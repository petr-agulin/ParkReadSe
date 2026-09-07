"""Две стадии конвейера, на которых вызывается модель.

`classify_image` — стадия 0, отсев. `extract_sign_data` — стадия 1, извлечение.
Инструментов у модели нет ни на одной; обе возвращают данные, а решения по ним
принимает код.

Демо-режим — ветка в **источнике данных**, а не в логике: при `DEMO_MODE=true` ответ
читается из фикстур, контракт функции тот же. Логика валидации, порога и движка общая
для обоих режимов, поэтому демо не может «работать иначе», чем живой вызов.
"""
from __future__ import annotations

import base64
import json
import mimetypes
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests

from . import fixtures, prompts
from .config import Config
from .photo import Photo
from .validation import InvalidModelResponse, Result, Validator, parse_json

TIMEOUT_S = 120

# Коды, при которых повтор осмыслен: провайдер занят или просит подождать.
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
# Паузы между попытками. Их длина и задаёт число повторов.
RETRY_PAUSE_S = (20, 45, 90)


# --- вызов провайдера ------------------------------------------------------
#
# Диалект — **OpenAI-совместимый**: его понимают и Google через совместимый эндпоинт,
# и Mistral, и OpenRouter. Благодаря этому обещание README выполняется буквально:
# смена провайдера — правка `.env`, а не правка кода.
#
# Плата за это — провайдер не принимает нашу JSON Schema и не может заставить модель
# отвечать строго по ней. Форма объясняется словами в промпте (скелет генерируется
# из самой схемы, см. prompts.shape_hint), а настоящей гарантией остаётся наш
# валидатор: он и раньше был единственным, чему код верил.

class VisionCallFailed(Exception):
    """Провайдер не ответил или ответил ошибкой. Штатный исход, не баг."""


def _endpoint(cfg: Config) -> str:
    """Адрес провайдера берётся только из `.env`. Значения по умолчанию нет намеренно:
    держать провайдера ещё и в исходниках значит иметь его в двух местах сразу —
    и однажды они разойдутся."""
    if not cfg.api_base_url:
        raise VisionCallFailed(
            "VISION_API_BASE_URL не задан в .env. Адреса провайдеров перечислены "
            "в .env.example; при DEMO_MODE=true адрес не нужен вовсе."
        )
    return cfg.api_base_url.rstrip("/") + "/chat/completions"


# --- ограничение частоты ---------------------------------------------------
#
# У бесплатного тарифа лимит не только суточный, но и **поминутный**, и упирается
# прогон именно в него: два вызова на снимок подряд, без пауз, — и пятнадцать запросов
# в минуту кончаются на восьмом снимке. Суточный при этом почти не тронут.

_last_call_at = 0.0


def _throttle(max_rpm: int) -> None:
    """Выдержать паузу так, чтобы не превысить заданное число запросов в минуту."""
    global _last_call_at
    if max_rpm <= 0:
        return
    gap = 60.0 / max_rpm
    wait = gap - (time.monotonic() - _last_call_at)
    if wait > 0:
        time.sleep(wait)
    _last_call_at = time.monotonic()


def _data_url(photo: Photo) -> str:
    """Снимок уходит провайдеру прямо из памяти: временного файла не возникает."""
    mime = mimetypes.guess_type(photo.name)[0] or "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(photo.data).decode()


def _call(cfg: Config, model: str, prompt: str, image: Photo) -> tuple[str, dict]:
    if not model:
        raise VisionCallFailed(
            "Модель не задана в .env: заполните VISION_MODEL и TRIAGE_MODEL."
        )
    body = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": _data_url(image)}},
        ]}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {cfg.api_key()}",
               "Content-Type": "application/json"}

    # Не всякая неудача — отказ. `429` просит подождать, `5xx` сообщает, что провайдер
    # сейчас перегружен, а таймаут и обрыв связи не говорят вообще ничего: ответа
    # просто нет. Все три случая лечатся одним и тем же — паузой и повтором.
    #
    # Найдено прогоном: из четырнадцати снимков одиннадцать упали на `503`
    # «high demand», и повтор их бы вытянул — но повторялся только `429`. Разница
    # в том, чья это перегрузка: `429` наша (спешим и сами это чиним паузой),
    # `503` чужая, и снимается она не за секунды. Поэтому пауза растёт.
    #
    # А вот `400` или `401` повторять нельзя: там перегрузки нет, есть неверный запрос
    # или ключ, и второй такой же запрос — просто вторая трата квоты.
    r, why = None, ""
    for attempt in range(len(RETRY_PAUSE_S) + 1):
        _throttle(cfg.max_rpm)
        try:
            r = requests.post(_endpoint(cfg), headers=headers, json=body,
                              timeout=TIMEOUT_S)
        except (requests.Timeout, requests.ConnectionError) as e:
            r, why = None, f"{type(e).__name__}: {str(e)[:200]}"
        else:
            if r.status_code == 200:
                break
            # Тело ошибки провайдера ключа не содержит; на всякий случай обрезаем.
            why = f"HTTP {r.status_code}: {r.text[:400]}"
            if r.status_code not in RETRY_STATUS:
                break
        if attempt < len(RETRY_PAUSE_S):
            time.sleep(RETRY_PAUSE_S[attempt])

    if r is None or r.status_code != 200:
        raise VisionCallFailed(f"{why} (попыток: {attempt + 1})")
    payload = r.json()
    try:
        text = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise VisionCallFailed(f"неожиданная форма ответа: {json.dumps(payload)[:400]}")
    return text, payload.get("usage") or {}


# --- результаты стадий -----------------------------------------------------

@dataclass
class TriageOutcome:
    category: str
    what_i_see: str
    panels_below_main_sign: int | None
    from_demo: bool
    usage: dict = field(default_factory=dict)
    validation: Result | None = None

    @property
    def is_parking_sign(self) -> bool:
        return self.category == "parking_sign"


@dataclass
class ExtractOutcome:
    data: dict | None
    validation: Result
    from_demo: bool
    usage: dict = field(default_factory=dict)


# --- стадия 0: отсев -------------------------------------------------------

def classify_image(image: Photo, cfg: Config, validator: Validator) -> TriageOutcome:
    """Отвечает на единственный вопрос: парковочный ли это знак.

    Возвращает МЕТКУ, а не решение. Останавливать ли конвейер, решает вызывающий код
    по `TRIAGE_ENFORCE` — при `false` метка только записывается, а снимок идёт дальше:
    так на этапе 5 меряется доля ложных отсевов, не теряя разборы.
    """
    cached = fixtures.load(cfg.demo_fixtures_path, image, "triage") if cfg.demo_mode else None
    if cached is not None:
        res = validator.triage(cached)
        return TriageOutcome(cached.get("category", "parking_sign"),
                             cached.get("what_i_see", ""),
                             cached.get("panels_below_main_sign"),
                             from_demo=True, validation=res)
    if cfg.demo_mode:
        raise FileNotFoundError(
            f"DEMO_MODE=true, но фикстуры отсева для {image.name} нет. "
            f"Положите её в {cfg.demo_fixtures_path} или снимите DEMO_MODE."
        )

    schema = json.loads((cfg.schema_path / "triage.schema.json").read_text(encoding="utf-8"))
    prompt = prompts.triage(schema)
    raw, usage = _call(cfg, cfg.triage_model, prompt, image)
    doc = parse_json(raw)
    doc.pop("schema_version", None)
    res = validator.triage(doc)
    if res.ok and image.remember:
        fixtures.save(cfg.demo_fixtures_path, image, "triage", doc, cfg.triage_model,
                      usage, prompt=prompt)
    return TriageOutcome(doc.get("category", "parking_sign"), doc.get("what_i_see", ""),
                         doc.get("panels_below_main_sign"), from_demo=False,
                         usage=usage, validation=res)


# --- стадия 1: извлечение --------------------------------------------------

def extract_sign_data(image: Photo, cfg: Config, validator: Validator,
                      panels_seen: int | None = None) -> ExtractOutcome:
    """Один вызов модели. На входе изображение, на выходе JSON по схеме.

    `panels_seen` приходит со стадии отсева — это независимый взгляд на ту же
    фотографию. Расхождение с `panel_count` означает потерю границы между табличками,
    и узнать об этом от самой модели извлечения нельзя: на снимке 013 она сообщила
    о полной уверенности, слив две таблички в одну.
    """
    cached = fixtures.load(cfg.demo_fixtures_path, image, "extract") if cfg.demo_mode else None
    if cached is not None:
        return _wrap(validator.sign(cached, panels_seen), from_demo=True, usage={})
    if cfg.demo_mode:
        raise FileNotFoundError(
            f"DEMO_MODE=true, но фикстуры извлечения для {image.name} нет. "
            f"Положите её в {cfg.demo_fixtures_path} или снимите DEMO_MODE."
        )

    schema = json.loads((cfg.schema_path / "sign.schema.json").read_text(encoding="utf-8"))
    prompt = prompts.extract(schema)
    raw, usage = _call(cfg, cfg.vision_model, prompt, image)
    try:
        doc = parse_json(raw)
    except InvalidModelResponse as e:
        return ExtractOutcome(None, Result(None, schema_errors=[str(e)]), False, usage)
    doc.setdefault("schema_version", 1)
    res = validator.sign(doc, panels_seen)
    if res.ok and image.remember:
        fixtures.save(cfg.demo_fixtures_path, image, "extract", doc, cfg.vision_model,
                      usage, prompt=prompt)
    return _wrap(res, from_demo=False, usage=usage)


def _wrap(res: Result, *, from_demo: bool, usage: dict) -> ExtractOutcome:
    return ExtractOutcome(data=res.data, validation=res, from_demo=from_demo, usage=usage)

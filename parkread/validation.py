"""Валидация ответа модели.

Схема отбраковывает форму; этот модуль добавляет проверки, которых в JSON Schema
выразить нельзя, и все три происходят из реальных ошибок прогона
(`testset/PROBE_LOG.md`). Промпт о них просит — здесь они гарантируются.

Главное правило модуля: **самооценка модели ни на что не влияет**. `boundaries.certain`
и `model_confidence` сохраняются как данные для замера и не используются как основание.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from jsonschema import Draft202012Validator

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S)


class InvalidModelResponse(Exception):
    """Ответ модели не удалось привести к JSON. Не баг приложения, а штатный исход."""


def parse_json(raw: str) -> dict:
    """Модель иногда оборачивает JSON в markdown-забор, иногда добавляет пролог.
    Снимаем то, что снимается; остальное — честная ошибка."""
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise InvalidModelResponse(
            f"ответ не разбирается как JSON (длина {len(raw)} символов)"
        )


@dataclass
class Result:
    """Что получилось после валидации. `data` пуст, если ответ отбракован."""
    data: dict | None
    schema_errors: list[str] = field(default_factory=list)
    repairs: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.data is not None and not self.schema_errors


class Validator:
    def __init__(self, schema_dir: Path):
        self._sign = Draft202012Validator(
            json.loads((schema_dir / "sign.schema.json").read_text(encoding="utf-8")))
        self._triage = Draft202012Validator(
            json.loads((schema_dir / "triage.schema.json").read_text(encoding="utf-8")))

    # ------------------------------------------------------------------ отсев

    def triage(self, doc: dict) -> Result:
        """Отсев чинится так же, как извлечение: мелочь оформления не должна
        уносить с собой годный ответ.

        Найдено замером: на трёх снимках ответ отсева не проходил проверку, ответ
        молча не сохранялся, и на диске оставалась старая затравка. Замер потом читал
        её как свежий ответ модели — ровно та подмена, против которой заведён отпечаток
        промпта. Строгость, из-за которой ответ теряется целиком, обходится дороже,
        чем поле, которое некуда положить.

        Строгим остаётся то, у чего есть последствие: `category` вне перечисления
        по-прежнему отбраковывает ответ, потому что именно она решает судьбу конвейера.
        """
        repairs: list[str] = []
        allowed = self._triage.schema["properties"]
        for key in list(doc):
            if key not in allowed:
                repairs.append(f"убрано лишнее поле {key!r}")
                doc.pop(key)

        seen = doc.get("what_i_see")
        limit = allowed["what_i_see"].get("maxLength", 200)
        if isinstance(seen, str) and len(seen) > limit:
            repairs.append(f"what_i_see укорочено до {limit} символов")
            doc["what_i_see"] = seen[:limit]

        # Число панелей строкой — форма записи, а не другой ответ.
        n = doc.get("panels_below_main_sign")
        if isinstance(n, str) and n.strip().isdigit():
            repairs.append(f"panels_below_main_sign {n!r} -> {int(n)}")
            doc["panels_below_main_sign"] = int(n)

        errs = [self._fmt(e) for e in sorted(self._triage.iter_errors(doc),
                                             key=lambda e: list(e.path))]
        return Result(data=doc if not errs else None, schema_errors=errs,
                      repairs=repairs)

    # -------------------------------------------------------------- извлечение

    def sign(self, doc: dict, panels_seen: int | None = None) -> Result:
        """`panels_seen` — число панелей, названное стадией отсева. Независимый взгляд
        на ту же фотографию: расхождение означает потерю границы."""
        repairs = self._repair(doc)
        repairs += self._drop_unknown_enums(doc)
        errs = [self._fmt(e) for e in sorted(self._sign.iter_errors(doc),
                                             key=lambda e: list(e.path))]
        res = Result(data=doc if not errs else None, schema_errors=errs, repairs=repairs)
        if res.ok:
            res.flags = self._flags(doc, panels_seen)
        return res

    # ------------------------------------------------------------------ правки

    @staticmethod
    def _repair(doc: dict) -> list[str]:
        """Правки, которые делаются молча, потому что однозначны. Каждая записывается:
        молчаливая правка, о которой никто не знает, — это второй источник ошибок."""
        done: list[str] = []
        panels = doc.get("panels")
        if not isinstance(panels, list):
            return done

        # Правило 1 из PROBE_LOG: основной знак — не табличка.
        # На снимке 010 модель записала P и в main_sign, и первой панелью без текста.
        kept = []
        for p in panels:
            if not isinstance(p, dict):
                kept.append(p)
                continue
            empty = not p.get("lines")
            pict = (p.get("parsed") or {}).get("pictogram")
            if empty and pict in {"parking", "p", "main_sign"}:
                done.append(f"убрана панель {p.get('index')}: дубль основного знака")
                continue
            kept.append(p)
        if len(kept) != len(panels):
            doc["panels"] = kept
            panels = kept

        # Пустые строки — не текст. Модель отдаёт стрелочную панель то как [],
        # то как [""], и разница попадала в замер как ошибка чтения, хотя
        # прочитано в обоих случаях одно и то же: ничего.
        for p in panels:
            if not isinstance(p, dict) or not isinstance(p.get("lines"), list):
                continue
            kept_lines = [s for s in p["lines"] if isinstance(s, str) and s.strip()]
            if len(kept_lines) != len(p["lines"]):
                done.append(f"панель {p.get('index')}: убраны пустые строки")
                p["lines"] = kept_lines

        # Индексы обязаны идти подряд сверху вниз: на них ссылается всё остальное.
        for want, p in enumerate(panels, start=1):
            if isinstance(p, dict) and p.get("index") != want:
                done.append(f"индекс панели {p.get('index')} -> {want}")
                p["index"] = want

        if doc.get("panel_count") != len(panels):
            done.append(f"panel_count {doc.get('panel_count')} -> {len(panels)}")
            doc["panel_count"] = len(panels)
        return done

    def _drop_unknown_enums(self, doc: dict) -> list[str]:
        """Необязательное поле `parsed` со значением вне перечисления **выбрасывается**,
        а не роняет весь разбор.

        Найдено замером: на снимке `009` модель вписала `payment_method: mobile`,
        когда такого значения в схеме уже не было. Строгая проверка отбраковала бы
        весь ответ целиком — то есть из-за необязательного поля пропал бы верно
        прочитанный знак. Это ровно тот случай, о котором предупреждает `AGENTS.md`, §9:
        защита, написанная второпях, ломает рабочий сценарий тише, чем это делает модель.

        Обязательные поля так не чинятся: там значение вне перечисления — настоящая
        поломка ответа, и её надо видеть.
        """
        done: list[str] = []
        for panel in doc.get("panels", []):
            parsed = panel.get("parsed")
            if not isinstance(parsed, dict):
                continue
            allowed = (self._sign.schema["$defs"]["parsed"]["properties"])
            for key in list(parsed):
                spec = allowed.get(key)
                if not spec or "enum" not in spec:
                    continue
                if parsed[key] not in spec["enum"]:
                    done.append(f"панель {panel.get('index')}: убрано {key}="
                                f"{parsed[key]!r} — нет в перечислении схемы")
                    parsed.pop(key)
        return done

    # ------------------------------------------------------------------ флаги

    @staticmethod
    def _flags(doc: dict, panels_seen: int | None) -> list[str]:
        """Сигналы для формулы уверенности этапа 4. Здесь только наблюдения —
        решение по ним принимается там."""
        out: list[str] = []
        panels = doc.get("panels", [])
        plates = [p for p in panels if p.get("kind") == "sign_plate"]

        if doc["main_sign"]["type"] == "unknown":
            out.append("main_sign_unknown")
        if doc["main_sign"]["type"].startswith("wayfinding"):
            out.append("wayfinding_sign_permits_nothing")
        if not plates:
            out.append("no_sign_plates")

        # Правило 3 из PROBE_LOG: границу нельзя проверять мнением модели.
        # Сравниваем с независимым счётом от стадии отсева — по табличкам С ПРАВИЛАМИ.
        #
        # Считали по всем панелям, пока отсев просили считать всё подряд. Замер показал,
        # что именно на «всём подряд» счёт и разваливается: платёжное табло — это стопка
        # наклеек без внятных границ, и число панелей на ней модель называет наугад
        # (на 008 назвала 1 вместо 3, на 014 — 5 вместо 2). Теперь обе стороны считают
        # одно и то же: таблички, которые задают правило.
        if panels_seen is not None and panels_seen != len(plates):
            out.append(f"panel_count_disagreement:{panels_seen}!={len(plates)}")
        if not doc["boundaries"].get("certain", True):
            out.append("model_reports_uncertain_boundary")

        for p in panels:
            if not p["legibility"].get("readable", True):
                out.append(f"panel_{p['index']}_unreadable")
            obs = p["legibility"].get("obstructions") or []
            if obs:
                out.append(f"panel_{p['index']}_obstructed:{','.join(obs)}")
            if p.get("kind") == "sign_plate" and not p.get("lines") \
                    and not (p.get("parsed") or {}):
                out.append(f"panel_{p['index']}_empty")
        if not doc["main_sign"]["legibility"].get("readable", True):
            out.append("main_sign_unreadable")
        return out

    @staticmethod
    def _fmt(err) -> str:
        where = "/".join(str(x) for x in err.path) or "<корень>"
        return f"{where}: {err.message}"

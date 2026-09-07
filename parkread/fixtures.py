"""Фикстуры демо-режима.

Каждый настоящий ответ модели сохраняется сюда, поэтому демо-набор собирается сам
по ходу работы, а не доделывается в конце. Он же — воспроизводимый стенд для этапов 5
и 6: одинаковый вход даёт одинаковый выход, и правка промпта сравнивается с эталоном,
а не с впечатлением.

Фотографии пользователя сюда не попадают: сохраняется только ответ модели по снимку
из тестового набора автора.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def fingerprint(prompt: str) -> str:
    """Отпечаток промпта, которым получен ответ.

    Нужен, чтобы повторный прогон умел отличать «этот снимок уже спрашивали»
    от «этот снимок уже спрашивали ЭТИМ ЖЕ вопросом». Правка промпта — другой
    вопрос, и старый ответ на него больше не отвечает: пропускать такой снимок
    значит молча мерить смесь двух версий.
    """
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]


def _file(root: Path, image, stage: str) -> Path:
    return root / f"{image.stem}.{stage}.json"


def stale(root: Path, image, stage: str, prompt: str) -> bool:
    """Нужно ли переспрашивать снимок. Да — если ответа нет, если он размечен
    руками, или если он получен другим промптом.

    Отпечатка нет у фикстур, сохранённых до введения этой проверки: они считаются
    устаревшими, потому что доказать обратное нечем."""
    p = _file(root, image, stage)
    if not p.exists():
        return True
    doc = json.loads(p.read_text(encoding="utf-8"))
    if doc.get("origin", "model") != "model":
        return True
    return doc.get("prompt_fingerprint") != fingerprint(prompt)


def refused(root: Path, image) -> bool:
    """Отсев уже ответил, что снимок не парковочный знак.

    Тогда извлечения на нём не было и не будет: конвейер до него не дошёл. Считать
    отсутствие фикстуры извлечения поводом переспросить снимок значит переспрашивать
    каждый отказной кадр в каждом прогоне — и так вечно, потому что взяться этой
    фикстуре неоткуда. Отказных кадров в наборе семь, и это семь лишних вызовов
    на всяком прогоне.

    Проверяется именно сохранённый ОТВЕТ, а не свежесть промпта: если промпт отсева
    изменится, снимок и так окажется устаревшим по своей стадии и будет переспрошен —
    а вместе с новым ответом вернётся и вопрос, нужно ли ему извлечение.
    """
    p = _file(root, image, "triage")
    if not p.exists():
        return False
    doc = json.loads(p.read_text(encoding="utf-8"))
    if doc.get("origin", "model") != "model":
        return False
    return (doc.get("response") or {}).get("category") != "parking_sign"


def load(root: Path, image, stage: str) -> dict | None:
    p = _file(root, image, stage)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))["response"]


def save(root: Path, image, stage: str, response: dict,
         model: str, usage: dict | None, prompt: str | None = None) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    p = _file(root, image, stage)
    p.write_text(json.dumps({
        "image": image.name,
        "stage": stage,
        "model": model,
        "prompt_fingerprint": fingerprint(prompt) if prompt is not None else None,
        "saved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "usage": usage,
        "response": response,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return p


def available(root: Path) -> list[str]:
    if not root.exists():
        return []
    return sorted({p.name.split(".")[0] for p in root.glob("*.json")})

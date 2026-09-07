"""Настройки из .env.

Ключ vision-API читается здесь и **никуда не печатается**: ни в лог, ни в диагностику.
Наружу отдаются только признак «задан» и длина — этого хватает, чтобы понять,
настроено ли окружение, и недостаточно, чтобы ключ утёк в скриншот.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _path(name: str, default: str) -> Path:
    raw = (os.getenv(name) or "").strip() or default
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


@dataclass(frozen=True)
class Config:
    demo_mode: bool
    demo_fixtures_path: Path
    vision_model: str
    triage_model: str
    triage_enforce: bool
    max_rpm: int
    api_base_url: str
    schema_path: Path
    reference_path: Path
    general_rules_path: Path
    holidays_path: Path
    db_path: Path
    log_level: str
    _api_key: str = ""

    # --- про ключ наружу отдаётся только это ---

    @property
    def api_key_is_set(self) -> bool:
        return bool(self._api_key)

    @property
    def api_key_length(self) -> int:
        return len(self._api_key)

    def api_key(self) -> str:
        """Единственная точка, где значение ключа покидает конфиг — ради заголовка
        запроса. Логировать результат нельзя."""
        if not self._api_key:
            raise RuntimeError(
                "VISION_API_KEY не задан. Либо заполните его в .env, "
                "либо работайте при DEMO_MODE=true — тогда ключ не нужен."
            )
        return self._api_key

    def describe(self) -> dict:
        """Безопасная диагностика: показывает, что настроено, без значения ключа."""
        return {
            "demo_mode": self.demo_mode,
            "vision_model": self.vision_model,
            "triage_model": self.triage_model,
            "triage_enforce": self.triage_enforce,
            "api_key": f"set, length {self.api_key_length}" if self.api_key_is_set else "not set",
        }


def load(env_file: str | os.PathLike | None = None) -> Config:
    load_dotenv(env_file or ROOT / ".env")
    # Провайдер, модели и адрес приходят ТОЛЬКО из .env: своих значений по умолчанию
    # у кода нет. Иначе провайдер живёт в двух местах сразу, и однажды они разойдутся.
    # Отсутствие значения обнаруживается при вызове, а не здесь: в демо-режиме
    # ни адрес, ни модель не нужны.
    vision_model = (os.getenv("VISION_MODEL") or "").strip()
    # Пустой TRIAGE_MODEL означает «та же модель, что и для извлечения».
    triage_model = (os.getenv("TRIAGE_MODEL") or "").strip() or vision_model
    return Config(
        demo_mode=_flag("DEMO_MODE", True),
        demo_fixtures_path=_path("DEMO_FIXTURES_PATH", "demo/"),
        vision_model=vision_model,
        triage_model=triage_model,
        triage_enforce=_flag("TRIAGE_ENFORCE", True),
        max_rpm=int((os.getenv("VISION_MAX_RPM") or "0").strip() or 0),
        api_base_url=(os.getenv("VISION_API_BASE_URL") or "").strip(),
        schema_path=_path("SCHEMA_PATH", "schema/"),
        reference_path=_path("REFERENCE_PATH", "reference/signs/"),
        general_rules_path=_path("GENERAL_RULES_PATH", "reference/general_rules/"),
        holidays_path=_path("HOLIDAYS_PATH", "data/holidays_se.json"),
        db_path=_path("DB_PATH", "data/parkread.sqlite3"),
        log_level=(os.getenv("LOG_LEVEL") or "INFO").strip().upper(),
        _api_key=(os.getenv("VISION_API_KEY") or "").strip(),
    )

"""История разборов в SQLite.

**Фотографии здесь нет и не будет.** Не хранится и имя файла: в имени, которое дал
снимку телефон, случается адрес и дата, а пользы от него ноль. Остаётся только то,
что нужно, чтобы посмотреть, как продукт вёл себя со временем: когда, в каком режиме,
что решил и почему.

Пишет эту таблицу код приложения. Модель её не читает и о ней не знает
(`AGENTS.md`, §8): история — наблюдение за продуктом, а не память ассистента.
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import closing, contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT    NOT NULL,
    demo_mode    INTEGER NOT NULL,
    triage       TEXT,
    category     TEXT    NOT NULL,
    confidence   REAL    NOT NULL,
    reasons      TEXT    NOT NULL,
    panel_count  INTEGER
);
"""


@dataclass
class Row:
    id: int
    created_at: str
    demo_mode: bool
    triage: str | None
    category: str
    confidence: float
    reasons: list[str]
    panel_count: int | None


class History:
    def __init__(self, db_path: Path):
        self._path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        """`with sqlite3.connect(...)` фиксирует транзакцию, но **не закрывает**
        соединение — на Windows это сразу видно: файл остаётся занят процессом.
        Поэтому закрываем явно, а не полагаемся на сборщик мусора."""
        with closing(sqlite3.connect(self._path)) as conn:
            with conn:
                yield conn

    def record(self, *, demo_mode: bool, category: str, confidence: float,
               reasons: list[str], triage: str | None = None,
               panel_count: int | None = None) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO analyses (created_at, demo_mode, triage, category,"
                " confidence, reasons, panel_count) VALUES (?,?,?,?,?,?,?)",
                (datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 1 if demo_mode else 0, triage, category, confidence,
                 json.dumps(reasons, ensure_ascii=False), panel_count))
            return int(cur.lastrowid)

    def recent(self, limit: int = 20) -> list[Row]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, created_at, demo_mode, triage, category, confidence,"
                " reasons, panel_count FROM analyses ORDER BY id DESC LIMIT ?",
                (limit,)).fetchall()
        return [Row(r[0], r[1], bool(r[2]), r[3], r[4], r[5],
                    json.loads(r[6]), r[7]) for r in rows]

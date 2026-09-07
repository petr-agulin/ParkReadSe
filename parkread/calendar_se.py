"""Классы дня по шведскому календарю.

Файл `data/holidays_se.json` хранит только красные дни. Воскресенья, субботы и кануны
**выводятся здесь**: хранить вычислимое значит однажды получить расхождение между
хранимым и вычисляемым.

Порядок проверок важен, и красное побеждает скобки **по определению**, а не
по договорённости: канун — это *vardag före sön- och helgdag*, то есть **рабочий**
день перед красным. Праздник рабочим днём не является и канунoм быть не может.
При обратном порядке в 2026 году портятся шесть дней.
"""
from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

WEEKDAY = "weekday"   # vardag
EVE = "eve"           # vardag före sön- och helgdag
RED = "red"           # sön- och helgdag
UNKNOWN = "unknown"   # дата вне покрытого периода


class Calendar:
    def __init__(self, path: Path):
        doc = json.loads(path.read_text(encoding="utf-8"))
        self.covered_from = date.fromisoformat(doc["covered_from"])
        self.covered_to = date.fromisoformat(doc["covered_to"])
        self._red = {
            date.fromisoformat(h["date"]): h
            for h in doc["public_holidays"] + doc.get("boundary_holidays", [])
        }

    # --- базовые предикаты ---

    def is_public_holiday(self, d: date) -> bool:
        return d in self._red

    def holiday_name(self, d: date) -> str | None:
        h = self._red.get(d)
        return h["name_sv"] if h else None

    def _is_red(self, d: date) -> bool:
        return d in self._red or d.weekday() == 6      # праздник или воскресенье

    def covers(self, d: date) -> bool:
        return self.covered_from <= d <= self.covered_to

    # --- класс дня ---

    def day_class(self, d: date) -> str:
        """1) красный: праздник или воскресенье.
        2) канун: не красный, а следующий день красный.
        3) будни: всё остальное."""
        if not self.covers(d):
            return UNKNOWN
        if self._is_red(d):
            return RED
        if self._is_red(d + timedelta(days=1)):
            return EVE
        return WEEKDAY

    def is_working_day(self, d: date) -> bool:
        """Рабочий день — только класс `weekday`. Суббота, воскресенье, праздник
        и день перед праздником счётчик 24 часов не тратят."""
        return self.day_class(d) == WEEKDAY

    def next_working_day(self, d: date) -> date | None:
        """Первый рабочий день строго после `d`. None, если вышли за календарь."""
        cur = d + timedelta(days=1)
        while self.covers(cur):
            if self.is_working_day(cur):
                return cur
            cur += timedelta(days=1)
        return None

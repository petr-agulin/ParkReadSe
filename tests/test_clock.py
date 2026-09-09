# -*- coding: utf-8 -*-
"""Перевод часов: длительность считается настоящим временем, а не циферблатом.

Всё остальное в продукте считается по циферблату, и это правильно: `9-12`
на табличке — девять на часах и в марте, и в октябре. Но ночь перевода длится
23 или 25 часов, и три места это обязаны знать — предел с таблички, правило
24 часов и длина отрезка на шкале.

Даты переходов сверены с правилом ЕС, приведённым разработчиком: 2026 — вперёд
29 марта, назад 25 октября; 2027 — вперёд 28 марта, назад 31 октября.
"""
from datetime import datetime, timedelta
from pathlib import Path

from parkread import clock_se as clock
from parkread import present
from parkread.calendar_se import Calendar
from parkread.engine import evaluate_parking_rules, twenty_four_hour_expiry

CAL = Calendar()

BACK_2026 = datetime(2026, 10, 25, 3, 0)      # 03:00 → 02:00
FORWARD_2027 = datetime(2027, 3, 28, 2, 0)    # 02:00 → 03:00


def sign(*panels, main="parking"):
    return {"schema_version": 1,
            "main_sign": {"type": main, "background_color": "blue",
                          "form": "regular", "legibility": {"readable": True}},
            "panel_count": len(panels), "boundaries": {"certain": True},
            "panels": list(panels)}


def plate(parsed, lines=None, color="white"):
    return {"index": 1, "kind": "sign_plate", "lines": lines or ["табличка"],
            "background_color": color, "legibility": {"readable": True},
            "parsed": parsed}


# --- само правило ----------------------------------------------------------

def test_the_switches_stand_where_the_eu_rule_puts_them():
    """Последнее воскресенье марта и октября, 01:00 UTC. На шведских часах это
    всегда одни и те же числа — 02:00 весной и 03:00 осенью; меняется только дата."""
    assert clock.spring_forward(2026) == datetime(2026, 3, 29, 2)
    assert clock.autumn_back(2026) == BACK_2026
    assert clock.spring_forward(2027) == FORWARD_2027
    assert clock.autumn_back(2027) == datetime(2027, 10, 31, 3)
    for year in range(2026, 2031):
        assert clock.spring_forward(year).date().weekday() == 6
        assert clock.autumn_back(year).date().weekday() == 6
        assert clock.spring_forward(year).month == 3
        assert clock.autumn_back(year).month == 10
        # Последнее воскресенье: через неделю уже следующий месяц.
        assert (clock.spring_forward(year) + timedelta(days=7)).month == 4
        assert (clock.autumn_back(year) + timedelta(days=7)).month == 11


def test_the_offset_is_plus_one_in_winter_and_plus_two_in_summer():
    assert clock.offset(datetime(2026, 1, 15, 12)) == clock.WINTER
    assert clock.offset(datetime(2026, 7, 15, 12)) == clock.SUMMER
    # Края: за минуту до перевода и сразу после него.
    assert clock.offset(FORWARD_2027 - timedelta(minutes=1)) == clock.WINTER
    assert clock.offset(FORWARD_2027 + timedelta(hours=1)) == clock.SUMMER
    assert clock.offset(BACK_2026 - timedelta(minutes=1)) == clock.SUMMER
    assert clock.offset(BACK_2026) == clock.WINTER


def test_the_hour_that_does_not_exist_and_the_hour_that_happens_twice():
    """Два случая, названные явно: весной 02:00-03:00 на часах нет вовсе,
    осенью 02:00-03:00 идёт дважды."""
    # Весной время из дыры сдвигается вперёд.
    assert clock.normalise(datetime(2027, 3, 28, 2, 30)) == datetime(2027, 3, 28, 3, 30)
    assert clock.normalise(datetime(2027, 3, 28, 1, 30)) == datetime(2027, 3, 28, 1, 30)
    # Осенью берётся первое вхождение — то, что человек видит на часах.
    assert clock.offset(datetime(2026, 10, 25, 2, 30)) == clock.SUMMER


def test_a_night_of_a_switch_is_23_or_25_hours_long():
    assert clock.real_minutes(datetime(2026, 10, 25), datetime(2026, 10, 26)) == 25 * 60
    assert clock.real_minutes(datetime(2027, 3, 28), datetime(2027, 3, 29)) == 23 * 60
    # Обычные сутки не трогаются.
    assert clock.real_minutes(datetime(2026, 9, 9), datetime(2026, 9, 10)) == 24 * 60


def test_adding_real_time_lands_on_the_right_clock_face():
    """`2 tim` — это два часа, прожитых машиной, а не два деления циферблата."""
    assert (clock.add(datetime(2026, 10, 25, 2, 30), timedelta(hours=2))
            == datetime(2026, 10, 25, 3, 30))          # ночь длиннее: 2 ч ⇒ +1 ч на часах
    assert (clock.add(datetime(2027, 3, 28, 1, 30), timedelta(hours=2))
            == datetime(2027, 3, 28, 4, 30))           # ночь короче: 2 ч ⇒ +3 ч на часах
    assert (clock.add(datetime(2026, 9, 9, 10), timedelta(hours=2))
            == datetime(2026, 9, 9, 12))               # обычный день не трогается


def test_the_module_carries_no_time_zone_database():
    """Требование к порту (шаг 6): в браузере часовых баз не будет."""
    source = (Path(__file__).resolve().parent.parent
              / "parkread/clock_se.py").read_text(encoding="utf-8")
    for forbidden in ("zoneinfo", "ZoneInfo", "pytz", "tzdata", "open("):
        assert forbidden not in source, forbidden


# --- три места, где это кусается -------------------------------------------

def _regime_view(moment: datetime):
    from parkread.reference import Reference
    from parkread.engine import horizon_end
    r = evaluate_parking_rules(sign(plate({"fee": True})), moment, CAL).regimes[0]
    return present._regime(Reference(Path("reference/signs")), r, horizon_end(moment), CAL)


def test_a_plate_limit_across_the_switch():
    """`2 tim`, поставленные в ночь перевода."""
    s = sign(plate({"duration_limit": {"amount": 2, "unit": "hours"}}, ["2 tim"]))
    r = evaluate_parking_rules(s, datetime(2026, 10, 25, 2, 30), CAL).regimes[0]
    assert r.duration_expires_at == datetime(2026, 10, 25, 3, 30)
    assert r.duration_source == "plate"

    r = evaluate_parking_rules(s, datetime(2027, 3, 28, 1, 30), CAL).regimes[0]
    assert r.duration_expires_at == datetime(2027, 3, 28, 4, 30)


def test_the_24_hour_rule_across_the_switch():
    """Сутки настоящие: в ночь, которая длится 25 часов, они кончаются на час
    раньше по циферблату, чем в обычную."""
    # Суббота 24 октября 2026 — канун, поэтому счёт начинается с понедельника.
    # Берём будний день: среда 21 октября, сутки идут до четверга — перевода нет.
    assert (twenty_four_hour_expiry(datetime(2026, 10, 21, 20), CAL)
            == datetime(2026, 10, 22, 20))
    # А эта пара суток накрывает ночь перевода: понедельник 26 октября начинается
    # уже по зимнему времени, поэтому проверяем прямо счёт от полуночи субботы.
    assert (clock.add(datetime(2026, 10, 24, 20), timedelta(days=1))
            == datetime(2026, 10, 25, 19))


def test_the_length_of_a_segment_counts_real_hours():
    """Отрезок шкалы, накрывший ночь перевода, длится на час больше, чем показывает
    разница на циферблате. Раньше он выдавал разницу — и «24 h» стояло там, где
    машина простоит двадцать пять."""
    view = _regime_view(datetime(2026, 10, 24, 20))
    first = datetime.fromisoformat(view["periods"][0]["start"])
    last = datetime.fromisoformat(view["periods"][-1]["end"])
    assert clock.switch_between(first, last) == "back"

    shown = sum(seg["minutes"] for seg in view["periods"])
    assert shown == clock.real_minutes(first, last)
    assert shown == int((last - first).total_seconds() // 60) + 60


# --- заметка на экране -----------------------------------------------------

def test_the_note_appears_when_the_shown_stretch_crosses_the_switch():
    view = _regime_view(datetime(2026, 10, 24, 20))
    assert view["clock_change_text"] == present.CLOCK_CHANGE_TEXT["back"]
    assert "an hour longer" in view["clock_change_text"]

    view = _regime_view(datetime(2027, 3, 27, 20))
    assert view["clock_change_text"] == present.CLOCK_CHANGE_TEXT["forward"]
    assert "an hour shorter" in view["clock_change_text"]


def test_there_is_no_note_when_nothing_crosses_the_switch():
    """В том числе при сканировании днём того же воскресенья, когда перевод
    уже позади: там заметка была бы шумом."""
    assert _regime_view(datetime(2026, 10, 25, 12))["clock_change_text"] is None
    assert _regime_view(datetime(2026, 9, 9, 12))["clock_change_text"] is None


def test_the_note_says_no_date_and_names_the_fixed_hours():
    """Даты в тексте нет: перевод может прийтись и на ближайшую ночь, и на следующее
    воскресенье в пределах горизонта. Часы, наоборот, постоянные."""
    for text in present.CLOCK_CHANGE_TEXT.values():
        assert "02:00" in text and "03:00" in text
        assert "October" not in text and "March" not in text
        assert "already allow for it" in text

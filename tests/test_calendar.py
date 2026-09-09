# -*- coding: utf-8 -*-
"""Календарь, который считается кодом.

Раньше красные дни лежали файлом на один 2026 год: с 1 января 2027-го продукт
перестал бы отвечать про класс дня — не деградация, а отказ на каждом запросе.
Теперь они выводятся из текста закона `Lag (1989:253) om allmänna helgdagar`.

Главная проверка здесь — **третья**: за 2026 год новый календарь обязан совпасть
со старым файлом день в день. Всё остальное сверяет правила по отдельности.
"""
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

from parkread.calendar_se import (EVE, RED, SELECTABLE_FROM, SELECTABLE_TO,
                                  UNKNOWN, WEEKDAY, Calendar, easter, holidays,
                                  selectable)

CAL = Calendar()

# Тринадцать красных дней 2026 года — дословно из `data/holidays_se.json`,
# который этот календарь заменил. Список перенесён в тест намеренно: файла
# больше нет, а эталон, с которым сверяются, остаться должен.
HOLIDAYS_2026 = {
    date(2026, 1, 1): "Nyårsdagen",
    date(2026, 1, 6): "Trettondedag jul",
    date(2026, 4, 3): "Långfredagen",
    date(2026, 4, 5): "Påskdagen",
    date(2026, 4, 6): "Annandag påsk",
    date(2026, 5, 1): "Första maj",
    date(2026, 5, 14): "Kristi himmelsfärdsdag",
    date(2026, 5, 24): "Pingstdagen",
    date(2026, 6, 6): "Sveriges nationaldag",
    date(2026, 6, 20): "Midsommardagen",
    date(2026, 10, 31): "Alla helgons dag",
    date(2026, 12, 25): "Juldagen",
    date(2026, 12, 26): "Annandag jul",
}

# Пасхальные воскресенья по опубликованным календарям. Таблица независима
# от реализации: сойдись она с формулой случайно на двадцати одном годе —
# это уже не случайность.
EASTER = {
    2020: (4, 12), 2021: (4, 4), 2022: (4, 17), 2023: (4, 9), 2024: (3, 31),
    2025: (4, 20), 2026: (4, 5), 2027: (3, 28), 2028: (4, 16), 2029: (4, 1),
    2030: (4, 21), 2031: (4, 13), 2032: (3, 28), 2033: (4, 17), 2034: (4, 9),
    2035: (3, 25), 2036: (4, 13), 2037: (4, 5), 2038: (4, 25), 2039: (4, 10),
    2040: (4, 1),
}


def _days(year: int):
    d = date(year, 1, 1)
    while d.year == year:
        yield d
        d += timedelta(days=1)


# --- Пасха -----------------------------------------------------------------

def test_easter_matches_the_published_dates():
    """«Полнолуние» в законе церковное, табличное, а не наблюдаемое: считать его
    по небу значило бы промахнуться в те годы, где таблица с астрономией расходится.
    Григорианский компутус ту же таблицу и воспроизводит."""
    for year, (month, day) in EASTER.items():
        assert easter(year) == date(year, month, day), year
        assert easter(year).weekday() == 6, year          # всегда воскресенье


def test_the_offsets_are_the_ones_the_law_names():
    """Закон задаёт смещения словами: «fredagen närmast före påskdagen», «sjätte
    torsdagen efter påskdagen», «sjunde söndagen». Проверяем именно это, а не числа
    39 и 49: если день недели не тот, значит смещение переписано неверно."""
    for year in range(2026, 2031):
        h = {name: d for d, name in holidays(year).items()}
        e = easter(year)
        assert h["Långfredagen"] == e - timedelta(days=2)
        assert h["Långfredagen"].weekday() == 4                     # пятница
        assert h["Annandag påsk"] == e + timedelta(days=1)
        assert h["Kristi himmelsfärdsdag"].weekday() == 3           # четверг
        assert (h["Kristi himmelsfärdsdag"] - e).days // 7 == 5     # шестой
        assert h["Pingstdagen"].weekday() == 6                      # воскресенье
        assert (h["Pingstdagen"] - e).days // 7 == 7                # седьмое


def test_the_saturdays_fall_inside_the_windows_the_law_gives():
    for year in range(2026, 2031):
        h = {name: d for d, name in holidays(year).items()}
        midsummer, saints = h["Midsommardagen"], h["Alla helgons dag"]
        assert midsummer.weekday() == 5 and midsummer.month == 6
        assert 20 <= midsummer.day <= 26
        assert saints.weekday() == 5
        assert (saints.month, saints.day) >= (10, 31)
        assert (saints.month, saints.day) <= (11, 6)


def test_thirteen_red_days_every_year():
    """Двенадцать перечислены в § 2 с датами, тринадцатый — `första maj`:
    § 1 его называет, а даты ему не нужно, она в самом названии."""
    for year in range(2026, 2031):
        assert len(holidays(year)) == 13, year
        assert date(year, 5, 1) in holidays(year)


# --- совпадение с файлом, который календарь заменил ------------------------

def test_2026_matches_the_file_it_replaced():
    assert holidays(2026) == HOLIDAYS_2026


def test_every_day_of_2026_keeps_its_class():
    """Самая важная проверка шага: ответы продукта за 2026 год не должны измениться
    ни на один день. Классы выводятся из тех же красных дней тем же правилом."""
    # 1 января 2027-го входит в эталон по той же причине, по какой лежало
    # отдельной записью в прежнем файле: без него 31 декабря нечем признать кануном.
    expected = dict(HOLIDAYS_2026)
    expected[date(2027, 1, 1)] = "Nyårsdagen"
    for d in _days(2026):
        red = d in expected or d.weekday() == 6
        nxt = d + timedelta(days=1)
        eve = not red and (nxt in expected or nxt.weekday() == 6)
        want = RED if red else (EVE if eve else WEEKDAY)
        assert CAL.day_class(d) == want, d


def test_the_2026_counts_are_unchanged():
    """63 / 57 / 245 — числа из `data/README.md`, посчитанные по прежнему файлу."""
    counts = Counter(CAL.day_class(d) for d in _days(2026))
    assert counts[RED] == 63 and counts[EVE] == 57 and counts[WEEKDAY] == 245
    assert sum(counts.values()) == 365
    # Суббота — vardag, поэтому в `weekday` не попадает никогда: следующий день
    # воскресенье, и она всегда канун. Воскресенье всегда красное.
    assert not any(d.weekday() == 5 and CAL.day_class(d) == WEEKDAY for d in _days(2026))
    assert all(CAL.day_class(d) == RED for d in _days(2026) if d.weekday() == 6)


# --- порядок правил --------------------------------------------------------

def test_a_red_day_is_never_an_eve():
    """Скобки на табличке — это *vardag* före sön- och helgdag, то есть **рабочий**
    день перед красным. Праздник рабочим днём не является, и скобок ему не бывает,
    даже когда следующий день тоже красный. Проверять «канун» раньше «красного» —
    шесть испорченных дней в 2026 году."""
    for d in (date(2026, 4, 5),    # Пасха: красный день перед красным
              date(2026, 6, 6),    # праздник, выпавший на субботу
              date(2026, 6, 20),
              date(2026, 10, 31),
              date(2026, 12, 25),  # Рождество перед вторым днём
              date(2026, 12, 26)):
        assert CAL.day_class(d) == RED, d


def test_the_eves_on_weekdays_are_the_nine_known_dates():
    nine = {(1, 5), (4, 2), (4, 30), (5, 13), (6, 5), (6, 19), (10, 30), (12, 24), (12, 31)}
    found = {(d.month, d.day) for d in _days(2026)
             if d.weekday() < 5 and CAL.day_class(d) == EVE}
    assert found == nine


def test_christmas_eve_midsummer_eve_and_new_years_eve_stay_eves():
    """Официальными праздниками они не являются, и добавлять их в список нельзя.
    Красными они и не становятся: вывод даёт им канун — и это проверка правила,
    а не отдельный случай в нём."""
    for year in range(2026, 2031):
        midsummer = {name: d for d, name in holidays(year).items()}["Midsommardagen"]
        for d in (date(year, 12, 24), date(year, 12, 31),
                  midsummer - timedelta(days=1)):
            assert not CAL.is_public_holiday(d), d
            # Красным такой день всё же бывает — но воскресеньем, а не праздником:
            # 24 декабря 2028-го приходится на воскресенье.
            assert CAL.day_class(d) == (RED if d.weekday() == 6 else EVE), d


# --- окно продукта ---------------------------------------------------------

def test_the_window_is_2026_to_2030():
    assert (SELECTABLE_FROM, SELECTABLE_TO) == (date(2026, 1, 1), date(2030, 12, 31))
    assert selectable(date(2026, 1, 1)) and selectable(date(2030, 12, 31))
    assert not selectable(date(2025, 12, 31))
    assert not selectable(date(2031, 1, 1))


def test_the_horizon_from_the_end_of_the_window_still_has_a_calendar():
    """Шкала строится на восемь суток вперёд, и разбор 28 декабря 2030-го спрашивает
    про январь 2031-го. Считается на год шире именно поэтому — иначе продукт получал бы
    «класс дня неизвестен» на ровном месте в последнюю неделю окна."""
    for n in range(9):
        d = date(2030, 12, 28) + timedelta(days=n)
        assert CAL.day_class(d) != UNKNOWN, d
    # Считать шире — не значит отвечать шире: выбрать такой момент нельзя.
    assert not selectable(date(2031, 1, 5))


def test_outside_the_computed_range_the_class_is_unknown():
    """Ветка «неизвестно» остаётся: набор праздников со временем меняется — до 2005 года
    вместо `nationaldagen` красным был `annandag pingst`, — и молчание тут честнее
    вычисления."""
    assert CAL.day_class(date(2004, 6, 6)) == UNKNOWN
    assert CAL.day_class(date(2040, 1, 1)) == UNKNOWN


# --- переносимость ---------------------------------------------------------

def test_the_calendar_needs_no_file_at_all():
    """Требование к порту (шаг 6): в браузере файлов не будет. Проверяется не словом
    в документации, а исходником: ни чтения, ни json."""
    source = (Path(__file__).resolve().parent.parent
              / "parkread/calendar_se.py").read_text(encoding="utf-8")
    for forbidden in ("import json", "open(", "read_text", "Path"):
        assert forbidden not in source, forbidden
    assert not (Path("data/holidays_se.json").exists())
    assert Calendar().day_class(date(2026, 12, 31)) == EVE


def test_the_picker_on_screen_carries_the_same_window():
    """Края поля выбора момента и края календаря — одно и то же окно, записанное
    дважды. Расхождение ловится здесь, а не пользователем, которому поле позволит
    выбрать день, на который бэкенд ответит отказом."""
    page = (Path(__file__).resolve().parent.parent
            / "web/src/components/PhotoInput.tsx").read_text(encoding="utf-8")
    assert f'MOMENT_FROM = "{SELECTABLE_FROM.isoformat()}T00:00"' in page
    assert f'MOMENT_TO = "{SELECTABLE_TO.isoformat()}T23:59"' in page

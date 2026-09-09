# -*- coding: utf-8 -*-
"""Регрессия движка правил (`AGENTS.md`, §9).

Тесты **постоянные**: каждый закрывает ошибку, уже допущенную при разборе вручную
или найденную на проверке модели. Запуск — `python tests/run.py`, без внешних
зависимостей и без обращений к vision-API.
"""
from datetime import date, datetime, timedelta

from parkread.calendar_se import EVE, RED, UNKNOWN, WEEKDAY, Calendar
from parkread.engine import (ALLOWED, NOT_STATED, PROHIBITED, UNCERTAIN,
                             evaluate_parking_rules, twenty_four_hour_expiry)

CAL = Calendar()


# --- конструкторы знаков ---------------------------------------------------

def sign(*panels, main="parking", form="regular"):
    return {"schema_version": 1,
            "main_sign": {"type": main, "background_color": "blue", "form": form,
                          "legibility": {"readable": True}},
            "panels": [dict(p, index=i + 1) for i, p in enumerate(panels)],
            "panel_count": len(panels),
            "boundaries": {"certain": True}}


def plate(parsed, lines=(), kind="sign_plate", color="blue"):
    return {"kind": kind, "lines": list(lines), "background_color": color,
            "legibility": {"readable": True}, "parsed": parsed}


def win(f, t, day_class="unspecified", named=None):
    w = {"from": f, "to": t, "day_class": day_class}
    if named:
        w["named_weekday"] = named
    return w


def at(regime, moment):
    """Условия и состояние режима в конкретный момент."""
    for p in regime.periods:
        if p.start <= moment < p.end:
            return p.state, p.conditions
    return None, None


# --- календарь -------------------------------------------------------------

def test_day_classes_match_fixture():
    """Фикстура из data/README.md: 57 канунов, из них 48 суббот."""
    d, eves = date(2026, 1, 1), []
    while d <= date(2026, 12, 31):
        if CAL.day_class(d) == EVE:
            eves.append(d)
        d += timedelta(days=1)
    assert len(eves) == 57, len(eves)
    assert sum(1 for x in eves if x.weekday() == 5) == 48


def test_red_beats_eve():
    """Праздник, выпавший на субботу, остаётся красным: канун — это РАБОЧИЙ день
    перед красным, а праздник рабочим днём не является."""
    assert CAL.day_class(date(2026, 6, 6)) == RED      # Sveriges nationaldag, суббота
    assert CAL.day_class(date(2026, 12, 25)) == RED    # Juldagen, перед вторым днём
    assert CAL.day_class(date(2026, 1, 10)) == EVE     # обычная суббота
    assert CAL.day_class(date(2026, 4, 30)) == EVE     # будний канун Первого мая
    assert CAL.day_class(date(2026, 1, 9)) == WEEKDAY  # пятница перед обычной субботой


def test_date_outside_calendar_is_unknown():
    """Календарь считается кодом, но отвечает не за любой год: окно продукта —
    2026-2030, и с запасом в год по краям. Дальше — «неизвестно», а не выдумка:
    набор праздников со временем меняется, и сверял его человек только внутри окна."""
    assert CAL.day_class(date(2035, 3, 1)) == UNKNOWN
    assert CAL.day_class(date(2019, 3, 1)) == UNKNOWN


# --- правило 24 часов ------------------------------------------------------

def test_24h_guaranteed_continuity():
    """Водителю положены полные 24 часа подряд. Обрывают их выходные — счётчик
    обнуляется и начинается заново с ближайшего рабочего дня.

    Правило спорное: шведские коммуны толкуют счёт вокруг выходных по-разному.
    Разработчик сверил распространённость трактовок и выбрал преобладающую."""
    # сутки укладываются в рабочие дни — считаются как есть
    assert twenty_four_hour_expiry(datetime(2026, 3, 2, 13), CAL) == datetime(2026, 3, 3, 13)
    assert twenty_four_hour_expiry(datetime(2026, 3, 5, 13), CAL) == datetime(2026, 3, 6, 13)

    # выходные обрывают сутки — полные 24 часа даются заново с понедельника
    tuesday = datetime(2026, 3, 10, 0)
    assert twenty_four_hour_expiry(datetime(2026, 3, 6, 13), CAL) == tuesday
    assert twenty_four_hour_expiry(datetime(2026, 3, 6, 23, 30), CAL) == tuesday


def test_24h_all_weekend_starts_give_the_same_answer():
    """Начало в любой момент выходных даёт один ответ: счётчик спит и просыпается
    в понедельник в 00:00, давая полные сутки — до вторника 00:00."""
    for start in (datetime(2026, 3, 7, 0, 1),
                  datetime(2026, 3, 7, 8, 0),
                  datetime(2026, 3, 8, 23, 59)):
        assert twenty_four_hour_expiry(start, CAL) == datetime(2026, 3, 10, 0, 0), start


def test_24h_friday_afternoon_is_not_cut_short_by_saturday():
    """Смысл «гарантированной непрерывности»: с пятницы 13:00 до субботы остаётся
    11 часов, а не 24, поэтому сутки не засчитываются частично — они даются целиком
    при ближайшей возможности."""
    friday = datetime(2026, 3, 6, 13)
    assert twenty_four_hour_expiry(friday, CAL) != friday + timedelta(days=1)
    assert twenty_four_hour_expiry(friday, CAL) == datetime(2026, 3, 10, 0)


def test_duration_plate_overrides_24h():
    """Табличка длительности ПЕРЕКРЫВАЕТ умолчание, а не складывается с ним:
    `30 min` означает тридцать минут, а не сутки и ещё полчаса."""
    now = datetime(2026, 3, 2, 13)
    bare = evaluate_parking_rules(sign(), now, CAL).regimes[0]
    limited = evaluate_parking_rules(
        sign(plate({"duration_limit": {"amount": 30, "unit": "minutes"}}, ["30 min"])),
        now, CAL).regimes[0]
    assert bare.duration_source == "24h_default"
    assert limited.duration_source == "plate"
    assert limited.duration_expires_at == now + timedelta(minutes=30)


# --- официальная пара: одни и те же слова, разная группировка ---------------

_TWO_TIM = {"duration_limit": {"amount": 2, "unit": "hours"}}
_AVGIFT_8_18 = {"fee": True, "time_windows": [win("08:00", "18:00", WEEKDAY)]}


def test_official_pair_two_plates():
    """ДВЕ таблички: ограничение в 2 часа действует всегда, плата — только 8-18."""
    now = datetime(2026, 3, 2, 20)   # понедельник, вечер, вне окна платности
    r = evaluate_parking_rules(sign(plate(_TWO_TIM, ["2 tim"]),
                                    plate(_AVGIFT_8_18, ["Avgift", "8-18"])),
                               now, CAL).regimes[0]
    assert r.duration_source == "plate"                      # 2 часа и вечером
    assert at(r, now) == (ALLOWED, [])                       # платы вечером нет
    assert at(r, datetime(2026, 3, 3, 10)) == (ALLOWED, ["avgift"])


def test_official_pair_one_plate():
    """ОДНА табличка: и лимит, и плата действуют только 8-18; вне окна — обычный P."""
    now = datetime(2026, 3, 2, 20)
    joint = dict(_TWO_TIM, **_AVGIFT_8_18)
    r = evaluate_parking_rules(sign(plate(joint, ["2 tim", "Avgift", "8-18"])),
                               now, CAL).regimes[0]
    assert at(r, now) == (ALLOWED, [])
    assert at(r, datetime(2026, 3, 3, 10)) == (ALLOWED, ["avgift"])
    # Ключевое различие с парой выше и вся суть официального примера: у ОДНОЙ
    # таблички лимит живёт ВНУТРИ окна. Вечером, вне окна, он не идёт — два часа
    # от 20:00 отсчитывать не с чего.
    assert r.duration_expires_at != now + timedelta(hours=2)
    # Но и «сутки» — не ответ: в 08:00 окно откроется, и с этой минуты пойдут два
    # часа. Стоянка кончается во вторник в 10:00, а не во вторник вечером.
    #
    # Тест раньше утверждал обратное (`24h_default`) и утверждал зря: он закреплял
    # ошибку, найденную разработчиком на снимке `005` в браузере. Счёт по табличке
    # начинается с НАЧАЛА окна, а не с постановки машины.
    assert r.duration_expires_at == datetime(2026, 3, 3, 10), r.duration_expires_at
    assert r.duration_source == "plate"
    # а внутри окна лимит идёт от самой постановки
    inside = evaluate_parking_rules(sign(plate(joint, ["2 tim", "Avgift", "8-18"])),
                                    datetime(2026, 3, 3, 10), CAL).regimes[0]
    assert inside.duration_source == "plate"
    assert inside.duration_expires_at == datetime(2026, 3, 3, 12)


def test_a_limit_that_starts_later_ends_the_stay_when_it_starts():
    """Снимок `005` (`2 tim / 8-18 / (8-15)`), найдено разработчиком в браузере.

    Машина поставлена в пятницу в 22:10, когда табличка молчит. Продукт отвечал
    «сутки, до вторника»: правило 24 часов с переносом через выходные. Но в субботу
    в 08:00 открывается окно `(8-15)`, и с этой минуты действует предел в два часа.
    Стоянка кончается в субботу в 10:00.
    """
    now = datetime(2026, 9, 4, 22, 10)      # пятница, вне окон
    двухчасовая = {"duration_limit": {"amount": 2, "unit": "hours"},
                   "time_windows": [win("08:00", "18:00", WEEKDAY),
                                    win("08:00", "15:00", EVE)]}
    r = evaluate_parking_rules(sign(plate(двухчасовая, ["2 tim", "8-18", "(8-15)"])),
                               now, CAL).regimes[0]
    assert r.duration_expires_at == datetime(2026, 9, 5, 10), r.duration_expires_at
    assert r.duration_source == "plate"


def test_a_limit_wider_than_its_window_never_bites():
    """Обратная сторона, и без неё поправка выше зашла бы слишком далеко.

    Если окно закрывается раньше, чем истекают часы предела, до предела дело
    не доходит вовсе: `2 tim` в окне `08-09` не обрывает стоянку в 10:00, потому
    что в 09:00 ограничение уже кончилось. Тогда остаётся умолчание в 24 часа.
    """
    now = datetime(2026, 3, 2, 20)          # понедельник, вечер
    узкое = {"duration_limit": {"amount": 2, "unit": "hours"},
             "time_windows": [win("08:00", "09:00", WEEKDAY)]}
    r = evaluate_parking_rules(sign(plate(узкое, ["2 tim", "8-9"])), now, CAL).regimes[0]
    assert r.duration_source == "24h_default", r.duration_source
    assert r.duration_expires_at == now + timedelta(days=1)


def test_conclusion_differs_from_any_single_plate():
    """Требование плана: итог для стопки не совпадает с итогом ни одной
    из её табличек по отдельности."""
    now = datetime(2026, 3, 3, 10)   # вторник, внутри 8-18
    stack = sign(plate(_TWO_TIM, ["2 tim"]), plate(_AVGIFT_8_18, ["Avgift", "8-18"]))
    only1 = sign(plate(_TWO_TIM, ["2 tim"]))
    only2 = sign(plate(_AVGIFT_8_18, ["Avgift", "8-18"]))
    full = evaluate_parking_rules(stack, now, CAL).regimes[0]
    a = evaluate_parking_rules(only1, now, CAL).regimes[0]
    b = evaluate_parking_rules(only2, now, CAL).regimes[0]
    assert at(full, now) != at(a, now)                       # у первой нет платы
    assert full.duration_source != b.duration_source         # у второй нет лимита


# --- дни без указания и явный `alla dagar` ---------------------------------

def test_unspecified_days_means_weekdays_only():
    """«Дни не указаны» — это будни по умолчанию, а не «каждый день»."""
    s = sign(plate({"fee": True, "time_windows": [win("08:00", "18:00")]}, ["Avgift 8-18"]))
    tue = datetime(2026, 3, 3, 10)      # вторник
    sat = datetime(2026, 3, 7, 10)      # суббота
    r = evaluate_parking_rules(s, tue, CAL).regimes[0]
    assert at(r, tue) == (ALLOWED, ["avgift"])
    assert at(r, sat) == (ALLOWED, [])   # в субботу окно не действует


def test_all_days_token_covers_weekend():
    s = sign(plate({"fee": True, "time_windows": [win("08:00", "18:00", "all_days")]},
                   ["Avgift 8-18", "alla dagar"]))
    sat = datetime(2026, 3, 7, 10)
    r = evaluate_parking_rules(s, datetime(2026, 3, 3, 10), CAL).regimes[0]
    assert at(r, sat) == (ALLOWED, ["avgift"])


# --- приоритет запрета -----------------------------------------------------

def test_prohibition_overrides_permission():
    """«Час бесплатно, но стоять нельзя» разрешается в пользу запрета."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"prohibition": True,
                    "time_windows": [win("00:00", "06:00", "named_weekday", "thursday")]},
                   ["Torsd 0-6"], color="yellow"))
    thu = datetime(2026, 3, 5, 3)       # четверг, ночь
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert at(r, thu) == (PROHIBITED, [])
    assert at(r, datetime(2026, 3, 5, 8))[0] == ALLOWED


def test_a_window_under_a_prohibiting_sign_limits_the_prohibition():
    """Табличка со временем под запрещающим знаком **очерчивает** запрет.

    Найдено на снимке зонального знака E20 с табличкой `Onsdag 9-12, jämna veckor,
    1 okt - 30 april`: приложение отвечало «No parking» в сентябрьскую среду
    нечётной недели, то есть когда ни одно условие таблички не выполнено. Причина
    была в модели: базовый режим запрещающего знака держался вне окна, а табличка
    считалась добавкой к вечному запрету. На деле она его и ограничивает — иначе
    табличка не значила бы ничего.
    """
    w = win("09:00", "12:00", "named_weekday", "wednesday")
    w["week_parity"] = "even"
    w["dates"] = {"mode": "only", "ranges": [{"from": "10-01", "to": "04-30"}]}
    s = sign(plate({"time_windows": [w]}, ["Onsdag 9-12", "jämna veckor"]),
             main="prohibition_parking")

    # Шкала строится на восемь суток вперёд, поэтому каждый момент проверяется
    # своим разбором: заглянуть из сентября в октябрь нельзя.
    def state(moment, from_moment):
        return at(evaluate_parking_rules(s, from_moment, CAL).regimes[0], moment)[0]

    # тот самый случай со снимка: сентябрьская среда, нечётная неделя, вне дат
    assert state(datetime(2026, 9, 9, 12, 33), datetime(2026, 9, 9, 12, 33)) == NOT_STATED

    # среда 14 октября — чётная неделя 42, внутри диапазона дат
    oct_start = datetime(2026, 10, 13, 12)
    assert state(datetime(2026, 10, 14, 10), oct_start) == PROHIBITED
    assert state(datetime(2026, 10, 14, 13), oct_start) == NOT_STATED   # после 12:00
    assert state(datetime(2026, 10, 15, 10), oct_start) == NOT_STATED   # четверг

    # соседняя среда 21 октября — неделя 43, нечётная: запрета нет
    assert state(datetime(2026, 10, 21, 10), datetime(2026, 10, 20, 12)) == NOT_STATED


def test_a_sign_that_states_nothing_shows_no_window_at_all():
    """Шкала обещала окно, которого знак не давал.

    На проверке в браузере запрет с окном вне сезона рисовал «Window starts —
    Nothing stated on the sign — Window ends». Читается как окно стоянки, хотя
    знак о стоянке молчит: шкалу в таком случае заменяет фраза.
    """
    from parkread import present

    w = win("09:00", "12:00", "named_weekday", "wednesday")
    w["week_parity"] = "even"
    w["dates"] = {"mode": "only", "ranges": [{"from": "10-01", "to": "04-30"}]}
    silent = evaluate_parking_rules(
        sign(plate({"time_windows": [w]}, ["Onsdag 9-12"]), main="prohibition_parking"),
        datetime(2026, 9, 9, 16, 27), CAL).regimes[0]
    assert {p.state for p in silent.periods} == {NOT_STATED}
    assert present._no_window(silent, []) == present.NO_WINDOW_NOTHING_STATED

    # А там, где знаку есть что сказать, шкала остаётся.
    speaking = evaluate_parking_rules(sign(plate({"fee": True}, ["Avgift"])),
                                      datetime(2026, 9, 9, 16, 27), CAL).regimes[0]
    assert present._no_window(speaking, []) is None


def test_the_scale_shows_only_what_the_sign_states():
    """Шкала — про то, что знак говорит о ВЫБРАННОМ моменте.

    Правило названо разработчиком после проверки зонального знака: момент внутри
    запрета — красная пунктирная линия «No parking»; любой момент вне запрета —
    фраза, и никакого окна вовсе. Прежде экран строил окно от молчания к запрету
    («Window starts — Nothing stated on the sign — No parking — Window ends»),
    то есть обещал окно стоянки там, где знак не разрешает ничего.
    """
    from parkread import present

    w = win("09:00", "12:00", "named_weekday", "wednesday")
    w["week_parity"] = "even"
    w["dates"] = {"mode": "only", "ranges": [{"from": "10-01", "to": "04-30"}]}
    s = sign(plate({"time_windows": [w]}, ["Onsdag 9-12", "jämna veckor"]),
             main="prohibition_parking")

    # Понедельник: знак об этом времени молчит — шкалы нет, есть фраза.
    quiet = evaluate_parking_rules(s, datetime(2026, 10, 12, 10), CAL).regimes[0]
    assert present._visible(quiet) == []
    assert present._no_window(quiet, []) == present.NO_WINDOW_NOTHING_STATED

    # Среда внутри окна: только запрет, и ничего после него.
    ban = evaluate_parking_rules(s, datetime(2026, 10, 14, 10), CAL).regimes[0]
    shown = present._visible(ban)
    assert [p.state for p in shown] == [PROHIBITED]
    assert shown[0].end == datetime(2026, 10, 14, 12)
    assert present._no_window(ban, []) is None

    # Знак, которому есть что сказать, окно по-прежнему показывает целиком.
    paid = evaluate_parking_rules(
        sign(plate({"fee": True, "time_windows": [win("08:00", "18:00")]},
                   ["Avgift 8-18"])),
        datetime(2026, 3, 2, 9), CAL).regimes[0]
    assert len(present._visible(paid)) >= 1
    assert present._no_window(paid, []) is None


def test_a_silent_period_carries_no_stay_limit():
    """Молчание знака — не позволение простоять до ближайшего запрета.

    На проверке в браузере понедельник у того же зонального знака показывал
    «Nothing stated on the sign • 47 h max»: число бралось от начала среды,
    а читалось как срок, который знак разрешает простоять. Знак стоянки здесь
    не даёт вовсе — ограничивать нечего, и конца стоянки у такого момента нет.
    """
    w = win("09:00", "12:00", "named_weekday", "wednesday")
    w["week_parity"] = "even"
    w["dates"] = {"mode": "only", "ranges": [{"from": "10-01", "to": "04-30"}]}
    s = sign(plate({"time_windows": [w]}, ["Onsdag 9-12", "jämna veckor"]),
             main="prohibition_parking")
    monday = datetime(2026, 10, 12, 10)          # понедельник перед средой 14-го
    r = evaluate_parking_rules(s, monday, CAL).regimes[0]
    assert at(r, monday)[0] == NOT_STATED
    assert any(p.state == PROHIBITED for p in r.periods)   # запрет впереди есть
    assert r.duration_expires_at is None
    assert r.duration_source is None

    # А там, где знак стоянку даёт, запрет её по-прежнему обрывает.
    speaking = evaluate_parking_rules(
        sign(plate({"prohibition": True,
                    "time_windows": [win("10:00", "14:00", "named_weekday", "thursday")]},
                   ["Torsd 10-14"], color="yellow")),
        datetime(2026, 3, 4, 12), CAL).regimes[0]
    assert speaking.duration_source == "prohibition"
    assert speaking.duration_expires_at == datetime(2026, 3, 5, 10)


def test_a_prohibiting_sign_without_plates_prohibits_always():
    """Очерчивать нечем — запрет остаётся вечным. Проверка обратной стороны."""
    s = sign(main="prohibition_parking")
    r = evaluate_parking_rules(s, datetime(2026, 9, 9, 12), CAL).regimes[0]
    assert at(r, datetime(2026, 9, 9, 12))[0] == PROHIBITED
    assert at(r, datetime(2026, 9, 12, 3))[0] == PROHIBITED


def test_a_window_under_a_permitting_sign_still_returns_to_permission():
    """Под разрешающим знаком правило обратное, и менять его было нельзя:
    вне окна возвращается разрешение, а не молчание (снимок 005)."""
    s = sign(plate({"fee": True, "time_windows": [win("08:00", "18:00")]},
                   ["Avgift 8-18"]))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 7), CAL).regimes[0]
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["avgift"])
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, [])


def test_ovrig_tid_still_beats_silence_under_a_prohibiting_sign():
    """Снимок 019: запрет 7-18 и «P Avgift övrig tid». Вне окна знак не молчит —
    табличка прямо говорит, что там платная стоянка."""
    s = sign(plate({"time_windows": [win("07:00", "18:00")]}, ["7-18"]),
             plate({"scope_shift": "remaining_time", "permits_parking": True,
                    "fee": True}, ["P Avgift övrig tid"]),
             main="prohibition_parking")
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 6), CAL).regimes[0]
    assert at(r, datetime(2026, 3, 2, 12))[0] == PROHIBITED
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, ["avgift"])


def test_named_weekday_ignores_holiday_calendar():
    """Названный день недели — литерал: запрет действует и в праздничный четверг.
    1 января 2026 — Nyårsdagen, четверг."""
    assert CAL.day_class(date(2026, 1, 1)) == RED
    s = sign(plate({"prohibition": True,
                    "time_windows": [win("00:00", "06:00", "named_weekday", "thursday")]},
                   ["Torsd 0-6"], color="yellow"))
    r = evaluate_parking_rules(s, datetime(2025, 12, 31, 23), CAL).regimes[0]
    assert at(r, datetime(2026, 1, 1, 3)) == (PROHIBITED, [])


# --- сдвиг охвата ----------------------------------------------------------

def test_ovrig_tid_fills_the_complement():
    """Знак А по сути: разрешение в окне, «остальное время» — платно."""
    s = sign(plate({"permit_required": True,
                    "time_windows": [win("07:00", "17:00", WEEKDAY)]},
                   ["Särskilt P-tillstånd erfordras", "07-17"]),
             plate({"fee": True, "scope_shift": "remaining_time"},
                   ["Övrig tid", "avgift"]))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["sarskilt-p-tillstand"])
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, ["avgift"])
    assert at(r, datetime(2026, 3, 7, 12)) == (ALLOWED, ["avgift"])   # суббота


def test_without_scope_shift_base_returns_outside_window():
    """Вне окна возвращается БАЗОВЫЙ режим, а не условия из окна и не «ничего»."""
    s = sign(plate({"fee": True, "time_windows": [win("08:00", "18:00", WEEKDAY)]},
                   ["Avgift 8-18"]))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, [])


# --- эталоны знаков Б и В --------------------------------------------------

def _sign_b():
    return sign(plate({"vehicle_class": "motorcycle", "fee": True, "tariff_code": "Taxa 13",
                       "time_windows": [win("07:00", "19:00", WEEKDAY),
                                        win("11:00", "17:00", EVE)]},
                      ["Avgift", "7-19", "(11-17)", "Taxa 13"]),
                plate({"stretch_metres": {"from": 0, "to": 5}}, ["0-5 m"]),
                plate({"prohibition": True,
                       "time_windows": [win("00:00", "06:00", "named_weekday", "thursday")]},
                      ["Torsd 0-6"], color="yellow"))


def test_sign_b_developer_reading():
    r = evaluate_parking_rules(_sign_b(), datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.eligibility == ["pictogram-motorcycle"]        # места отведены мотоциклам
    assert "stretch-metres" in r.place_notes
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["avgift"])      # будни 7-19
    assert at(r, datetime(2026, 3, 7, 12)) == (ALLOWED, ["avgift"])      # суббота 11-17
    assert at(r, datetime(2026, 3, 7, 9)) == (ALLOWED, [])               # суббота до 11
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, [])              # вне окна — обычный P
    assert at(r, datetime(2026, 3, 5, 3)) == (PROHIBITED, [])            # любой четверг 0-6


def test_sign_v_no_vehicle_plate_does_not_narrow():
    """Отсутствие таблички транспорта круг НЕ сужает (запись 35a)."""
    s = sign(plate({"fee": True, "tariff_code": "Taxa 3",
                    "time_windows": [win("07:00", "19:00", WEEKDAY),
                                     win("11:00", "17:00", EVE)]},
                   ["Avgift", "7-19", "(11-17)", "Taxa 3"]),
             plate({"prohibition": True,
                    "time_windows": [win("00:00", "06:00", "named_weekday", "monday")]},
                   ["Månd 0-6"], color="yellow"),
             plate({"eligibility": "residents"}, ["Boende"], color="white"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 3, 12), CAL).regimes[0]
    # Проверяется именно ТРАНСПОРТ: пиктограммы машины нет, и достраивать её нельзя.
    # `Boende` при этом в круге стоящих есть и быть должен — это ответ на вопрос
    # «кому», просто не про класс транспорта.
    assert not ({"pictogram-motorcycle", "bil-personbil", "pictogram-electric-car"}
                & set(r.eligibility)), r.eligibility
    assert r.eligibility == ["boende"]
    assert at(r, datetime(2026, 3, 9, 3)) == (PROHIBITED, []) # понедельник 0-6
    assert at(r, datetime(2026, 3, 3, 12)) == (ALLOWED, ["avgift"])


# --- стрелки ---------------------------------------------------------------

def test_arrows_split_into_two_regimes():
    """Снимок 010: стрелка закрывает указание над собой, и один знак задаёт
    два режима — по одному на участок."""
    s = sign(plate({"eligibility": "rented"}, ["Förhyrda platser"]),
             plate({"arrow": "left"}, color="white"),
             plate({"eligibility": "rented", "permit_required": True},
                   ["Förhyrd plats", "Särskilt P-tillstånd erfordras"]),
             plate({"arrow": "right"}, color="white"))
    ev = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL)
    assert len(ev.regimes) == 2
    left, right = ev.regimes
    assert (left.extent, right.extent) == ("left", "right")
    assert left.eligibility == ["forhyrda-platser"]
    # справа — арендованное место, где ВДОБАВОК нужно разрешение: два условия
    assert right.eligibility == ["forhyrda-platser", "sarskilt-p-tillstand"]


def test_no_arrow_means_here():
    s = sign(plate({"vehicle_class": "motorcycle"}))
    ev = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL)
    assert len(ev.regimes) == 1 and ev.regimes[0].extent == "here"


# --- границы продукта ------------------------------------------------------

def test_info_board_never_enters_rules():
    """Платёжное табло — не дорожный знак: в правила не попадает."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"area_code": "31370"}, ["Områdeskod 31370"],
                   kind="info_board", color="other"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["avgift"])
    assert r.place_notes == []


def test_wayfinding_sign_permits_nothing():
    ev = evaluate_parking_rules(sign(main="wayfinding_park_and_ride"),
                                datetime(2026, 3, 2, 12), CAL)
    assert ev.permits_parking is False and ev.regimes == []


def test_prohibition_main_sign_inverts_base():
    """Снимок 019: базовый режим запрещающий, «Övrig tid avgift» открывает дополнение."""
    s = sign(plate({"time_windows": [win("07:00", "18:00", WEEKDAY)]}, ["7-18"], color="yellow"),
             plate({"fee": True, "scope_shift": "remaining_time", "permits_parking": True},
                   ["P Avgift", "övrig tid"]),
             main="prohibition_parking")
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    # разбор разработчика: запрет в будни 7-18, в остальное время — обычный P с платой
    assert at(r, datetime(2026, 3, 2, 12)) == (PROHIBITED, [])     # будни 7-18
    assert at(r, datetime(2026, 3, 2, 20)) == (ALLOWED, ["avgift"])  # вечер
    assert at(r, datetime(2026, 3, 7, 12)) == (ALLOWED, ["avgift"])  # суббота


def test_date_outside_calendar_is_uncertain_not_error():
    ev = evaluate_parking_rules(
        sign(plate({"fee": True, "time_windows": [win("08:00", "18:00", WEEKDAY)]})),
        datetime(2035, 5, 3, 10), CAL)
    assert "date_outside_calendar" in ev.uncertainties
    assert any(p.state == UNCERTAIN for p in ev.regimes[0].periods)


# --- эталоны с новых снимков 022 и 023 -------------------------------------

def test_sign_022_charging_electric_only():
    """Разбор разработчика: два места справа от знака только для заряжающихся
    электромобилей и подключаемых гибридов; стоянка всегда платная; максимум 4 часа."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"duration_limit": {"amount": 4, "unit": "hours"}}, ["4 tim"]),
             plate({"vehicle_class": "electric"}, ["Endast laddande elbilar"]),
             plate({"place_count": 2}, ["2 platser"]),
             plate({"arrow": "right"}, color="white"),
             plate({"area_code": "31308"}, ["Områdeskod 31308"],
                   kind="info_board", color="other"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.extent == "right"
    assert r.eligibility == ["pictogram-electric-car"]
    assert "place-count" in r.place_notes
    # плата и лимит без окон действуют всегда: и в будни, и в выходные, и ночью
    for moment in (datetime(2026, 3, 2, 12), datetime(2026, 3, 7, 3),
                   datetime(2026, 3, 8, 23)):
        assert at(r, moment) == (ALLOWED, ["avgift"]), moment
    assert r.duration_source == "plate"
    assert r.duration_expires_at == datetime(2026, 3, 2, 16)


def test_sign_023_same_rule_without_count_and_arrow():
    """Пара к 022: то же правило в другом окружении, вывод меняться не должен."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"duration_limit": {"amount": 4, "unit": "hours"}}, ["4 tim"]),
             plate({"vehicle_class": "electric"}, ["Endast laddande elbilar"]))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.extent == "here"                 # стрелки нет — место здесь же
    assert r.place_notes == []                # сколько мест, знак не говорит
    assert r.eligibility == ["pictogram-electric-car"]
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["avgift"])
    assert r.duration_expires_at == datetime(2026, 3, 2, 16)


def test_forhyrda_platser_with_numbered_spaces():
    """Снимок 020: ворота по аренде плюс номера конкретных мест как пометка."""
    s = sign(plate({"eligibility": "rented"},
                   ["Förhyrda platser", "Gäller plats 13 och 14"]),
             plate({"arrow": "right"}, color="white"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.extent == "right"
    assert r.eligibility == ["forhyrda-platser"]


def test_privat_parkering_does_not_restrict():
    """Снимок 021, исправленный разбор разработчика: `Privat parkering` правил
    не задаёт. Знак `P` на частной земле означает то же самое — стоять может кто
    угодно, и действует умолчание в 24 часа. Табличка лишь сообщает, кто следит
    за площадкой и каким будет штраф."""
    s = sign(plate({"operator": {"name": "Brf Ängslyckan"}},
                   ["Privat parkering", "Brf Ängslyckan"], kind="operator_plate"),
             plate({"arrow": "right"}, color="white"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.eligibility == [], "круг не сужается"
    assert r.duration_source == "24h_default", "умолчание в 24 часа действует"
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, [])


# --- эталоны со снимков 024-026 --------------------------------------------

def test_sign_024_payment_by_phone_only():
    """Разбор разработчика: обычный `P`, стоянка всегда платная. Способ оплаты
    (телефон, приложение, SMS) в область продукта не входит — важно только «платно»."""
    s = sign(plate({"fee": True}, ["Avgift erläggs med"]),
             plate({"arrow": "both_horizontal"}, color="white"),
             plate({"operator": {"name": "Västia Parkering", "phone": "0771-501550"}},
                   ["Västia Parkering", "0771-501550"], kind="operator_plate"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.extent == "both_sides"
    # плата без окна действует всегда, и способ оплаты идёт рядом с ней
    for moment in (datetime(2026, 3, 2, 12), datetime(2026, 3, 7, 23)):
        # способ оплаты в область продукта не входит: важно только «платно»
        assert at(r, moment) == (ALLOWED, ["avgift"]), moment
    assert r.duration_source == "24h_default"


def test_sign_025_eligibility_and_duration_on_one_plate():
    """Снимок 025: `30 min` и `Endast gäster till Franks Gatukök` на ОДНОЙ табличке.
    По правилу «gemensamt» это одно указание: тридцать минут относятся к гостям."""
    s = sign(plate({"stretch_metres": {"from": 0, "to": 30}}, ["0-30 m"]),
             plate({"duration_limit": {"amount": 30, "unit": "minutes"},
                    "eligibility": "visitors"},
                   ["30 min", "Endast gäster till Franks Gatukök"]),
             plate({"arrow": "left"}, color="white"))
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.extent == "left"
    assert r.eligibility == ["besokande"]
    assert "stretch-metres" in r.place_notes
    assert r.duration_source == "plate"
    assert r.duration_expires_at == datetime(2026, 3, 2, 12, 30)
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, [])   # бесплатно


def test_metres_are_not_minutes():
    """Ловушка снимка 025: `0-30 m` и `30 min` стоят рядом. Отрезок в метрах
    не имеет права превратиться в длительность."""
    only_metres = sign(plate({"stretch_metres": {"from": 0, "to": 30}}, ["0-30 m"]))
    r = evaluate_parking_rules(only_metres, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert r.duration_source == "24h_default", "метры не стали минутами"
    assert r.duration_expires_at == datetime(2026, 3, 3, 12)


def test_sign_026_zone_reads_as_ordinary_sign():
    """Снимок 026: жёлтый зональный щит `P` + `Avgift`. Правило читается как
    у обычного знака; протяжённость зоны продукт не вычисляет."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"prohibition": True, "placement": "marked_bay_only"},
                   ["Utanför markerad plats"], color="yellow"),
             plate({"operator": {"name": "Mölndals Parkerings AB"}},
                   ["Mölndals Parkerings AB"], color="yellow", kind="operator_plate"),
             form="zone")
    r = evaluate_parking_rules(s, datetime(2026, 3, 2, 12), CAL).regimes[0]
    assert "utanfor-markerad-plats" in r.place_notes
    assert at(r, datetime(2026, 3, 2, 12)) == (ALLOWED, ["avgift"])
    assert r.duration_source == "24h_default"


# --- находки обкатки на знаке Boende Solna ---------------------------------

def test_info_board_below_the_arrow_is_not_a_second_stretch():
    """Табло висит ниже стрелки, и раньше оно образовывало ВТОРОЙ участок — режим
    из одного платёжного табла. Продукт сообщал про него «стрелки нет, места здесь
    же» про знак, у которого стрелки как раз есть."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"arrow": "both_horizontal"}),
             plate({"area_code": "8010"}, ["Områdeskod 8010"], kind="info_board"))
    ev = evaluate_parking_rules(s, datetime(2026, 9, 2, 18, 41), CAL)
    assert len(ev.regimes) == 1, [r.extent for r in ev.regimes]
    assert ev.regimes[0].extent == "both_sides"


def test_prohibition_ends_the_stay_earlier_than_the_24h_limit():
    """`Torsdag 10-14` посреди суток означает, что машину надо убрать в 10:00,
    а не досидеть до 18:41 следующего дня. Найдено разработчиком: шкала показывала
    конец стоянки ровно через 24 часа от загрузки снимка, будто запрета нет."""
    s = sign(plate({"fee": True}, ["Avgift"]),
             plate({"prohibition": True,
                    "time_windows": [win("10:00", "14:00", "named_weekday",
                                         named="thursday")]},
                   ["Torsdag 10-14"]))
    wednesday_evening = datetime(2026, 9, 2, 18, 41)
    r = evaluate_parking_rules(s, wednesday_evening, CAL).regimes[0]

    assert r.duration_expires_at == datetime(2026, 9, 3, 10, 0)
    assert r.duration_source == "prohibition"


def test_without_a_prohibition_the_24h_limit_still_governs():
    """Обратная проверка: запрет обрывает стоянку, только если он вообще есть."""
    r = evaluate_parking_rules(sign(plate({"fee": True}, ["Avgift"])),
                               datetime(2026, 9, 2, 18, 41), CAL).regimes[0]
    assert r.duration_expires_at == datetime(2026, 9, 3, 18, 41)
    assert r.duration_source == "24h_default"


def test_even_week_prohibition_applies_every_second_week():
    """`Jämna veckor` — запрет приходит через неделю, а не каждую. Без этого поля
    продукт считал запрет действующим всегда: на запрете это строже правды,
    на разрешающем окне было бы наоборот — обещание стоянки там, где её нет."""
    s = sign(plate({"prohibition": True,
                    "time_windows": [dict(win("10:00", "14:00", "named_weekday",
                                              named="thursday"),
                                          week_parity="even")]},
                   ["Torsdag 10-14", "Jämna veckor"]))

    even = datetime(2026, 9, 3, 11)      # четверг недели 36 — чётная
    odd = datetime(2026, 9, 10, 11)      # четверг недели 37 — нечётная
    assert even.isocalendar()[1] % 2 == 0 and odd.isocalendar()[1] % 2 == 1

    assert at(evaluate_parking_rules(s, even, CAL).regimes[0], even)[0] == PROHIBITED
    assert at(evaluate_parking_rules(s, odd, CAL).regimes[0], odd)[0] == ALLOWED


def test_date_range_may_wrap_the_year_end():
    """`1 nov-15 maj` — зима: первый месяц больше второго не по ошибке."""
    s = sign(plate({"prohibition": True,
                    "time_windows": [dict(win("12:00", "15:00", "named_weekday",
                                              named="tuesday"),
                                          dates={"mode": "only", "ranges": [
                                              {"from": "11-01", "to": "05-15"}]})]},
                   ["Tisdag 12-15", "1 nov-15 maj"]))

    december = datetime(2026, 12, 1, 13)      # вторник, внутри сезона
    june = datetime(2026, 6, 2, 13)           # вторник, вне сезона
    assert at(evaluate_parking_rules(s, december, CAL).regimes[0], december)[0] == PROHIBITED
    assert at(evaluate_parking_rules(s, june, CAL).regimes[0], june)[0] == ALLOWED


def test_mid_month_boundary_is_kept_to_the_day():
    """Ради этого поле и переписано с месяцев на даты. `15 maj` — это 15 мая,
    а не май целиком: округление вверх добавляло две недели запрета, которых
    на знаке нет (снимок `034`)."""
    s = sign(plate({"prohibition": True,
                    "time_windows": [dict(win("12:00", "15:00", "named_weekday",
                                              named="tuesday"),
                                          dates={"mode": "only", "ranges": [
                                              {"from": "11-01", "to": "05-15"}]})]},
                   ["Tisdag 12-15", "1 nov-15 maj"]))

    inside = datetime(2026, 5, 12, 13)        # вторник 12 мая — сезон ещё идёт
    outside = datetime(2026, 5, 19, 13)       # вторник 19 мая — уже кончился
    assert at(evaluate_parking_rules(s, inside, CAL).regimes[0], inside)[0] == PROHIBITED
    assert at(evaluate_parking_rules(s, outside, CAL).regimes[0], outside)[0] == ALLOWED


def test_single_days_are_ranges_of_one_day():
    """`Gäller ej 15/6 15/8` разработчик прочёл как два отдельных дня. Форма записи
    та же, что у сезона: промежуток, у которого начало равно концу."""
    s = sign(plate({"prohibition": True,
                    "time_windows": [dict(win("00:00", "06:00", "named_weekday",
                                              named="friday"),
                                          dates={"mode": "except", "ranges": [
                                              {"from": "06-15", "to": "06-15"},
                                              {"from": "08-15", "to": "08-15"}]})]},
                   ["Fred 0-6", "Gäller ej 15/6 15/8"]))

    excluded = datetime(2026, 6, 19, 3)       # пятница... но не 15-е
    assert datetime(2026, 6, 19).strftime("%a") == "Fri"
    assert at(evaluate_parking_rules(s, excluded, CAL).regimes[0], excluded)[0] == PROHIBITED

    from parkread.engine import _dates_match
    from datetime import date as _d
    win_only = {"dates": {"mode": "except", "ranges": [{"from": "06-15", "to": "06-15"}]}}
    assert not _dates_match(win_only, _d(2026, 6, 15)), "15 июня исключён"
    assert _dates_match(win_only, _d(2026, 6, 16)), "16 июня — нет"


def test_parity_and_season_are_named_to_the_reader():
    """Правило, которое молча применяется, пользователь проверить не может.
    Чётность и сезон обязаны попасть в справочные ключи панели."""
    from parkread.reference import Reference, recognise
    ref = Reference(__import__("pathlib").Path("reference/signs"))
    s = sign(plate({"prohibition": True,
                    "time_windows": [dict(win("10:00", "14:00", "named_weekday",
                                              named="thursday"),
                                          week_parity="even",
                                          dates={"mode": "except", "ranges": [
                                              {"from": "07-01", "to": "07-31"}]})]},
                   ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"]))
    keys = recognise(s, ref).panel_keys[1]
    assert "jamna-veckor" in keys and "datumintervall" in keys, keys


def test_residents_plate_answers_who_can_park():
    """`Boende` отвечает на вопрос «кому» не хуже прочих условий допуска.
    Без него знак с табличкой жильцов сообщал только «всем транспортным средствам»,
    хотя на столбе прямо написано, для кого места."""
    r = evaluate_parking_rules(sign(plate({"eligibility": "residents"}, ["Boende Solna"])),
                               datetime(2026, 9, 2, 19, 27), CAL).regimes[0]
    assert r.eligibility == ["boende"]


def test_an_arrow_under_a_wayfinding_sign_means_direction_not_extent():
    """Снимок `037`, найдено разработчиком в браузере.

    Под указателем `F28` стоит стрелка поворота, и продукт называл её
    протяжённостью участка (`T11`): «действует справа от знака». Но указатель
    стоянки не разрешает вовсе — протягивать вправо нечего, и стрелка показывает
    дорогу. `T11` описывает МЕСТО, где можно стоять, а места здесь нет.

    Стрелка под указателем может быть и его частью, и отдельным знаком
    предписанного направления (`D1`) на том же столбе. Различить их по фотографии
    продукт не берётся, и не нужно: последствие одно — «стоянка не здесь, а там».
    """
    from pathlib import Path

    from parkread.reference import Reference, recognise
    ref = Reference(Path("reference/signs"))

    указатель = sign(plate({"arrow": "right", "pictogram": "arrow"}),
                     main="wayfinding_parking_house")
    keys = recognise(указатель, ref).panel_keys[1]
    assert keys == ["wayfinding-direction"], keys


def test_the_same_arrow_under_a_parking_sign_is_still_the_extent():
    """Обратная сторона, и без неё поправка расползётся: под обычным `P` та же
    стрелка по-прежнему `T11`. Протяжённость — рабочее указание, и потерять её
    значит потерять участок, к которому относится разрешение."""
    from pathlib import Path

    from parkread.reference import Reference, recognise
    ref = Reference(Path("reference/signs"))

    стоянка = sign(plate({"arrow": "right", "pictogram": "arrow"}))
    keys = recognise(стоянка, ref).panel_keys[1]
    assert keys == ["arrow-right"], keys


def test_plates_below_the_last_arrow_do_not_make_a_second_stretch():
    """Снимок `033`, найдено разработчиком в браузере.

    `Zon E` и `Boende Storskogen` стоят ПОД стрелкой влево, и движок делал из них
    второй режим «здесь, у знака» — у знака, у которого стрелка как раз есть
    и уводит стоянку влево. Разработчик прочёл знак одним участком.

    Стрелка закрывает указания НАД собой; то, что под ней, относится к знаку
    целиком и достаётся каждому участку.
    """
    r = evaluate_parking_rules(
        sign(plate(_AVGIFT_8_18, ["Avgift", "8-18"]),
             plate({"arrow": "left"}),
             plate({"tariff_code": "Zon E"}, ["Zon E"]),
             plate({"eligibility": "residents"}, ["Boende"], color="white")),
        datetime(2026, 3, 2, 12), CAL)
    assert [x.extent for x in r.regimes] == ["left"], [x.extent for x in r.regimes]
    # и хвостовые таблички не потерялись: круг жильцов достался участку
    assert "boende" in r.regimes[0].eligibility


def test_the_tail_reaches_every_stretch_not_just_the_last():
    """Табличка внизу стопки относится к знаку целиком, значит и к обоим участкам.
    Отдать её только последнему значило бы придумать различие, которого на знаке нет."""
    r = evaluate_parking_rules(
        sign(plate(_TWO_TIM, ["2 tim"]),
             plate({"arrow": "left"}),
             plate(_AVGIFT_8_18, ["Avgift", "8-18"]),
             plate({"arrow": "right"}),
             plate({"eligibility": "residents"}, ["Boende"], color="white")),
        datetime(2026, 3, 2, 12), CAL)
    assert [x.extent for x in r.regimes] == ["left", "right"]
    for режим in r.regimes:
        assert "boende" in режим.eligibility, режим.extent


def test_a_sign_without_arrows_is_still_one_stretch_here():
    """Обратная сторона: закрывать нечего, и участок по-прежнему «здесь».
    Без этой проверки поправка легко съест обычный знак без стрелок."""
    r = evaluate_parking_rules(sign(plate(_TWO_TIM, ["2 tim"])),
                               datetime(2026, 3, 2, 12), CAL)
    assert [x.extent for x in r.regimes] == ["here"]

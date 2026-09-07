# -*- coding: utf-8 -*-
"""Регрессия категорий полноты и правила асимметрии (этап 4).

Ключевой набор — сценарии из плана: **один и тот же снимок с искусственно выбитой
панелью даёт разные категории**.
"""
import copy
from datetime import datetime
from pathlib import Path

from parkread.calendar_se import Calendar
from parkread.completeness import (FULL, INSUFFICIENT, MAY_BE_INCOMPLETE,
                                   MAY_PROHIBIT, NOT_A_PARKING_SIGN, PARTIAL,
                                   apply_asymmetry, grade)
from parkread.engine import ALLOWED, UNCERTAIN, evaluate_parking_rules

CAL = Calendar(Path("data/holidays_se.json"))
NOW = datetime(2026, 3, 2, 12)   # обычный понедельник


def _sign():
    """P + `Avgift 8-18` + жёлтая табличка запрета. Три панели, все прочитаны."""
    return {
        "schema_version": 1,
        "main_sign": {"type": "parking", "background_color": "blue",
                      "form": "regular", "legibility": {"readable": True}},
        "panels": [
            {"index": 1, "kind": "sign_plate", "lines": ["Avgift", "8-18"],
             "background_color": "blue", "legibility": {"readable": True},
             "parsed": {"fee": True, "time_windows": [
                 {"from": "08:00", "to": "18:00", "day_class": "weekday"}]}},
            {"index": 2, "kind": "sign_plate", "lines": ["2 tim"],
             "background_color": "blue", "legibility": {"readable": True},
             "parsed": {"duration_limit": {"amount": 2, "unit": "hours"}}},
            {"index": 3, "kind": "sign_plate", "lines": ["Torsd 0-6"],
             "background_color": "yellow", "legibility": {"readable": True},
             "parsed": {"prohibition": True, "time_windows": [
                 {"from": "00:00", "to": "06:00", "day_class": "named_weekday",
                  "named_weekday": "thursday"}]}},
        ],
        "panel_count": 3,
        "boundaries": {"certain": True},
    }


def _blank(sign, index, color):
    """Выбить панель: текст и разобранные поля стёрты, цвет остался.
    Именно так выглядит табличка, залепленная грязью."""
    s = copy.deepcopy(sign)
    p = next(x for x in s["panels"] if x["index"] == index)
    p["lines"] = []
    p["parsed"] = {}
    p["background_color"] = color
    p["legibility"] = {"readable": False, "obstructions": ["dirt"]}
    return s


# --- четыре категории ------------------------------------------------------

def test_full_parse():
    a = grade(_sign())
    assert a.category == FULL
    assert a.unread_panels == []
    assert a.confidence > 0.9


def test_not_a_parking_sign_comes_from_triage():
    a = grade(None, triage_category="not_a_sign")
    assert a.category == NOT_A_PARKING_SIGN and not a.has_answer


def test_schema_invalid_is_insufficient():
    a = grade(None, schema_valid=False)
    assert a.category == INSUFFICIENT and a.confidence == 0.0


def test_one_of_three_unread_is_partial():
    """Ровно случай наставника: одна из трёх табличек залеплена грязью."""
    a = grade(_blank(_sign(), 2, "blue"))
    assert a.category == PARTIAL
    assert a.unread_panels == [2]


def test_most_panels_unread_is_insufficient():
    s = _blank(_blank(_sign(), 1, "blue"), 2, "blue")
    a = grade(s)
    assert a.category == INSUFFICIENT


def test_panel_count_disagreement_lowers_confidence_but_keeps_the_answer():
    """Расхождение с независимым счётом панелей — сигнал, а не приговор.

    Мерено на 22 настоящих ответах: флаг сработал 5 раз, все пять — ложная тревога,
    настоящих потерь границы поймано ноль. Отнимать за это ответ целиком значит
    совершать самую дорогую ошибку продукта — человек стоит перед знаком и не получает
    ничего — ради защиты, которая пока ни разу не сработала по делу."""
    a = grade(_sign(), flags=["panel_count_disagreement:4!=3"])
    assert a.category != INSUFFICIENT, "ответ остаётся"
    assert "panel_count_disagreement" in a.reasons, "но причина названа"
    assert a.confidence < grade(_sign()).confidence, "и уверенность ниже"


def test_unknown_main_sign_is_insufficient():
    s = _sign()
    s["main_sign"]["type"] = "unknown"
    assert grade(s).category == INSUFFICIENT


# --- сценарий плана: одна и та же фотография, разные категории --------------

def test_same_photo_different_categories():
    base = _sign()
    assert grade(base).category == FULL
    assert grade(_blank(base, 2, "blue")).category == PARTIAL
    assert grade(_blank(_blank(base, 1, "blue"), 2, "blue")).category == INSUFFICIENT


# --- цвет непрочитанной панели ---------------------------------------------

def test_yellow_unread_panel_may_prohibit():
    a = grade(_blank(_sign(), 3, "yellow"))
    assert a.category == PARTIAL and a.may_hide_prohibition


def test_blue_unread_panel_does_not_imply_prohibition():
    a = grade(_blank(_sign(), 2, "blue"))
    assert a.category == PARTIAL and not a.may_hide_prohibition


def test_unreadable_colour_is_treated_as_worst_case():
    """Если не читается даже цвет — считаем, что панель может быть запретом."""
    a = grade(_blank(_sign(), 2, "unreadable"))
    assert a.may_hide_prohibition


# --- правило асимметрии ----------------------------------------------------

def test_full_parse_is_not_narrowed():
    s = _sign()
    ev = evaluate_parking_rules(s, NOW, CAL)
    out = apply_asymmetry(ev, grade(s))
    assert [p.state for p in out.regimes[0].periods] == \
           [p.state for p in ev.regimes[0].periods]


def test_yellow_unread_forbids_presenting_any_period_as_allowed():
    """Жёлтая непрочитанная панель может быть запретом, поэтому ни один период
    не подаётся как разрешающий."""
    s = _blank(_sign(), 3, "yellow")
    ev = evaluate_parking_rules(s, NOW, CAL)
    assert any(p.state == ALLOWED for p in ev.regimes[0].periods)   # до правила
    out = apply_asymmetry(ev, grade(s))
    assert not any(p.state == ALLOWED for p in out.regimes[0].periods)
    assert all(p.note == MAY_PROHIBIT for p in out.regimes[0].periods
               if p.state == UNCERTAIN)
    assert MAY_PROHIBIT in out.uncertainties


def test_blue_unread_keeps_answer_but_marks_empty_periods():
    """«В остальное время ограничений нет» при неполном разборе — утверждение,
    основанное на отсутствии данных. Такой период помечается."""
    s = _blank(_sign(), 2, "blue")
    out = apply_asymmetry(evaluate_parking_rules(s, NOW, CAL), grade(s))
    allowed = [p for p in out.regimes[0].periods if p.state == ALLOWED]
    assert allowed, "ответ сохраняется"
    empty = [p for p in allowed if not p.conditions]
    assert empty and all(p.note == MAY_BE_INCOMPLETE for p in empty)


def test_asymmetry_never_widens():
    """Проверка направления: правило может только убрать разрешающие периоды,
    добавить их оно не может ни при каких данных."""
    for color in ("yellow", "blue", "white", "unreadable"):
        s = _blank(_sign(), 2, color)
        ev = evaluate_parking_rules(s, NOW, CAL)
        out = apply_asymmetry(ev, grade(s))
        before = sum(1 for p in ev.regimes[0].periods if p.state == ALLOWED)
        after = sum(1 for p in out.regimes[0].periods if p.state == ALLOWED)
        assert after <= before, color


# --- уверенность -----------------------------------------------------------

def test_confidence_falls_as_data_is_lost():
    full = grade(_sign()).confidence
    partial = grade(_blank(_sign(), 2, "blue")).confidence
    disagreement = grade(_sign(), flags=["panel_count_disagreement:4!=3"]).confidence
    assert full > partial > 0
    assert full > disagreement


def test_confidence_is_a_number_inside_the_category_not_instead_of_it():
    """Категорию задаёт то, чего не хватает. Высокая уверенность не превращает
    частичный разбор в полный."""
    s = _blank(_sign(), 2, "blue")
    s["model_confidence"] = 1.0
    a = grade(s)
    assert a.category == PARTIAL


def test_an_uninterpreted_plate_is_not_a_full_reading():
    """Прочитать текст таблички и понять её — разные вещи. Знак `Beskickningsfordon`
    разбирался как полный с уверенностью 98%: текст снят, а что он предписывает —
    неизвестно. Найдено разработчиком на обкатке."""
    a = grade(_sign(), flags=["uninterpreted_panels:1"])
    b = grade(_sign())
    assert a.category == PARTIAL, "часть знака до продукта не дошла"
    assert a.confidence < b.confidence
    assert a.uninterpreted_plates == [1]
    assert any(r.startswith("uninterpreted_plates:") for r in a.reasons)


def test_only_rule_bearing_plates_count_as_uninterpreted():
    """Табло оператора не истолковано по определению и уверенность ронять не должно:
    правил оно не задаёт."""
    s = _sign()
    s["panels"].append({"index": 9, "kind": "info_board", "lines": ["EasyPark"],
                        "background_color": "white",
                        "legibility": {"readable": True}, "parsed": {}})
    a = grade(s, flags=["uninterpreted_panels:9"])
    assert a.uninterpreted_plates == []
    assert a.category != PARTIAL or a.reasons


# --- подтверждение основного знака табличками ------------------------------
#
# Замер на 54 снимках: `050` — частный указатель `Aimo Park` со стрелкой к стоянке
# на другой улице — разобран как `parking` с уверенностью 0.998, и продукт ответил
# «стоянка разрешена здесь, сутки». Ни один сигнал не сработал: противоречия не было,
# потому что весь ответ состоял из одного поля.

def _pointer():
    """`P` со стрелкой и больше ничем — по разбору неотличим от указателя к стоянке."""
    return {
        "schema_version": 1,
        "main_sign": {"type": "parking", "background_color": "blue",
                      "form": "regular", "legibility": {"readable": True}},
        "panels": [
            {"index": 1, "kind": "sign_plate", "lines": [],
             "background_color": "blue", "legibility": {"readable": True},
             "parsed": {"arrow": "right"}},
        ],
        "panel_count": 1,
        "boundaries": {"certain": True},
    }


def test_a_sign_without_a_single_rule_plate_is_not_a_full_parse():
    """Стрелка не подтверждает, что стоянка здесь: ровно так же она стоит
    и на указателе к чужой стоянке. Подтверждать нечем — значит не `full`."""
    a = grade(_pointer())
    assert a.category == PARTIAL, a.category
    assert "main_sign_uncorroborated" in a.reasons
    assert a.confidence < 0.9, a.confidence


def test_no_plates_at_all_still_gets_an_answer():
    """`050` в чистом виде: табличек нет вовсе. Ответ при этом остаётся — молчать
    продукт не начинает, потому что молчание стоит пользователю дороже оговорки."""
    s = _pointer()
    s["panels"], s["panel_count"] = [], 0
    a = grade(s)
    assert a.category == PARTIAL, a.category
    assert a.has_answer, "ответ должен остаться"


def test_one_rule_plate_is_enough_to_corroborate():
    """Обратная сторона: `P` с `Avgift` подтверждает сам себя — указатель
    к стоянке платы за проезд мимо себя не требует."""
    s = _pointer()
    s["panels"][0]["parsed"] = {"arrow": "right", "fee": True}
    a = grade(s)
    assert a.category == FULL, a.reasons
    assert "main_sign_uncorroborated" not in a.reasons


def test_placement_fields_alone_never_corroborate():
    """Держит границу списка: поля положения говорят, КУДА и СКОЛЬКО МЕТРОВ,
    но не свидетельствуют, что у этого столба стоянка вообще есть.

    Без этого теста список правил однажды пополнится «любым разобранным полем» —
    и подтверждение снова начнёт подтверждать само себя."""
    for поле, значение in (("arrow", "right"), ("placement", "as_shown"),
                           ("stretch_metres", {"from": 0, "to": 15}),
                           ("place_count", 4), ("pictogram", "parking")):
        s = _pointer()
        s["panels"][0]["parsed"] = {поле: значение}
        a = grade(s)
        assert "main_sign_uncorroborated" in a.reasons, поле


def test_every_rule_key_is_a_field_the_schema_knows():
    """Список правил перечисляет поля `parsed` по именам, и опечатка в нём молча
    сделала бы сигнал слепым к целому виду табличек."""
    import json
    from parkread import completeness

    schema = json.loads(Path("schema/sign.schema.json").read_text(encoding="utf-8"))
    known = set(schema["$defs"]["parsed"]["properties"])
    assert completeness.RULE_KEYS <= known, completeness.RULE_KEYS - known
    assert completeness.PLACEMENT_KEYS <= known, completeness.PLACEMENT_KEYS - known
    assert not (completeness.RULE_KEYS & completeness.PLACEMENT_KEYS)


def test_the_caption_does_not_claim_a_plate_went_unread():
    """У `partial` причин две, и они разные. Сказать про знак без табличек «часть
    знака не прочитана» — неправда, и неправда обидная: пользователь пойдёт искать
    на столбе то, чего там нет."""
    from parkread.present import _category_text

    без_подтверждения = _category_text(grade(_pointer()))
    assert "not read" not in без_подтверждения, без_подтверждения
    assert "no plate" in без_подтверждения.lower()

    # а когда табличка и правда не прочитана — подпись обычная
    обычная = _category_text(grade(_blank(_sign(), 2, "blue")))
    assert "not read" in обычная, обычная


# --- хватает ли пикселей на прочитанный текст ------------------------------
#
# Партия плохих кадров показала, чего стоит спрашивать об этом модель: на снимке
# 82x179 она вернула четыре таблички связного шведского текста и НИ ОДНОЙ пометки
# о помехах, а на хорошем ночном кадре честно сообщила про блики. Помехи она
# называет там, где кадр хороший. Разрешение продукт меряет сам.

def _wordy():
    """Знак с таким же объёмом текста, как на `061`: шестьдесят с лишним
    печатных знаков. Обычный `_sign()` для этой проверки не годится — на нём
    всего два десятка букв, и порог он не задевает при любом разумном кадре."""
    s = _sign()
    s["panels"][0]["lines"] = ["Avgift", "7-19", "(11-17)", "Taxa 3"]
    s["panels"][1]["lines"] = ["Övrig tid", "3 tim", "P-skiva", "24 h max"]
    s["panels"][2]["lines"] = ["Får ej ställas", "på i sidled"]
    return s


def test_more_text_than_the_pixels_can_carry_is_not_a_full_parse():
    """`061`: 82x179 пикселей и шестьдесят четыре печатных знака в ответе.
    На табличку приходится порядка тридцати пикселей — прочесть это оттуда нельзя."""
    a = grade(_wordy(), image_pixels=82 * 179)
    assert a.category == PARTIAL, a.category
    assert "text_exceeds_the_pixels" in a.reasons
    assert a.signals["text_fits_the_pixels"] < 0.5


def test_a_large_photo_is_not_punished_for_its_text():
    """Обратная сторона: на нормальном кадре тот же текст ничего не стоит."""
    a = grade(_wordy(), image_pixels=1200 * 1600)
    assert a.category == FULL, a.reasons
    assert a.signals["text_fits_the_pixels"] == 1.0


def test_a_small_photo_without_text_is_not_punished():
    """Снимок `032` — 103x188 и две таблички без единой буквы: инвалидная
    пиктограмма и стрелка. Пиктограмма переживает низкое разрешение, текст нет,
    и мерить надо ЗАЯВЛЕННЫЙ текст, а не размер снимка сам по себе.

    Без этой проверки сигнал выродится в «маленький снимок — плохой снимок»
    и начнёт наказывать верные разборы.
    """
    s = _sign()
    for p in s["panels"]:
        p["lines"] = []
    a = grade(s, image_pixels=103 * 188)
    assert a.signals["text_fits_the_pixels"] == 1.0, a.signals
    assert "text_exceeds_the_pixels" not in a.reasons


def test_an_unknown_image_size_never_punishes_the_parse():
    """Размер неизвестен — наказывать не за что. Иначе продукт станет придирчив
    к формату файла вместо того, чтобы судить о снимке."""
    a = grade(_sign(), image_pixels=None)
    assert a.signals["text_fits_the_pixels"] == 1.0
    assert a.category == FULL, a.reasons


def test_the_signal_is_graded_not_a_cliff():
    """Значение падает плавно: обрыв в одной точке был бы такой же выдумкой,
    как и разбор, который мы им ловим. `059` (727 пикселей на знак) обязан
    получить меньше единицы, но больше нуля."""
    крупный = grade(_wordy(), image_pixels=1200 * 1600).signals["text_fits_the_pixels"]
    средний = grade(_wordy(), image_pixels=125 * 320).signals["text_fits_the_pixels"]
    мелкий = grade(_wordy(), image_pixels=82 * 179).signals["text_fits_the_pixels"]
    assert крупный == 1.0
    assert 0.0 < мелкий < средний < крупный, (мелкий, средний, крупный)


def test_the_photo_reads_its_own_size_from_both_formats():
    """Размер берётся из заголовка, без библиотеки изображений: в наборе есть
    и png, и jpg, и ошибка тут молча обнулила бы весь сигнал."""
    from parkread.photo import Photo

    png = Photo.from_path(Path("testset/photos/061-lastplats-langt-avstand.png"))
    jpg = Photo.from_path(Path("testset/photos/003-p-2tim.jpg"))
    assert png.pixels == 82 * 179, png.pixels
    assert jpg.pixels == 576 * 1280, jpg.pixels
    assert Photo("нечто.bin", b"not an image").pixels is None

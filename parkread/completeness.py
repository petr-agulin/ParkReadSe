"""Полнота извлечения и политика ответа.

Разрыв, который этот модуль закрывает: раньше уверенность была числом, число
сравнивалось с порогом, и исходов получалось два — «ответ» или «отказ». Реальность
богаче: чаще всего часть знака прочитана, а часть нет, и обслуживать надо именно
этот случай.

**Категорию задаёт то, чего не хватает, а не то, насколько сильно код в себе
сомневается.** Число уверенности работает внутри категории, а не вместо неё.

Главное правило частичного разбора — **сузить можно, расширить нельзя**. Непрочитанная
панель может оказаться запретом, поэтому неполные данные позволяют только сузить
сказанное знаком. Асимметрия не вкусовая: ошибка в сторону сужения стоит пользователю
лишней осторожности, ошибка в сторону расширения стоит эвакуации.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass, field

from .engine import ALLOWED, UNCERTAIN, Evaluation

# --- категории -------------------------------------------------------------

NOT_A_PARKING_SIGN = "not_a_parking_sign"
FULL = "full"
PARTIAL = "partial"
INSUFFICIENT = "insufficient"

# --- пометки на периодах ---------------------------------------------------

MAY_PROHIBIT = "unread_panel_may_prohibit"
MAY_BE_INCOMPLETE = "conditions_may_be_incomplete"


@dataclass
class Assessment:
    category: str
    confidence: float
    signals: dict[str, float] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    unread_panels: list[int] = field(default_factory=list)
    may_hide_prohibition: bool = False
    uninterpreted_plates: list[int] = field(default_factory=list)

    @property
    def has_answer(self) -> bool:
        return self.category in (FULL, PARTIAL)


# --- сигналы формулы уверенности -------------------------------------------
#
# Калибровка этапа 5 (`.venv\Scripts\python.exe cli.py calibrate`) показала главное
# про эти веса:
# **на наборе из 47 снимков пять сигналов из десяти не изменились ни разу**, и весят
# они вместе 0.45 — почти половину формулы.
#
# Вывод отсюда НЕ «переложить их вес на остальные». Постоянны они потому, что в наборе
# нет снимков, на которых основной знак не читается, где схема не сходится или где
# день непонятен. Переложить вес значило бы сделать продукт увереннее ровно на тех
# кадрах, которых в наборе не хватает, — и подтвердить это было бы нечем.
#
# Исключение одно и оно уже учтено: `schema_valid` постоянен НЕ из-за набора.
# Разбор, схему не прошедший, до формулы не доходит вовсе. Его вес уже урезан вдвое;
# оставшееся трогать без плохих кадров смысла нет.

WEIGHTS = {
    # Схема при подсчёте всегда верна: разбор, её не прошедший, до формулы не доходит
    # вовсе — он возвращается как INSUFFICIENT строкой выше. Значит этот сигнал —
    # константа, и большой вес у константы ничего не различает, а только разбавляет
    # остальные. Отсюда 0.20 → 0.10, и освободившееся идёт новому сигналу.
    # Ноль намеренно. Сигнал остаётся в отчёте — видеть, что схема пройдена,
    # полезно, — но различать им нечего: разбор, схему не прошедший, до формулы
    # не доходит, и значение здесь всегда единица. Освободившийся вес ушёл
    # сигналу, который на наборе как раз ДВИЖЕТСЯ.
    "schema_valid": 0.0,
    "main_sign_identified": 0.15,
    "main_sign_readable": 0.10,
    "panels_read_share": 0.20,
    # Прочитать текст таблички и понять её — разные вещи, и раньше вторую продукт
    # не считал вовсе. Знак `Beskickningsfordon` разбирался с уверенностью 98%:
    # текст снят, а что он предписывает — неизвестно. Отсюда отдельный сигнал.
    "plates_interpreted": 0.10,
    "panel_count_agreement": 0.10,
    # Чем подтверждается, что знак прочитан верно, кроме него самого.
    #
    # Замер: `050` — частный указатель к чужой стоянке — разобран как `parking`
    # с уверенностью 0.998, и продукт ответил «стоянка разрешена здесь, сутки».
    # Ни один сигнал не сработал, потому что противоречия и не было: ответ состоял
    # из одного поля, и спорить с ним было нечему.
    #
    # Табличка с правилом — независимое подтверждение. `P` с `Avgift Taxa 2`
    # подтверждает сам себя: указатель к стоянке платы за неё не требует. А `P`
    # с одной стрелкой не подтверждает ничего — стрелка ровно так же стоит и на
    # указателе. Поэтому считаются только таблички, несущие ПРАВИЛО, а не положение.
    "main_sign_corroborated": 0.10,
    # Хватило ли на прочитанный текст пикселей.
    #
    # Партия плохих кадров показала, чего стоит спрашивать об этом модель:
    # на снимке 82x179 она вернула четыре таблички связного шведского текста
    # и ни одной пометки о помехах, а на хорошем ночном кадре честно сообщила
    # про блики. Помехи она называет там, где кадр хороший.
    #
    # Разрешение продукт меряет САМ, и это единственный способ поймать такой
    # случай: сколько пикселей у снимка — факт, а не мнение.
    "text_fits_the_pixels": 0.10,
    "no_repairs_needed": 0.05,
    "day_class_known": 0.05,
    "model_confidence": 0.05,
}


# Площадь кадра на один печатный знак, ниже которой прочтение неправдоподобно.
#
# Число взято из замера, а не на глаз. По всему набору три самых «плотных» снимка —
# `061` (229), `060` (422) и `059` (727) — это ровно те три, на которых ответ разошёлся
# с эталоном; ближайший верно прочитанный, `062`, идёт с большим отрывом (1107).
#
# У порога есть и физический смысл: знаку нужно хотя бы несколько десятков
# собственных пикселей, а сам текст занимает малую долю кадра. Тысяча пикселей
# кадра на знак — это уже край того, что пиксели способны нести.
PIXELS_PER_CHARACTER = 1000

# Ниже этой доли разбор перестаёт быть полным: заявлено больше текста, чем кадр
# может содержать. Половина порога — вдвое меньше пикселей, чем нужно даже с краю.
TEXT_PLAUSIBLE_ENOUGH = 0.5


def _text_fits(sign: dict, image_pixels: int | None) -> float:
    """Насколько заявленный текст умещается в пиксели снимка.

    Единица — пикселей вдоволь. Ноль — их нет вовсе. Промежуточные значения
    возвращаются как есть: обрыв в одной точке был бы такой же выдумкой,
    как и сам разбор, который мы им ловим.

    Размер неизвестен или текста не заявлено — единица: наказывать не за что.
    """
    if not image_pixels:
        return 1.0
    знаков = sum(len("".join(p.get("lines") or []))
                 for p in sign.get("panels", [])
                 if p.get("kind") == "sign_plate")
    if not знаков:
        return 1.0
    return min(1.0, image_pixels / (знаков * PIXELS_PER_CHARACTER))


def _unread(panels: list[dict]) -> list[dict]:
    """Панель считается непрочитанной, если модель прямо сказала «нечитаемо»
    либо на ней нет ни текста, ни единого разобранного поля."""
    out = []
    for p in panels:
        if p.get("kind") != "sign_plate":
            continue
        unreadable = not p.get("legibility", {}).get("readable", True)
        empty = not p.get("lines") and not (p.get("parsed") or {})
        if unreadable or empty:
            out.append(p)
    return out


# Поля, которые говорят о ПРАВИЛЕ стоянки: сколько, кому, когда, почём.
# Наличие любого из них означает, что у этого столба стоянка чем-то регулируется —
# а значит, здесь она вообще есть.
RULE_KEYS = frozenset({
    "fee", "tariff_code", "payment_method", "duration_limit", "time_windows",
    "eligibility", "vehicle_class", "permit_required", "prohibition",
    "scope_shift", "permits_parking",
})

# Поля, которые говорят лишь о ПОЛОЖЕНИИ: куда, сколько метров, сколько мест, как
# ставить. Они уточняют правило, но сами по себе не свидетельствуют, что правило
# есть. Стрелка на указателе к стоянке выглядит точно так же.
PLACEMENT_KEYS = frozenset({
    "arrow", "placement", "stretch_metres", "place_count", "pictogram",
})


def _corroborated(plates: list[dict]) -> bool:
    """Есть ли хоть одна табличка, подтверждающая, что знак и правда о стоянке ЗДЕСЬ.

    Без таких табличек весь ответ держится на одном поле `main_sign.type` — одном
    прочтении одной картинки, которому нечего противопоставить. Это не значит,
    что оно неверно: голый `P` без табличек существует и означает «действуют общие
    правила». Это значит, что подтверждения у него нет, и говорить о таком разборе
    «полный» продукт не вправе.
    """
    return any(RULE_KEYS & set(p.get("parsed") or {}) for p in plates)


def _may_prohibit(panel: dict) -> bool:
    """Может ли непрочитанная панель оказаться запретом.

    «Не прочитали табличку» почти никогда не значит «не знаем о ней ничего»: текст
    может не читаться, а цвет фона — читаться. Жёлтый в Швеции носят запрещающие знаки,
    поэтому жёлтая непрочитанная панель обязана трактоваться как возможный запрет.
    Нечитаемый цвет — худший случай, и он тоже считается возможным запретом.
    """
    color = panel.get("background_color")
    return color in ("yellow", "unreadable", "other", None)


def too_little(sign: dict) -> bool:
    """Прочитано ли настолько мало, что говорить не о чем.

    То же условие, по которому `grade` выносит `INSUFFICIENT`, — вынесено сюда,
    чтобы конвейер мог спросить об этом ДО того, как считать полноту целиком.
    Второй копии условия заводить нельзя: разойдутся, и переспрос начнёт случаться
    не тогда, когда продукт молчит.
    """
    main = sign["main_sign"]
    plates = [p for p in sign.get("panels", []) if p.get("kind") == "sign_plate"]
    unread = _unread(sign.get("panels", []))
    read_share = 1.0 if not plates else (len(plates) - len(unread)) / len(plates)
    return (main["type"] == "unknown"
            or not main["legibility"].get("readable", True)
            or read_share < 0.5)


def grade(sign: dict | None, *, triage_category: str = "parking_sign",
          schema_valid: bool = True, flags: list[str] | None = None,
          repairs: list[str] | None = None,
          evaluation: Evaluation | None = None,
          image_pixels: int | None = None) -> Assessment:
    """Категория и уверенность по тому, что вернули стадии 0-1 и движок."""
    flags = flags or []
    repairs = repairs or []
    reasons: list[str] = []

    if triage_category != "parking_sign":
        return Assessment(NOT_A_PARKING_SIGN, confidence=1.0,
                          reasons=[f"triage:{triage_category}"])

    if not schema_valid or sign is None:
        return Assessment(INSUFFICIENT, confidence=0.0,
                          reasons=["schema_invalid"])

    panels = sign.get("panels", [])
    plates = [p for p in panels if p.get("kind") == "sign_plate"]
    unread = _unread(panels)
    unread_idx = [p["index"] for p in unread]
    may_prohibit = any(_may_prohibit(p) for p in unread)

    main = sign["main_sign"]
    main_ok = main["type"] != "unknown"
    main_readable = main["legibility"].get("readable", True)
    disagreement = any(f.startswith("panel_count_disagreement") for f in flags)
    # Таблички, текст которых снят, а смысл в справочнике не найден. Для продукта
    # это не «прочитано», а «прочитано и не понято»: указание на знаке есть,
    # и какое оно — неизвестно.
    uninterpreted_idx = sorted(
        {int(n) for f in flags if f.startswith("uninterpreted_panels:")
         for n in f.split(":", 1)[1].split(",") if n.strip().isdigit()})
    plate_idx = {p["index"] for p in plates}
    uninterpreted_idx = [i for i in uninterpreted_idx if i in plate_idx]
    read_share = 1.0 if not plates else (len(plates) - len(unread)) / len(plates)
    corroborated = _corroborated(plates)
    text_fits = _text_fits(sign, image_pixels)
    day_known = not (evaluation and "date_outside_calendar" in evaluation.uncertainties)

    signals = {
        "schema_valid": 1.0,
        "main_sign_identified": 1.0 if main_ok else 0.0,
        "main_sign_readable": 1.0 if main_readable else 0.0,
        "panels_read_share": read_share,
        "plates_interpreted": 0.0 if uninterpreted_idx else 1.0,
        "panel_count_agreement": 0.0 if disagreement else 1.0,
        "main_sign_corroborated": 1.0 if corroborated else 0.0,
        "text_fits_the_pixels": round(text_fits, 3),
        "no_repairs_needed": 0.0 if repairs else 1.0,
        "day_class_known": 1.0 if day_known else 0.0,
        "model_confidence": float(sign.get("model_confidence") or 0.5),
    }
    confidence = round(sum(WEIGHTS[k] * v for k, v in signals.items()), 3)

    # --- категория: её задаёт то, чего не хватает ---
    if not main_ok:
        reasons.append("main_sign_unknown")
    if not main_readable:
        reasons.append("main_sign_unreadable")
    if disagreement:
        reasons.append("panel_count_disagreement")
    if unread_idx:
        reasons.append("unread_panels:" + ",".join(map(str, unread_idx)))
    if uninterpreted_idx:
        reasons.append("uninterpreted_plates:" + ",".join(map(str, uninterpreted_idx)))
    if not corroborated:
        reasons.append("main_sign_uncorroborated")
    if text_fits < TEXT_PLAUSIBLE_ENOUGH:
        reasons.append("text_exceeds_the_pixels")
    if not day_known:
        reasons.append("day_class_unknown")

    # Расхождение в счёте панелей — сигнал, а не приговор.
    #
    # Раньше оно само по себе давало INSUFFICIENT, то есть отнимало у пользователя
    # ответ целиком. Замер на 22 настоящих ответах: флаг сработал 5 раз, все пять —
    # ложная тревога, ни одной настоящей потери границы не поймано. Цена такой
    # осторожности — 23% верных разборов молчат, а это самая дорогая ошибка продукта
    # по его же таблице рисков: человек стоит перед знаком и не получает ничего.
    #
    # Сигнал остаётся: он снижает уверенность (вес 0.15) и попадает в причины.
    # Если счётчик однажды поймает настоящее слияние табличек, это будет видно
    # в уверенности и в причинах — но не ценой молчания на верных разборах.
    if too_little(sign):
        category = INSUFFICIENT
    elif (unread_idx or uninterpreted_idx or not corroborated
          or text_fits < TEXT_PLAUSIBLE_ENOUGH):
        # Непонятая табличка — это именно PARTIAL: часть знака до продукта
        # не дошла. Называть такой разбор полным значит утверждать, что понято всё.
        #
        # Знак без единой таблички с правилом — тоже PARTIAL, и по той же причине,
        # только с другой стороны: понимать нечего, потому что подтверждения нет.
        # Ответ при этом остаётся — молчать продукт не начинает.
        category = PARTIAL
    else:
        category = FULL

    return Assessment(category, confidence, signals, reasons,
                      unread_panels=unread_idx, may_hide_prohibition=may_prohibit,
                      uninterpreted_plates=uninterpreted_idx)


# --- правило асимметрии ----------------------------------------------------

def apply_asymmetry(evaluation: Evaluation, assessment: Assessment) -> Evaluation:
    """Сузить можно, расширить нельзя.

    При частичном разборе ответ не имеет права утверждать то, что непрочитанная
    панель могла бы отменить:

    - если она **может быть запретом** (жёлтая или с нечитаемым цветом), ни один
      период не подаётся как разрешающий;
    - если она скорее уточняет разрешение, ответ сохраняется, но период с пустым
      списком условий помечается: «в остальное время ограничений нет» при неполном
      разборе — утверждение, основанное на отсутствии данных, а не на данных.
    """
    if assessment.category != PARTIAL:
        return evaluation

    out = copy.deepcopy(evaluation)
    for regime in out.regimes:
        for period in regime.periods:
            if period.state != ALLOWED:
                continue
            if assessment.may_hide_prohibition:
                period.state = UNCERTAIN
                period.note = MAY_PROHIBIT
            elif not period.conditions:
                period.note = MAY_BE_INCOMPLETE
    if assessment.may_hide_prohibition:
        out.uncertainties.append(MAY_PROHIBIT)
    return out

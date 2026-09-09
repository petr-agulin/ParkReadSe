"""`evaluate_parking_rules` — чистая функция без обращений к модели.

Здесь вся арифметика уходит из модели в код. Реализуется **тот самый порядок сборки
из семи шагов**, что записан в `PROJECT_BRIEF.md`, раздел «Как из табличек получается
итог», а не свой:

1. базовый режим по основному знаку;
2. разбиение стопки на таблички (уже сделано извлечением: панель = указание);
3. разделение на участки по стрелкам;
4. условия допуска — в подпись к режиму, а не в проверку;
5. условия места — в постоянные пометки;
6. раскладка по времени: окна поверх базы, дополнение — база либо то, что назвал
   токен сдвига;
7. наложение запретов: запрет в своём окне перекрывает разрешение.

Три вещи, которые легко сделать неправильно и которые здесь сделаны намеренно:

- **вне окна возвращается базовый режим**, а не «ничего» и не условия из окна;
- **условие допуска никогда не проверяется**: продукт не знает, кто стоит перед знаком;
- **названный день недели — литерал**: календарь праздников к нему не применяется.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from . import clock_se as clock
from .calendar_se import RED, UNKNOWN, WEEKDAY, Calendar
from .reference import ELIGIBILITY_KEYS, VEHICLE_KEYS

HORIZON_DAYS = 8          # насколько вперёд строится шкала периодов
DAY = timedelta(days=1)

# состояния периода
ALLOWED = "allowed"
PROHIBITED = "prohibited"
UNCERTAIN = "uncertain"
# Знак ничего не говорит об этом времени. Не «можно» и не «нельзя»: запрещающий
# знак с табличкой времени запрещает ТОЛЬКО в своё окно, а вне его не разрешает
# ничего — он просто молчит, и действуют общие правила. Смешивать это с UNCERTAIN
# нельзя: там мы не смогли прочесть, здесь прочли и знаем, что сказать нечего.
NOT_STATED = "not_stated"

# участки
HERE = "here"
_ARROW_EXTENT = {
    "left": "left", "right": "right",
    "up": "ahead", "down": "behind",
    "both_horizontal": "both_sides", "both_vertical": "both_directions",
}


@dataclass
class Period:
    start: datetime
    end: datetime
    state: str
    conditions: list[str] = field(default_factory=list)   # ключи справочника
    max_duration_minutes: int | None = None   # None -> действует умолчание в 24 часа
    note: str | None = None

    def same_as(self, other: "Period") -> bool:
        return (self.state == other.state
                and self.conditions == other.conditions
                and self.max_duration_minutes == other.max_duration_minutes
                and self.note == other.note)


@dataclass
class Regime:
    extent: str
    eligibility: list[str]             # ключи справочника: кому отведены места
    place_notes: list[str]             # ключи справочника: где и сколько
    periods: list[Period]
    duration_expires_at: datetime | None = None
    duration_source: str | None = None  # "plate" | "24h_default"


@dataclass
class Evaluation:
    regimes: list[Regime]
    uncertainties: list[str] = field(default_factory=list)
    permits_parking: bool = True       # false у указателей направления
    note: str | None = None


# --- шаг 1: базовый режим -------------------------------------------------

_BASE_PROHIBITED = {"prohibition_parking", "prohibition_stopping"}
_WAYFINDING = {"wayfinding_parking_house", "wayfinding_park_and_ride"}


# --- шаг 3: разделение на участки по стрелкам ------------------------------

def _split_by_arrows(panels: list[dict]) -> list[tuple[str, list[dict]]]:
    """Стрелка **закрывает** указания над собой и привязывает их к участку.

    Несколько стрелок — несколько режимов на одном знаке (снимок `010`).
    Отсутствие стрелки означает, что место здесь же, у знака (снимок `015`).
    """
    # Делят участок только таблички С ПРАВИЛАМИ. Табло оператора, висящее ниже
    # стрелки, участком не является: иначе у знака появляется второй режим
    # из одного платёжного табла, и продукт сообщает про него «стрелки нет,
    # места здесь же» — про знак, у которого стрелки как раз есть.
    panels = [p for p in panels if p.get("kind") == "sign_plate"]

    groups: list[tuple[str, list[dict]]] = []
    current: list[dict] = []
    for p in panels:
        arrow = (p.get("parsed") or {}).get("arrow")
        if arrow:
            groups.append((_ARROW_EXTENT.get(arrow, HERE), current))
            current = []
        else:
            current.append(p)
    # Таблички НИЖЕ последней стрелки участка не заводят.
    #
    # Найдено на обкатке, снимок `033`: `Zon E` и `Boende Storskogen` стоят под
    # стрелкой влево, и продукт делал из них второй режим «здесь, у знака» — у знака,
    # у которого стрелка как раз есть и уводит стоянку влево. Разработчик прочёл
    # этот знак одним участком: «parking to the left of the sign pole».
    #
    # Стрелка закрывает указания НАД собой; то, что под ней, относится к знаку
    # целиком и потому достаётся каждому участку. Собственный участок появляется
    # только у группы со своей стрелкой.
    #
    # Знак вовсе без стрелок — по-прежнему один участок «здесь»: там закрывать
    # нечего, и `current` становится единственной группой.
    if not groups:
        groups.append((HERE, current))
    elif current:
        groups = [(ext, items + current) for ext, items in groups]
    return [(ext, items) for ext, items in groups if items] or [(HERE, [])]


# --- шаг 6: применимость указания в конкретный момент ----------------------

def _window_applies(win: dict, moment: datetime, cal: Calendar) -> bool | None:
    """None означает «неизвестно»: дата вне календаря, а окно зависит от класса дня."""
    dc = win.get("day_class", "unspecified")
    d = moment.date()

    if dc == "named_weekday":
        # Литерал. Календарь праздников к нему НЕ применяется: запрет `Tisdag 18-24`
        # действует и в праздничный вторник.
        names = ["monday", "tuesday", "wednesday", "thursday",
                 "friday", "saturday", "sunday"]
        if names[d.weekday()] != win.get("named_weekday"):
            return False
    else:
        day = cal.day_class(d)
        if day == UNKNOWN and dc != "all_days":
            return None
        if dc == "unspecified" and day != WEEKDAY:
            # «Дни не указаны» означает будни по умолчанию, а не «каждый день».
            return False
        if dc in (WEEKDAY, "eve", RED) and day != dc:
            return False

    # Чётность недели и диапазон месяцев сужают окно ещё раз. Оба вычисляются
    # по календарю, а не по мнению модели: номер недели — ISO, промежутки дат
    # умеют перехлёстывать конец года.
    if not _week_parity_matches(win, d):
        return False
    if not _dates_match(win, d):
        return False

    return _in_clock_window(win, moment)


def _week_parity_matches(win: dict, d: date) -> bool:
    """`jämna veckor` — чётные недели ISO, `udda veckor` — нечётные.

    Поля нет — окно действует каждую неделю. Это безопасное умолчание для запрета
    (шире запрет, уже разрешение) и рискованное для разрешающего окна, поэтому
    промпт просит чётность обязательно, когда она написана на табличке."""
    parity = win.get("week_parity")
    if not parity:
        return True
    week = d.isocalendar()[1]
    return (week % 2 == 0) if parity == "even" else (week % 2 == 1)


def _in_clock_window(win: dict, moment: datetime) -> bool:
    start = _clock(win["from"])
    end = _clock(win["to"])
    t = moment.time()
    if start <= end:
        return start <= t < end
    return t >= start or t < end          # окно через полночь


def _clock(s: str) -> time:
    h, m = s.split(":")
    return time(23, 59) if h == "24" else time(int(h), int(m))


def _md(value: str) -> tuple[int, int]:
    """`MM-DD` в пару чисел. Года здесь нет намеренно: табличка вешается один раз
    и действует каждый год."""
    month, day = value.split("-")
    return int(month), int(day)


def _in_range(d: date, rng: dict) -> bool:
    """Попадает ли дата в промежуток, умеющий перехлёстывать конец года."""
    start, end, here = _md(rng["from"]), _md(rng["to"]), (d.month, d.day)
    if start <= end:
        return start <= here <= end
    return here >= start or here <= end


def _dates_match(win: dict, d: date) -> bool:
    """Даты, ограничивающие окно: «только в эти промежутки» или «всегда, кроме них».

    Так и написано на табличках: `Gäller ej 1 juli - 31 juli` — исключение,
    `1 nov-15 maj` — сезон. Раньше здесь хранились номера целых месяцев, и середина
    месяца не выражалась вовсе: `1 nov-15 maj` со снимка `034` округлялся до ноября
    и мая целиком, добавляя две недели запрета, которых на знаке нет.
    """
    dates = win.get("dates")
    if not dates:
        return True
    hit = any(_in_range(d, r) for r in dates.get("ranges") or [])
    return hit if dates.get("mode") == "only" else not hit


def horizon_end(now: datetime) -> datetime:
    """Докуда построена шкала. Это НЕ граница правила: знак в этот момент ничего
    не меняет, просто дальше мы не смотрим. Показывать её как конец периода —
    то же, что показывать пользователю служебный токен."""
    return datetime.combine(now.date() + timedelta(days=HORIZON_DAYS), time(0, 0))


def _boundaries(now: datetime, instructions: list[dict]) -> list[datetime]:
    """Моменты, в которые что-то может измениться: полуночи и края всех окон.

    На вход идут уже разобранные указания (`parsed`), а не панели."""
    out = {now}
    day0 = now.date()
    for i in range(HORIZON_DAYS + 1):
        d = day0 + timedelta(days=i)
        out.add(datetime.combine(d, time(0, 0)))
        for parsed in instructions:
            for w in parsed.get("time_windows") or []:
                for key in ("from", "to"):
                    out.add(datetime.combine(d, _clock(w[key])))
    end = horizon_end(now)
    return sorted(t for t in out if now <= t <= end)


# --- сборка режима --------------------------------------------------------

def _duration_minutes(parsed: dict) -> int | None:
    d = parsed.get("duration_limit")
    if not d:
        return None
    return int(d["amount"] * (60 if d["unit"] == "hours" else 1))


def _conditions_of(parsed: dict) -> list[str]:
    """Ключи справочника, которые указание добавляет к периоду."""
    out = []
    if parsed.get("fee"):
        out.append("avgift")
    if parsed.get("permit_required"):
        out.append("sarskilt-p-tillstand")
    pm = parsed.get("payment_method")
    if pm == "parking_disc":
        out.append("p-skiva")
    elif pm == "ticket":
        out.append("p-biljett")
    return out


def _build_regime(extent: str, panels: list[dict], base_state: str,
                  now: datetime, cal: Calendar,
                  uncertainties: list[str]) -> Regime:
    plates = [p for p in panels if p.get("kind") == "sign_plate"]

    # шаг 4: условие допуска — подпись к режиму
    # Таблицы берутся из справочника, а не пишутся здесь заново: своя копия
    # однажды уже разошлась со схемой и потеряла автобусы (снимок `038`).
    VEHICLE, WHO = VEHICLE_KEYS, ELIGIBILITY_KEYS
    eligibility: list[str] = []
    for p in plates:
        parsed = p.get("parsed") or {}
        for key in (VEHICLE.get(parsed.get("vehicle_class")),
                    WHO.get(parsed.get("eligibility"))):
            if key and key not in eligibility:
                eligibility.append(key)
        # «Арендованное место, где вдобавок нужно разрешение» — два условия сразу,
        # а не выбор одного из них.
        if parsed.get("permit_required") and "sarskilt-p-tillstand" not in eligibility:
            eligibility.append("sarskilt-p-tillstand")

    # шаг 5: условия места — постоянные пометки
    place_notes = []
    for p in plates:
        parsed = p.get("parsed") or {}
        if parsed.get("placement") == "marked_bay_only":
            place_notes.append("utanfor-markerad-plats")
        if parsed.get("placement") == "as_shown":
            place_notes.append("placement-as-shown")
        if parsed.get("place_count"):
            place_notes.append("place-count")
        if parsed.get("stretch_metres"):
            place_notes.append("stretch-metres")

    # разделение указаний по роли во времени
    windowed, always, shifted, prohibitions = [], [], [], []
    for p in plates:
        parsed = p.get("parsed") or {}
        if parsed.get("prohibition") and parsed.get("time_windows"):
            prohibitions.append(parsed)
            continue
        if parsed.get("scope_shift") == "remaining_time":
            shifted.append(parsed)
        elif parsed.get("time_windows"):
            windowed.append(parsed)
        elif _conditions_of(parsed) or parsed.get("duration_limit"):
            always.append(parsed)

    # Табличка со временем под ЗАПРЕЩАЮЩИМ знаком не добавляет условий к вечному
    # запрету, а очерчивает его: «Onsdag 9-12» означает, что в остальное время
    # знак не запрещает. Под разрешающим знаком всё наоборот — там вне окна
    # возвращается разрешение, и трогать это нельзя.
    scoping = [p for p in windowed + prohibitions if not p.get("permits_parking")]
    scoped = base_state == PROHIBITED and any(p.get("time_windows") for p in scoping)

    periods = _timeline(now, cal, base_state, windowed, always, shifted,
                        prohibitions, uncertainties, scoped=scoped)

    # Длительность: табличка перекрывает умолчание в 24 часа — но только там,
    # где она действует. Поэтому берётся из периода, в котором находится «сейчас»,
    # а не из стопки целиком: вне окна возвращается умолчание.
    expires, source = None, None
    current = next((p for p in periods if p.start <= now < p.end), None)
    # Знак, который сейчас молчит, стоянки не даёт — значит, и ограничивать нечего.
    # Иначе рядом с «Nothing stated on the sign» появлялось «47 h max»: число,
    # взятое из времени до начала запрета, читалось как разрешение столько простоять.
    silent = current is not None and current.state == NOT_STATED
    minutes = None if silent else (current.max_duration_minutes if current else None)
    if minutes:
        # Настоящее время, а не деления циферблата: `2 tim` в ночь перевода
        # кончаются на час раньше или позже, чем показывают часы (решение 116).
        expires, source = clock.add(now, timedelta(minutes=minutes)), "plate"
    elif base_state == ALLOWED:
        expires = twenty_four_hour_expiry(now, cal)
        source = "24h_default" if expires else None
        if expires is None:
            uncertainties.append("24h_expiry_outside_calendar")

    # Ограничение, которое ВСТУПИТ позже, тоже обрывает стоянку.
    #
    # Найдено на снимке `005` (`2 tim / 8-18 / (8-15)`): машина поставлена в пятницу
    # в 22:10, когда табличка не действует, и продукт отвечал «сутки, до вторника».
    # Но в субботу в 08:00 окно открывается, и с этой минуты действует предел в два
    # часа — стоянка кончается в 10:00, а не через трое суток.
    #
    # Счёт идёт от НАЧАЛА окна, а не от постановки машины: до восьми утра табличка
    # молчала, и отсчитывать по ней было нечего.
    #
    # Предел кусается не всегда. Если окно закрывается раньше, чем истекают его
    # часы, — скажем, `2 tim` в окне `08-09`, — до предела дело не доходит вовсе,
    # и стоянка продолжается. Поэтому граница берётся, только когда она попадает
    # ВНУТРЬ окна.
    for later in periods:
        if later.start <= now or later.state != ALLOWED:
            continue
        if expires is not None and later.start >= expires:
            break                      # дальше предела и так не досидеть
        limit = later.max_duration_minutes
        if not limit:
            continue
        edge = clock.add(later.start, timedelta(minutes=limit))
        if edge < later.end and (expires is None or edge < expires):
            expires, source = edge, "plate"
            break

    # Запрет обрывает стоянку раньше предела. Знак `Torsdag 10-14` посреди суток
    # означает, что машину надо убрать в 10:00, а не досидеть до 18:41 следующего
    # дня: с этого момента стоянка кончилась, и всё, что дальше, — уже другая.
    stop = next((p.start for p in periods
                 if p.start > now and p.state == PROHIBITED), None)
    if stop and not silent and (expires is None or stop < expires):
        expires, source = stop, "prohibition"

    return Regime(extent=extent, eligibility=eligibility,
                  place_notes=sorted(set(place_notes)), periods=periods,
                  duration_expires_at=expires, duration_source=source)


def _timeline(now: datetime, cal: Calendar, base_state: str,
              windowed: list[dict], always: list[dict], shifted: list[dict],
              prohibitions: list[dict], uncertainties: list[str],
              scoped: bool = False) -> list[Period]:
    base_conditions = sorted({c for p in always for c in _conditions_of(p)})
    marks = _boundaries(now, windowed + shifted + prohibitions + always)
    raw: list[Period] = []

    base_duration = next((_duration_minutes(p) for p in always
                          if _duration_minutes(p)), None)

    for t0, t1 in zip(marks, marks[1:]):
        state, conds, unknown = base_state, list(base_conditions), False
        duration = base_duration
        # Запрет очерчен окном: вне окна знак молчит, пока что-нибудь не скажет
        # обратного — попадание в окно ниже или табличка «в остальное время».
        if scoped:
            state = NOT_STATED

        # шаг 6: окна поверх базы
        inside = False
        for parsed in windowed:
            hit = any(_window_applies(w, t0, cal)
                      for w in parsed.get("time_windows") or [])
            if any(_window_applies(w, t0, cal) is None
                   for w in parsed.get("time_windows") or []):
                unknown = True
            if hit:
                inside = True
                conds += _conditions_of(parsed)
                # Ограничение длительности с окном действует ТОЛЬКО в окне.
                duration = _duration_minutes(parsed) or duration
                # Под запрещающим знаком попадание в окно и есть запрет.
                if scoped and not parsed.get("permits_parking"):
                    state = PROHIBITED

        # дополнение: база либо то, что назвал токен сдвига
        if not inside:
            for parsed in shifted:
                conds += _conditions_of(parsed)
                # Табличка может сама восстанавливать разрешение: под запрещающим
                # знаком «P Avgift / övrig tid» означает, что вне окна запрета
                # это снова знак стоянки, только платной (снимок 019).
                if parsed.get("permits_parking"):
                    state = ALLOWED
                duration = _duration_minutes(parsed) or duration
        else:
            for parsed in windowed:
                if parsed.get("permits_parking") and any(
                        _window_applies(w, t0, cal) for w in parsed.get("time_windows") or []):
                    state = ALLOWED

        # шаг 7: запрет перекрывает разрешение
        for parsed in prohibitions:
            hit = any(_window_applies(w, t0, cal)
                      for w in parsed.get("time_windows") or [])
            if any(_window_applies(w, t0, cal) is None
                   for w in parsed.get("time_windows") or []):
                unknown = True
            if hit:
                state, conds = PROHIBITED, []

        if unknown and state != PROHIBITED:
            state = UNCERTAIN
            if "day_class_unknown" not in uncertainties:
                uncertainties.append("day_class_unknown")

        raw.append(Period(t0, t1, state, sorted(set(conds)),
                          max_duration_minutes=duration))

    # склеить соседние одинаковые
    merged: list[Period] = []
    for p in raw:
        if merged and merged[-1].same_as(p) and merged[-1].end == p.start:
            merged[-1].end = p.end
        else:
            merged.append(p)
    return merged


# --- правило 24 часов ------------------------------------------------------

def twenty_four_hour_expiry(start: datetime, cal: Calendar) -> datetime | None:
    """**Гарантированная непрерывность:** водителю положены полные 24 часа подряд,
    и если выходные их обрывают, счётчик обнуляется и начинается заново с ближайшего
    рабочего дня.

    - Понедельник 13:00 → вторник 13:00. Сутки укладываются в рабочие дни целиком.
    - Пятница 13:00 → **вторник 00:00**. До субботы остаётся 11 часов, а не 24;
      счётчик обнуляется в субботу 00:00 и стартует заново в понедельник 00:00,
      давая полные сутки — до конца понедельника.
    - Суббота 00:01, суббота 08:00, воскресенье 23:59 → все три дают вторник 00:00:
      начали в нерабочий день, счётчик спит до понедельника.

    **Правило спорное, и выбор здесь сделан осознанно.** Шведские коммуны толкуют
    счёт 24 часов вокруг выходных по-разному, единого мнения нет. Разработчик
    сверил распространённость трактовок и выбрал преобладающую — «гарантированная
    непрерывность». Продукт следует ей.

    История этого места стоит того, чтобы её знать: сначала здесь было ровно это
    правило, потом оно было заменено на «сутки идут подряд от начала» (пятница →
    суббота 13:00), и теперь возвращено. Причина первой замены — двусмысленность
    формулировки «полночь понедельника» в записи источника: полночь, которой
    понедельник начинается, и полночь, которой он кончается, отстоят на сутки
    (решение 82).
    """
    if not cal.covers(start.date()):
        return None

    if not cal.is_working_day(start.date()):
        nxt = cal.next_working_day(start.date())
        return None if nxt is None else clock.add(datetime.combine(nxt, time(0, 0)), DAY)

    # Сутки — настоящие: в ночь перевода их конец на часах сдвигается на час.
    end = clock.add(start, DAY)
    day = start.date()
    while day <= end.date():
        if not cal.covers(day):
            return None
        # Нерабочий день ВНУТРИ суток обрывает их: полных 24 часов не вышло,
        # значит они положены заново с ближайшего рабочего дня.
        if not cal.is_working_day(day) and datetime.combine(day, time(0, 0)) < end:
            nxt = cal.next_working_day(day)
            return None if nxt is None else clock.add(datetime.combine(nxt, time(0, 0)), DAY)
        day += timedelta(days=1)
    return end


# --- вход ------------------------------------------------------------------

def evaluate_parking_rules(sign: dict, moment: datetime, cal: Calendar) -> Evaluation:
    main = sign["main_sign"]
    uncertainties: list[str] = []

    if main["type"] in _WAYFINDING:
        return Evaluation(regimes=[], permits_parking=False,
                          note="wayfinding_sign_permits_nothing")

    base_state = PROHIBITED if main["type"] in _BASE_PROHIBITED else ALLOWED
    if main["type"] == "unknown":
        uncertainties.append("main_sign_unknown")

    if not cal.covers(moment.date()):
        uncertainties.append("date_outside_calendar")

    regimes = [
        _build_regime(extent, panels, base_state, moment, cal, uncertainties)
        for extent, panels in _split_by_arrows(sign.get("panels", []))
    ]
    return Evaluation(regimes=regimes, uncertainties=uncertainties)

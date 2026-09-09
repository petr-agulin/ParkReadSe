"""Стадия 4 конвейера: разбор в форму, пригодную для показа.

Это `render_result` из `AGENTS.md`, §8. Здесь **не считают правила** — всё уже посчитано
движком и оценкой полноты; здесь их раскладывают по четырём блокам экрана
(`PROJECT_BRIEF.md`, «Форма подачи результата»).

**Формулировки берутся из справочника, а не сочиняются.** Ключ вроде `avgift` заменяется
готовой строкой `Entry.en`. Поэтому проверка словаря запрещённых формулировок остаётся
статической и живёт на бэкенде: фронтенду нечего сочинять, он получает готовый текст.

Ключ, которого в справочнике нет, отдаётся как есть в `unknown_keys` — по принципу
«чего нет в белом списке, показывается дословно и не интерпретируется».
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from . import clock_se as clock
from .engine import (ALLOWED, NOT_STATED, PROHIBITED, Evaluation, Period, Regime,
                     horizon_end)
from .completeness import FULL, PARTIAL, Assessment
from .pipeline import Analysis
from .reference import Reference


# --- подписи состояний -----------------------------------------------------
#
# Каждая подпись — утверждение О ЗНАКЕ, а не о пользователе (`PROJECT_BRIEF.md`,
# словарь формулировок). «The sign permits parking», но никогда «you may park».
#
# Живут они здесь, а не во фронтенде, намеренно: фронтенд не сочиняет ни одной фразы
# о смысле знака, поэтому запрещённая формулировка проверяется одним статическим
# тестом на бэкенде и не может просочиться через вёрстку.

CONTRACT = 5

STATE_TEXT = {
    "allowed": "The sign permits parking during this period",
    "prohibited": "The sign is a no-parking sign for this period",
    "uncertain": "The sign's conditions for this period could not be read in full",
    # Прочитали всё и знаем, что знак об этом времени не говорит: его запрет
    # ограничен окном, а разрешения он не даёт. Обещать «можно» здесь нельзя —
    # действуют общие правила, которых на знаке нет.
    "not_stated": "The sign's restriction does not cover this period, and the sign "
                  "states nothing else about it",
}

# Участок из `engine._ARROW_EXTENT` — внутренний токен, и показывать его человеку
# нельзя: «here» ничего не сообщает тому, кто стоит перед знаком. Стрелка закрывает
# указание над собой и привязывает его к участку (`PROJECT_BRIEF.md`), а её отсутствие
# означает, что места здесь же, у знака.
# Короткая форма того же — заголовком окна. Длинная фраза объясняет, ОТКУДА
# известен участок («стрелка показывает влево»); в заголовке нужен сам участок.
EXTENT_SHORT = {
    "here": "Here at the sign",
    "left": "To the left of the sign",
    "right": "To the right of the sign",
    "ahead": "Ahead of the sign",
    "behind": "Up to the sign",
    "both_sides": "Both sides of the sign",
    "both_directions": "Both ahead of the sign and up to it",
}

EXTENT_TEXT = {
    "here": "The sign carries no arrow, so it covers the spaces here, at the sign",
    "left": "The sign's arrow points left: it covers the stretch to the left of the sign",
    "right": "The sign's arrow points right: it covers the stretch to the right of the sign",
    "ahead": "The sign's arrow points ahead: it covers the stretch forward from the sign",
    "behind": "The sign's arrow points back: it covers the stretch up to the sign, not past it",
    # «В обе стороны» само по себе не говорит, в какие именно. Горизонтальная
    # двойная стрелка — это влево и вправо вдоль улицы, и так и сказано.
    "both_sides": "The sign's arrows point left and right: it covers the stretch "
                  "on both sides of the sign, along the street",
    "both_directions": "The sign's arrows point up and down: it covers the stretch "
                       "both ahead of the sign and up to it",
}

# Чем кончается стоянка. Строка стоит под ПОСЛЕДНИМ периодом, а не отдельным
# абзацем над шкалой: раньше предел и шкала жили порознь, и «знак разрешает стоянку
# … onwards» рядом с «предел истекает завтра в 17:11» читалось как противоречие.
# Заголовок отрезка на шкале. Короткая форма того же утверждения о знаке.
#
# **«Free parking» — особый случай.** Словарь продукта эту формулировку запрещает:
# она обещает бесплатность там, где может требоваться диск или билет. Но там, где
# продукт установил, что условий НЕТ ВООБЩЕ, она и короче, и точнее длинной фразы —
# поэтому разрешена ровно в этом случае и только в нём.
#
# Есть хоть одно условие (диск, билет, разрешение) — заголовок снова осторожный,
# а само условие стоит строкой ниже. Иначе «Free parking» соседствовало бы
# с «требуется диск», и одно отменяло бы другое.
PERIOD_HEADLINE = {
    "paid": "Parking fee",
    "free": "Free parking",
    "free_with_conditions": "No fee stated for this period",
    "prohibited": "No parking",
    "uncertain": "Conditions could not be read in full",
    "not_stated": "Nothing stated on the sign",
}

STAY_END_REASON = {
    "plate": "the limit stated on the sign",
    "24h_default": "general 24-hour rule, not written on the sign",
    "prohibition": "the sign prohibits parking from this moment",
}

STAY_END_TEXT = {
    "plate": "This stay must end here — the limit stated on the sign",
    "prohibition": "This stay must end here — the sign prohibits parking from "
                   "this moment",
    "24h_default": "This stay must end here — general 24-hour rule, not written "
                   "on the sign",
}

# Цвет строки полноты. Решает бэкенд, а не вёрстка: это суждение о том, насколько
# ответу можно верить, а не оформление. Три уровня, и порог назван здесь явно.
#
# Зелёный — только когда прочитано ВСЁ и ни один сигнал уверенность не снизил.
# Стоит прочитаться не всему или появиться причине вроде неточной границы табличек —
# цвет уходит в жёлтый: ответ есть, но с оговоркой. Красный — когда ответа нет.
#
# Порог откалиброван замером на 47 снимках (`python cli.py calibrate`), а не выбран.
#
# Мерится совпадение ОТВЕТА, а не полей: движок пускается дважды, по эталону и по
# ответу модели. Поля разошлись у 19 снимков, ответ — у 6, и разница не пустяк:
# цвет таблички и порядок панелей в разборе видны, а до человека не доходят.
#
#   порог  помечено  из них разошлись   пропущено как «полный»  из них разошлись
#   0.875      7            3                    40                    3
#   0.900     11            4                    36                    2
#   0.950     11            4                    36                    2
#
# От 0.900 до 0.950 таблица не меняется: значения уверенности на наборе дискретны
# и в этот промежуток не попадает ни одно. Берётся нижний край площадки — при той же
# ловле он навешивает оговорку на меньшее число снимков. Ниже 0.9 ловится трое из
# шести вместо четверых; выше 0.976 помечается почти весь набор, и порог перестаёт
# что-либо отделять.
#
# Двое пропущенных — `010` и `042` — расходятся кругом стоящих, и ни один сигнал
# на них не срабатывает. Порогом это не чинится: нужен сигнал, которого нет.
GOOD_ENOUGH = 0.9


def _tone(category: str, confidence: float) -> str:
    if category in ("insufficient", "not_a_parking_sign"):
        return "bad"
    if category == "full" and confidence >= GOOD_ENOUGH:
        return "good"
    return "caution"


CATEGORY_TEXT = {
    "full": "Every plate on the sign was read",
    "partial": "Part of the sign was not read; what follows is incomplete",
    "insufficient": "Too little of the sign was read to say what it states",
    "not_a_parking_sign": "This photograph does not show a parking sign",
}


# Причины и неопределённости — тоже внутренние токены. `panel_count_disagreement`
# понятно разработчику и бессмысленно человеку у знака. Токен остаётся в ответе
# рядом с текстом: он нужен замеру и разбору полётов, а показывается текст.
#
# **Формулировка объясняет последствие, а не устройство.** Пользователь не знает,
# что разбор идёт двумя вызовами модели, и знать не должен: «два независимых
# прочтения насчитали разное» — это рассказ о внутренней кухне, из которого нельзя
# понять, чему верить. Сказать надо, чего именно не удалось установить и на что
# это влияет.
#
# Причины, снижающие уверенность, начинаются с «Confidence is lower» намеренно.
# Иначе строка спорит с заголовком блока: «прочитаны все таблички» и рядом
# «граница могла быть потеряна» выглядит как противоречие, хотя это оговорка.

REASON_TEXT = {
    "main_sign_unknown": "The sign at the top of the pole could not be identified",
    "main_sign_unreadable": "The sign at the top of the pole could not be read",
    # Отсев отказал. Категория говорит, что знака нет; причина уточняет, что именно
    # на снимке: другой дорожный знак — не то же самое, что знака нет вовсе.
    "triage:other_road_sign": "The photograph shows a road sign, but not one about "
                              "parking",
    "triage:not_a_sign": "The photograph shows no road sign at all",
    # Ответ модели не прошёл схему. Найдено проверкой, а не глазами: на снимках
    # `038` и `055` такое случалось, и страница показала бы слово `schema_invalid`.
    "schema_invalid": "The sign could not be read into a form the service can work "
                      "with, so there is nothing here to go on",
    "panel_count_disagreement": "Confidence is lower: it is not certain where one "
                                "plate ends and the next begins",
    "day_class_unknown": "Confidence is lower: whether this date counts as a public "
                         "holiday could not be established",
    "text_exceeds_the_pixels": "The photograph is too small to carry all the text "
                               "reported on the sign, so some of it may not have "
                               "been read from the plates at all",
    "main_sign_uncorroborated": "No plate on this sign states a parking rule, so the "
                                "reading rests on the symbol at the top of the pole "
                                "alone — a sign pointing the way to a car park "
                                "elsewhere looks much the same",
}

# Заметка движка ко всему разбору. Как и участок, приходит на экран готовой
# подписью: токен `wayfinding_sign_permits_nothing` однажды вышел на страницу
# как есть — ровно то, что запрещает решение 80. Таблица нужна и затем, чтобы
# формулировка жила в Python рядом с остальными, а не в вёрстке.
NOTE_TEXT = {
    "wayfinding_sign_permits_nothing":
        "This sign points the way to parking; it does not itself designate spaces",
}

UNCERTAINTY_TEXT = {
    "day_class_unknown": "Whether this date counts as a public holiday could not be "
                         "established, and the sign's hours depend on it",
    "date_outside_calendar": "Whether this date counts as a public holiday could not "
                             "be established, and the sign's hours depend on it",
    "main_sign_unknown": "The sign at the top of the pole could not be identified",
    "24h_expiry_outside_calendar": "When the 24-hour limit would run out could not be "
                                   "worked out this far ahead",
}


def _explain(token: str, table: dict) -> dict:
    """Токен → пара «токен и текст». Токен нужен замеру, текст — человеку.

    `unread_panels:2,3` несёт данные в самом токене, поэтому разбирается отдельно."""
    if token.startswith("uninterpreted_plates:"):
        which = token.split(":", 1)[1]
        many = "," in which
        return {"token": token,
                "text": ("Confidence is lower: "
                         + (f"plates {which} state something the service does not know"
                            if many else
                            f"plate {which} states something the service does not know"))}
    if token.startswith("unread_panels:"):
        which = token.split(":", 1)[1]
        return {"token": token,
                "text": f"Plates {which} on the sign could not be read"}
    # Подписи нет — на экран не выходит НИЧЕГО. Раньше здесь возвращался сам токен,
    # и он дважды доезжал до страницы: `wayfinding_sign_permits_nothing` (запись 54)
    # и `triage:other_road_sign` (запись 57). Токен в ответе остаётся — он нужен
    # замеру, — а человеку показывать нечего, пока подпись не написана.
    #
    # Пропажу строки ловит проверка: всякая причина, которую код умеет породить,
    # обязана иметь подпись. Тихо исчезнуть она может только у того, кто не запускал
    # тесты, — а служебное слово на странице видел бы каждый.
    return {"token": token, "text": table.get(token, "")}


# Подписи к непонятой табличке. Видов три, и путать их нельзя.
NOT_INTERPRETED = {
    # Текст таблички уже напечатан строкой выше — повторять его значит показать
    # одно и то же дважды, да ещё разбитым на строки таблички.
    "shown_above": "Not interpreted — shown above exactly as printed",
    # Текста нет вовсе: на табличке рисунок, которого справочник не знает.
    # Найдено на снимке `042` (велосипеды и мопеды): панель приходила пустой,
    # и на экране от неё оставалась голая рамка без единого слова.
    "symbol": "A symbol here that the service does not know — it may narrow "
              "who these spaces are for",
}


def _not_interpreted(panel: dict, keys: list[str],
                     leftovers: list[str] | None) -> str | None:
    """Что сказать про непонятое на этой табличке — или ничего, если всё понято."""
    if leftovers is None:
        return None
    if leftovers:
        return (NOT_INTERPRETED["shown_above"] if not keys
                else "Not interpreted: " + "; ".join(leftovers))
    return NOT_INTERPRETED["symbol"]


def _term(ref: Reference, key: str) -> dict:
    """Ключ справочника → готовая для показа пара. Неизвестный ключ не выдумывается."""
    entry = ref.get(key)
    if entry is None:
        return {"key": key, "text": key, "known": False}
    return {"key": key, "text": entry.en, "known": True}


def _join_alike(periods: list[Period]) -> list[Period]:
    """Склеить соседние отрезки, неотличимые на экране.

    На знаке `2 tim 8-18` граница в 18:00 настоящая — за ней перестаёт действовать
    лимит с таблички. Но на шкале оба отрезка выглядят одинаково: «плата не указана».
    Две одинаковые полосы подряд читаются как ошибка, а различие между ними
    и так сказано концом стоянки.
    """
    out: list[Period] = []
    for p in periods:
        prev = out[-1] if out else None
        if (prev and prev.end == p.start and prev.state == p.state
                and prev.conditions == p.conditions):
            out[-1] = replace(prev, end=p.end)
        else:
            out.append(p)
    return out


def _visible(r: Regime) -> list[Period]:
    """Сколько шкалы показывать. Движок считает полную картину — она нужна ему,
    чтобы отвечать про любой момент, — а на экран идёт только то, о чём человек
    спрашивает: **сколько он здесь простоит**.

    Есть предел стоянки — шкала кончается им. Показывать «знак разрешает стоянку»
    дальше момента, когда машину надо убрать, значит отвечать не на тот вопрос:
    рядом с «предел истекает завтра в 17:11» это читается как противоречие
    (найдено разработчиком на обкатке).

    Предела нет — например, знак сейчас запрещает — доводим до первой смены
    состояния включительно: дальше начинается уже другая стоянка.

    Молчание знака шкалой не рисуется вовсе (`_stated`).
    """
    periods = r.periods
    if not periods:
        return periods

    if r.duration_expires_at:
        out: list[Period] = []
        for p in periods:
            if p.start >= r.duration_expires_at:
                break
            out.append(p if p.end <= r.duration_expires_at
                       else replace(p, end=r.duration_expires_at))
        return _stated(_join_alike(out or periods[:1]))

    first = periods[0].state
    for i, p in enumerate(periods):
        if p.state != first:
            return _stated(_join_alike(periods[:i + 1]))
    return _stated(_join_alike(periods))


def _stated(periods: list[Period]) -> list[Period]:
    """Шкала — про то, что знак о моменте ГОВОРИТ. Молчание на ней не рисуется.

    Указано разработчиком после проверки зонального знака: момент внутри запрета
    показывается красной пунктирной линией «No parking», а любой момент вне его —
    фразой, и никакого окна при этом нет.

    Отсюда два правила, и оба — про молчание:

    - спрошено про момент, о котором знак молчит, — шкалы нет вовсе, вместо неё
      встаёт фраза (`_no_window`);
    - молчание в ХВОСТЕ — «Window ends» после запрета обещало окно, которого знак
      не даёт: конец запрета не начало разрешения.
    """
    if periods and periods[0].state == NOT_STATED:
        return []
    while periods and periods[-1].state == NOT_STATED:
        periods = periods[:-1]
    return periods


def _period_tone(p: Period) -> str:
    if p.state == "prohibited":
        return "prohibited"
    if p.state == "not_stated":
        return "not_stated"
    if p.state == "uncertain":
        return "uncertain"
    return "paid" if "avgift" in p.conditions else "free"


def _headline(p: Period, tone: str) -> str:
    """«Free parking» — только когда условий нет вовсе (см. комментарий выше)."""
    if tone == "free" and p.conditions:
        return PERIOD_HEADLINE["free_with_conditions"]
    return PERIOD_HEADLINE[tone]


def _period(ref: Reference, p: Period, horizon: datetime,
            stay_end: str = "", reason: str = "", certain: bool = True,
            aside: list[dict] | None = None) -> dict:
    tone = _period_tone(p)
    return {
        "start": p.start.isoformat(timespec="minutes"),
        "end": p.end.isoformat(timespec="minutes"),
        "state": p.state,
        "state_text": STATE_TEXT.get(p.state, p.state),
        # Тон отрезка решает бэкенд: платность — свойство правила, а не оформления.
        "tone": tone,
        "headline": _headline(p, tone),
        # Длительность настоящая, а не по циферблату: ночь перевода часов
        # длится 23 или 25 часов, и отрезок, накрывший её, — столько же.
        "minutes": clock.real_minutes(p.start, p.end),
        # Плата уже названа заголовком отрезка; ниже — то, что к ней добавляется.
        "notes": [_term(ref, c) for c in p.conditions if c != "avgift"],
        # Период, упирающийся в конец горизонта, ничем не кончается: знак в этот
        # момент не меняется. Дата тут была бы выдумкой продукта, а не чтением знака.
        "ends_at_horizon": p.end >= horizon,
        "stay_end_text": stay_end,
        "stay_end_reason": reason,
        "conditions": [_term(ref, c) for c in p.conditions],
        "max_duration_minutes": p.max_duration_minutes,
        "note": p.note,
        # Может ли продукт поручиться за то, что этим отрезком управляет.
        #
        # Сплошная линия — «правило прочитано целиком». Пунктир — «что-то тут
        # осталось невыясненным»: табличка не понята, не прочитана, пикселей
        # на текст не хватило, или знак вообще отсылает к условиям вне себя
        # (частная земля). Причина названа в блоке полноты; линия лишь не даёт
        # принять неполный ответ за полный.
        #
        # Пунктиром рисуется и запрет, но там он значит другое — не сомнение,
        # а невозможность стоять. Цвет их и различает.
        "certain": certain,
        # Строки под отрезком: кому годится окно и чьи условия отличаются.
        #
        # Считаются ДЛЯ КАЖДОГО отрезка, а не для окна целиком. Найдено на обкатке,
        # снимок `033`: «residents may have separate parking terms» стояло только
        # под первым отрезком, и читающий средний — платный — его не видел.
        # Оговорка относится ко всему окну, значит и к каждой его части.
        "aside": aside or [],
    }


UNKNOWN_PLATE_TERM = {
    "key": "unknown-plate",
    "known": False,
    "text": "One plate could not be interpreted; it may narrow who these spaces "
            "are for",
}


# Запрет С ЧАСАМИ — не то же самое, что запрет всегда.
#
# Найдено на обкатке, снимок `019`: знак запрещает стоянку с 7 до 18, в остальное
# время она платная — шкала это показывала верно, а круг стоящих говорил «The sign
# prohibits parking» без оговорки. Формулировка бралась у самой записи справочника,
# а запись описывает знак вообще, безотносительно табличек с часами под ним.
#
# «Не запрещает» не равно «разрешает»: вне названных часов знак просто молчит,
# и дальше действуют общие правила. Так и сказано.
TIMED_PROHIBITION_TEXT = {
    "main-prohibition-parking":
        "The sign prohibits parking only during the hours it names — outside "
        "them the general parking rules apply",
    "main-prohibition-stopping":
        "The sign prohibits stopping and parking only during the hours it names "
        "— outside them the general parking rules apply",
    "main-zone-prohibition":
        "Inside the area the sign marks, parking is prohibited only during the "
        "hours it names — outside them the general parking rules apply",
}


# Арендованное место — не круг, к которому можно принадлежать, а место, отданное
# КОНКРЕТНОМУ человеку. Разрешение для инвалида или билет посетителя предъявляют;
# арендованное место либо твоё, либо нет, и предъявить тут нечего.
RENTED = "forhyrda-platser"

NO_WINDOW_RENTED = (
    "The sign sets no parking window here: these spaces are rented, and how "
    "long a rented space may be used follows from its rental, not from this sign."
)

# Запрещающий знак, чьё окно сейчас не идёт, не оставляет после себя окна стоянки:
# он не запрещает — но и не разрешает. Шкала здесь показывала «Window starts /
# Window ends» и обещала окно, которого знак не давал.
NO_WINDOW_NOTHING_STATED = (
    "The sign restricts parking only at the times written on its plate. About "
    "parking here at other times the sign states nothing: the general rules of "
    "the road apply, and they are not on this sign."
)


# Заметка о переводе часов. Показывается тогда, когда показанный отрезок перевод
# ПЕРЕСЕКАЕТ, — там, где она меняет чтение экрана. Сканирование днём того же
# воскресенья, когда перевод уже позади, ничего не меняет, и заметка была бы шумом
# (решение 117).
#
# Даты в тексте нет намеренно: перевод может прийтись и на ближайшую ночь,
# и на следующее воскресенье в пределах горизонта, а «показанная здесь ночь»
# верна в обоих случаях — шкала эту ночь и так показывает.
#
# Часы, наоборот, постоянные: переход в ЕС идёт в 01:00 UTC, Швеция зимой `+1`,
# летом `+2`, поэтому весной это ровно 02:00, осенью — ровно 03:00.
CLOCK_CHANGE_TEXT = {
    "back": "The clocks go back on the night shown here: at 03:00 they return to "
            "02:00, so that night is an hour longer. The times shown already allow "
            "for it.",
    "forward": "The clocks go forward on the night shown here: at 02:00 they jump to "
               "03:00, so that night is an hour shorter. The times shown already "
               "allow for it.",
}


def _clock_change(periods: list[Period]) -> str | None:
    if not periods:
        return None
    return CLOCK_CHANGE_TEXT.get(
        clock.switch_between(periods[0].start, periods[-1].end) or "")


def _no_window(r: Regime, circle: list[dict]) -> str | None:
    """Есть ли смысл рисовать шкалу — или её содержание вводит в заблуждение.

    Найдено на обкатке, снимок `020`: «Free parking, 28 h 19 min max» под знаком
    арендованных мест. Оговорка «Rented spaces» строкой ниже верна, а число над
    ней — нет: **оно целиком из правила 24 часов, а не со знака**. Тому, чьё это
    место, срок известен из договора; всем остальным стоять нельзя вовсе,
    и предлагать им двадцать восемь часов бессмысленно.

    Шкала убирается, только когда убирать нечего: все отрезки разрешающие
    и предел взялся из умолчания. Если знак вводит СВОИ часы — скажем, запрет
    по пятницам, — шкала несёт настоящее указание и остаётся: оно нужно
    и самому арендатору.
    """
    # Знак молчит о СПРОШЕННОМ моменте — этого довольно. Дальше по шкале запрет
    # может и начаться, но окна стоянки он не образует: между «сейчас» и запретом
    # знак не разрешает ничего, и рисовать там окно значит обещать своё.
    # Шкала начинается с выбранного момента, поэтому спрошенное — первый отрезок.
    if r.periods and r.periods[0].state == NOT_STATED:
        return NO_WINDOW_NOTHING_STATED

    if not any(t["key"] == RENTED for t in circle):
        return None
    if any(p.state != ALLOWED for p in r.periods):
        return None
    if r.duration_source != "24h_default":
        return None
    return NO_WINDOW_RENTED


def _main_term(ref: Reference, r: Regime, main_key: str) -> dict:
    """Подпись основного знака для круга стоящих.

    У запрещающего знака она зависит от того, оставили ли таблички разрешённые
    часы: запрет на весь срок и запрет с 7 до 18 — разные утверждения, и второе
    без оговорки читается как первое.
    """
    term = _term(ref, main_key)
    timed = TIMED_PROHIBITION_TEXT.get(main_key)
    if timed and any(p.state == ALLOWED for p in r.periods):
        return dict(term, text=timed)
    return term


def _narrowing(ref: Reference, r: Regime) -> list[str]:
    """Таблички, которые СУЖАЮТ круг стоящих: коляска, `Besökande`, мотоцикл.

    Дополняющие (`Boende`) сюда не входят — они круг не сужают и стоят отдельной
    строкой примечания."""
    return [k for k in r.eligibility
            if (e := ref.get(k)) and e.counts_towards_rules]


# Как читается круг стоящих, когда основной знак ЗАПРЕЩАЕТ.
#
# Под синим `P` табличка сужает разрешение: «окно годится вот кому». Под запретом
# логика обратная — табличка вводит ИСКЛЮЧЕНИЕ из запрета, и та же короткая подпись
# без оговорки прочтётся наоборот: «здесь нельзя стоять именно арендаторам».
#
# Формулировка остаётся утверждением о ЗНАКЕ. «Unless you have rented the spot»
# было бы про читателя, а относится ли он к названному кругу, продукт не знает
# и знать не может (`PROJECT_BRIEF.md`, словарь).
EXCEPTION_PREFIX = "The sign names an exception: "


def _short_term(ref: Reference, key: str, *, exception: bool = False) -> dict:
    """Короткая подпись из справочника — для мест, где длинная фраза не помещается.

    Берётся `short` той же записи, что даёт длинный текст: два места, две длины,
    один источник. Разойтись они не могут."""
    entry = ref.get(key)
    if entry is None:
        return {"key": key, "text": key, "known": False}
    text = entry.short or entry.en
    return {"key": key,
            "text": (EXCEPTION_PREFIX + text) if exception else text,
            "known": True}


def _who_can_park(ref: Reference, r: Regime, main_key: str | None,
                  unknown_plates: bool = False,
                  private_land: bool = False) -> list[dict]:
    """Круг стоящих: сначала общее правило знака, если его никто не сузил.

    **Непонятая табличка обязана быть названа здесь.** Правило асимметрии: при
    неполном разборе можно сузить, но не расширить. Знак `Beskickningsfordon`
    сообщал «стоянка для всех транспортных средств» — формально верно, потому что
    дипломатические машины бывают любого типа, и ровно поэтому опасно: водитель,
    к этому кругу не относящийся, читал разрешение там, где на знаке стоит
    ограничение, которого продукт не понял.

    Оговорка общая и не требует знать, ЧТО написано на табличке, — этим она
    и хороша: в жизни таких табличек бесконечно много, и заводить под каждую
    значение в схеме нельзя.
    """
    narrowing = _narrowing(ref, r)
    extra = [k for k in r.eligibility if k not in narrowing]

    caveat = [dict(UNKNOWN_PLATE_TERM)] if unknown_plates else []
    # Оговорка про частную землю идёт ПОСЛЕ общего правила знака, а не вместо него.
    #
    # Знак `P` наверху и правда разрешает стоянку — это даже довод при оспаривании
    # штрафа. Но земля частная, и находиться на ней нужно с разрешения владельца,
    # а его условий на столбе нет. Оба утверждения верны, и второе уточняет первое.
    if private_land:
        caveat = caveat + [_term(ref, PRIVATE_LAND)]
    if narrowing:
        return [_term(ref, k) for k in narrowing + extra] + caveat
    head = [_main_term(ref, r, main_key)] if main_key else []
    return head + [_term(ref, k) for k in extra] + caveat


PRIVATE_LAND = "privat-parkering"


def _regime(ref: Reference, r: Regime, horizon: datetime,
            main_key: str | None = None, unknown_plates: bool = False,
            private_land: bool = False, certain: bool = True) -> dict:
    # Под синим `P` табличка сужает разрешение; под запретом — вводит исключение.
    # Логика обратная, и от этого зависит и текст строки, и её место на шкале.
    запрет = bool(main_key) and "prohibition" in main_key

    # Строка под отрезком собирается ЗДЕСЬ целиком — и что писать, и под каким
    # отрезком. Фронтенд её только показывает (решение 80).
    #
    # Отрезок выбирается по смыслу: исключение из запрета принадлежит запрещающему
    # отрезку, круг окна — разрешающему. Поставить «Visitors only» под «No parking»
    # значит сказать обратное тому, что на знаке.
    нужное = PROHIBITED if запрет else ALLOWED
    несущий = next((i for i, p in enumerate(r.periods) if p.state == нужное), 0)

    # Указание, которое движок расписал ПО ЧАСАМ, кругом окна не является.
    #
    # На знаке `012` разрешение требуется с 7 до 17, а в остальное время довольно
    # платы. Движок кладёт его и в условия отрезка 7-17, и в круг режима — там оно
    # означает «такая табличка на знаке есть». Показать его строкой у всего окна
    # значит распространить на часы, где его не требуют: на `012` строка
    # «A special parking permit is required» стояла под ночным отрезком, где
    # довольно заплатить.
    #
    # Поэтому из круга уходит всё, что хоть у одного отрезка стоит условием: там
    # оно уже сказано, и сказано ТОЧНЕЕ — с часами, к которым относится.
    #
    # Сверяется по КЛЮЧУ, а не по тексту: у длинной и короткой формы тексты разные,
    # и по ним ни повтор, ни этот случай не видны.
    показанные = _visible(r)
    по_часам = {k for p in r.periods for k in p.conditions}
    круг = [_short_term(ref, k, exception=запрет)
            for k in _narrowing(ref, r) if k not in по_часам]
    # Частная земля — не круг стоящих, а оговорка ко всему окну: сроки на шкале
    # верны только для того, кому владелец вообще разрешил тут находиться.
    if private_land:
        круг = круг + [_short_term(ref, PRIVATE_LAND)]
    примечания = [_term(ref, k) for k in r.eligibility
                  if (e := ref.get(k)) and not e.counts_towards_rules]
    return {
        "extent": r.extent,
        "extent_text": EXTENT_TEXT.get(r.extent, r.extent),
        # Участок заголовком окна. Найдено на обкатке: на знаке `010` стрелки
        # задают ДВА разных режима — слева просто арендованные места, справа
        # арендованные с особым разрешением, — и продукт показывал два окна,
        # ничем не подписанных. Со стороны они выглядели повтором, хотя правила
        # разные. Участок продукт вычислял и на экран не выводил вовсе.
        "extent_short": EXTENT_SHORT.get(r.extent, r.extent),
        "eligibility": [_term(ref, k) for k in r.eligibility],
        # Кому отведены места. Условие допуска — ПОДПИСЬ к режиму, а не проверка
        # пользователя: продукт называет круг и останавливается, потому что
        # относится ли к нему стоящий у знака, знает только он сам.
        #
        # Таблички здесь двух разных родов, и путать их нельзя:
        #
        # - **сужающие** (`Besökande`, коляска, `Förhyrda platser`) — они и есть
        #   круг стоящих, и общее разрешение знака ими заменяется;
        # - **дополняющие** (`Boende`) — круг не сужают вовсе. `Boende Solna`
        #   не запрещает стоять никому: он сообщает, что у жильцов свои условия.
        #   Показать одну эту строку значит намекнуть, что остальным нельзя.
        #
        # Поэтому при дополняющей табличке сначала говорится общее правило знака,
        # и только потом — чьи условия отличаются.
        "who_can_park": _who_can_park(ref, r, main_key, unknown_plates,
                                      private_land),
        # Дополняющие таблички (`Boende`) — не круг стоящих, а примечание к нему.
        # На шкале они стоят рядом с отрезком: условия у этих людей свои.
        "notes": примечания,
        # Кому годится ЭТО окно — короткой строкой, прямо под отрезком шкалы.
        #
        # Найдено на обкатке: под «Who can park here» стояло «места отведены
        # держателям разрешения для инвалидов», а на шкале — только «Parking fee
        # и длительность». Окно выглядело годным для всех, и круг терялся ровно
        # там, где человек смотрит на своё время.
        #
        # Пусто, когда круг никто не сузил: у обычного `P` уточнять нечего,
        # и лишняя строка «для всех» только шумит.
        "window_for": круг,
        # Заполнено — шкалы нет, вместо неё эта строка.
        "no_window_text": _no_window(r, круг + примечания),
        # Заметка о переводе часов — про ПОКАЗАННЫЙ отрезок, поэтому и стоит она
        # у режима: у знака с двумя стрелками окон два, и пересекать перевод
        # может одно из них.
        "clock_change_text": _clock_change(показанные),
        # Куда эту строку ставить, решает её СМЫСЛ, а не место в списке.
        # Исключение из запрета принадлежит запрещающему отрезку; круг окна —
        # разрешающему. Поставь «Visitors only» под «No parking», и выйдет
        # ровно обратное тому, что на знаке.
        "place_notes": [_term(ref, k) for k in r.place_notes],
        "duration_expires_at": (r.duration_expires_at.isoformat(timespec="minutes")
                                if r.duration_expires_at else None),
        "duration_source": r.duration_source,
        "periods": [
            _period(ref, p, horizon,
                    # последний период кончается там же, где кончается стоянка
                    STAY_END_TEXT.get(r.duration_source or "", "")
                    if r.duration_expires_at and p.end == r.duration_expires_at else "",
                    STAY_END_REASON.get(r.duration_source or "", "")
                    if r.duration_expires_at and p.end == r.duration_expires_at else "",
                    certain=certain and not private_land,
                    # Круг стоящих идёт под отрезками СВОЕГО рода: исключение
                    # из запрета — под запрещающими, круг окна — под разрешающими.
                    # Примечания (`Boende`) относятся ко всему окну и идут под всеми.
                    aside=[t for t in (круг if p.state == нужное else []) + примечания
                           if t["key"] not in set(p.conditions)])
            for p in показанные
        ],
    }


# --- имена полей для блока «что сервис увидел» ------------------------------
#
# Блок показывает не пересказ, а **разбор**: что именно прочитано и как это поле
# называется. Имя берётся из схемы дословно (`parsed.duration_limit`, а не «Duration»),
# потому что вопрос, на который блок отвечает, — «что сервис увидел», и сверить его
# с самим знаком можно только по настоящим именам.
#
# Порядок фиксирован здесь, а не собирается из словаря: словарь придёт в том порядке,
# в каком модель заполнила поля, и одинаковые знаки будут выглядеть по-разному.

_PANEL_ORDER = ["index", "kind", "background_color", "lines"]
_PARSED_ORDER = [
    "duration_limit", "time_windows", "fee", "payment_method", "permit_required",
    "scope_shift", "eligibility", "vehicle_class", "arrow", "place_count",
    "stretch_metres", "placement", "prohibition", "pictogram", "operator",
    "tariff_code", "area_code", "permits_parking", "uninterpreted",
]


def _fmt(value) -> str:
    """Значение поля одной строкой. Форма важна: `2 hours` читается, `{'amount': 2,
    'unit': 'hours'}` — нет, а показать надо именно то, что прочитано."""
    if isinstance(value, bool):
        return "yes" if value else "no"
    if value is None:
        return "—"
    if isinstance(value, dict):
        if "amount" in value and "unit" in value:
            return f"{value['amount']} {value['unit']}"
        if "from" in value and "to" in value:
            day = value.get("day_class")
            return f"{value['from']}–{value['to']}" + (f" ({day})" if day else "")
        if "readable" in value:
            out = "readable" if value["readable"] else "not readable"
            obs = value.get("obstructions") or []
            return out + (f"; {', '.join(obs)}" if obs else "")
        return ", ".join(f"{k}: {v}" for k, v in value.items() if v not in (None, ""))
    if isinstance(value, list):
        return ", ".join(_fmt(v) for v in value) if value else "—"
    return str(value)


def _row(name: str, value) -> dict | None:
    if value is None or value == [] or value == {}:
        return None
    return {"name": name, "value": _fmt(value)}


def _main_sign_fields(main: dict) -> list[dict]:
    rows = [_row(k, main.get(k))
            for k in ("type", "form", "background_color", "legibility")]
    return [r for r in rows if r]


def _panel_fields(panel: dict, reference_keys: list[str]) -> list[dict]:
    rows = [_row(k, panel.get(k)) for k in _PANEL_ORDER]
    # `lines` показывается всегда: пустой список здесь — это факт о панели
    # (пиктограмма без текста), а не отсутствие данных.
    if not panel.get("lines"):
        rows.append({"name": "lines", "value": "(no text)"})

    parsed = panel.get("parsed") or {}
    for key in _PARSED_ORDER:
        if key in parsed:
            rows.append(_row(f"parsed.{key}", parsed[key]))
    for key in sorted(set(parsed) - set(_PARSED_ORDER)):   # поле вне схемы не прячем
        rows.append(_row(f"parsed.{key}", parsed[key]))

    rows.append(_row("legibility", panel.get("legibility")))
    rows.append(_row("reference_keys", reference_keys))
    return [r for r in rows if r]


# --- время одной фразой ----------------------------------------------------
#
# Табличка `Torsdag 10-14 / Jämna veckor / Augusti-Juni` — это ОДНО указание, и на
# экране оно должно быть одной строкой. Порознь получалось четыре: «запрет», «часы
# в названный день», «чётные недели», «сезон» — каждая верна, а вместе они шумят
# и заставляют читателя собирать смысл самому.
#
# Собирает фразу код, а не модель: порядок частей и их формулировки фиксированы
# здесь и проверяются тестом.

_MONTHS = ["", "January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"]

_DAY_PHRASE = {
    "weekday": "on weekdays",
    "eve": "on Saturdays and days before a holiday",
    "red": "on Sundays and public holidays",
    "all_days": "every day",
    "unspecified": "on weekdays",
}

# Ключи справочника, которые описывают ВРЕМЯ. Они уходят в общую фразу, поэтому
# отдельными строками больше не показываются.
_TIME_KEYS = {"window-weekday", "window-eve", "window-red", "alla-dagar",
              "named-weekday", "jamna-veckor", "udda-veckor", "datumintervall"}


_MONTH_LEN = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
              7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}


def _md(value: str) -> tuple[int, int]:
    month, day = value.split("-")
    return int(month), int(day)


def _range_name(rng: dict) -> str:
    """Промежуток дат по-человечески.

    Целый месяц называется месяцем (`July`), один день — днём (`15 June`),
    всё прочее — от и до. Пересказывать `07-01 … 07-31` как «с 1 по 31 июля»
    там, где на табличке написано «июль», значит быть точным и нечитаемым.
    """
    (am, ad), (bm, bd) = _md(rng["from"]), _md(rng["to"])
    if (am, ad) == (bm, bd):
        return f"{ad} {_MONTHS[am]}"
    full_end = bd >= _MONTH_LEN[bm] or (bm == 2 and bd >= 28)
    if ad == 1 and full_end:
        return _MONTHS[am] if am == bm else f"{_MONTHS[am]} to {_MONTHS[bm]}"
    return f"{ad} {_MONTHS[am]} to {bd} {_MONTHS[bm]}"


def _join(names: list[str]) -> str:
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


def _dates_phrase(windows: list[dict]) -> str:
    """Даты группы окон одной фразой — так, как написано на табличке.

    `Gäller ej 1 juli - 31 juli` человек читает как «кроме июля», и видеть должен
    исключение, а не пересказ двух оставшихся промежутков.
    """
    dates = [w.get("dates") for w in windows]
    if any(d is None for d in dates):
        return ""

    ranges = [r for d in dates for r in d.get("ranges") or []]
    modes = {d.get("mode") for d in dates}
    if len(modes) != 1:
        return ""          # разные режимы в одной группе — сказать нечего
    names = [_range_name(r) for r in ranges]

    if modes.pop() == "except":
        return "all year except " + _join(names)
    if len(names) == 1 and " to " in names[0]:
        return f"from {names[0]} inclusive"
    return "in " + _join(names)


def _key(w: dict) -> tuple:
    """Чем окна отличаются, кроме дат: день, часы, чётность недели."""
    return (w.get("day_class"), w.get("named_weekday"),
            w.get("from"), w.get("to"), w.get("week_parity"))


def _window_phrase(w: dict, dates: str) -> str:
    day = w.get("day_class")
    if day == "named_weekday" and w.get("named_weekday"):
        part = "on " + w["named_weekday"].capitalize() + "s"
    else:
        part = _DAY_PHRASE.get(day, "on weekdays")

    out = [f"{part} between {w['from']} and {w['to']}"]
    parity = w.get("week_parity")
    if parity:
        out.append(f"in {parity} weeks")
    if dates:
        out.append(dates)
    return ", ".join(out)


def _time_phrase(parsed: dict) -> str:
    """Окна, отличающиеся только датами, сливаются в одно предложение: на табличке
    это одно указание, и два почти одинаковых предложения подряд читались как ошибка."""
    windows = [w for w in parsed.get("time_windows") or [] if w.get("from")]
    groups: dict[tuple, list[dict]] = {}
    for w in windows:
        groups.setdefault(_key(w), []).append(w)
    return "; ".join(_window_phrase(g[0], _dates_phrase(g)) for g in groups.values())


def _meaning(ref: Reference, key: str) -> dict:
    """Ключ справочника → как эта табличка называется официально и что она значит.

    `Length of road section (T1)` плюс объяснение — вместо имени поля схемы. Код
    берётся из справочника, куда он занесён по официальным сериям E, C и T; там,
    где кода нет (табло оператора — не дорожный знак), поле пустое, а не выдуманное.
    """
    e = ref.get(key)
    if e is None:
        return {"key": key, "label": key, "code": "", "text": "", "short": "",
                "continues": False}
    return {"key": key, "label": e.label or key, "code": e.code,
            "text": e.en, "short": e.short, "continues": False}


def _merge(items: list[dict]) -> list[dict]:
    """Две записи с одним названием и кодом — одна строка на экране.

    `Avgift` и `Taxa 2` обе несут код T16, и порознь дали бы «Fee (T16)» дважды.
    Смысл при этом разный, поэтому короткие подписи склеиваются, а не теряются."""
    out: list[dict] = []
    for item in items:
        same = next((o for o in out if (o["label"], o["code"])
                     == (item["label"], item["code"])), None)
        if same is None:
            out.append(dict(item))
            continue
        for field in ("short", "text"):
            if item[field] and item[field] not in same[field]:
                same[field] = f"{same[field]}; {item[field]}" if same[field] else item[field]
    return out


def _join_lines(lines: list[str]) -> str:
    """Строки таблички в одну фразу.

    Шведские таблички часто переносят слово с дефисом: `Beskicknings-` / `fordon` —
    это одно слово `Beskickningsfordon`, а не два. Склеивать их пробелом значит
    показывать человеку слово, которого на знаке нет и которого нет в языке.
    """
    out = ""
    for raw in lines:
        part = raw.strip()
        if not part:
            continue
        if out.endswith("-"):
            out = out[:-1] + part          # перенос: дефис уходит вместе со стыком
        elif out:
            out += " " + part
        else:
            out = part
    return out


def _panel_view(panel: dict, keys: list[str], ref: Reference) -> dict:
    """Панель так, как её читает человек: что написано и что это значит.

    Заголовок один и тот же — «Panel», без номера: номер нужен коду для ссылок,
    а человеку у знака он ничего не сообщает. Порядок панелей на экране и так
    сверху вниз, как на самом знаке.
    """
    kind = panel.get("kind")
    text = _join_lines(panel.get("lines", []))
    carries_rule = kind == "sign_plate"

    # Заголовок один и тот же у всех панелей, включая табло: панель на знаке —
    # это панель, а чем именно она оказалась, сказано строкой ниже.
    if not carries_rule:
        key = "info-board" if kind == "info_board" else "operator-plate"
        entry = ref.get(key)
        meanings = [{"key": key,
                     "label": entry.label if entry else "Info board",
                     "code": "", "text": "", "short": "", "continues": False}]
    else:
        parsed = panel.get("parsed") or {}
        phrase = _time_phrase(parsed)
        items = _merge([_meaning(ref, k) for k in keys if k not in _TIME_KEYS])

        if phrase:
            # Фраза о времени прицепляется к тому указанию, которое она уточняет,
            # и читается с ним как одно предложение: «No parking (C35) on Thursdays
            # between 10:00 and 14:00, in even weeks». `continues` говорит вёрстке
            # не ставить точку перед ней.
            if items:
                items[0] = dict(items[0], short=phrase, continues=True)
            else:
                items = [{"key": "time-window", "label": "Hours", "code": "T6",
                          "text": "", "short": phrase, "continues": True}]
        meanings = items

    return {"title": "Panel", "text": text, "meanings": meanings,
            "carries_rule": carries_rule}


def _what_we_saw(analysis: Analysis, ref: Reference) -> dict:
    """Блок 1: что сервис увидел. Панели показываются ВСЕ, включая те, что правил
    не задают: на фотографии они видны, и их отсутствие в разборе выглядит потерей."""
    out = analysis.outcome
    if not (out.extraction and out.extraction.data):
        return {"main_sign": None, "main_sign_fields": [],
                "primary_sign": None, "panels": []}
    d = out.extraction.data
    rec = out.recognised
    panels = []
    for p in d["panels"]:
        keys = rec.panel_keys.get(p["index"], []) if rec else []
        panels.append({
            "index": p["index"],
            "kind": p.get("kind"),
            "lines": p.get("lines", []),
            "background_color": p.get("background_color"),
            "carries_rule": p.get("kind") == "sign_plate",
            "reference_keys": keys,
            "uninterpreted": (rec.uninterpreted.get(p["index"], []) if rec else []),
            # Готовая подпись «это не истолковано» — здесь, а не в вёрстке:
            # у случая три вида, и различать их должен тот, кто знает, что
            # именно не понято.
            "not_interpreted_text": _not_interpreted(
                p, keys, rec.uninterpreted.get(p["index"]) if rec else None),
            "fields": _panel_fields(p, keys),
            **_panel_view(p, keys, ref),
        })

    mk = rec.main_sign_key if rec else None
    return {"main_sign": d["main_sign"],
            "main_sign_fields": _main_sign_fields(d["main_sign"]),
            "primary_sign": _meaning(ref, mk) if mk else None,
            "panels": panels}


def _category_text(a: Assessment) -> str:
    """Подпись к полноте. У `partial` причин две, и они разные.

    Обычно `partial` значит «часть знака не прочитана». Но знак без единой таблички
    с правилом прочитан ЦЕЛИКОМ — просто читать было нечего, и подтвердить прочтение
    нечем. Сказать про него «часть знака не прочитана» — неправда, и неправда
    обидная: пользователь пойдёт искать на столбе то, чего там нет.
    """
    if a.category == PARTIAL and a.reasons == ["main_sign_uncorroborated"]:
        return ("The sign carries no plate stating a parking rule, so what follows "
                "rests on the symbol at the top of the pole alone")
    return CATEGORY_TEXT.get(a.category, a.category)


def _completeness(a: Assessment) -> dict:
    """Блок 4: полнота и уверенность. Уверенность считает код по своим сигналам;
    самооценка модели — один из входов, а не решающий (`AGENTS.md`, §8)."""
    return {
        "category": a.category,
        "category_text": _category_text(a),
        "tone": _tone(a.category, a.confidence),
        "confidence": a.confidence,
        "signals": a.signals,
        "reasons": [_explain(r, REASON_TEXT) for r in a.reasons],
        "unread_panels": a.unread_panels,
        "may_hide_prohibition": a.may_hide_prohibition,
    }


def to_json(analysis: Analysis, ref: Reference, moment: datetime,
            day_class: str) -> dict:
    """Полный ответ по снимку. Форма одна и та же во всех исходах: сначала полнота,
    потом то, что удалось прочитать. Отказ — не другая форма ответа, а тот же ответ
    без вывода."""
    out, a, ev = analysis.outcome, analysis.assessment, analysis.evaluation

    body = {
        # Растёт при каждом изменении формы ответа. Страница сверяет и говорит
        # человеку, что сервер старее её, вместо пустых блоков без объяснения.
        "contract": CONTRACT,
        "moment": moment.isoformat(timespec="minutes"),
        "day_class": day_class,
        "completeness": _completeness(a),
        "has_answer": analysis.has_answer,
        "what_we_saw": _what_we_saw(analysis, ref),
        "stopped_at": out.stopped_at,
        "reason": out.reason,
        "flags": out.flags,
        "triage": ({"category": out.triage.category,
                    "what_i_see": out.triage.what_i_see,
                    "panels_below_main_sign": out.triage.panels_below_main_sign}
                   if out.triage else None),
        "regimes": [],
        "uncertainties": [],
        "permits_parking": None,
    }

    if ev is not None:
        main_key = out.recognised.main_sign_key if out.recognised else None
        # Непонятая табличка на знаке — свойство всего разбора, а не участка:
        # какому именно участку она принадлежит, мы как раз и не знаем.
        unknown_plates = bool(a.uninterpreted_plates)
        # Частная земля — свойство площадки, а не участка: она одинакова для всех
        # режимов знака, как и непонятая табличка.
        private_land = bool(out.recognised) and any(
            PRIVATE_LAND in keys for keys in out.recognised.panel_keys.values())
        # За что продукт может поручиться. Разбор неполный — поручиться нельзя
        # ни за один отрезок: чего именно недостаёт, знает блок полноты, а линия
        # лишь не даёт принять неполный ответ за полный.
        certain = a.category == FULL
        body["regimes"] = [_regime(ref, r, horizon_end(moment), main_key,
                                   unknown_plates, private_land, certain)
                           for r in ev.regimes]
        body["uncertainties"] = [_explain(u, UNCERTAINTY_TEXT) for u in ev.uncertainties]
        body["permits_parking"] = ev.permits_parking
        if ev.note:
            body["note"] = _explain(ev.note, NOTE_TEXT)
    return body

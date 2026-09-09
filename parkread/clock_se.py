"""Перевод часов. **Считается кодом, часовых баз не требует.**

Правило ЕС одно на весь союз: вперёд — в последнее воскресенье марта, назад —
в последнее воскресенье октября, оба перехода в 01:00 UTC. Швеция зимой `+1`,
летом `+2`, поэтому на шведских часах числа всегда одни и те же: **весной 02:00
становится 03:00, осенью 03:00 становится 02:00**. Меняется только дата.

**Зачем это движку.** Всё остальное в продукте считается по циферблату, и правильно:
`9-12` на табличке — это девять на часах и в марте, и в октябре. Но **длительность**
циферблатом не меряется: в ночь перевода сутки длятся 23 или 25 часов. Мест, где
это кусается, ровно три — предел с таблички (`2 tim`), правило 24 часов и длина
отрезка на шкале. Промах — час, дважды в год, у стоянок, пересекающих переход
(решение 116).

**Два случая названы явно.** Весной час 02:00-03:00 не существует, осенью
02:00-03:00 идёт дважды. Несуществующее время сдвигается вперёд; у повторяющегося
берётся **первое** вхождение, ещё летнее. Иначе ответ зависел бы от того, какой
из двух одинаковых часов имел в виду человек, а спросить его об этом нельзя.

Время внутри продукта — наивное местное (шведское). Эти функции переводят его
в настоящее и обратно, ничего не зная о часовых поясах устройства: пояс устройства
остаётся открытым вопросом, и здесь он не решается.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

WINTER = 1   # CET,  UTC+1
SUMMER = 2   # CEST, UTC+2

HOUR = timedelta(hours=1)


def _last_sunday(year: int, month: int) -> date:
    """Последнее воскресенье месяца — так правило ЕС и записано."""
    d = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
    return d - timedelta(days=(d.weekday() + 1) % 7)


def spring_forward(year: int) -> datetime:
    """Момент на шведских часах, в который стрелки прыгают вперёд: 02:00 → 03:00."""
    return datetime.combine(_last_sunday(year, 3), datetime.min.time()) + 2 * HOUR


def autumn_back(year: int) -> datetime:
    """Момент на шведских часах, в который стрелки идут назад: 03:00 → 02:00.
    Записан **до** перевода, то есть по летнему времени."""
    return datetime.combine(_last_sunday(year, 10), datetime.min.time()) + 3 * HOUR


def normalise(local: datetime) -> datetime:
    """Час, которого не было. Весной 02:00-03:00 на часах не существует, и время
    из этой дыры сдвигается вперёд — иначе оно не значит ничего."""
    jump = spring_forward(local.year)
    if jump <= local < jump + HOUR:
        return local + HOUR
    return local


def offset(local: datetime) -> int:
    """Сколько часов местное время впереди UTC: `+1` зимой, `+2` летом.

    В повторяющийся осенний час возвращается летнее смещение: берём первое
    вхождение — то, которое человек и видит на часах, когда пишет это время.
    """
    local = normalise(local)
    if spring_forward(local.year) <= local < autumn_back(local.year):
        return SUMMER
    return WINTER


def to_utc(local: datetime) -> datetime:
    return normalise(local) - timedelta(hours=offset(local))


def from_utc(moment: datetime) -> datetime:
    # В UTC переходы стоят на 01:00 обоих воскресений — там разрывов нет,
    # поэтому смещение определяется однозначно и без оговорок.
    year = moment.year
    spring = datetime.combine(_last_sunday(year, 3), datetime.min.time()) + HOUR
    autumn = datetime.combine(_last_sunday(year, 10), datetime.min.time()) + HOUR
    return moment + timedelta(hours=SUMMER if spring <= moment < autumn else WINTER)


def add(local: datetime, delta: timedelta) -> datetime:
    """Прибавить **настоящее** время. `2 tim` — это два часа, прожитых машиной,
    а не два деления циферблата: в ночь перевода это разные вещи."""
    return from_utc(to_utc(local) + delta)


def real_minutes(start: datetime, end: datetime) -> int:
    """Сколько минут пройдёт на самом деле. Ночь перевода длится 23 или 25 часов,
    и отрезок шкалы, накрывший её, длится столько же."""
    return int((to_utc(end) - to_utc(start)).total_seconds() // 60)


def switch_between(start: datetime, end: datetime) -> str | None:
    """Пересекает ли отрезок перевод часов, и в какую сторону.

    Возвращает `"forward"`, `"back"` или `None`. По этому и решается, показывать ли
    заметку: она нужна там, где меняет чтение экрана, а не в любые выходные перевода.
    """
    for year in range(start.year, end.year + 1):
        if start <= spring_forward(year) < end:
            return "forward"
        if start <= autumn_back(year) < end:
            return "back"
    return None

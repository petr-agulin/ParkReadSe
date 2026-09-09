"""Классы дня по шведскому календарю. **Считается кодом, файла нет.**

Праздники задаёт `Lag (1989:253) om allmänna helgdagar`: § 1 перечисляет красные дни,
§ 2 называет их даты. Правил там три — постоянная дата, смещение от Пасхи и «суббота,
попавшая в такие-то числа», — и все три вычислимы. Поэтому список не хранится: файл
с ним покрывал один год и однажды перестал бы отвечать (решение 108).

Воскресенья, субботы и кануны выводятся здесь же: хранить вычислимое значит однажды
получить расхождение между хранимым и вычисляемым.

Порядок проверок важен, и красное побеждает скобки **по определению**, а не
по договорённости: канун — это *vardag före sön- och helgdag*, то есть **рабочий**
день перед красным. Праздник рабочим днём не является и канунoм быть не может.
При обратном порядке в 2026 году портятся шесть дней.

**Окно продукта — 2026-2030** (решение 115). Раньше него отвечать незачем, дальше —
нельзя без проверки: набор праздников со временем меняется (до 2005 года вместо
`nationaldagen` красным был `annandag pingst`), и «любой год» тихо врал бы.
Продлевается окно одной константой ниже.
"""
from __future__ import annotations

from datetime import date, timedelta

WEEKDAY = "weekday"   # vardag
EVE = "eve"           # vardag före sön- och helgdag
RED = "red"           # sön- och helgdag
UNKNOWN = "unknown"   # дата вне покрытого периода

# Окно, в котором продукт отвечает. Момент вне него выбрать нельзя: поле на экране
# ограничено этими краями, и бэкенд такой запрос отклоняет.
SELECTABLE_FROM = date(2026, 1, 1)
SELECTABLE_TO = date(2030, 12, 31)

# Считается на год шире с каждой стороны. Шкала строится на восемь суток вперёд,
# и разбор, сделанный 28 декабря 2030-го, спрашивает про январь 2031-го: без запаса
# он получил бы «класс дня неизвестен» на ровном месте. Тот же приём был и в файле —
# там ради 31 декабря лежал отдельной записью 1 января следующего года.
MARGIN = 1


def easter(year: int) -> date:
    """Пасхальное воскресенье по григорианскому компутусу (Meeus/Jones/Butcher).

    Закон говорит «söndagen närmast efter den fullmåne som infaller på eller närmast
    efter den 21 mars», и полнолуние здесь **церковное, табличное**, а не наблюдаемое:
    церковь наблюдений не ведёт, а считает по эпакте и золотому числу. Эта функция
    ту же таблицу и воспроизводит, поэтому Пасха — чистая функция года.

    Астрономическое полнолуние с табличным иногда расходится на день-другой.
    В такие годы права **таблица**: считать по небу значило бы получить неверную Пасху.
    """
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    lunar = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * lunar) // 451
    month, day = divmod(h + lunar - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _saturday_between(year: int, month: int, first: int, days: int) -> date:
    """Суббота, попавшая в окно из `days` дней подряд начиная с `first` числа.

    Окно всегда семидневное, поэтому суббота в нём ровно одна — так закон и задаёт
    `midsommardagen` (20-26 июня) и `alla helgons dag` (31 октября - 6 ноября).
    """
    start = date(year, month, first)
    return start + timedelta(days=(5 - start.weekday()) % 7)


def holidays(year: int) -> dict[date, str]:
    """Тринадцать красных дней года. Ввода-вывода здесь нет и быть не должно:
    эта функция переезжает в браузер как есть (шаг 6).

    Воскресенья сюда не входят — они красные сами по себе, и по той же § 1.
    """
    e = easter(year)
    return {
        date(year, 1, 1): "Nyårsdagen",
        date(year, 1, 6): "Trettondedag jul",
        e - timedelta(days=2): "Långfredagen",
        e: "Påskdagen",
        e + timedelta(days=1): "Annandag påsk",
        date(year, 5, 1): "Första maj",
        # «Sjätte torsdagen efter påskdagen» — это +39 дней: первый четверг после
        # Пасхи отстоит на четыре дня, дальше пять недель.
        e + timedelta(days=39): "Kristi himmelsfärdsdag",
        # «Sjunde söndagen efter påskdagen» — семь недель ровно.
        e + timedelta(days=49): "Pingstdagen",
        date(year, 6, 6): "Sveriges nationaldag",
        _saturday_between(year, 6, 20, 7): "Midsommardagen",
        _saturday_between(year, 10, 31, 7): "Alla helgons dag",
        date(year, 12, 25): "Juldagen",
        date(year, 12, 26): "Annandag jul",
    }


# Английские названия — для экрана: продукт говорит по-английски, а шведское имя
# остаётся рядом, потому что именно оно стоит в календаре, который человек откроет
# для проверки. Перенесены из `data/holidays_se.json`, который этот модуль заменил.
NAME_EN = {
    "Nyårsdagen": "New Year's Day",
    "Trettondedag jul": "Epiphany",
    "Långfredagen": "Good Friday",
    "Påskdagen": "Easter Sunday",
    "Annandag påsk": "Easter Monday",
    "Första maj": "May Day",
    "Kristi himmelsfärdsdag": "Ascension Day",
    "Pingstdagen": "Whit Sunday",
    "Sveriges nationaldag": "National Day of Sweden",
    "Midsommardagen": "Midsummer Day",
    "Alla helgons dag": "All Saints' Day",
    "Juldagen": "Christmas Day",
    "Annandag jul": "Boxing Day",
}


def selectable(d: date) -> bool:
    """Можно ли спрашивать про этот день. Граница продукта, а не календаря:
    считать календарь умеет и шире, но отвечать за годы, которых никто не сверял,
    он не должен."""
    return SELECTABLE_FROM <= d <= SELECTABLE_TO


class Calendar:
    """Календарь классов дня. Строится без аргументов: брать больше неоткуда."""

    def __init__(self) -> None:
        self.covered_from = date(SELECTABLE_FROM.year - MARGIN, 1, 1)
        self.covered_to = date(SELECTABLE_TO.year + MARGIN, 12, 31)
        self._red: dict[date, str] = {}
        for year in range(self.covered_from.year, self.covered_to.year + 1):
            self._red.update(holidays(year))

    # --- базовые предикаты ---

    def is_public_holiday(self, d: date) -> bool:
        return d in self._red

    def holiday_name(self, d: date) -> str | None:
        return self._red.get(d)

    def holiday_name_en(self, d: date) -> str | None:
        return NAME_EN.get(self._red.get(d, ""))

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

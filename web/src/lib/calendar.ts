// Классы дня по шведскому календарю. Порт `parkread/calendar_se.py`, слово в слово.
//
// Праздники задаёт `Lag (1989:253) om allmänna helgdagar`: § 1 перечисляет красные
// дни, § 2 называет их даты. Правил три — постоянная дата, смещение от Пасхи
// и «суббота, попавшая в такие-то числа», — и все три вычислимы, поэтому список
// не хранится (решение 108).
//
// Порядок проверок важен, и красное побеждает скобки по определению: канун — это
// *vardag före sön- och helgdag*, то есть РАБОЧИЙ день перед красным. Праздник
// рабочим днём не является и кануном быть не может.
//
// Окно продукта — 2026-2030 (решение 115): набор праздников со временем меняется
// (до 2005 года вместо `nationaldagen` красным был `annandag pingst`), и «любой
// год» тихо врал бы.

import { addDays, compare, days, isoDate, parseDate, weekday, type Civil } from "./civil";

export const WEEKDAY = "weekday";   // vardag
export const EVE = "eve";           // vardag före sön- och helgdag
export const RED = "red";           // sön- och helgdag
export const UNKNOWN = "unknown";   // дата вне вычисленного периода

export const SELECTABLE_FROM: Civil = { y: 2026, m: 1, d: 1 };
export const SELECTABLE_TO: Civil = { y: 2030, m: 12, d: 31 };

// Считается на год шире с каждой стороны: шкала строится на восемь суток вперёд,
// и разбор 28 декабря 2030-го спрашивает про январь 2031-го.
export const MARGIN = 1;

/** Пасхальное воскресенье по григорианскому компутусу (Meeus/Jones/Butcher).
 *
 *  «Полнолуние» закона — церковное, табличное, а не наблюдаемое: церковь считает
 *  по эпакте и золотому числу. Эта функция ту же таблицу и воспроизводит. */
export function easter(year: number): Civil {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const lunar = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * lunar) / 451);
  const total = h + lunar - 7 * m + 114;
  return { y: year, m: Math.floor(total / 31), d: (total % 31) + 1 };
}

/** Суббота в семидневном окне, начинающемся с указанного числа: так закон задаёт
 *  `midsommardagen` (20-26 июня) и `alla helgons dag` (31 октября - 6 ноября). */
function saturdayBetween(year: number, month: number, first: number): Civil {
  const start = { y: year, m: month, d: first };
  return addDays(start, ((5 - weekday(start)) % 7 + 7) % 7);
}

/** Тринадцать красных дней года. Воскресенья сюда не входят — они красные сами
 *  по себе, и по той же § 1. */
export function holidays(year: number): Map<string, string> {
  const e = easter(year);
  const pairs: [Civil, string][] = [
    [{ y: year, m: 1, d: 1 }, "Nyårsdagen"],
    [{ y: year, m: 1, d: 6 }, "Trettondedag jul"],
    [addDays(e, -2), "Långfredagen"],
    [e, "Påskdagen"],
    [addDays(e, 1), "Annandag påsk"],
    [{ y: year, m: 5, d: 1 }, "Första maj"],
    // «Sjätte torsdagen efter påskdagen» — +39 дней; «sjunde söndagen» — +49.
    [addDays(e, 39), "Kristi himmelsfärdsdag"],
    [addDays(e, 49), "Pingstdagen"],
    [{ y: year, m: 6, d: 6 }, "Sveriges nationaldag"],
    [saturdayBetween(year, 6, 20), "Midsommardagen"],
    [saturdayBetween(year, 10, 31), "Alla helgons dag"],
    [{ y: year, m: 12, d: 25 }, "Juldagen"],
    [{ y: year, m: 12, d: 26 }, "Annandag jul"],
  ];
  return new Map(pairs.map(([d, name]) => [isoDate(d), name]));
}

// Английские названия — для экрана; шведское остаётся рядом, потому что именно оно
// стоит в календаре, который человек откроет для проверки.
export const NAME_EN: Record<string, string> = {
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
};

/** Можно ли спрашивать про этот день. Граница продукта, а не календаря. */
export function selectable(d: Civil): boolean {
  return compare(d, SELECTABLE_FROM) >= 0 && compare(d, SELECTABLE_TO) <= 0;
}

export class Calendar {
  readonly coveredFrom: Civil = { y: SELECTABLE_FROM.y - MARGIN, m: 1, d: 1 };
  readonly coveredTo: Civil = { y: SELECTABLE_TO.y + MARGIN, m: 12, d: 31 };
  private readonly red = new Map<string, string>();

  constructor() {
    for (let year = this.coveredFrom.y; year <= this.coveredTo.y; year += 1) {
      for (const [iso, name] of holidays(year)) this.red.set(iso, name);
    }
  }

  isPublicHoliday(d: Civil): boolean {
    return this.red.has(isoDate(d));
  }

  holidayName(d: Civil): string | null {
    return this.red.get(isoDate(d)) ?? null;
  }

  holidayNameEn(d: Civil): string | null {
    const sv = this.holidayName(d);
    return sv ? NAME_EN[sv] ?? null : null;
  }

  private isRed(d: Civil): boolean {
    return this.red.has(isoDate(d)) || weekday(d) === 6;   // праздник или воскресенье
  }

  covers(d: Civil): boolean {
    return compare(d, this.coveredFrom) >= 0 && compare(d, this.coveredTo) <= 0;
  }

  /** 1) красный: праздник или воскресенье. 2) канун: не красный, а следующий
   *  день красный. 3) будни: всё остальное. */
  dayClass(d: Civil): string {
    if (!this.covers(d)) return UNKNOWN;
    if (this.isRed(d)) return RED;
    if (this.isRed(addDays(d, 1))) return EVE;
    return WEEKDAY;
  }

  /** Рабочий день — только `weekday`. Суббота, воскресенье, праздник и канун
   *  счётчик 24 часов не тратят. */
  isWorkingDay(d: Civil): boolean {
    return this.dayClass(d) === WEEKDAY;
  }

  /** Первый рабочий день строго после `d`. `null`, если вышли за календарь. */
  nextWorkingDay(d: Civil): Civil | null {
    let cur = addDays(d, 1);
    while (this.covers(cur)) {
      if (this.isWorkingDay(cur)) return cur;
      cur = addDays(cur, 1);
    }
    return null;
  }
}

export { isoDate, parseDate, days };

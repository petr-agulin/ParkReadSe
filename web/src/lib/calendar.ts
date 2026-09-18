// The classes of day by the Swedish calendar. A port of `parkread/calendar_se.py`,
// word for word.
//
// The holidays are set by `Lag (1989:253) om allmänna helgdagar`: § 1 lists the red
// days, § 2 names their dates. There are three rules — a fixed date, an offset from
// Easter, and "the Saturday falling on such-and-such dates" — and all three are
// computable, so no list is kept on disk (decision 108).
//
// The order of the checks matters, and red beats the brackets by definition: an eve
// is a *vardag före sön- och helgdag*, that is, a WORKING day before a red one. A
// holiday is not a working day and cannot be an eve.
//
// The product's window is 2026-2030 (decision 115): the set of holidays changes with
// time (before 2005 the red day was `annandag pingst` rather than `nationaldagen`),
// and "any year at all" would quietly lie.

import { addDays, compare, days, isoDate, parseDate, weekday, type Civil } from "./civil";

export const WEEKDAY = "weekday";   // vardag
export const EVE = "eve";           // vardag före sön- och helgdag
export const RED = "red";           // sön- och helgdag
export const UNKNOWN = "unknown";   // a date outside the computed period

export const SELECTABLE_FROM: Civil = { y: 2026, m: 1, d: 1 };
export const SELECTABLE_TO: Civil = { y: 2030, m: 12, d: 31 };

// Counted a year wider on each side: the scale is built eight days ahead, and a
// reading on 28 December 2030 asks about January 2031.
export const MARGIN = 1;

/** Easter Sunday by the Gregorian computus (Meeus/Jones/Butcher).
 *
 *  The law's "full moon" is the ecclesiastical one — from a table, not observed: the
 *  church counts by the epact and the golden number. This function reproduces that
 *  same table. */
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

/** The Saturday in the seven-day window beginning on the given date: that is how the
 *  law sets `midsommardagen` (20-26 June) and `alla helgons dag` (31 October -
 *  6 November). */
function saturdayBetween(year: number, month: number, first: number): Civil {
  const start = { y: year, m: month, d: first };
  return addDays(start, ((5 - weekday(start)) % 7 + 7) % 7);
}

/** The thirteen red days of the year. Sundays are not among them — they are red in
 *  their own right, and by that same § 1. */
export function holidays(year: number): Map<string, string> {
  const e = easter(year);
  const pairs: [Civil, string][] = [
    [{ y: year, m: 1, d: 1 }, "Nyårsdagen"],
    [{ y: year, m: 1, d: 6 }, "Trettondedag jul"],
    [addDays(e, -2), "Långfredagen"],
    [e, "Påskdagen"],
    [addDays(e, 1), "Annandag påsk"],
    [{ y: year, m: 5, d: 1 }, "Första maj"],
    // "Sjätte torsdagen efter påskdagen" — +39 days; "sjunde söndagen" — +49.
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

// The English names are for the screen; the Swedish stays beside them, because the
// Swedish is what stands in the calendar a person will open to check.
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

/** Whether this day may be asked about. A boundary of the product, not of the
 *  calendar. */
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
    return this.red.has(isoDate(d)) || weekday(d) === 6;   // a holiday, or a Sunday
  }

  covers(d: Civil): boolean {
    return compare(d, this.coveredFrom) >= 0 && compare(d, this.coveredTo) <= 0;
  }

  /** 1) red: a holiday or a Sunday. 2) an eve: not red itself, while the next day is
   *  red. 3) a weekday: everything else. */
  dayClass(d: Civil): string {
    if (!this.covers(d)) return UNKNOWN;
    if (this.isRed(d)) return RED;
    if (this.isRed(addDays(d, 1))) return EVE;
    return WEEKDAY;
  }

  /** A working day is `weekday` and nothing else. Saturday, Sunday, a holiday and an
   *  eve do not spend the 24-hour counter. */
  isWorkingDay(d: Civil): boolean {
    return this.dayClass(d) === WEEKDAY;
  }

  /** The first working day strictly after `d`. `null` if we have run off the
   *  calendar. */
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

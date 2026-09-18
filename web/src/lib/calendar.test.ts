// The calendar, computed in code. Carried over from `tests/test_calendar.py` in full
// (step 8): now that Python's output is gone, these checks are the only ones.
//
// The central one is "every day of 2026 keeps its class": across 2026 the computed
// calendar must agree, day for day, with the file it replaced. That file is gone,
// and the reference it is checked against had to stay - which is why thirteen dates
// of 2026 are written into the test itself.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar, EVE, RED, SELECTABLE_FROM, SELECTABLE_TO, UNKNOWN, WEEKDAY,
         easter, holidays, selectable } from "./calendar";
import { addDays, days, isoDate, parseDate, weekday, type Civil } from "./civil";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();
const cls = (iso: string) => cal.dayClass(parseDate(iso));

// Published dates of Easter: the table is independent of the formula, and the two
// could not have agreed across twenty-one years by chance.
const EASTER: Record<number, string> = {
  2020: "2020-04-12", 2021: "2021-04-04", 2022: "2022-04-17", 2023: "2023-04-09",
  2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28",
  2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13",
  2032: "2032-03-28", 2033: "2033-04-17", 2034: "2034-04-09", 2035: "2035-03-25",
  2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-10",
  2040: "2040-04-01",
};

// The thirteen red days of 2026, verbatim from `data/holidays_se.json`, which the
// computed calendar replaced.
const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "Nyårsdagen",
  "2026-01-06": "Trettondedag jul",
  "2026-04-03": "Långfredagen",
  "2026-04-05": "Påskdagen",
  "2026-04-06": "Annandag påsk",
  "2026-05-01": "Första maj",
  "2026-05-14": "Kristi himmelsfärdsdag",
  "2026-05-24": "Pingstdagen",
  "2026-06-06": "Sveriges nationaldag",
  "2026-06-20": "Midsommardagen",
  "2026-10-31": "Alla helgons dag",
  "2026-12-25": "Juldagen",
  "2026-12-26": "Annandag jul",
};

function* daysOf(year: number): Generator<Civil> {
  for (let d: Civil = { y: year, m: 1, d: 1 }; d.y === year; d = addDays(d, 1)) yield d;
}

/** The holidays of a year by name - the law names them in words, not in numbers. */
const byName = (year: number) =>
  new Map([...holidays(year)].map(([iso, name]) => [name, parseDate(iso)] as const));

const between = (a: Civil, b: Civil) => days(a) - days(b);

describe("Easter and the offsets from it", () => {
  // py: test_calendar::test_easter_matches_the_published_dates
  it("Easter agrees with the published dates", () => {
    for (const [year, iso] of Object.entries(EASTER)) {
      const day = easter(Number(year));
      expect(isoDate(day), year).toBe(iso);
      expect(weekday(day)).toBe(6);                    // always a Sunday
    }
  });

  // py: test_calendar::test_the_offsets_are_the_ones_the_law_names
  it("the offsets are the ones the law names in words, not the numbers 39 and 49", () => {
    // "fredagen närmast före påskdagen", "sjätte torsdagen efter påskdagen",
    // "sjunde söndagen": if the weekday comes out wrong, an offset was mistranscribed.
    for (let year = 2026; year <= 2030; year += 1) {
      const h = byName(year);
      const e = easter(year);
      expect(between(h.get("Långfredagen")!, e), String(year)).toBe(-2);
      expect(weekday(h.get("Långfredagen")!)).toBe(4);                      // Friday
      expect(between(h.get("Annandag påsk")!, e)).toBe(1);
      expect(weekday(h.get("Kristi himmelsfärdsdag")!)).toBe(3);            // Thursday
      expect(Math.floor(between(h.get("Kristi himmelsfärdsdag")!, e) / 7)).toBe(5);
      expect(weekday(h.get("Pingstdagen")!)).toBe(6);                       // Sunday
      expect(Math.floor(between(h.get("Pingstdagen")!, e) / 7)).toBe(7);
    }
  });

  // py: test_calendar::test_the_saturdays_fall_inside_the_windows_the_law_gives
  it("the Saturday holidays fall inside the windows the law gives", () => {
    for (let year = 2026; year <= 2030; year += 1) {
      const h = byName(year);
      const midsummer = h.get("Midsommardagen")!;
      const saints = h.get("Alla helgons dag")!;
      expect(weekday(midsummer)).toBe(5);
      expect(midsummer.m).toBe(6);
      expect(midsummer.d >= 20 && midsummer.d <= 26, String(year)).toBe(true);
      expect(weekday(saints)).toBe(5);
      const md = saints.m * 100 + saints.d;
      expect(md >= 1031 && md <= 1106, String(year)).toBe(true);
    }
  });

  // py: test_calendar::test_thirteen_red_days_every_year
  it("thirteen red days a year, the first of May among them", () => {
    // Twelve are listed with their dates in § 2; the thirteenth is `första maj`:
    // § 1 names it, and its date is in the name itself.
    for (let year = 2026; year <= 2030; year += 1) {
      expect(holidays(year).size, String(year)).toBe(13);
      expect(holidays(year).has(`${year}-05-01`)).toBe(true);
    }
  });
});

describe("agreement with the file the calendar replaced", () => {
  // py: test_calendar::test_2026_matches_the_file_it_replaced
  it("the holidays of 2026 are the same thirteen", () => {
    expect(Object.fromEntries(holidays(2026))).toEqual(HOLIDAYS_2026);
  });

  // py: test_calendar::test_every_day_of_2026_keeps_its_class
  it("every day of 2026 keeps its class", () => {
    // 1 January 2027 belongs to the reference for the same reason it sat as a
    // separate entry in the old file: without it there is nothing by which to call
    // 31 December an eve.
    const expected = new Set([...Object.keys(HOLIDAYS_2026), "2027-01-01"]);
    const isRed = (d: Civil) => expected.has(isoDate(d)) || weekday(d) === 6;
    for (const d of daysOf(2026)) {
      const want = isRed(d) ? RED : isRed(addDays(d, 1)) ? EVE : WEEKDAY;
      expect(cal.dayClass(d), isoDate(d)).toBe(want);
    }
  });

  // py: test_calendar::test_the_2026_counts_are_unchanged
  it("the counts for 2026 are unchanged: 63 red, 57 eves, 245 weekdays", () => {
    const counts: Record<string, number> = {};
    for (const d of daysOf(2026)) counts[cal.dayClass(d)] = (counts[cal.dayClass(d)] ?? 0) + 1;
    expect(counts).toEqual({ [RED]: 63, [EVE]: 57, [WEEKDAY]: 245 });
    // A Saturday is a vardag, but Sunday follows it, so it is always an eve;
    // a Sunday is always red.
    for (const d of daysOf(2026)) {
      if (weekday(d) === 5) expect(cal.dayClass(d), isoDate(d)).not.toBe(WEEKDAY);
      if (weekday(d) === 6) expect(cal.dayClass(d), isoDate(d)).toBe(RED);
    }
  });
});

describe("the order of the rules", () => {
  // py: test_calendar::test_a_red_day_is_never_an_eve
  it("a red day never takes brackets, not even before another red one", () => {
    // Six days of 2026 that a naive order of checks gets wrong.
    for (const iso of ["2026-04-05", "2026-06-06", "2026-06-20",
                       "2026-10-31", "2026-12-25", "2026-12-26"]) {
      expect(cls(iso), iso).toBe(RED);
    }
  });

  // py: test_calendar::test_the_eves_on_weekdays_are_the_nine_known_dates
  it("the Monday-to-Friday eves of 2026 are the same nine", () => {
    const found: string[] = [];
    for (const d of daysOf(2026)) {
      if (weekday(d) < 5 && cal.dayClass(d) === EVE) found.push(isoDate(d).slice(5));
    }
    expect(found).toEqual(["01-05", "04-02", "04-30", "05-13", "06-05", "06-19",
                           "10-30", "12-24", "12-31"]);
  });

  // py: test_calendar::test_christmas_eve_midsummer_eve_and_new_years_eve_stay_eves
  it("Christmas Eve, Midsummer Eve and New Year's Eve stay eves", () => {
    // They are not official holidays, and must not be added to the list.
    for (let year = 2026; year <= 2030; year += 1) {
      const midsummer = byName(year).get("Midsommardagen")!;
      const eves: Civil[] = [{ y: year, m: 12, d: 24 }, { y: year, m: 12, d: 31 },
                             addDays(midsummer, -1)];
      for (const d of eves) {
        expect(cal.isPublicHoliday(d), isoDate(d)).toBe(false);
        // Such a day can still be red - as a Sunday rather than as a holiday:
        // 24 December 2028 falls on a Sunday.
        expect(cal.dayClass(d), isoDate(d)).toBe(weekday(d) === 6 ? RED : EVE);
      }
    }
  });

  it("a Saturday is a vardag and therefore an eve; a Sunday is always red", () => {
    expect(cls("2026-09-12")).toBe(EVE);               // an ordinary Saturday
    expect(cls("2026-09-13")).toBe(RED);               // an ordinary Sunday
    expect(cls("2026-09-09")).toBe(WEEKDAY);
  });
});

describe("the product's window", () => {
  // py: test_calendar::test_the_window_is_2026_to_2030
  it("the window runs from 2026 to 2030 inclusive", () => {
    expect(isoDate(SELECTABLE_FROM)).toBe("2026-01-01");
    expect(isoDate(SELECTABLE_TO)).toBe("2030-12-31");
    expect(selectable(parseDate("2026-01-01"))).toBe(true);
    expect(selectable(parseDate("2030-12-31"))).toBe(true);
    expect(selectable(parseDate("2025-12-31"))).toBe(false);
    expect(selectable(parseDate("2031-01-01"))).toBe(false);
  });

  // py: test_calendar::test_the_horizon_from_the_end_of_the_window_still_has_a_calendar
  it("the horizon from the end of the window still finds a calendar", () => {
    // The timeline runs eight days ahead, so a reading on 28 December 2030 asks
    // about January 2031. That is exactly why a year wider is computed.
    for (let n = 0; n <= 8; n += 1) {
      const d = addDays(parseDate("2030-12-28"), n);
      expect(cal.dayClass(d), isoDate(d)).not.toBe(UNKNOWN);
    }
    // Computing wider does not mean answering wider: such a moment cannot be chosen.
    expect(selectable(parseDate("2031-01-05"))).toBe(false);
  });

  // py: test_calendar::test_outside_the_computed_range_the_class_is_unknown
  it("outside the computed range the class of the day is unknown", () => {
    // The set of holidays changes over time - before 2005 `annandag pingst` was red
    // instead of `nationaldagen` - and silence here is more honest than computation.
    expect(cls("2004-06-06")).toBe(UNKNOWN);
    expect(cls("2040-01-01")).toBe(UNKNOWN);
  });

  // py: test_calendar::test_the_picker_on_screen_carries_the_same_window
  it("the moment picker on screen carries the same window", () => {
    // The window is written down twice - in the calendar and in the field. A
    // disagreement is caught here rather than by the person, whose field would let
    // them choose a day outside it.
    const bounds = readFileSync(`${ROOT}web/src/lib/home.ts`, "utf-8");
    expect(bounds).toContain(`MOMENT_FROM = "${isoDate(SELECTABLE_FROM)}T00:00"`);
    expect(bounds).toContain(`MOMENT_TO = "${isoDate(SELECTABLE_TO)}T23:59"`);

    // Declaring the edges is not enough - the field has to wear them. The bounds and
    // the field itself ended up in different files (stage 4 of step 11), and a check
    // of the declaration alone would stay green even with neither bound on the field.
    const home = readFileSync(`${ROOT}web/src/components/Home.tsx`, "utf-8");
    expect(home).toContain("min={MOMENT_FROM}");
    expect(home).toContain("max={MOMENT_TO}");
  });
});

describe("portability", () => {
  // py: test_calendar::test_the_calendar_needs_no_file_at_all
  it("the calendar needs no file at all", () => {
    const source = readFileSync(`${ROOT}web/src/lib/calendar.ts`, "utf-8");
    for (const forbidden of ["node:fs", "readFile", "fetch(", ".json\""]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(existsSync(`${ROOT}data/holidays_se.json`)).toBe(false);
    expect(cls("2026-12-31")).toBe(EVE);
  });
});

describe("beyond what Python had", () => {
  it("holiday names are Swedish, with the English alongside", () => {
    const saints = parseDate("2026-10-31");
    expect(cal.holidayName(saints)).toBe("Alla helgons dag");
    expect(cal.holidayNameEn(saints)).toBe("All Saints' Day");
    expect(cal.holidayName(parseDate("2026-09-13"))).toBeNull();
  });

  it("a working day means weekdays only, and the next one is sought past the weekend", () => {
    expect(cal.isWorkingDay(parseDate("2026-09-12"))).toBe(false);
    const next = cal.nextWorkingDay(parseDate("2026-09-11"));
    expect(next && isoDate(next)).toBe("2026-09-14");
  });
});

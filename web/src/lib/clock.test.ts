// The change of the clocks: a length is counted in real time rather than off the
// dial. Carried over from `tests/test_clock.py` in full (step 8).
//
// Everything else in the product is counted off the dial, and rightly so: `9-12` on a
// plate is nine o'clock in March and in October alike. But the night of a change
// lasts 23 or 25 hours, and three places are obliged to know it - a limit from a
// plate, the 24-hour rule, and the length of a segment on the timeline.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { addDays, isoNaive, minutes, parseNaive, weekday, type Naive } from "./civil";
import { SUMMER, WINTER, add, autumnBack, normalise, offset, realMinutes,
         springForward, switchBetween } from "./clock";
import { evaluateParkingRules, horizonEnd, twentyFourHourExpiry } from "./engine";
import { CLOCK_CHANGE_TEXT, regimeView } from "./present";
import type { Panel, Parsed, SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CAL = new Calendar();
const at = (iso: string): Naive => parseNaive(iso);

function sign(...panels: Panel[]): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panel_count: panels.length, boundaries: { certain: true }, panels,
  };
}

function plate(parsed: Parsed, lines = ["a plate"]): Panel {
  return { index: 1, kind: "sign_plate", lines, background_color: "white",
           legibility: { readable: true }, parsed };
}

/** The window of a sign with a fee - as the screen will see it. */
function regimeAt(iso: string) {
  const moment = at(iso);
  const r = evaluateParkingRules(sign(plate({ fee: true })), moment, CAL).regimes[0];
  return regimeView(r, horizonEnd(moment), CAL);
}

describe("the rule itself", () => {
  // py: test_clock::test_the_switches_stand_where_the_eu_rule_puts_them
  it("puts the changes where the European rule puts them", () => {
    // The last Sunday of March and of October, at 01:00 UTC. On Swedish clocks that
    // is always 02:00 in spring and 03:00 in autumn; only the date moves.
    expect(isoNaive(springForward(2026))).toBe("2026-03-29T02:00");
    expect(isoNaive(autumnBack(2026))).toBe("2026-10-25T03:00");
    expect(isoNaive(springForward(2027))).toBe("2027-03-28T02:00");
    expect(isoNaive(autumnBack(2027))).toBe("2027-10-31T03:00");
    for (let year = 2026; year <= 2030; year += 1) {
      expect(weekday(springForward(year)), String(year)).toBe(6);
      expect(weekday(autumnBack(year))).toBe(6);
      expect(springForward(year).m).toBe(3);
      expect(autumnBack(year).m).toBe(10);
      // The last Sunday: a week later it is already the next month.
      expect(addDays(springForward(year), 7).m).toBe(4);
      expect(addDays(autumnBack(year), 7).m).toBe(11);
    }
  });

  // py: test_clock::test_the_offset_is_plus_one_in_winter_and_plus_two_in_summer
  it("keeps the offset at one in winter and two in summer, with exact edges", () => {
    expect(offset(at("2026-01-15T12:00"))).toBe(WINTER);
    expect(offset(at("2026-07-15T12:00"))).toBe(SUMMER);
    expect(offset(at("2026-03-29T01:59"))).toBe(WINTER);
    expect(offset(at("2026-03-29T03:00"))).toBe(SUMMER);
    expect(offset(at("2026-10-25T02:59"))).toBe(SUMMER);   // the first occurrence
    expect(offset(at("2026-10-25T03:00"))).toBe(WINTER);
  });

  // py: test_clock::test_the_hour_that_does_not_exist_and_the_hour_that_happens_twice
  it("moves the hour that never was forward, and takes the repeated one first", () => {
    expect(isoNaive(normalise(at("2027-03-28T02:30")))).toBe("2027-03-28T03:30");
    expect(isoNaive(normalise(at("2027-03-28T01:30")))).toBe("2027-03-28T01:30");
    // In autumn the first occurrence is taken - the one a person sees on the clock.
    expect(offset(at("2026-10-25T02:30"))).toBe(SUMMER);
  });

  // py: test_clock::test_a_night_of_a_switch_is_23_or_25_hours_long
  it("makes the night of a change 23 or 25 hours long", () => {
    expect(realMinutes(at("2026-10-25T00:00"), at("2026-10-26T00:00"))).toBe(25 * 60);
    expect(realMinutes(at("2027-03-28T00:00"), at("2027-03-29T00:00"))).toBe(23 * 60);
    expect(realMinutes(at("2026-09-09T00:00"), at("2026-09-10T00:00"))).toBe(24 * 60);
  });

  // py: test_clock::test_adding_real_time_lands_on_the_right_clock_face
  it("counts two hours as two hours lived, not two marks on a dial", () => {
    expect(isoNaive(add(at("2026-10-25T02:30"), 120))).toBe("2026-10-25T03:30");
    expect(isoNaive(add(at("2027-03-28T01:30"), 120))).toBe("2027-03-28T04:30");
    expect(isoNaive(add(at("2026-09-09T10:00"), 120))).toBe("2026-09-09T12:00");
  });

  it("finds a crossing of the change rather than inventing one", () => {
    expect(switchBetween(at("2026-10-24T20:00"), at("2026-10-26T00:00"))).toBe("back");
    expect(switchBetween(at("2026-10-25T12:00"), at("2026-10-26T00:00"))).toBeNull();
    expect(switchBetween(at("2027-03-27T20:00"), at("2027-03-29T00:00"))).toBe("forward");
    expect(switchBetween(at("2026-09-09T00:00"), at("2026-09-17T00:00"))).toBeNull();
  });

  // py: test_clock::test_the_module_carries_no_time_zone_database
  it("carries no time-zone database: not in the clock, nor in the dates beneath it", () => {
    // In a browser the device's time belongs to whoever owns the device, and the
    // counting has to be done on Swedish clocks. Any reliance on the platform's own
    // date machinery would bring the device's zone in with it.
    for (const file of ["clock.ts", "civil.ts"]) {
      const source = readFileSync(`${ROOT}web/src/lib/${file}`, "utf-8");
      for (const forbidden of ["new Date", "Intl.", "timeZone", "toLocale",
                               "getTimezoneOffset"]) {
        expect(source, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("the three places where it bites", () => {
  // py: test_clock::test_a_plate_limit_across_the_switch
  it("a `2 tim` limit begun on the night of a change", () => {
    const s = sign(plate({ duration_limit: { amount: 2, unit: "hours" } }, ["2 tim"]));
    let r = evaluateParkingRules(s, at("2026-10-25T02:30"), CAL).regimes[0];
    expect(r.durationExpiresAt && isoNaive(r.durationExpiresAt)).toBe("2026-10-25T03:30");
    expect(r.durationSource).toBe("plate");

    r = evaluateParkingRules(s, at("2027-03-28T01:30"), CAL).regimes[0];
    expect(r.durationExpiresAt && isoNaive(r.durationExpiresAt)).toBe("2027-03-28T04:30");
  });

  // py: test_clock::test_the_24_hour_rule_across_the_switch
  it("makes the day of the 24-hour rule a real one", () => {
    // Wednesday 21 October 2026: the day runs to Thursday, with no change in it.
    const plain = twentyFourHourExpiry(at("2026-10-21T20:00"), CAL);
    expect(plain && isoNaive(plain)).toBe("2026-10-22T20:00");
    // And a day from Saturday 20:00 covers the night of the change and ends an hour
    // earlier.
    expect(isoNaive(add(at("2026-10-24T20:00"), 24 * 60))).toBe("2026-10-25T19:00");
  });

  // py: test_clock::test_the_length_of_a_segment_counts_real_hours
  it("counts the length of a segment on the timeline in real hours", () => {
    // A segment used to report the difference on the dial - and "24 h" stood where a
    // car will stand for twenty-five.
    const view = regimeAt("2026-10-24T20:00");
    const first = parseNaive(view.periods[0].start);
    const last = parseNaive(view.periods.at(-1).end);
    expect(switchBetween(first, last)).toBe("back");

    const shown = view.periods.reduce((sum: number, p: { minutes: number }) => sum + p.minutes, 0);
    expect(shown).toBe(realMinutes(first, last));
    expect(shown).toBe(minutes(last) - minutes(first) + 60);
  });
});

describe("the note on screen", () => {
  // py: test_clock::test_the_note_appears_when_the_shown_stretch_crosses_the_switch
  it("appears when the stretch shown crosses the change", () => {
    let view = regimeAt("2026-10-24T20:00");
    expect(view.clock_change_text).toBe(CLOCK_CHANGE_TEXT.back);
    expect(view.clock_change_text).toContain("an hour longer");

    view = regimeAt("2027-03-27T20:00");
    expect(view.clock_change_text).toBe(CLOCK_CHANGE_TEXT.forward);
    expect(view.clock_change_text).toContain("an hour shorter");
  });

  // py: test_clock::test_there_is_no_note_when_nothing_crosses_the_switch
  it("is absent when nothing crosses the change", () => {
    // Including the daytime of that same Sunday, once the change is behind us.
    expect(regimeAt("2026-10-25T12:00").clock_change_text).toBeNull();
    expect(regimeAt("2026-09-09T12:00").clock_change_text).toBeNull();
  });

  // py: test_clock::test_the_note_says_no_date_and_names_the_fixed_hours
  it("carries no date in it, while naming the hours", () => {
    // The change may fall on the coming night or on a Sunday within the horizon. The
    // hours, by contrast, are fixed.
    for (const text of Object.values(CLOCK_CHANGE_TEXT)) {
      expect(text).toContain("02:00");
      expect(text).toContain("03:00");
      expect(text).not.toContain("October");
      expect(text).not.toContain("March");
      expect(text).toContain("already allow for it");
    }
  });
});

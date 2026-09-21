// The rules engine. Carried over from `tests/test_engine.py` IN FULL (step 8).
//
// These tests are permanent: each closes a mistake already made while reading a
// sign by hand or found while probing the model, and behind many of them stands a
// decision of the developer. Only part of them moved here at first (16 of 63): the
// rest were held by the comparison with Python, and that comparison left with it.

import { describe, expect, it } from "vitest";

import { Calendar, EVE, RED, UNKNOWN, WEEKDAY } from "./calendar";
import { addDays, isoNaive, parseDate, parseNaive, weekday,
         type Civil, type Naive } from "./civil";
import { ALLOWED, FEE_PERIOD_ELSEWHERE, NOT_STATED, PROHIBITED, UNCERTAIN,
         evaluateParkingRules, horizonEnd, isoWeek, twentyFourHourExpiry,
         windowApplies, type Regime } from "./engine";
import { NO_WINDOW_NOTHING_STATED, regimeView, visible } from "./present";
import { recognise } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

const CAL = new Calendar();
const at = (iso: string): Naive => parseNaive(iso);
const iso = (t: Naive | null) => (t ? isoNaive(t) : null);

// --- building signs ---------------------------------------------------------

function sign(panels: Panel[] = [], main = "parking", form = "regular"): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: main as SignDoc["main_sign"]["type"], background_color: "blue",
                 form, legibility: { readable: true } },
    panels: panels.map((p, i) => ({ ...p, index: i + 1 })),
    panel_count: panels.length,
    boundaries: { certain: true },
  };
}

function plate(parsed: Parsed, lines: string[] = [], kind = "sign_plate",
               color = "blue"): Panel {
  return { kind: kind as Panel["kind"], lines, background_color: color,
           legibility: { readable: true }, parsed };
}

function win(from: string, to: string, dayClass = "unspecified", named?: string): TimeWindow {
  const w: TimeWindow = { from, to, day_class: dayClass as TimeWindow["day_class"] };
  if (named) w.named_weekday = named as TimeWindow["named_weekday"];
  return w;
}

/** The state and the conditions of a regime at a given moment. */
function state(r: Regime, moment: string): [string | null, string[]] {
  for (const p of r.periods) {
    if (isoNaive(p.start) <= moment && moment < isoNaive(p.end)) return [p.state, p.conditions];
  }
  return [null, []];
}

const evaluate = (doc: SignDoc, moment: string) => evaluateParkingRules(doc, at(moment), CAL);
const first = (doc: SignDoc, moment: string) => evaluate(doc, moment).regimes[0];
const expiry = (moment: string) => iso(twentyFourHourExpiry(at(moment), CAL));
/** What the screen will say instead of a timeline, if it says anything. */
const noWindow = (r: Regime, moment: string) =>
  regimeView(r, horizonEnd(at(moment)), CAL).no_window_text;

const TWO_TIM: Parsed = { duration_limit: { amount: 2, unit: "hours" } };
const AVGIFT_8_18: Parsed = { fee: true, time_windows: [win("08:00", "18:00", WEEKDAY)] };

/** A zonal prohibition: `Onsdag 9-12`, even weeks, 1 October to 30 April. */
function zonal(): TimeWindow {
  const w = win("09:00", "12:00", "named_weekday", "wednesday");
  w.week_parity = "even";
  w.dates = { mode: "only", ranges: [{ from: "10-01", to: "04-30" }] };
  return w;
}

describe("the calendar inside the engine", () => {
  it("the eves of 2026: 57 of them, 48 being Saturdays", () => {
    const eves: Civil[] = [];
    for (let d: Civil = { y: 2026, m: 1, d: 1 }; d.y === 2026; d = addDays(d, 1)) {
      if (CAL.dayClass(d) === EVE) eves.push(d);
    }
    expect(eves).toHaveLength(57);
    expect(eves.filter((d) => weekday(d) === 5)).toHaveLength(48);
  });

  it("a holiday on a Saturday stays red: an eve is a WORKING day before a red one", () => {
    expect(CAL.dayClass(parseDate("2026-06-06"))).toBe(RED);     // Sveriges nationaldag
    expect(CAL.dayClass(parseDate("2026-12-25"))).toBe(RED);     // before the second day
    expect(CAL.dayClass(parseDate("2026-01-10"))).toBe(EVE);     // an ordinary Saturday
    expect(CAL.dayClass(parseDate("2026-04-30"))).toBe(EVE);     // a weekday eve
    expect(CAL.dayClass(parseDate("2026-01-09"))).toBe(WEEKDAY); // Friday
  });

  it("outside the window, with room to spare: unknown rather than invented", () => {
    expect(CAL.dayClass(parseDate("2035-03-01"))).toBe(UNKNOWN);
    expect(CAL.dayClass(parseDate("2019-03-01"))).toBe(UNKNOWN);
  });
});

describe("the 24-hour rule", () => {
  it("a weekend cuts the day short, and it starts afresh on Monday", () => {
    // The rule is contested; the developer checked how widely each reading is held
    // and took the prevailing one - guaranteed continuity (decision 82).
    expect(expiry("2026-03-02T13:00")).toBe("2026-03-03T13:00");
    expect(expiry("2026-03-05T13:00")).toBe("2026-03-06T13:00");
    expect(expiry("2026-03-06T13:00")).toBe("2026-03-10T00:00");
    expect(expiry("2026-03-06T23:30")).toBe("2026-03-10T00:00");
  });

  it("any start during the weekend gives one answer - until Tuesday 00:00", () => {
    for (const start of ["2026-03-07T00:01", "2026-03-07T08:00", "2026-03-08T23:59"]) {
      expect(expiry(start), start).toBe("2026-03-10T00:00");
    }
  });

  it("Friday 13:00 is not cut short by Saturday: the day comes whole, later", () => {
    expect(expiry("2026-03-06T13:00")).not.toBe("2026-03-07T13:00");
    expect(expiry("2026-03-06T13:00")).toBe("2026-03-10T00:00");
  });

  it("a duration plate overrides the default rather than adding to it", () => {
    const bare = first(sign(), "2026-03-02T13:00");
    const limited = first(sign([plate({ duration_limit: { amount: 30, unit: "minutes" } },
                                      ["30 min"])]), "2026-03-02T13:00");
    expect(bare.durationSource).toBe("24h_default");
    expect(limited.durationSource).toBe("plate");
    expect(iso(limited.durationExpiresAt)).toBe("2026-03-02T13:30");
  });
});

describe("the official pair: the same words, grouped differently", () => {
  it("TWO plates: two hours always, a fee only from 8 to 18", () => {
    const r = first(sign([plate(TWO_TIM, ["2 tim"]), plate(AVGIFT_8_18, ["Avgift", "8-18"])]),
                    "2026-03-02T20:00");
    expect(r.durationSource).toBe("plate");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
  });

  it("ONE plate: both the limit and the fee live inside the window", () => {
    const joint = sign([plate({ ...TWO_TIM, ...AVGIFT_8_18 }, ["2 tim", "Avgift", "8-18"])]);
    const r = first(joint, "2026-03-02T20:00");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
    // In the evening, outside the window, the limit does not run - there is nothing
    // to count from. But "a whole day" is no answer either: at 08:00 the window
    // opens, and two hours start from that minute. This test once claimed
    // `24h_default` and pinned the mistake from photograph `005`.
    expect(iso(r.durationExpiresAt)).not.toBe("2026-03-02T22:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T10:00");
    expect(r.durationSource).toBe("plate");
    // Inside the window the limit runs from the moment of parking.
    const inside = first(joint, "2026-03-03T10:00");
    expect(inside.durationSource).toBe("plate");
    expect(iso(inside.durationExpiresAt)).toBe("2026-03-03T12:00");
  });

  it("a limit that starts later ends the stay when its window opens", () => {
    // Photograph `005`: Friday 22:10, and the product answered "a day, until Tuesday".
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "18:00", WEEKDAY),
                                                             win("08:00", "15:00", EVE)] },
                                ["2 tim", "8-18", "(8-15)"])]), "2026-09-04T22:10");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-05T10:00");
    expect(r.durationSource).toBe("plate");
  });

  it("a limit wider than its own window never bites", () => {
    // `2 tim` inside an `08-09` window: by 09:00 the restriction is already over.
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "09:00", WEEKDAY)] },
                                ["2 tim", "8-9"])]), "2026-03-02T20:00");
    expect(r.durationSource).toBe("24h_default");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T20:00");
  });

  it("the result of the stack matches the result of none of its plates", () => {
    const now = "2026-03-03T10:00";
    const full = first(sign([plate(TWO_TIM, ["2 tim"]), plate(AVGIFT_8_18, ["Avgift", "8-18"])]), now);
    const a = first(sign([plate(TWO_TIM, ["2 tim"])]), now);
    const b = first(sign([plate(AVGIFT_8_18, ["Avgift", "8-18"])]), now);
    expect(state(full, now)).not.toEqual(state(a, now));   // the first states no fee
    expect(full.durationSource).not.toBe(b.durationSource); // the second states no limit
  });
});

describe("days left unstated, and `alla dagar`", () => {
  it("days left unstated means weekdays, not every day", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                ["Avgift 8-18"])]), "2026-03-03T10:00");
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T10:00")).toEqual([ALLOWED, []]);   // Saturday
  });

  it("`alla dagar` covers the weekend", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00", "all_days")] },
                                ["Avgift 8-18", "alla dagar"])]), "2026-03-03T10:00");
    expect(state(r, "2026-03-07T10:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("prohibition wins, and windows under a prohibiting sign", () => {
  it("\"free for an hour, but you may not stand here\" resolves to the prohibition", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
    expect(state(r, "2026-03-05T08:00")[0]).toBe(ALLOWED);
  });

  it("a window under a prohibiting sign draws the bounds of the prohibition", () => {
    // A zonal `E20`: "No parking" on a September Wednesday of an odd week, when not
    // one condition of the plate is met (decision 113).
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    const stateFrom = (moment: string, from: string) => state(first(s, from), moment)[0];
    expect(stateFrom("2026-09-09T12:33", "2026-09-09T12:33")).toBe(NOT_STATED);
    expect(stateFrom("2026-10-14T10:00", "2026-10-13T12:00")).toBe(PROHIBITED);  // even week
    expect(stateFrom("2026-10-14T13:00", "2026-10-13T12:00")).toBe(NOT_STATED);  // after 12:00
    expect(stateFrom("2026-10-15T10:00", "2026-10-13T12:00")).toBe(NOT_STATED);  // Thursday
    expect(stateFrom("2026-10-21T10:00", "2026-10-20T12:00")).toBe(NOT_STATED);  // odd week
  });

  it("a sign with nothing to say shows no window at all", () => {
    const moment = "2026-09-09T16:27";
    const silent = first(sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12"])],
                              "prohibition_parking"), moment);
    expect(new Set(silent.periods.map((p) => p.state))).toEqual(new Set([NOT_STATED]));
    expect(noWindow(silent, moment)).toBe(NO_WINDOW_NOTHING_STATED);
    // And where the sign does have something to say, the timeline stays.
    expect(noWindow(first(sign([plate({ fee: true }, ["Avgift"])]), moment), moment)).toBeNull();
  });

  it("the timeline shows only what the sign states about the chosen moment", () => {
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    // Monday: the sign is silent - no timeline, just a phrase.
    const quiet = first(s, "2026-10-12T10:00");
    expect(visible(quiet)).toEqual([]);
    expect(noWindow(quiet, "2026-10-12T10:00")).toBe(NO_WINDOW_NOTHING_STATED);
    // Wednesday inside the window: the prohibition only, and nothing after it.
    const ban = first(s, "2026-10-14T10:00");
    const shown = visible(ban);
    expect(shown.map((p) => p.state)).toEqual([PROHIBITED]);
    expect(isoNaive(shown[0].end)).toBe("2026-10-14T12:00");
    expect(noWindow(ban, "2026-10-14T10:00")).toBeNull();
    // A sign with something to say shows its window in full.
    const paid = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                   ["Avgift 8-18"])]), "2026-03-02T09:00");
    expect(visible(paid).length).toBeGreaterThanOrEqual(1);
    expect(noWindow(paid, "2026-03-02T09:00")).toBeNull();
  });

  it("under a permitting sign, outside the window permission returns, not silence", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                ["Avgift 8-18"])]), "2026-03-02T07:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
  });

  it("`övrig tid` beats silence under a prohibiting sign too", () => {
    const r = first(sign([
      plate({ time_windows: [win("07:00", "18:00")] }, ["7-18"]),
      plate({ scope_shift: "remaining_time", permits_parking: true, fee: true },
            ["P Avgift övrig tid"]),
    ], "prohibition_parking"), "2026-03-02T06:00");
    expect(state(r, "2026-03-02T12:00")[0]).toBe(PROHIBITED);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
  });

  it("a named weekday is a literal: the prohibition holds on a holiday Thursday", () => {
    expect(CAL.dayClass(parseDate("2026-01-01"))).toBe(RED);     // Nyarsdagen, a Thursday
    const r = first(sign([
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2025-12-31T23:00");
    expect(state(r, "2026-01-01T03:00")).toEqual([PROHIBITED, []]);
  });

  it("a prohibiting sign with no plates prohibits always", () => {
    const r = first(sign([], "prohibition_parking"), "2026-09-09T12:00");
    expect(state(r, "2026-09-09T12:00")[0]).toBe(PROHIBITED);
    expect(state(r, "2026-09-12T03:00")[0]).toBe(PROHIBITED);
  });

  it("a prohibiting main sign inverts the base; `övrig tid` opens the complement", () => {
    // Photograph `019`: prohibited on weekdays 7-18, and at other times an ordinary
    // P with a fee.
    const r = first(sign([
      plate({ time_windows: [win("07:00", "18:00", WEEKDAY)] }, ["7-18"], "sign_plate", "yellow"),
      plate({ fee: true, scope_shift: "remaining_time", permits_parking: true },
            ["P Avgift", "övrig tid"]),
    ], "prohibition_parking"), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([PROHIBITED, []]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("the limit and its window", () => {
  it("`24:00` and `23:59` are the end of the day, not a minute short of it", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("00:00", "24:00")] },
                                ["Avgift 00-24"])]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T23:59")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    // The model writes `00:00-23:59` where the sign says `00-24` (photograph `049`).
    const almost = first(sign([plate({ fee: true, time_windows: [win("00:00", "23:59")] },
                                     ["Avgift 00-24"])]), "2026-03-02T12:00");
    expect(state(almost, "2026-03-02T23:59")).toEqual([ALLOWED, ["avgift"]]);
    const edges = almost.periods.flatMap((p) => [p.start, p.end])
      .filter((t) => t.hh === 23 && t.mm === 59);
    expect(edges, "the day is not cut into pieces").toEqual([]);
  });

  it("a limit does not outlive the window that set it", () => {
    // Photograph `005`, Friday 30 October 2026 - the eve of Alla helgons dag: the
    // bracketed window closes at 15:00, and the product answered "until 16:00"
    // (decision 118).
    const s = sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "18:00", WEEKDAY),
                                                       win("08:00", "15:00", EVE)] },
                          ["2 tim", "8-18", "(8-15)"])]);
    expect(CAL.dayClass(parseDate("2026-10-30"))).toBe(EVE);
    const r = first(s, "2026-10-30T14:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-11-02T10:00");
    expect(r.durationSource).toBe("plate");
    expect(iso(first(s, "2026-10-30T09:00").durationExpiresAt)).toBe("2026-10-30T11:00");
  });

  it("a window cut by midnight is still one window", () => {
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("20:00", "02:00")] },
                                ["2 tim", "20-02"])]), "2026-09-09T23:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-10T01:00");
    expect(r.durationSource).toBe("plate");
  });

  it("a silent period carries no limit on the stay", () => {
    // Next to "Nothing stated on the sign" stood "47 h max" - a number counted from
    // the start of the nearest prohibition, read as permission to stay that long.
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    const r = first(s, "2026-10-12T10:00");
    expect(state(r, "2026-10-12T10:00")[0]).toBe(NOT_STATED);
    expect(r.periods.some((p) => p.state === PROHIBITED)).toBe(true);
    expect(r.durationExpiresAt).toBeNull();
    expect(r.durationSource).toBeNull();
    // And where the sign does grant parking, a prohibition still ends it.
    const speaking = first(sign([
      plate({ prohibition: true, time_windows: [win("10:00", "14:00", "named_weekday", "thursday")] },
            ["Torsd 10-14"], "sign_plate", "yellow"),
    ]), "2026-03-04T12:00");
    expect(speaking.durationSource).toBe("prohibition");
    expect(iso(speaking.durationExpiresAt)).toBe("2026-03-05T10:00");
  });

  it("a prohibition ends the stay earlier than the 24-hour limit", () => {
    // `Torsdag 10-14` - move the car at 10:00, not sit on until 18:41 the next day.
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, time_windows: [win("10:00", "14:00", "named_weekday", "thursday")] },
            ["Torsdag 10-14"]),
    ]), "2026-09-02T18:41");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-03T10:00");
    expect(r.durationSource).toBe("prohibition");
  });

  it("with no prohibition the 24-hour rule governs", () => {
    const r = first(sign([plate({ fee: true }, ["Avgift"])]), "2026-09-02T18:41");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-03T18:41");
    expect(r.durationSource).toBe("24h_default");
  });
});

describe("who a condition addresses: a pictogram on a plate (decision 120)", () => {
  /** Frihamnen: `30 min 00-24 (00-14)` for everyone, `[bus] Avgift (14-24) 00-24`. */
  const frihamnen = () => sign([
    plate({ duration_limit: { amount: 30, unit: "minutes" },
            time_windows: [win("00:00", "24:00", WEEKDAY), win("00:00", "14:00", EVE)] },
          ["30 min", "00-24", "(00-14)"]),
    plate({ fee: true, vehicle_class: "bus",
            time_windows: [win("14:00", "24:00", EVE), win("00:00", "24:00", RED)] },
          ["Avgift", "(14-24)", "00-24"]),
  ]);

  it("a pictogram beside a condition says WHO the condition is for, not whose the spaces are", () => {
    const ev = evaluate(frihamnen(), "2026-09-13T10:00");
    expect(ev.regimes.map((r) => r.audience)).toEqual([null, "pictogram-bus"]);
    expect(ev.regimes.every((r) => r.eligibility.length === 0)).toBe(true);
    expect(ev.regimes[0].audienceExcluded).toEqual(["pictogram-bus"]);
    const [everyone, buses] = ev.regimes;
    expect(state(everyone, "2026-09-13T10:00")).toEqual([ALLOWED, []]);        // Sunday
    expect(state(buses, "2026-09-13T10:00")).toEqual([ALLOWED, ["avgift"]]);
    // Weekdays: both halves get the same - half an hour, from the first plate.
    const moment = "2026-09-10T21:15";
    for (const r of evaluate(frihamnen(), moment).regimes) {
      const p = r.periods.find((x) => isoNaive(x.start) <= moment && moment < isoNaive(x.end))!;
      expect([p.state, p.conditions, p.maxDurationMinutes]).toEqual([ALLOWED, [], 30]);
    }
  });

  it("a pictogram on a plate of its own says who may park", () => {
    // Photograph `038`: the spaces are designated for buses.
    const ev = evaluate(sign([plate({ vehicle_class: "bus", pictogram: "bus" }),
                              plate({ eligibility: "visitors" }, ["Besökande"])]),
                        "2026-03-02T12:00");
    expect(ev.regimes).toHaveLength(1);
    expect(ev.regimes[0].audience).toBeNull();
    expect(ev.regimes[0].eligibility).toContain("pictogram-bus");
  });

  it("only a pictogram standing alone narrows the sign", () => {
    // The developer's rule: put anything else beside it and the plate no longer
    // designates spaces - it sets a condition for its own kind of vehicle.
    const alone = evaluate(sign([plate({ vehicle_class: "bus", pictogram: "bus" })]),
                           "2026-03-02T12:00");
    expect(alone.regimes).toHaveLength(1);
    expect(alone.regimes[0].eligibility).toEqual(["pictogram-bus"]);
    expect(alone.regimes[0].audience).toBeNull();
    const withRule = evaluate(sign([plate({ vehicle_class: "bus", fee: true }, ["Avgift"])]),
                              "2026-03-02T12:00");
    expect(withRule.regimes.map((r) => r.audience)).toEqual([null, "pictogram-bus"]);
    expect(withRule.regimes.every((r) => r.eligibility.length === 0)).toBe(true);
  });

  it("\"övrig tid\" is counted over the whole sign, not half of it", () => {
    // Photograph `049`: the season is taken by the moped plate - for other vehicles
    // it is NOT "the remaining time" (decision 121).
    const season = win("00:00", "24:00", "all_days");
    season.dates = { mode: "only", ranges: [{ from: "04-01", to: "09-30" }] };
    const s = sign([
      plate({ fee: true, tariff_code: "Taxa 12", vehicle_class: "motorcycle",
              time_windows: [season] }, ["1/4-30/9", "Avgift", "Taxa 12"]),
      plate({ fee: true, tariff_code: "Taxa 2", scope_shift: "remaining_time" },
            ["Övrig tid", "Avgift", "Taxa 2"]),
    ]);
    const [everyone, mopeds] = evaluate(s, "2026-07-15T12:00").regimes;
    expect(state(everyone, "2026-07-15T12:00")).toEqual([ALLOWED, []]);      // the sign is silent
    expect(state(mopeds, "2026-07-15T12:00")).toEqual([ALLOWED, ["avgift"]]);
    // Silence is not passed off as free: the period is marked.
    const now = everyone.periods.find((p) => isoNaive(p.start) <= "2026-07-15T12:00"
                                           && "2026-07-15T12:00" < isoNaive(p.end))!;
    expect(now.note).toBe(FEE_PERIOD_ELSEWHERE);
    expect(mopeds.periods.every((p) => p.note === null)).toBe(true);
    // Out of season everyone pays, and the halves agree.
    for (const r of evaluate(s, "2026-11-16T12:00").regimes) {
      expect(state(r, "2026-11-16T12:00")).toEqual([ALLOWED, ["avgift"]]);
    }
  });

  it("an arrow and an audience divide the sign in turn, and independently", () => {
    // A bus plate above a left arrow divides only the left stretch.
    const ev = evaluate(sign([
      plate({ duration_limit: { amount: 30, unit: "minutes" } }, ["30 min"]),
      plate({ fee: true, vehicle_class: "bus" }, ["Avgift"]),
      plate({ arrow: "left" }),
      plate(TWO_TIM, ["2 tim"]),
      plate({ arrow: "right" }),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => [r.extent, r.audience])).toEqual([
      ["left", null], ["left", "pictogram-bus"], ["right", null]]);
    expect(state(ev.regimes[0], "2026-03-02T12:00")).toEqual([ALLOWED, []]);
    expect(state(ev.regimes[1], "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("the shift of scope", () => {
  it("`övrig tid` fills the complement of the window", () => {
    const r = first(sign([
      plate({ permit_required: true, time_windows: [win("07:00", "17:00", WEEKDAY)] },
            ["Särskilt P-tillstånd erfordras", "07-17"]),
      plate({ fee: true, scope_shift: "remaining_time" }, ["Övrig tid", "avgift"]),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["sarskilt-p-tillstand"]]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);   // Saturday
  });

  it("with no shift, the base regime returns outside the window", () => {
    const r = first(sign([plate(AVGIFT_8_18, ["Avgift 8-18"])]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
  });
});

describe("the reference readings of sign B and sign V", () => {
  it("sign B: motorcycles pay in their hours, others stand free, all are barred", () => {
    // The reading was revisited by the developer on 2026-09-10: the pictogram stands
    // together with `Avgift 7-19 (11-17) Taxa 13`, so it designates no spaces.
    const ev = evaluate(sign([
      plate({ vehicle_class: "motorcycle", fee: true, tariff_code: "Taxa 13",
              time_windows: [win("07:00", "19:00", WEEKDAY), win("11:00", "17:00", EVE)] },
            ["Avgift", "7-19", "(11-17)", "Taxa 13"]),
      plate({ stretch_metres: { from: 0, to: 5 } }, ["0-5 m"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2026-03-02T12:00");
    const [everyone, bikes] = ev.regimes;
    expect([everyone.audience, bikes.audience]).toEqual([null, "pictogram-motorcycle"]);
    expect(everyone.eligibility).toEqual([]);
    expect(bikes.eligibility).toEqual([]);
    expect(everyone.placeNotes).toContain("stretch-metres");
    expect(state(bikes, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);   // weekdays 7-19
    expect(state(bikes, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);   // Saturday 11-17
    expect(state(bikes, "2026-03-07T09:00")).toEqual([ALLOWED, []]);           // Saturday before 11
    expect(state(bikes, "2026-03-02T20:00")).toEqual([ALLOWED, []]);           // outside the window
    expect(state(everyone, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
    expect(state(everyone, "2026-03-07T12:00")).toEqual([ALLOWED, []]);
    expect(state(everyone, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
    expect(state(bikes, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
  });

  it("sign V: with no vehicle plate, the range is not narrowed by vehicle", () => {
    const r = first(sign([
      plate({ fee: true, tariff_code: "Taxa 3",
              time_windows: [win("07:00", "19:00", WEEKDAY), win("11:00", "17:00", EVE)] },
            ["Avgift", "7-19", "(11-17)", "Taxa 3"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "monday")] },
            ["Månd 0-6"], "sign_plate", "yellow"),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-03T12:00");
    const vehicles = ["pictogram-motorcycle", "bil-personbil", "pictogram-electric-car"];
    expect(r.eligibility.filter((k) => vehicles.includes(k))).toEqual([]);
    expect(r.eligibility).toEqual(["boende"]);
    expect(state(r, "2026-03-09T03:00")).toEqual([PROHIBITED, []]);   // Monday 0-6
    expect(state(r, "2026-03-03T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("arrows and stretches", () => {
  it("an arrow closes the instruction above it: two stretches, two regimes", () => {
    // Photograph `010`.
    const ev = evaluate(sign([
      plate({ eligibility: "rented" }, ["Förhyrda platser"]),
      plate({ arrow: "left" }, [], "sign_plate", "white"),
      plate({ eligibility: "rented", permit_required: true },
            ["Förhyrd plats", "Särskilt P-tillstånd erfordras"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes).toHaveLength(2);
    const [left, right] = ev.regimes;
    expect([left.extent, right.extent]).toEqual(["left", "right"]);
    expect(left.eligibility).toEqual(["forhyrda-platser"]);
    expect(right.eligibility).toEqual(["forhyrda-platser", "sarskilt-p-tillstand"]);
  });

  it("no arrow means the place is here", () => {
    const ev = evaluate(sign([plate({ vehicle_class: "motorcycle" })]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["here"]);
  });

  it("a payment board below the arrow does not start a second stretch", () => {
    const ev = evaluate(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ arrow: "both_horizontal" }),
      plate({ area_code: "8010" }, ["Områdeskod 8010"], "info_board"),
    ]), "2026-09-02T18:41");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["both_sides"]);
  });

  it("plates below the last arrow do not start a second stretch", () => {
    // Photograph `033`: `Zon E` and `Boende Storskogen` under a left arrow.
    const ev = evaluate(sign([
      plate(AVGIFT_8_18, ["Avgift", "8-18"]),
      plate({ arrow: "left" }),
      plate({ tariff_code: "Zon E" }, ["Zon E"]),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["left"]);
    expect(ev.regimes[0].eligibility).toContain("boende");
  });

  it("the tail of the stack reaches every stretch, not only the last", () => {
    const ev = evaluate(sign([
      plate(TWO_TIM, ["2 tim"]),
      plate({ arrow: "left" }),
      plate(AVGIFT_8_18, ["Avgift", "8-18"]),
      plate({ arrow: "right" }),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["left", "right"]);
    for (const r of ev.regimes) expect(r.eligibility, r.extent).toContain("boende");
  });

  it("a sign with no arrows is still one stretch, here", () => {
    expect(evaluate(sign([plate(TWO_TIM, ["2 tim"])]), "2026-03-02T12:00").regimes
      .map((r) => r.extent)).toEqual(["here"]);
  });

  it("an arrow under a wayfinding sign means direction, not extent", () => {
    // Photograph `037`: a sign pointing to parking permits nothing, so there is no
    // extent to draw.
    const keys = recognise(sign([plate({ arrow: "right", pictogram: "arrow" })],
                                "wayfinding_parking_house")).panelKeys[1];
    expect(keys).toEqual(["wayfinding-direction"]);
  });

  it("the same arrow under an ordinary `P` is still the extent", () => {
    const keys = recognise(sign([plate({ arrow: "right", pictogram: "arrow" })])).panelKeys[1];
    expect(keys).toEqual(["arrow-right"]);
  });
});

describe("the boundaries of the product", () => {
  it("a payment board never enters the rules", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ area_code: "31370" }, ["Områdeskod 31370"], "info_board", "other"),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(r.placeNotes).toEqual([]);
  });

  it("a wayfinding sign permits nothing", () => {
    const ev = evaluate(sign([], "wayfinding_park_and_ride"), "2026-03-02T12:00");
    expect(ev.permitsParking).toBe(false);
    expect(ev.regimes).toEqual([]);
  });

  it("a date outside the calendar is uncertainty, not an error", () => {
    const ev = evaluate(sign([plate(AVGIFT_8_18)]), "2035-05-03T10:00");
    expect(ev.uncertainties).toContain("date_outside_calendar");
    expect(ev.regimes[0].periods.some((p) => p.state === UNCERTAIN)).toBe(true);
  });

  it("`Boende` answers the question of who", () => {
    const r = first(sign([plate({ eligibility: "residents" }, ["Boende Solna"])]),
                    "2026-09-02T19:27");
    expect(r.eligibility).toEqual(["boende"]);
  });
});

describe("reference readings from photographs 020-026", () => {
  it("022: two spaces on the right for charging electric cars only, 4 hours, paid", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ duration_limit: { amount: 4, unit: "hours" } }, ["4 tim"]),
      plate({ vehicle_class: "electric" }, ["Endast laddande elbilar"]),
      plate({ place_count: 2 }, ["2 platser"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
      plate({ area_code: "31308" }, ["Områdeskod 31308"], "info_board", "other"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("right");
    expect(r.eligibility).toEqual(["pictogram-electric-car"]);
    expect(r.placeNotes).toContain("place-count");
    // A fee and a limit with no windows apply always: weekdays, weekends and nights.
    for (const moment of ["2026-03-02T12:00", "2026-03-07T03:00", "2026-03-08T23:00"]) {
      expect(state(r, moment), moment).toEqual([ALLOWED, ["avgift"]]);
    }
    expect(r.durationSource).toBe("plate");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T16:00");
  });

  it("023: the same rule without a count or an arrow - the same conclusion", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ duration_limit: { amount: 4, unit: "hours" } }, ["4 tim"]),
      plate({ vehicle_class: "electric" }, ["Endast laddande elbilar"]),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("here");
    expect(r.placeNotes).toEqual([]);
    expect(r.eligibility).toEqual(["pictogram-electric-car"]);
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T16:00");
  });

  it("020: rented spaces with numbers - the gate is the tenancy", () => {
    const r = first(sign([
      plate({ eligibility: "rented" }, ["Förhyrda platser", "Gäller plats 13 och 14"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("right");
    expect(r.eligibility).toEqual(["forhyrda-platser"]);
  });

  it("021: \"Privat parkering\" states no rule", () => {
    // A `P` sign on private land means the same: anyone may stand, for 24 hours.
    const r = first(sign([
      plate({ operator: { name: "Brf Ängslyckan" } } as unknown as Parsed,
            ["Privat parkering", "Brf Ängslyckan"], "operator_plate"),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.eligibility, "the range is not narrowed").toEqual([]);
    expect(r.durationSource, "the 24-hour default applies").toBe("24h_default");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
  });

  it("024: the means of payment is out of scope - only \"paid\" matters", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift erläggs med"]),
      plate({ arrow: "both_horizontal" }, [], "sign_plate", "white"),
      plate({ operator: { name: "Västia Parkering", phone: "0771-501550" } } as unknown as Parsed,
            ["Västia Parkering", "0771-501550"], "operator_plate"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("both_sides");
    for (const moment of ["2026-03-02T12:00", "2026-03-07T23:00"]) {
      expect(state(r, moment), moment).toEqual([ALLOWED, ["avgift"]]);
    }
    expect(r.durationSource).toBe("24h_default");
  });

  it("025: `30 min` and \"guests only\" on one plate are one instruction", () => {
    const r = first(sign([
      plate({ stretch_metres: { from: 0, to: 30 } }, ["0-30 m"]),
      plate({ duration_limit: { amount: 30, unit: "minutes" }, eligibility: "visitors" },
            ["30 min", "Endast gäster till Franks Gatukök"]),
      plate({ arrow: "left" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("left");
    expect(r.eligibility).toEqual(["besokande"]);
    expect(r.placeNotes).toContain("stretch-metres");
    expect(r.durationSource).toBe("plate");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T12:30");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
  });

  it("metres do not become minutes", () => {
    // The trap of photograph `025`: `0-30 m` and `30 min` stand side by side.
    const r = first(sign([plate({ stretch_metres: { from: 0, to: 30 } }, ["0-30 m"])]),
                    "2026-03-02T12:00");
    expect(r.durationSource).toBe("24h_default");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T12:00");
  });

  it("026: a zonal board reads as an ordinary sign", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, placement: "marked_bay_only" },
            ["Utanför markerad plats"], "sign_plate", "yellow"),
      plate({ operator: { name: "Mölndals Parkerings AB" } } as unknown as Parsed,
            ["Mölndals Parkerings AB"], "operator_plate", "yellow"),
    ], "parking", "zone"), "2026-03-02T12:00");
    expect(r.placeNotes).toContain("utanfor-markerad-plats");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(r.durationSource).toBe("24h_default");
  });
});

describe("even weeks, seasons and single days", () => {
  const tuesdaySeason = () => {
    const w = win("12:00", "15:00", "named_weekday", "tuesday");
    w.dates = { mode: "only", ranges: [{ from: "11-01", to: "05-15" }] };
    return sign([plate({ prohibition: true, time_windows: [w] }, ["Tisdag 12-15", "1 nov-15 maj"])]);
  };

  it("`jämna veckor` prohibits every second week, not every week", () => {
    const w = win("10:00", "14:00", "named_weekday", "thursday");
    w.week_parity = "even";
    const s = sign([plate({ prohibition: true, time_windows: [w] }, ["Torsdag 10-14", "Jämna veckor"])]);
    expect(isoWeek(parseDate("2026-09-03")) % 2).toBe(0);    // week 36
    expect(isoWeek(parseDate("2026-09-10")) % 2).toBe(1);    // week 37
    expect(state(first(s, "2026-09-03T11:00"), "2026-09-03T11:00")[0]).toBe(PROHIBITED);
    expect(state(first(s, "2026-09-10T11:00"), "2026-09-10T11:00")[0]).toBe(ALLOWED);
  });

  it("a range of dates may wrap around the new year", () => {
    expect(state(first(tuesdaySeason(), "2026-12-01T13:00"), "2026-12-01T13:00")[0]).toBe(PROHIBITED);
    expect(state(first(tuesdaySeason(), "2026-06-02T13:00"), "2026-06-02T13:00")[0]).toBe(ALLOWED);
  });

  it("a boundary in mid-month is kept to the day", () => {
    // `15 maj` is the 15th of May, not the whole of May (photograph `034`).
    expect(state(first(tuesdaySeason(), "2026-05-12T13:00"), "2026-05-12T13:00")[0]).toBe(PROHIBITED);
    expect(state(first(tuesdaySeason(), "2026-05-19T13:00"), "2026-05-19T13:00")[0]).toBe(ALLOWED);
  });

  it("single days are ranges one day long", () => {
    // `Gäller ej 15/6 15/8` the developer read as two separate days.
    const w = win("00:00", "06:00", "named_weekday", "friday");
    w.dates = { mode: "except", ranges: [{ from: "06-15", to: "06-15" },
                                         { from: "08-15", to: "08-15" }] };
    const s = sign([plate({ prohibition: true, time_windows: [w] }, ["Fred 0-6", "Gäller ej 15/6 15/8"])]);
    expect(weekday(parseDate("2026-06-19"))).toBe(4);        // a Friday, but not the 15th
    expect(state(first(s, "2026-06-19T03:00"), "2026-06-19T03:00")[0]).toBe(PROHIBITED);
    // The excluded day itself is exactly one day, and no more.
    const onlyJune: TimeWindow = { from: "00:00", to: "24:00", day_class: "all_days",
                                   dates: { mode: "except", ranges: [{ from: "06-15", to: "06-15" }] } };
    expect(windowApplies(onlyJune, at("2026-06-15T12:00"), CAL), "15 June is excluded").toBe(false);
    expect(windowApplies(onlyJune, at("2026-06-16T12:00"), CAL), "16 June is not").toBe(true);
  });

  it("the week parity and the season are named to the reader", () => {
    // A rule applied silently is one the person cannot check.
    const w = win("10:00", "14:00", "named_weekday", "thursday");
    w.week_parity = "even";
    w.dates = { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] };
    const keys = recognise(sign([plate({ prohibition: true, time_windows: [w] },
                                       ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"])])).panelKeys[1];
    expect(keys).toContain("jamna-veckor");
    expect(keys).toContain("datumintervall");
  });
});

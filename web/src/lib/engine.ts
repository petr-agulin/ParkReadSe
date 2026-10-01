// `evaluateParkingRules` - a pure function with no call to the model.
// A port of `parkread/engine.py`, line for line: improvements are not applied along
// the way but put to the developer (decision 123).
//
// This is where all the arithmetic moves out of the model and into code. It
// implements the seven-step order of assembly:
//
// 1. the base regime from the main sign;
// 2. splitting the stack into plates (already done by extraction);
// 3. dividing into stretches by arrows;
// 4. conditions of eligibility - into a caption to the regime, not into a check;
// 5. conditions of place - into permanent notes;
// 6. laying out over time: windows on top of the base, and the complement being the
//    base or whatever the shift token named;
// 7. applying prohibitions: within its window a prohibition overrides permission.
//
// Three things that are easy to get wrong and are deliberate here:
//
// - outside a window the BASE regime returns, not "nothing" and not the conditions
//   from inside the window;
// - a condition of eligibility is NEVER checked: the product does not know who is
//   standing at the sign;
// - a named weekday is a LITERAL: the holiday calendar does not apply to it.

import { Calendar, RED, UNKNOWN, WEEKDAY } from "./calendar";
import { add as clockAdd } from "./clock";
import { addDays, addMinutes, compare, minutes, weekday,
         type Civil, type Naive } from "./civil";
import { ELIGIBILITY_KEYS, VEHICLE_KEYS, WHO_SLOT_NARROWS, PRINTED_HOURS } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

export const HORIZON_DAYS = 8;        // how far ahead the timeline of periods runs
const DAY_MINUTES = 24 * 60;

// states of a period
export const ALLOWED = "allowed";
export const PROHIBITED = "prohibited";
export const UNCERTAIN = "uncertain";
// The sign says nothing about this time. Neither "you may" nor "you may not": a
// prohibiting sign with a time plate prohibits ONLY within its window, and outside
// it permits nothing. It must not be mixed with UNCERTAIN: there something could not
// be read, here it was read and we know there is nothing to say.
export const NOT_STATED = "not_stated";

// A note on a period: a fee is named only for "the remaining time", and which time
// is "remaining" is written on a plate addressed to a different kind of vehicle.
export const FEE_PERIOD_ELSEWHERE = "fee_period_belongs_to_another_audience";

// A plate that says WHEN parking is permitted says, by saying it, that at other times
// it is not: otherwise the plate would have nothing to do (the developer's word,
// 2026-09-24, photographs `064`, `117`). The sign carries no prohibition, so the
// period names its own reason.
export const OUTSIDE_PERMITTED_HOURS = "outside_the_hours_the_sign_permits";

// A prohibition that has LAPSED leaves something different behind: a street where this
// sign says nothing at all, and there the general rules hold - among them the 24 hours
// (decision 155, photographs `093`, `109`, `089`).
export const GENERAL_RULE_GAP = "general_rules_apply_outside_the_sign";

// On a priority road the general rules give no leave to park, so the same gap stays
// shut (the developer's word, photographs `118`, `120`).
export const PRIORITY_ROAD_GAP = "priority_road_needs_a_permitting_sign";

// stretches
export const HERE = "here";
export const ARROW_EXTENT: Record<string, string> = {
  left: "left", right: "right",
  up: "ahead", down: "behind",
  both_horizontal: "both_sides", both_vertical: "both_directions",
};

const BASE_PROHIBITED = new Set(["prohibition_parking", "prohibition_stopping"]);
const WAYFINDING = new Set(["wayfinding_parking_house", "wayfinding_park_and_ride"]);

export type Period = {
  start: Naive;
  end: Naive;
  state: string;
  conditions: string[];               // reference keys
  maxDurationMinutes: number | null;  // null -> the 24-hour default applies
  note: string | null;
};

export type Regime = {
  extent: string;
  eligibility: string[];              // who the spaces are designated for
  placeNotes: string[];               // where, and how many
  periods: Period[];
  durationExpiresAt: Naive | null;
  durationSource: string | null;      // "plate" | "24h_default"
  // Who THIS window is addressed to. Not the same as `eligibility`: that says who
  // the spaces are for, this says whose stay the countdown was computed for.
  audience: string | null;
  audienceExcluded: string[];
};

export type Evaluation = {
  regimes: Regime[];
  uncertainties: string[];
  permitsParking: boolean;            // false for signs that point the way
  note: string | null;
};

function sameAs(a: Period, b: Period): boolean {
  return a.state === b.state
    && a.conditions.length === b.conditions.length
    && a.conditions.every((c, i) => c === b.conditions[i])
    && a.maxDurationMinutes === b.maxDurationMinutes
    && a.note === b.note;
}

const parsedOf = (p: Panel): Parsed => p.parsed ?? {};
const windowsOf = (parsed: Parsed): TimeWindow[] => parsed.time_windows ?? [];
const dateOf = (t: Naive): Civil => ({ y: t.y, m: t.m, d: t.d });
const midnight = (d: Civil): Naive => ({ ...d, hh: 0, mm: 0 });
const minuteOfDay = (t: Naive): number => t.hh * 60 + t.mm;
const sortedUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

// --- step 3: dividing into stretches by arrows ------------------------------

/** An arrow CLOSES the instructions above it and ties them to a stretch.
 *
 *  Several arrows mean several regimes on one sign (photograph `010`). No arrow
 *  means the place is right here, at the sign (photograph `015`). */
export function splitByArrows(panels: Panel[]): [string, Panel[]][] {
  // Only plates that STATE A RULE divide a stretch: an operator's board is not one.
  const plates = panels.filter((p) => p.kind === "sign_plate");

  const groups: [string, Panel[]][] = [];
  let current: Panel[] = [];
  for (const p of plates) {
    const arrow = parsedOf(p).arrow;
    if (arrow) {
      groups.push([ARROW_EXTENT[arrow] ?? HERE, current]);
      current = [];
    } else {
      current.push(p);
    }
  }
  // Plates BELOW the last arrow do not start a stretch (photograph `033`): an arrow
  // closes the instructions above it, and what stands under it belongs to the sign
  // as a whole and reaches every stretch.
  let result: [string, Panel[]][];
  if (groups.length === 0) {
    result = [[HERE, current]];
  } else if (current.length) {
    result = groups.map(([ext, items]) => [ext, [...items, ...current]]);
  } else {
    result = groups;
  }
  const kept = result.filter(([, items]) => items.length > 0);
  return kept.length ? kept : [[HERE, []]];
}

// --- step 6: whether an instruction applies at a given moment ---------------

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday",
                       "friday", "saturday", "sunday"];

/** `null` means "unknown": the date is outside the calendar, and the window depends
 *  on the class of the day. */
export function windowApplies(win: TimeWindow, moment: Naive, cal: Calendar): boolean | null {
  const dc = win.day_class ?? "unspecified";
  const d = dateOf(moment);

  if (dc === "named_weekday") {
    // A literal. The holiday calendar does NOT apply to it: a `Tisdag 18-24`
    // prohibition holds on a Tuesday that is a holiday.
    if (WEEKDAY_NAMES[weekday(d)] !== win.named_weekday) return false;
  } else {
    const day = cal.dayClass(d);
    if (day === UNKNOWN && dc !== "all_days") return null;
    // "Days unstated" means weekdays by default, not "every day".
    if (dc === "unspecified" && day !== WEEKDAY) return false;
    if ((dc === WEEKDAY || dc === "eve" || dc === RED) && day !== dc) return false;
  }

  // A named weekday binds whatever class of day came with it. On `120` the model gave
  // `3:e tisdagen` the class "weekday" together with `named_weekday: tuesday`; read by
  // the class alone, the ban fell on every working day of the month's third week.
  if (dc !== "named_weekday" && win.named_weekday
      && WEEKDAY_NAMES[weekday(d)] !== win.named_weekday) return false;

  // The week parity and the range of dates narrow the window once more.
  if (!weekParityMatches(win, d)) return false;
  if (!datesMatch(win, d)) return false;
  // A window that comes round by the calendar, not by the week: `1:a varje månad`
  // (photograph `114`), `3:e tisdagen` (`120`). With no way to say either, the model
  // wrote "weekdays", and a monthly prohibition became one on every working day.
  if (win.day_of_month !== undefined && d.d !== win.day_of_month) return false;
  if (win.nth_of_month !== undefined && Math.ceil(d.d / 7) !== win.nth_of_month) {
    return false;
  }

  return inClockWindow(win, moment);
}

/** `jämna veckor` means even ISO weeks, `udda veckor` odd ones. With no such field
 *  the window applies every week. */
function weekParityMatches(win: TimeWindow, d: Civil): boolean {
  const parity = win.week_parity;
  if (!parity) return true;
  const week = isoWeek(d);
  return parity === "even" ? week % 2 === 0 : week % 2 === 1;
}

/** The ISO week number - the same one Python's `date.isocalendar()[1]` gives. */
export function isoWeek(d: Civil): number {
  // The Thursday of the same week decides which year the week belongs to.
  const thursday = addDays(d, 3 - ((weekday(d) + 7) % 7));
  const jan1 = { y: thursday.y, m: 1, d: 1 };
  const days = (a: Civil, b: Civil) => Math.round(compare(a, b));
  return Math.floor(days(thursday, jan1) / 7) + 1;
}

function inClockWindow(win: TimeWindow, moment: Naive): boolean {
  const start = clockMinute(win.from);
  const end = clockMinute(win.to);
  const t = minuteOfDay(moment);
  // `24:00` is the end of the day, not 00:00 of the same day.
  if (end === 0) return t >= start;
  if (start <= end) return start <= t && t < end;
  return t >= start || t < end;         // a window across midnight
}

/** A time from a plate, in minutes from midnight. The end of the day is zero.
 *
 *  `23:59` counts as that same end of day: signs are not written that way, but the
 *  model writes `00-24` as `00:00-23:59` all the time, and the last minute of the
 *  day was falling outside the window (photograph `049`). */
export function clockMinute(s: string): number {
  const [h, m] = s.split(":");
  if (h === "24" || (h === "23" && m === "59")) return 0;
  return Number(h) * 60 + Number(m);
}

/** `MM-DD` into a pair of numbers. There is no year here on purpose: a plate is hung
 *  once and applies every year. */
function md(value: string): [number, number] {
  const [month, day] = value.split("-");
  return [Number(month), Number(day)];
}

function inRange(d: Civil, rng: { from: string; to: string }): boolean {
  const [sm, sd] = md(rng.from);
  const [em, ed] = md(rng.to);
  const start = sm * 100 + sd;
  const end = em * 100 + ed;
  const here = d.m * 100 + d.d;
  if (start <= end) return start <= here && here <= end;
  return here >= start || here <= end;
}

/** The dates bounding a window: "only within these ranges" or "always except them". */
function datesMatch(win: TimeWindow, d: Civil): boolean {
  const dates = win.dates;
  if (!dates) return true;
  const hit = (dates.ranges ?? []).some((r) => inRange(d, r));
  return dates.mode === "only" ? hit : !hit;
}

/** How far the timeline is drawn. This is NOT a boundary of a rule: the sign changes
 *  nothing at that moment, we simply look no further. */
export function horizonEnd(now: Naive): Naive {
  return midnight(addDays(dateOf(now), HORIZON_DAYS));
}

/** The moments where something may change: midnights and the edges of every window. */
function boundaries(now: Naive, instructions: Parsed[]): Naive[] {
  const marks = new Set<number>([minutes(now)]);
  const day0 = dateOf(now);
  for (let i = 0; i <= HORIZON_DAYS; i += 1) {
    const d = addDays(day0, i);
    marks.add(minutes(midnight(d)));
    for (const parsed of instructions) {
      for (const w of windowsOf(parsed)) {
        for (const key of [w.from, w.to]) {
          marks.add(minutes(midnight(d)) + clockMinute(key));
        }
      }
    }
  }
  const from = minutes(now);
  const to = minutes(horizonEnd(now));
  return [...marks].filter((t) => t >= from && t <= to)
                   .sort((a, b) => a - b)
                   .map((t) => addMinutes({ y: 1970, m: 1, d: 1, hh: 0, mm: 0 }, t));
}

// --- assembling a regime ---------------------------------------------------

function durationMinutes(parsed: Parsed): number | null {
  const d = parsed.duration_limit;
  if (!d) return null;
  const per = d.unit === "days" ? DAY_MINUTES : d.unit === "hours" ? 60 : 1;
  return Math.trunc(d.amount * per);
}

/** Whether a plate carries a rule of its own - a fee, a limit, a permit, a
 *  prohibition or its own hours. A pictogram beside such a rule addresses THAT rule,
 *  not the sign. */
function addressesACondition(parsed: Parsed): boolean {
  return Boolean(conditionsOf(parsed).length || parsed.duration_limit
                 || parsed.prohibition || parsed.time_windows);
}

/** The reference key, if the plate addresses its condition to a kind of vehicle.
 *
 *  The developer's rule (2026-09-10): a sign says "buses only" just when the
 *  pictogram on the plate stands ALONE. Put anything else beside it - hours, a fee,
 *  a tariff - and the plate designates no spaces but sets a condition for its own
 *  kind of vehicle. A pictogram WITHOUT a condition (photograph `038`) does not come
 *  here. */
function addressedClass(parsed: Parsed): string | null {
  const key = parsed.vehicle_class ? VEHICLE_KEYS[parsed.vehicle_class] : undefined;
  return key && addressesACondition(parsed) ? key : null;
}

/** One sign, several windows, when a condition is addressed to a kind of vehicle
 *  (the photograph from Frihamnen, decision 120). */
function splitByVehicle(panels: Panel[]): [string | null, string[], Panel[]][] {
  const addressed = panels.map((p) => [addressedClass(parsedOf(p)), p] as const);
  const keys: string[] = [];
  for (const [key] of addressed) if (key && !keys.includes(key)) keys.push(key);
  if (!keys.length) return [[null, [], panels]];

  const common = addressed.filter(([key]) => !key).map(([, p]) => p);
  const out: [string | null, string[], Panel[]][] = [[null, keys, common]];
  for (const key of keys) {
    out.push([key, [], addressed.filter(([k]) => !k || k === key).map(([, p]) => p)]);
  }
  return out;
}

/** The reference keys an instruction adds to a period. */
function conditionsOf(parsed: Parsed): string[] {
  const out: string[] = [];
  if (parsed.fee) out.push("avgift");
  if (parsed.permit_required) out.push("sarskilt-p-tillstand");
  if (parsed.payment_method === "parking_disc") out.push("p-skiva");
  else if (parsed.payment_method === "ticket") out.push("p-biljett");
  return out;
}

function buildRegime(extent: string, panels: Panel[], baseState: string,
                     now: Naive, cal: Calendar, uncertainties: string[],
                     audience: string | null, audienceExcluded: string[],
                     others: Panel[], onPriorityRoad = false): Regime {
  const plates = panels.filter((p) => p.kind === "sign_plate");

  // step 4: a condition of eligibility is a caption to the regime
  const eligibility: string[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    // A pictogram that addresses a condition does not narrow who may park
    // (decision 120).
    const vehicle = addressedClass(parsed)
      ? undefined
      : (parsed.vehicle_class ? VEHICLE_KEYS[parsed.vehicle_class] : undefined);
    // A plate the model could place only as WHO narrows like a named group (decision
    // 162); a vehicle on it would already have said who.
    const who = parsed.eligibility ? ELIGIBILITY_KEYS[parsed.eligibility]
      : WHO_SLOT_NARROWS && parsed.unrecognised_slot === "who" && !parsed.vehicle_class
        ? ELIGIBILITY_KEYS.custom : undefined;
    for (const key of [vehicle, who]) {
      if (key && !eligibility.includes(key)) eligibility.push(key);
    }
    // "A rented space that also needs a permit" is two conditions at once.
    if (parsed.permit_required && !eligibility.includes("sarskilt-p-tillstand")) {
      eligibility.push("sarskilt-p-tillstand");
    }
  }

  // step 5: conditions of place become permanent notes
  const placeNotes: string[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    if (parsed.placement === "marked_bay_only") placeNotes.push("utanfor-markerad-plats");
    if (parsed.placement === "as_shown") placeNotes.push("placement-as-shown");
    if (parsed.place_count) placeNotes.push("place-count");
    if (parsed.stretch_metres) placeNotes.push("stretch-metres");
  }

  // sorting the instructions by their role in time
  const windowed: Parsed[] = [];
  const always: Parsed[] = [];
  const shifted: Parsed[] = [];
  const prohibitions: Parsed[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    if (parsed.prohibition && parsed.time_windows) {
      prohibitions.push(parsed);
      continue;
    }
    if (parsed.scope_shift === "remaining_time") {
      // A window narrows `Övrig tid` only when the hours are ON THE PLATE. On `019`
      // the plate reads `Avgift / övrig tid` and nothing more, and the model filled
      // the window in itself by inverting the prohibition above - a paraphrase of
      // "the remaining time", not a second condition. Narrowing by that would have
      // dropped the fee on Saturdays, which no line of the sign does.
      const printed = PRINTED_HOURS.test((p.lines ?? []).join(" "));
      shifted.push(printed ? parsed : { ...parsed, time_windows: undefined });
    }
    else if (parsed.time_windows) windowed.push(parsed);
    else if (conditionsOf(parsed).length || parsed.duration_limit) always.push(parsed);
  }

  // A plate with hours under a PROHIBITING sign does not add conditions to a
  // perpetual prohibition - it DRAWS ITS BOUNDS (decision 113). Under a permitting
  // sign it is the other way round.
  const scoping = [...windowed, ...prohibitions].filter((p) => !p.permits_parking);
  const scoped = baseState === PROHIBITED && scoping.some((p) => p.time_windows);

  // A windowed plate carrying NO rule of its own can only be saying WHEN the
  // permission holds - there is nothing else left for it to mean. Under a permitting
  // sign it therefore draws bounds, exactly as a plate with hours does under a
  // prohibiting one. On photograph `117` (`18-08`) such a plate was read as saying
  // nothing at all, and the stay ran a full day past the close of the window.
  // "Nothing of its own" is meant strictly: the plate's only field is its hours. A
  // plate that also names WHO (`Boende C 22-7` on `052`) is telling the residents
  // when their terms hold, not telling everyone when the sign permits parking at all.
  // `Övrig tid` means the sign has spoken about the rest of the time, so nothing is
  // left for a bare window to bound: on `040` the plate `Vardagar 7-17` divides the
  // day between free and paid, it does not close the sign outside office hours.
  const bounding = (baseState === PROHIBITED || shifted.length) ? [] : windowed.filter((q) =>
    Object.entries(q).every(([field, value]) =>
      value === undefined || field === "time_windows" || field === "uninterpreted"));

  // Hours taken by plates addressed to SOMEONE ELSE: they give this window no
  // conditions, but "Övrig tid" does not step across them (photograph `049`,
  // decision 121).
  const occupied = others.map(parsedOf).filter((q) => q.time_windows);

  const periods = timeline(now, cal, baseState, windowed, always, shifted,
                           prohibitions, uncertainties, scoped, occupied, bounding,
                           onPriorityRoad);

  // Duration: a plate overrides the 24-hour default - but only where the plate
  // applies.
  let expires: Naive | null = null;
  let source: string | null = null;
  const nowM = minutes(now);
  const current = periods.find((p) => minutes(p.start) <= nowM && nowM < minutes(p.end));
  // A sign that is silent right now grants no parking, so there is nothing to limit.
  const silent = current !== undefined && current.state === NOT_STATED;
  const limit = silent ? null : (current ? current.maxDurationMinutes : null);
  // Real elapsed time, not the marks on a dial (decision 116).
  const edge = limit ? clockAdd(now, limit) : null;

  // A limit does not always bite - not even in the CURRENT window: the boundary is
  // taken only when it falls INSIDE the window (decision 118, photograph `005`). The
  // end of the window is not taken from a single period: midnight cuts a window into
  // several, and the limit across them is one and the same.
  let windowEnd: Naive | null = null;
  if (limit && current) {
    windowEnd = current.end;
    for (const p of periods) {
      if (minutes(p.start) === minutes(windowEnd) && p.state === current.state
          && p.maxDurationMinutes === limit) {
        windowEnd = p.end;
      }
    }
  }

  if (limit && edge && windowEnd && minutes(edge) < minutes(windowEnd)) {
    expires = edge;
    source = "plate";
    // The 24-hour rule governs any stay that is permitted NOW, not only one under a
    // blue P. Where a lapsed prohibition left the street to the general rules, the
    // general rules bring their limit with them - without this the stay ran to the
    // next ban instead, and a Monday morning bought 47 hours.
  } else if (baseState === ALLOWED || current?.state === ALLOWED) {
    expires = twentyFourHourExpiry(now, cal);
    source = expires ? "24h_default" : null;
    if (expires === null) uncertainties.push("24h_expiry_outside_calendar");
  }

  // A restriction that STARTS later also ends the stay (photograph `005`). It counts
  // from the START of the window, not from the moment the car was parked.
  for (const later of periods) {
    if (minutes(later.start) <= nowM || later.state !== ALLOWED) continue;
    if (expires !== null && minutes(later.start) >= minutes(expires)) break;
    const lim = later.maxDurationMinutes;
    if (!lim) continue;
    const at = clockAdd(later.start, lim);
    if (minutes(at) < minutes(later.end)
        && (expires === null || minutes(at) < minutes(expires))) {
      expires = at;
      source = "plate";
      break;
    }
  }

  // A prohibition ends the stay earlier than any limit.
  const stop = periods.find((p) => minutes(p.start) > nowM && p.state === PROHIBITED);
  if (stop && !silent && (expires === null || minutes(stop.start) < minutes(expires))) {
    expires = stop.start;
    source = "prohibition";
  }

  return {
    extent,
    eligibility,
    placeNotes: sortedUnique(placeNotes),
    periods,
    durationExpiresAt: expires,
    durationSource: source,
    audience,
    audienceExcluded: [...audienceExcluded],
  };
}

function timeline(now: Naive, cal: Calendar, baseState: string,
                  windowed: Parsed[], always: Parsed[], shifted: Parsed[],
                  prohibitions: Parsed[], uncertainties: string[],
                  scoped: boolean, occupied: Parsed[],
                  bounding: Parsed[] = [], onPriorityRoad = false): Period[] {
  const baseConditions = sortedUnique(always.flatMap(conditionsOf));
  const marks = boundaries(now, [...windowed, ...shifted, ...prohibitions,
                                 ...always, ...occupied]);
  const raw: Period[] = [];

  const baseDuration = always.map(durationMinutes).find((m) => m) ?? null;

  for (let i = 0; i + 1 < marks.length; i += 1) {
    const t0 = marks[i];
    const t1 = marks[i + 1];
    let state = baseState;
    let conds = [...baseConditions];
    let unknown = false;
    let duration = baseDuration;
    let note: string | null = null;
    // The prohibition is bounded by a window: outside it the sign is silent, until
    // something says otherwise - falling inside a window below, or a plate saying
    // "at other times".
    // Two kinds of silence, and they end differently. A lapsed prohibition leaves the
    // street to the general rules; a closed permission leaves parking not permitted.
    if (scoped) state = NOT_STATED;
    if (bounding.length) state = PROHIBITED;

    // step 6: windows on top of the base
    let inside = false;
    let permitted = false;
    for (const parsed of windowed) {
      const results = windowsOf(parsed).map((w) => windowApplies(w, t0, cal));
      if (results.some((r) => r === null)) unknown = true;
      if (results.some((r) => r === true)) {
        inside = true;
        conds = conds.concat(conditionsOf(parsed));
        // A duration limit that carries a window applies ONLY inside that window.
        duration = durationMinutes(parsed) ?? duration;
        // Under a prohibiting sign, falling inside the window is the prohibition.
        if (scoped && !parsed.permits_parking) state = PROHIBITED;
        // Only a BOUNDING plate grants the permission: a fee window that happens to
        // fall outside the bounds does not open hours the sign never opened.
        if (bounding.includes(parsed)) permitted = true;
      }
    }

    if (bounding.length) {
      state = permitted ? ALLOWED : PROHIBITED;
      if (!permitted) { conds = []; note = OUTSIDE_PERMITTED_HOURS; }
    }

    // Time taken by a plate addressed to someone else is not "remaining" time.
    if (!inside) {
      for (const parsed of occupied) {
        if (windowsOf(parsed).some((w) => windowApplies(w, t0, cal) === true)) {
          inside = true;
          // The fee is named only for "the remaining time", so about this hour the
          // sign told everyone else nothing. That is not "free".
          if (shifted.length) note = FEE_PERIOD_ELSEWHERE;
          break;
        }
      }
    }

    // the complement: the base, or whatever the shift token named
    if (!inside) {
      for (const parsed of shifted) {
        // `Övrig tid` alone means the whole remainder. Followed by hours of its own it
        // means "at other times, NAMELY THESE" - the window narrows the shift instead
        // of describing it (decision 161, photograph `125`). Read the other way, a
        // weekday evening became payable without a single figure on the sign saying so.
        const own = windowsOf(parsed);
        if (own.length) {
          const results = own.map((w) => windowApplies(w, t0, cal));
          if (results.some((r) => r === null)) unknown = true;
          if (!results.some((r) => r === true)) continue;
        }
        // A yellow `Övrig tid` with a no-parking symbol closes the rest of the time
        // (photograph `095`, decision 183). Read only for permission, it was dropped
        // and the night came out as free parking.
        if (parsed.prohibition) {
          state = PROHIBITED;
          conds = [];
          continue;
        }
        conds = conds.concat(conditionsOf(parsed));
        // A plate may restore permission by itself (photograph `019`).
        if (parsed.permits_parking) state = ALLOWED;
        duration = durationMinutes(parsed) ?? duration;
      }
    } else {
      for (const parsed of windowed) {
        if (parsed.permits_parking
            && windowsOf(parsed).some((w) => windowApplies(w, t0, cal) === true)) {
          state = ALLOWED;
        }
      }
    }

    // step 7: a prohibition overrides permission
    for (const parsed of prohibitions) {
      const results = windowsOf(parsed).map((w) => windowApplies(w, t0, cal));
      if (results.some((r) => r === null)) unknown = true;
      if (results.some((r) => r === true)) {
        state = PROHIBITED;
        conds = [];
      }
    }

    // The gap a lapsed prohibition leaves. Filled only where the sign was READ: that
    // is settled by the completeness, which refuses the answer whole before it reaches
    // the screen, not by guessing here.
    if (scoped && state === NOT_STATED) {
      state = onPriorityRoad ? PROHIBITED : ALLOWED;
      conds = [];
      if (note === null) note = onPriorityRoad ? PRIORITY_ROAD_GAP : GENERAL_RULE_GAP;
    }

    if (unknown && state !== PROHIBITED) {
      state = UNCERTAIN;
      if (!uncertainties.includes("day_class_unknown")) {
        uncertainties.push("day_class_unknown");
      }
    }

    raw.push({ start: t0, end: t1, state, conditions: sortedUnique(conds),
               maxDurationMinutes: duration, note });
  }

  // merge neighbours that say the same thing
  const merged: Period[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && sameAs(last, p) && minutes(last.end) === minutes(p.start)) {
      last.end = p.end;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

// --- the 24-hour rule ------------------------------------------------------

/** GUARANTEED CONTINUITY: the driver is owed a full 24 hours in a row, and if a
 *  weekend cuts them short the counter resets and starts afresh on the nearest
 *  working day (decision 82).
 *
 *  - Monday 13:00 -> Tuesday 13:00.
 *  - Friday 13:00 -> Tuesday 00:00: only 11 hours remain until Saturday, not 24.
 *  - Saturday or Sunday at any hour -> Tuesday 00:00. */
export function twentyFourHourExpiry(start: Naive, cal: Calendar): Naive | null {
  const startDate = dateOf(start);
  if (!cal.covers(startDate)) return null;

  if (!cal.isWorkingDay(startDate)) {
    const next = cal.nextWorkingDay(startDate);
    return next === null ? null : clockAdd(midnight(next), DAY_MINUTES);
  }

  // The day is a real one: on the night the clocks change, its end shifts by an hour.
  const end = clockAdd(start, DAY_MINUTES);
  const endDate = dateOf(end);
  let day = startDate;
  while (compare(day, endDate) <= 0) {
    if (!cal.covers(day)) return null;
    // A non-working day INSIDE the 24 hours cuts them short.
    if (!cal.isWorkingDay(day) && minutes(midnight(day)) < minutes(end)) {
      const next = cal.nextWorkingDay(day);
      return next === null ? null : clockAdd(midnight(next), DAY_MINUTES);
    }
    day = addDays(day, 1);
  }
  return end;
}

// --- the way in ------------------------------------------------------------

export function evaluateParkingRules(sign: SignDoc, moment: Naive,
                                     cal: Calendar): Evaluation {
  const main = sign.main_sign;
  const uncertainties: string[] = [];

  if (WAYFINDING.has(main.type)) {
    return { regimes: [], uncertainties: [], permitsParking: false,
             note: "wayfinding_sign_permits_nothing" };
  }

  const baseState = BASE_PROHIBITED.has(main.type) ? PROHIBITED : ALLOWED;
  const onPriorityRoad = (sign.panels ?? []).some(
    (p) => p.kind === "other_sign" && p.parsed?.road_sign === "priority_road");
  if (main.type === "unknown") uncertainties.push("main_sign_unknown");
  if (!cal.covers(dateOf(moment))) uncertainties.push("date_outside_calendar");

  // Two things divide a sign, and they divide it independently: an arrow gives a
  // stretch, a pictogram carrying a condition gives an audience.
  const regimes: Regime[] = [];
  for (const [extent, panels] of splitByArrows(sign.panels ?? [])) {
    for (const [audience, excluded, group] of splitByVehicle(panels)) {
      const others = panels.filter((p) => !group.includes(p));
      regimes.push(buildRegime(extent, group, baseState, moment, cal, uncertainties,
                               audience, excluded, others, onPriorityRoad));
    }
  }
  // The regimes are built from the same plates, so the caveats repeat.
  return { regimes, uncertainties: [...new Set(uncertainties)],
           permitsParking: true, note: null };
}

// Stage 4 of the pipeline: laying the reading out in a form fit to be shown. A port
// of `parkread/present.py`.
//
// NO RULES ARE COMPUTED HERE - the engine and the completeness grading have already
// done that; here their results are sorted into the blocks of the screen.
//
// **The wording is taken from the reference, not invented.** A key such as `avgift`
// is replaced by the ready-made string of its entry. A key the reference does not
// have is passed through as it is - by the principle that whatever is not in the
// whitelist is shown verbatim and not interpreted.
//
// Every caption about the meaning of a sign lives here rather than in the markup:
// the front end invents not one phrase, so a forbidden wording is caught by a single
// test and cannot seep through the layout.

import { Calendar, EVE, RED } from "./calendar";
import { isoDate, isoNaive, type Civil, type Naive, addDays } from "./civil";
import { realMinutes, switchBetween } from "./clock";
import { FULL, INSUFFICIENT, PARTIAL, type Assessment } from "./completeness";
import { ALLOWED, EVEN_SIDE_ONLY, FEE_PERIOD_ELSEWHERE, GENERAL_RULE_GAP, NOT_STATED,
         ODD_SIDE_ONLY, OUTSIDE_PERMITTED_HOURS, PRIORITY_ROAD_GAP, PROHIBITED,
         horizonEnd,
         type Evaluation, type Period, type Regime } from "./engine";
import { carriesRule, countsTowardsRules, get as refGet, type Recognised } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

export const CONTRACT = 7;

export const STATE_TEXT: Record<string, string> = {
  allowed: "The sign permits parking during this period",
  prohibited: "The sign is a no-parking sign for this period",
  uncertain: "The sign's conditions for this period could not be read in full",
  // Everything was read, and we know the sign says nothing about this time: its
  // prohibition is bounded by a window, and it grants no permission.
  not_stated: "The sign's restriction does not cover this period, and the sign "
            + "states nothing else about it",
};

// A stretch is an internal token and must never be shown to a person: "here" tells
// nothing to someone standing in front of the sign.
export const EXTENT_SHORT: Record<string, string> = {
  here: "Here at the sign",
  left: "To the left of the sign",
  right: "To the right of the sign",
  ahead: "Ahead of the sign",
  behind: "Up to the sign",
  both_sides: "Both sides of the sign",
  both_directions: "Both ahead of the sign and up to it",
};

export const EXTENT_TEXT: Record<string, string> = {
  here: "The sign carries no arrow, so it covers the spaces here, at the sign",
  left: "The sign's arrow points left: it covers the stretch to the left of the sign",
  right: "The sign's arrow points right: it covers the stretch to the right of the sign",
  ahead: "The sign's arrow points ahead: it covers the stretch forward from the sign",
  behind: "The sign's arrow points back: it covers the stretch up to the sign, not past it",
  both_sides: "The sign's arrows point left and right: it covers the stretch "
            + "on both sides of the sign, along the street",
  both_directions: "The sign's arrows point up and down: it covers the stretch "
                 + "both ahead of the sign and up to it",
};

// "Free parking" is a special case. The product's vocabulary forbids that wording:
// it promises free parking where a disc or a ticket may still be required. Where the
// product has established that there are NO conditions at all, it is more exact than
// a long phrase - and it is permitted in exactly that case.
export const PERIOD_HEADLINE: Record<string, string> = {
  paid: "Parking fee",
  free: "Free parking",
  free_with_conditions: "No fee stated for this period",
  prohibited: "No parking",
  uncertain: "Conditions could not be read in full",
  not_stated: "Nothing stated on the sign",
};

// Who a window is addressed to. The noun comes from here rather than from the
// reference: there the entry reads "Buses only" - a statement about the sign -
// whereas here a name is needed.
export const AUDIENCE_NOUN: Record<string, string> = {
  "pictogram-bus": "buses",
  "pictogram-truck": "lorries",
  "pictogram-motorcycle": "motorcycles",
  "pictogram-electric-car": "electric cars",
  "pictogram-bicycle": "bicycles and class II mopeds",
  "bil-personbil": "cars",
  taxi: "taxis",
};

export const STAY_END_REASON: Record<string, string> = {
  plate: "the limit stated on the sign",
  "24h_default": "general 24-hour rule, not written on the sign",
  prohibition: "the sign prohibits parking from this moment",
};

export const STAY_END_TEXT: Record<string, string> = {
  plate: "This stay must end here — the limit stated on the sign",
  prohibition: "This stay must end here — the sign prohibits parking from this moment",
  "24h_default": "This stay must end here — general 24-hour rule, not written on the sign",
};

// Whether the answer says a second sign post was left unread. Off until the flag is
// measured (decision 172): a warning wrong on most of the screens that carry it teaches
// the reader to ignore warnings.
export const SHOW_ANOTHER_POST = false;

// The threshold was calibrated by measurement over the set of photographs, not chosen.
export const GOOD_ENOUGH = 0.9;

export function toneOf(category: string, confidence: number): string {
  if (category === "insufficient" || category === "not_a_parking_sign") return "bad";
  if (category === "full" && confidence >= GOOD_ENOUGH) return "good";
  return "caution";
}

export const CATEGORY_TEXT: Record<string, string> = {
  full: "Every plate on the sign was read",
  partial: "Part of the sign was not read; what follows is incomplete",
  insufficient: "Too little of the sign was read to say what it states",
  not_a_parking_sign: "This photograph does not show a parking sign",
};

// The wording explains the CONSEQUENCE, not the machinery: the user does not know
// the reading takes two calls to the model, and does not need to.
export const REASON_TEXT: Record<string, string> = {
  main_sign_unknown: "The sign at the top of the pole could not be identified",
  main_sign_unreadable: "The sign at the top of the pole could not be read",
  "triage:other_road_sign": "The photograph shows a road sign, but not one about parking",
  // Triage has no label of its own for a sign too far away to read, so such a photograph
  // is filed with those that show no sign at all (`074`, `076`, `080`-`082`). The words
  // must be true of both: "no road sign at all" was said of photographs full of signs.
  "triage:not_a_sign": "No parking sign in this photograph can be read: there is none, "
                     + "or it is too far away or too small",
  schema_invalid: "The sign could not be read into a form the service can work "
                + "with, so there is nothing here to go on",
  panel_count_disagreement: "Confidence is lower: it is not certain where one "
                          + "plate ends and the next begins",
  day_class_unknown: "Confidence is lower: whether this date counts as a public "
                   + "holiday could not be established",
  text_exceeds_the_pixels: "The photograph is too small to carry all the text "
                         + "reported on the sign, so some of it may not have "
                         + "been read from the plates at all",
  main_sign_uncorroborated: "No plate on this sign states a parking rule, so the "
                          + "reading rests on the symbol at the top of the pole "
                          + "alone — a sign pointing the way to a car park "
                          + "elsewhere looks much the same",
};

export const NOTE_TEXT: Record<string, string> = {
  wayfinding_sign_permits_nothing:
    "This sign points the way to parking; it does not itself designate spaces",
};

export const UNCERTAINTY_TEXT: Record<string, string> = {
  day_class_unknown: "Whether this date counts as a public holiday could not be "
                   + "established, and the sign's hours depend on it",
  date_outside_calendar: "Whether this date counts as a public holiday could not "
                       + "be established, and the sign's hours depend on it",
  main_sign_unknown: "The sign at the top of the pole could not be identified",
  "24h_expiry_outside_calendar": "When the 24-hour limit would run out could not be "
                               + "worked out this far ahead",
  another_post_not_read: "Another sign post is in this photograph and was not read - "
                       + "only one post is read at a time, so photograph the other "
                       + "separately",
};

export type Explained = { token: string; text: string };

/** A token becomes a pair of token and text. The measurement needs the token, the
 *  person needs the text. */
export function explain(token: string, table: Record<string, string>): Explained {
  if (token.startsWith("uninterpreted_plates:")) {
    const which = token.slice("uninterpreted_plates:".length);
    const many = which.includes(",");
    return { token, text: "Confidence is lower: " + (many
      ? `plates ${which} state something the service does not know`
      : `plate ${which} states something the service does not know`) };
  }
  if (token.startsWith("unread_panels:")) {
    const which = token.slice("unread_panels:".length);
    return { token, text: `Plates ${which} on the sign could not be read` };
  }
  // With no caption, NOTHING reaches the screen: an internal word on the page would
  // be seen by everyone, and a test catches the missing line.
  return { token, text: table[token] ?? "" };
}

// Captions for a plate that was not understood. There are three kinds, and they must
// not be confused.
const NOT_INTERPRETED: Record<string, string> = {
  shown_above: "Not interpreted — shown above exactly as printed",
  symbol: "A symbol here that the service does not know — it may narrow "
        + "who these spaces are for",
};

export function notInterpreted(keys: string[], leftovers: string[] | null): string | null {
  if (leftovers === null) return null;
  if (leftovers.length) {
    return keys.length ? "Not interpreted: " + leftovers.join("; ")
                       : NOT_INTERPRETED.shown_above;
  }
  return NOT_INTERPRETED.symbol;
}

export type Term = { key: string; text: string; known: boolean };

/** A reference key becomes a pair ready to show. An unknown key is not invented. */
function term(key: string): Term {
  const entry = refGet(key);
  if (entry === null) return { key, text: key, known: false };
  return { key, text: entry.en, known: true };
}

const EXCEPTION_PREFIX = "The sign names an exception: ";

/** The short caption from the reference - for places where the long phrase will not
 *  fit. */
function shortTerm(key: string, exception = false): Term {
  const entry = refGet(key);
  if (entry === null) return { key, text: key, known: false };
  const text = entry.short || entry.en;
  return { key, text: exception ? EXCEPTION_PREFIX + text : text, known: true };
}

const dateOf = (t: Naive): Civil => ({ y: t.y, m: t.m, d: t.d });
const sameMoment = (a: Naive, b: Naive) => isoNaive(a) === isoNaive(b);

/** Join neighbouring periods that look identical on screen: two identical bands in a
 *  row read as a fault, and what separates them is already said by the end of the
 *  stay. */
function joinAlike(periods: Period[]): Period[] {
  const out: Period[] = [];
  for (const p of periods) {
    const prev = out[out.length - 1];
    if (prev && sameMoment(prev.end, p.start) && prev.state === p.state
        && prev.conditions.join("|") === p.conditions.join("|")) {
      out[out.length - 1] = { ...prev, end: p.end };
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/** The timeline is about what the sign SAYS of a moment. Silence is not drawn on it:
 *  ask about a silent moment and there is no timeline at all; silence in the tail
 *  meant "Window ends" after a prohibition promised a window the sign never gave. */
function stated(periods: Period[]): Period[] {
  if (periods.length && periods[0].state === NOT_STATED) return [];
  let out = periods;
  while (out.length && out[out.length - 1].state === NOT_STATED) out = out.slice(0, -1);
  return out;
}

/** How much of the timeline to show: with a limit on the stay it ends there; without
 *  one, it runs to the first change of state inclusive. */
export function visible(r: Regime): Period[] {
  const periods = r.periods;
  if (!periods.length) return periods;

  if (r.durationExpiresAt) {
    const limit = isoNaive(r.durationExpiresAt);
    const out: Period[] = [];
    for (const p of periods) {
      if (isoNaive(p.start) >= limit) break;
      out.push(isoNaive(p.end) <= limit ? p : { ...p, end: r.durationExpiresAt });
    }
    return stated(joinAlike(out.length ? out : periods.slice(0, 1)));
  }

  const first = periods[0].state;
  for (let i = 0; i < periods.length; i += 1) {
    if (periods[i].state !== first) return stated(joinAlike(periods.slice(0, i + 1)));
  }
  return stated(joinAlike(periods));
}

// The class of the day, as a line under the date. The caption appears where a day is
// NAMED: on a holiday and on the eve before one. Ordinary Sundays and Saturdays do
// not get it - "Red day: Sunday" under the line "Sunday, 13 September" repeats what
// is already written.
function holidayLabel(cal: Calendar, d: Civil): string | null {
  const sv = cal.holidayName(d);
  if (!sv) return null;
  const en = cal.holidayNameEn(d);
  return en ? `${sv} (${en})` : sv;
}

export type DayNote = { text: string; kind: string };

function dayNote(cal: Calendar, d: Civil): DayNote | null {
  const day = cal.dayClass(d);
  if (day === RED) {
    const name = holidayLabel(cal, d);
    return name ? { text: `Red day: ${name}`, kind: "red" } : null;
  }
  if (day === EVE) {
    // "Eve of", not "the day before a red one: name": after a colon the name read as
    // the name of TODAY, though the holiday is tomorrow.
    const name = holidayLabel(cal, addDays(d, 1));
    return name ? { text: `Eve of ${name}`, kind: "eve" } : null;
  }
  return null;
}

export function periodTone(p: Period): string {
  if (p.state === "prohibited") return "prohibited";
  if (p.state === "not_stated") return "not_stated";
  if (p.state === "uncertain") return "uncertain";
  return p.conditions.includes("avgift") ? "paid" : "free";
}

/** "Free parking" only when there are no conditions at all, and only when the sign
 *  has spoken about this time (photograph `049`). */
export function headline(p: Period, tone: string): string {
  if (tone === "free" && (p.conditions.length || p.note === FEE_PERIOD_ELSEWHERE)) {
    return PERIOD_HEADLINE.free_with_conditions;
  }
  return PERIOD_HEADLINE[tone];
}

function periodView(p: Period, horizon: Naive, cal: Calendar, stayEnd: string,
                    reason: string, certain: boolean, aside: Term[],
                    restricted = false): Record<string, unknown> {
  const tone = periodTone(p);
  return {
    start: isoNaive(p.start),
    end: isoNaive(p.end),
    // The class of the day at both ends of the period: the nodes of the timeline
    // show exactly those.
    start_day: dayNote(cal, dateOf(p.start)),
    end_day: dayNote(cal, dateOf(p.end)),
    state: p.state,
    state_text: STATE_TEXT[p.state] ?? p.state,
    tone,
    headline: headline(p, tone),
    // Real elapsed time, not marks on a dial: the night the clocks change lasts 23
    // or 25 hours.
    minutes: realMinutes(p.start, p.end),
    // The fee is already named by the period's headline; below it goes what is added
    // to it.
    notes: p.conditions.filter((c) => c !== "avgift").map(term),
    // A period running into the end of the horizon ends with nothing: the sign does
    // not change at that moment, and a date there would be the product's invention.
    ends_at_horizon: isoNaive(p.end) >= isoNaive(horizon),
    stay_end_text: stayEnd,
    stay_end_reason: reason,
    conditions: p.conditions.map(term),
    max_duration_minutes: p.maxDurationMinutes,
    note: p.note,
    certain,
    // The window holds for a named circle only, not for whoever is reading. The
    // timeline draws it broken for that reason - a solid line answers "you may park
    // here", and to a driver who is not a taxi that answer is false (photograph
    // `071`). Kept apart from `certain`, which says something else entirely: there
    // the product does not vouch for the rule, here it vouches for it and the rule
    // is simply not addressed to everyone.
    restricted,
    aside,
  };
}

// An explanation of the hole in the stack: the fee is named for "other times", and
// the boundary of those times is set by a plate addressed to a different kind of
// vehicle (photograph `049`).
function feeElsewhereTerm(excluded: string[]): Term {
  const nouns = excluded.map((k) => AUDIENCE_NOUN[k]).filter(Boolean);
  const addressed = nouns.join(", ") || "another kind of vehicle";
  return {
    key: "fee-period-elsewhere",
    known: true,
    text: `The fee plate applies to “other times”; the period it refers `
        + `to is written on a plate addressed to ${addressed}`,
  };
}

const UNKNOWN_PLATE_TERM: Term = {
  key: "unknown-plate",
  known: false,
  text: "One plate could not be interpreted; it may narrow who these spaces are for",
};

// A prohibition WITH HOURS is not the same as a prohibition always (photograph
// `019`). "Does not prohibit" is not "permits": outside the hours it names, the sign
// is simply silent.
export const TIMED_PROHIBITION_TEXT: Record<string, string> = {
  "main-prohibition-parking":
    "The sign prohibits parking only during the hours it names — outside "
    + "them the general parking rules apply",
  "main-prohibition-stopping":
    "The sign prohibits stopping and parking only during the hours it names "
    + "— outside them the general parking rules apply",
  "main-zone-prohibition":
    "Inside the area the sign marks, parking is prohibited only during the "
    + "hours it names — outside them the general parking rules apply",
};

const RENTED = "forhyrda-platser";
export const PRIVATE_LAND = "privat-parkering";

export const NOT_READ_RELIABLY =
  "This plate could not be read reliably, so its words are not shown.";

const NO_WINDOW_RENTED =
  "The sign sets no parking window here: these spaces are rented, and how "
  + "long a rented space may be used follows from its rental, not from this sign.";

export const NO_WINDOW_NOTHING_STATED =
  "The sign restricts parking only at the times written on its plate. About "
  + "parking here at other times the sign states nothing: the general rules of "
  + "the road apply, and they are not on this sign.";

export const NO_WINDOW_TOO_LITTLE_READ =
  "Too little of this sign was read to say when parking is allowed here. No "
  + "window is shown rather than a guess: photograph the sign again, closer, or "
  + "read it yourself.";

// A note about the clocks changing. There is deliberately no date in the text: the
// change may fall on the coming night or on the Sunday after. The hours, by
// contrast, are fixed.
export const CLOCK_CHANGE_TEXT: Record<string, string> = {
  back: "The clocks go back on the night shown here: at 03:00 they return to "
      + "02:00, so that night is an hour longer. The times shown already allow for it.",
  forward: "The clocks go forward on the night shown here: at 02:00 they jump to "
         + "03:00, so that night is an hour shorter. The times shown already allow for it.",
};

function clockChange(periods: Period[]): string | null {
  if (!periods.length) return null;
  const side = switchBetween(periods[0].start, periods[periods.length - 1].end);
  return side ? CLOCK_CHANGE_TEXT[side] : null;
}

/** Is there any point drawing a timeline - or would its content mislead? */
function noWindow(r: Regime, circle: Term[]): string | null {
  // No periods at all means the reading was refused (see `applyAsymmetry`). The card
  // must still say something: an empty space where the window stood reads as an
  // oversight rather than as an answer.
  if (!r.periods.length) return NO_WINDOW_TOO_LITTLE_READ;
  // The sign is silent about the moment ASKED - that is enough: between "now" and
  // the prohibition it permits nothing, and drawing a window there would be
  // promising something of our own.
  if (r.periods.length && r.periods[0].state === NOT_STATED) {
    return NO_WINDOW_NOTHING_STATED;
  }
  // Photograph `020`: "Free parking, 28 h max" under a sign for rented spaces - the
  // number comes entirely from the 24-hour rule, not from the sign.
  if (!circle.some((t) => t.key === RENTED)) return null;
  if (r.periods.some((p) => p.state !== ALLOWED)) return null;
  if (r.durationSource !== "24h_default") return null;
  return NO_WINDOW_RENTED;
}

/** The caption of the main sign: a prohibition for the whole time and a prohibition
 *  from 7 to 18 are different statements, and the second without its caveat reads as
 *  the first. */
function mainTerm(r: Regime, mainKey: string): Term {
  const base = term(mainKey);
  const timed = TIMED_PROHIBITION_TEXT[mainKey];
  if (timed && r.periods.some((p) => p.state === ALLOWED)) return { ...base, text: timed };
  return base;
}

/** Plates that NARROW who may park. Ones that merely add (`Boende`) do not belong
 *  here. */
function narrowing(r: Regime): string[] {
  return r.eligibility.filter((k) => {
    const e = refGet(k);
    return e !== null && countsTowardsRules(e);
  });
}

function audienceShort(r: Regime): string | null {
  if (r.audience) {
    const noun = AUDIENCE_NOUN[r.audience];
    return noun ? noun[0].toUpperCase() + noun.slice(1) : null;
  }
  if (r.audienceExcluded.length) {
    const nouns = r.audienceExcluded.map((k) => AUDIENCE_NOUN[k]).filter(Boolean);
    if (nouns.length) return "All vehicles except " + nouns.join(", ");
  }
  return null;
}

/** Who may park: the sign's general rule first, if nobody narrowed it.
 *
 *  A plate that was not understood must be named here - the asymmetry rule: on an
 *  incomplete reading one may narrow, but not widen. */
export function whoCanPark(r: Regime, mainKey: string | null, unknownPlates: boolean,
                    privateLand: boolean): Term[] {
  const narrow = narrowing(r);
  const extra = r.eligibility.filter((k) => !narrow.includes(k));

  let caveat: Term[] = unknownPlates ? [{ ...UNKNOWN_PLATE_TERM }] : [];
  // The caveat about private land comes AFTER the sign's general rule, not instead
  // of it: a `P` sign really does permit parking, but the owner's conditions are not
  // on the pole.
  if (privateLand) caveat = [...caveat, term(PRIVATE_LAND)];
  if (narrow.length) return [...narrow, ...extra].map(term).concat(caveat);
  const head = mainKey ? [mainTerm(r, mainKey)] : [];
  return [...head, ...extra.map(term), ...caveat];
}

export function regimeView(r: Regime, horizon: Naive, cal: Calendar,
                           mainKey: string | null = null, unknownPlates = false,
                           privateLand = false, certain = true): Record<string, any> {
  // Under a blue `P` a plate narrows the permission; under a prohibition it
  // introduces an exception.
  const prohibiting = Boolean(mainKey) && (mainKey as string).includes("prohibition");
  const wantedState = prohibiting ? PROHIBITED : ALLOWED;

  const shown = visible(r);
  // An instruction spelled out BY THE HOUR is not the audience of the window: there
  // it has already been said, and said more precisely - with the hours it applies to
  // (photograph `012`).
  const spelledByHour = new Set(r.periods.flatMap((p) => p.conditions));
  let windowFor = narrowing(r).filter((k) => !spelledByHour.has(k))
                              .map((k) => shortTerm(k, prohibiting));
  // Private land is not who may park but a caveat to the whole window.
  if (privateLand) windowFor = [...windowFor, shortTerm(PRIVATE_LAND)];
  const plainNotes = r.eligibility
    .filter((k) => { const e = refGet(k); return e !== null && !countsTowardsRules(e); })
    .map(term);

  const expiresIso = r.durationExpiresAt ? isoNaive(r.durationExpiresAt) : null;

  return {
    extent: r.extent,
    extent_text: EXTENT_TEXT[r.extent] ?? r.extent,
    extent_short: EXTENT_SHORT[r.extent] ?? r.extent,
    audience: r.audience,
    audience_short: audienceShort(r),
    eligibility: r.eligibility.map(term),
    who_can_park: whoCanPark(r, mainKey, unknownPlates, privateLand),
    notes: plainNotes,
    window_for: windowFor,
    no_window_text: noWindow(r, [...windowFor, ...plainNotes]),
    clock_change_text: clockChange(shown),
    place_notes: r.placeNotes.map(term),
    duration_expires_at: expiresIso,
    duration_source: r.durationSource,
    periods: shown.map((p) => {
      const last = expiresIso !== null && isoNaive(p.end) === expiresIso;
      const aside = [...(p.state === wantedState ? windowFor : []), ...plainNotes]
        .filter((t) => !p.conditions.includes(t.key));
      if (p.note === FEE_PERIOD_ELSEWHERE) aside.push(feeElsewhereTerm(r.audienceExcluded));
      // Where the window does not come from the sign, the reader is told so: a green
      // line that the pole never promised has to say whose promise it is.
      if (p.note === GENERAL_RULE_GAP) {
        aside.push({ key: GENERAL_RULE_GAP, known: true,
                     text: "The sign says nothing about this time, so the general road "
                         + "rules apply - among them the 24-hour limit. That rule is "
                         + "not written on this sign." });
      }
      if (p.note === OUTSIDE_PERMITTED_HOURS) {
        aside.push({ key: OUTSIDE_PERMITTED_HOURS, known: true,
                     text: "The sign names the hours when parking is permitted, and "
                         + "this time is not among them." });
      }
      if (p.note === PRIORITY_ROAD_GAP) {
        aside.push({ key: PRIORITY_ROAD_GAP, known: true,
                     text: "The sign says nothing about this time, and this is a "
                         + "priority road: parking there needs a sign that permits it." });
      }
      // The product cannot tell which side of the street the car is on, so the
      // prohibition is applied - and the side it belongs to is named.
      if (p.note === EVEN_SIDE_ONLY || p.note === ODD_SIDE_ONLY) {
        const side = p.note === EVEN_SIDE_ONLY ? "even" : "odd";
        aside.push({ key: p.note, known: true,
                     text: `This prohibition holds only on the side of the street with `
                         + `${side} house numbers.` });
      }
      return periodView(p, horizon, cal,
                        last ? STAY_END_TEXT[r.durationSource ?? ""] ?? "" : "",
                        last ? STAY_END_REASON[r.durationSource ?? ""] ?? "" : "",
                        certain && !privateLand, aside,
                        p.state === wantedState && windowFor.length > 0);
    }),
  };
}

// --- the block "what the service saw" ---------------------------------------
//
// The block shows not a retelling but the READING: what exactly was read and what
// that field is called. The order is fixed here rather than assembled from a
// dictionary.

const PANEL_ORDER = ["index", "kind", "background_color", "lines"];
const PARSED_ORDER = [
  "duration_limit", "time_windows", "fee", "payment_method", "permit_required",
  "scope_shift", "eligibility", "vehicle_class", "arrow", "place_count",
  "stretch_metres", "placement", "prohibition", "pictogram", "operator",
  "tariff_code", "area_code", "permits_parking", "uninterpreted",
];

/** A field's value on one line: `2 hours` reads, an object does not. */
function fmt(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.map(fmt).join(", ") : "—";
  if (typeof value === "object") {
    const v = value as Record<string, any>;
    if ("amount" in v && "unit" in v) return `${v.amount} ${v.unit}`;
    if ("from" in v && "to" in v) {
      return `${v.from}–${v.to}` + (v.day_class ? ` (${v.day_class})` : "");
    }
    if ("readable" in v) {
      const out = v.readable ? "readable" : "not readable";
      const obs = v.obstructions ?? [];
      return out + (obs.length ? `; ${obs.join(", ")}` : "");
    }
    return Object.entries(v).filter(([, x]) => x !== null && x !== "")
                 .map(([k, x]) => `${k}: ${x}`).join(", ");
  }
  return String(value);
}

type Field = { name: string; value: string };

function row(name: string, value: unknown): Field | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && !value.length) return null;
  if (typeof value === "object" && !Array.isArray(value)
      && !Object.keys(value as object).length) return null;
  return { name, value: fmt(value) };
}

function mainSignFields(main: Record<string, unknown>): Field[] {
  return ["type", "form", "background_color", "legibility"]
    .map((k) => row(k, main[k])).filter((r): r is Field => r !== null);
}

export function panelFields(panel: Panel, referenceKeys: string[]): Field[] {
  const raw = panel as unknown as Record<string, unknown>;
  const rows: (Field | null)[] = PANEL_ORDER.map((k) => row(k, raw[k]));
  // `lines` is always shown: an empty list here is a fact about the panel.
  if (!(panel.lines ?? []).length) rows.push({ name: "lines", value: "(no text)" });

  const parsed = (panel.parsed ?? {}) as Record<string, unknown>;
  for (const key of PARSED_ORDER) {
    if (key in parsed) rows.push(row(`parsed.${key}`, parsed[key]));
  }
  for (const key of Object.keys(parsed).filter((k) => !PARSED_ORDER.includes(k)).sort()) {
    rows.push(row(`parsed.${key}`, parsed[key]));      // a field outside the schema is not hidden
  }
  rows.push(row("legibility", panel.legibility));
  rows.push(row("reference_keys", referenceKeys));
  return rows.filter((r): r is Field => r !== null);
}

// --- time in a single phrase ------------------------------------------------
//
// The plate `Torsdag 10-14 / Jämna veckor / Augusti-Juni` is ONE instruction, and on
// screen it must be one line.

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

const DAY_PHRASE: Record<string, string> = {
  weekday: "on weekdays",
  eve: "on Saturdays and days before a holiday",
  red: "on Sundays and public holidays",
  all_days: "every day",
  unspecified: "on weekdays",
};

// Reference keys that describe TIME: they go into the shared phrase.
export const TIME_KEYS = new Set(["window-weekday", "window-eve", "window-red", "alla-dagar",
                           "named-weekday", "jamna-veckor", "udda-veckor", "datumintervall"]);

const MONTH_LEN: Record<number, number> = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
                                            7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };

const md = (value: string): [number, number] => {
  const [m, d] = value.split("-");
  return [Number(m), Number(d)];
};

/** A range of dates in human terms: a whole month as a month, a single day as a day. */
export function rangeName(rng: { from: string; to: string }): string {
  const [am, ad] = md(rng.from);
  const [bm, bd] = md(rng.to);
  if (am === bm && ad === bd) return `${ad} ${MONTHS[am]}`;
  const fullEnd = bd >= MONTH_LEN[bm] || (bm === 2 && bd >= 28);
  if (ad === 1 && fullEnd) {
    return am === bm ? MONTHS[am] : `${MONTHS[am]} to ${MONTHS[bm]}`;
  }
  return `${ad} ${MONTHS[am]} to ${bd} ${MONTHS[bm]}`;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/** The dates of a group of windows in one phrase - the way the plate writes them. */
function datesPhrase(windows: TimeWindow[]): string {
  const dates = windows.map((w) => w.dates);
  if (dates.some((d) => d === undefined || d === null)) return "";

  const ranges = dates.flatMap((d) => d!.ranges ?? []);
  const modes = new Set(dates.map((d) => d!.mode));
  if (modes.size !== 1) return "";       // different modes within one group
  const names = ranges.map(rangeName);

  if ([...modes][0] === "except") return "all year except " + joinNames(names);
  if (names.length === 1 && names[0].includes(" to ")) return `from ${names[0]} inclusive`;
  return "in " + joinNames(names);
}

/** What distinguishes windows, apart from their dates. */
const windowKey = (w: TimeWindow) =>
  [w.day_class, w.named_weekday, w.from, w.to, w.week_parity, w.day_of_month,
   w.nth_of_month].join("|");

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];
const ordinal = (n: number): string => ORDINAL[n] ?? `${n}th`;

function windowPhrase(w: TimeWindow, dates: string): string {
  const day = w.day_class;
  const weekdayName = w.named_weekday
    ? w.named_weekday[0].toUpperCase() + w.named_weekday.slice(1) : "";
  // A window that comes round by the calendar says so before anything else: read as
  // "on weekdays", `1:a varje månad` told a reader a monthly ban held every working
  // day (photographs `114`, `120`).
  const part = w.day_of_month !== undefined
    ? `on the ${ordinal(w.day_of_month)} of every month`
    : w.nth_of_month !== undefined && weekdayName
      ? `on the ${ordinal(w.nth_of_month)} ${weekdayName} of every month`
      : day === "named_weekday" && weekdayName
        ? "on " + weekdayName + "s"
        : (DAY_PHRASE[day ?? ""] ?? "on weekdays");

  const out = [`${part} between ${w.from} and ${w.to}`];
  if (w.week_parity) out.push(`in ${w.week_parity} weeks`);
  if (dates) out.push(dates);
  return out.join(", ");
}

/** Windows differing only in their dates merge into one sentence. */
export function timePhrase(parsed: Parsed): string {
  const windows = (parsed.time_windows ?? []).filter((w) => w.from);
  const groups = new Map<string, TimeWindow[]>();
  for (const w of windows) {
    const k = windowKey(w);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(w);
  }
  return [...groups.values()]
    .map((g) => windowPhrase(g[0], datesPhrase(g))).join("; ");
}

type Meaning = { key: string; label: string; code: string; text: string;
                 short: string; continues: boolean };

/** A reference key becomes the plate's official name and what it means. */
function meaning(key: string): Meaning {
  const e = refGet(key);
  if (e === null) {
    return { key, label: key, code: "", text: "", short: "", continues: false };
  }
  return { key, label: e.label || key, code: e.code, text: e.en,
           short: e.short, continues: false };
}

/** Two entries with the same name and code are one line on screen (`Avgift` and
 *  `Taxa 2` both carry the code T16). Their meanings differ, so the short captions
 *  are joined. */
export function merge(items: Meaning[]): Meaning[] {
  const out: Meaning[] = [];
  for (const item of items) {
    const same = out.find((o) => o.label === item.label && o.code === item.code);
    if (!same) {
      out.push({ ...item });
      continue;
    }
    for (const field of ["short", "text"] as const) {
      if (item[field] && !same[field].includes(item[field])) {
        same[field] = same[field] ? `${same[field]}; ${item[field]}` : item[field];
      }
    }
  }
  return out;
}

/** The lines of a plate as one phrase. Swedish plates hyphenate across a line break:
 *  `Beskicknings-` / `fordon` is one word, not two. */
export function joinLines(lines: string[]): string {
  let out = "";
  for (const raw of lines) {
    const part = raw.trim();
    if (!part) continue;
    if (out.endsWith("-")) out = out.slice(0, -1) + part;
    else if (out) out += " " + part;
    else out = part;
  }
  return out;
}

export function panelView(panel: Panel, keys: string[],
                          leftovers: string[] | null = null): Record<string, unknown> {
  const kind = panel.kind;
  const text = joinLines(panel.lines ?? []);

  let meanings: Meaning[];
  if (kind !== "sign_plate") {
    const key = kind === "info_board" ? "info-board"
      : kind === "other_sign"
        ? (panel.parsed?.road_sign === "priority_road" ? "priority-road" : "other-road-sign")
        : "operator-plate";
    const entry = refGet(key);
    meanings = [{ key, label: entry ? entry.label : "Info board", code: "",
                  text: "", short: "", continues: false }];
  } else {
    const parsed = panel.parsed ?? {};
    const phrase = timePhrase(parsed);
    let items = merge(keys.filter((k) => !TIME_KEYS.has(k)).map(meaning));
    if (phrase) {
      // The phrase about time attaches to the instruction it qualifies:
      // "No parking (C35) on Thursdays between 10:00 and 14:00, in even weeks".
      if (items.length) items[0] = { ...items[0], short: phrase, continues: true };
      else items = [{ key: "time-window", label: "Hours", code: "T6",
                      text: "", short: phrase, continues: true }];
    }
    meanings = items;
  }

  return { title: "Panel", text, meanings, carries_rule: carriesRule(keys, leftovers) };
}

export type Sighting = {
  doc: SignDoc | null;
  recognised: Recognised | null;
};

/** A plate whose words are not evidence of anything.
 *
 *  Two ways in. The model may say outright that the plate is illegible; or the whole
 *  reading may have failed the pixel budget, in which case no plate on it is worth
 *  quoting whatever the model believes (decision 156). On `075` and `076` the product
 *  printed `P-tillstand erfordras` off a sign the developer could not read at all -
 *  words invented downstream of a photograph that never carried them. Naming the
 *  plate and refusing to quote it is the honest half of what we know. */
function unreliable(panel: Panel, refused: boolean): boolean {
  return refused || panel.legibility?.readable === false;
}

/** Block 1: what the service saw. ALL panels are shown, including those that state
 *  no rule: they are visible in the photograph, and their absence looks like a loss. */
function whatWeSaw(s: Sighting, refused = false): Record<string, unknown> {
  if (!s.doc) {
    return { main_sign: null, main_sign_fields: [], primary_sign: null, panels: [] };
  }
  const rec = s.recognised;
  const panels = (s.doc.panels ?? []).map((p) => {
    const index = p.index as number;
    const keys = rec ? rec.panelKeys[index] ?? [] : [];
    const leftovers = rec
      ? (index in rec.uninterpreted ? rec.uninterpreted[index] : null)
      : null;
    const bad = unreliable(p, refused);
    return {
      index,
      kind: p.kind,
      lines: bad ? [] : (p.lines ?? []),
      background_color: p.background_color ?? null,
      reference_keys: keys,
      uninterpreted: leftovers ?? [],
      not_interpreted_text: bad ? NOT_READ_RELIABLY : notInterpreted(keys, leftovers),
      fields: panelFields(p, keys),
      ...panelView(p, keys, leftovers),
      // Last word, so it overrides the quote `panelView` built from the same lines.
      ...(bad ? { text: "", unreliable: true } : { unreliable: false }),
    };
  });

  const mk = rec ? rec.mainSignKey : null;
  return {
    main_sign: s.doc.main_sign,
    main_sign_fields: mainSignFields(s.doc.main_sign as unknown as Record<string, unknown>),
    primary_sign: mk ? meaning(mk) : null,
    panels,
  };
}

/** The caption for completeness. `partial` has two causes, and they differ: a sign
 *  with no rule-bearing plate at all was read IN FULL - there was simply nothing to
 *  read. */
function categoryText(a: Assessment): string {
  if (a.category === PARTIAL && a.reasons.length === 1
      && a.reasons[0] === "main_sign_uncorroborated") {
    return "The sign carries no plate stating a parking rule, so what follows "
         + "rests on the symbol at the top of the pole alone";
  }
  return CATEGORY_TEXT[a.category] ?? a.category;
}

function completenessView(a: Assessment): Record<string, unknown> {
  return {
    category: a.category,
    category_text: categoryText(a),
    tone: toneOf(a.category, a.confidence),
    confidence: a.confidence,
    signals: a.signals,
    reasons: a.reasons.map((r) => explain(r, REASON_TEXT)),
    unread_panels: a.unreadPanels,
    may_hide_prohibition: a.mayHideProhibition,
  };
}

function sameWindow(a: Record<string, any>, b: Record<string, any>): boolean {
  return JSON.stringify(a.periods) === JSON.stringify(b.periods)
    && a.duration_expires_at === b.duration_expires_at
    && a.no_window_text === b.no_window_text;
}

/** An audience's window is shown only when it DIFFERS from the shared one. */
export function windows(views: Record<string, any>[]): Record<string, any>[] {
  const shared = new Map<string, Record<string, any>>();
  for (const v of views) if (!v.audience) shared.set(v.extent, v);

  const kept = views.filter((v) => !(v.audience && shared.has(v.extent)
                                     && sameWindow(shared.get(v.extent)!, v)));
  // No audience left on the stretch - then the shared window needs no caption.
  const withAudience = new Set(kept.filter((v) => v.audience).map((v) => v.extent));
  for (const v of kept) {
    if (!v.audience && !withAudience.has(v.extent)) v.audience_short = null;
  }
  return kept;
}

export type Analysis = {
  doc: SignDoc | null;
  recognised: Recognised | null;
  assessment: Assessment;
  evaluation: Evaluation | null;
  stoppedAt?: string | null;
  reason?: string | null;
  flags?: string[];
  triage?: { category: string; what_i_see: string;
             panels_below_main_sign: number | null } | null;
};

/** The complete answer about a photograph. The shape is the same in every outcome:
 *  completeness first, then whatever could be read. A refusal is not a different
 *  shape of answer. */
export function toJson(analysis: Analysis, moment: Naive, cal: Calendar): Record<string, any> {
  const a = analysis.assessment;
  const ev = analysis.evaluation;
  const hasAnswerHere = (a.category === FULL || a.category === PARTIAL) && ev !== null;

  const body: Record<string, any> = {
    contract: CONTRACT,
    moment: isoNaive(moment),
    day_class: cal.dayClass(dateOf(moment)),
    completeness: completenessView(a),
    has_answer: hasAnswerHere,
    what_we_saw: whatWeSaw({ doc: analysis.doc, recognised: analysis.recognised },
                           a.category === INSUFFICIENT),
    stopped_at: analysis.stoppedAt ?? null,
    reason: analysis.reason ?? null,
    flags: analysis.flags ?? [],
    triage: analysis.triage ?? null,
    regimes: [],
    uncertainties: [],
    permits_parking: null,
  };

  if (ev !== null) {
    const mainKey = analysis.recognised ? analysis.recognised.mainSignKey : null;
    // A plate that was not understood is a property of the whole reading, not of a
    // stretch: which stretch it belongs to is exactly what we do not know.
    const unknownPlates = a.uninterpretedPlates.length > 0;
    // Private land is a property of the site, not of a stretch.
    const privateLand = analysis.recognised !== null
      && Object.values(analysis.recognised.panelKeys).some((ks) => ks.includes(PRIVATE_LAND));
    // What the product can vouch for: on an incomplete reading, not one period.
    const certain = a.category === FULL;
    body.regimes = windows(ev.regimes.map(
      (r) => regimeView(r, horizonEnd(moment), cal, mainKey, unknownPlates,
                        privateLand, certain)));
    body.uncertainties = ev.uncertainties.map((u) => explain(u, UNCERTAINTY_TEXT));
    // One post is read per photograph (AGENTS.md section 8). With a second one in the
    // frame, the answer is meant to say it covers only one (decision 160, photograph
    // `096`). Held back for now: on the first live run the model set the flag on 18 of
    // 127 photographs, most with no second post to speak of. The flag is still saved;
    // the line returns once step 15g measures it against ground truth (decision 172).
    if (SHOW_ANOTHER_POST && analysis.doc?.another_post_in_frame) {
      body.uncertainties.push(explain("another_post_not_read", UNCERTAINTY_TEXT));
    }
    body.permits_parking = ev.permitsParking;
    if (ev.note) body.note = explain(ev.note, NOTE_TEXT);
  }
  return body;
}

export { isoDate };

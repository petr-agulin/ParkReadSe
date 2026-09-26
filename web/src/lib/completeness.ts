// How complete the reading is, and what the answer may say. Ported from
// `parkread/completeness.py`, line for line.
//
// The gap this module closes: confidence as a single number gives two outcomes -
// an answer or a refusal. Reality is richer: most often part of the sign was read
// and part was not, and it is exactly that case which has to be served.
//
// THE CATEGORY IS SET BY WHAT IS MISSING, not by how strongly the code doubts
// itself. The confidence number works inside the category, not instead of it.
//
// The governing rule of a partial reading is NARROWING IS ALLOWED, WIDENING IS NOT.
// An unread panel may be a prohibition. An error towards narrowing costs the user
// some extra caution; an error towards widening costs a tow.

import { ALLOWED, UNCERTAIN, type Evaluation } from "./engine";
import type { Panel, Parsed, SignDoc } from "./sign";

export const NOT_A_PARKING_SIGN = "not_a_parking_sign";
export const FULL = "full";
export const PARTIAL = "partial";
export const INSUFFICIENT = "insufficient";

// notes placed on periods
export const MAY_PROHIBIT = "unread_panel_may_prohibit";
export const MAY_BE_INCOMPLETE = "conditions_may_be_incomplete";

export type Assessment = {
  category: string;
  confidence: number;
  signals: Record<string, number>;
  reasons: string[];
  unreadPanels: number[];
  mayHideProhibition: boolean;
  uninterpretedPlates: number[];
};

export function hasAnswer(a: Assessment): boolean {
  return a.category === FULL || a.category === PARTIAL;
}

// The weights were calibrated by measurement (`npm run measure`). Six of the eleven
// signals never once changed across the set, and together they weigh 0.55 - but
// their weight must not be redistributed: they are constant because the set holds no
// photograph where the main sign is unreadable or the day is unclear. `schema_valid`
// is constant for a different reason: a reading that fails the schema never reaches
// the formula at all, which is why its weight is zero.
export const WEIGHTS: Record<string, number> = {
  schema_valid: 0.0,
  main_sign_identified: 0.15,
  main_sign_readable: 0.10,
  panels_read_share: 0.20,
  // Reading a plate's text and understanding it are different things
  // (`Beskickningsfordon` was read with 98% confidence: the text was captured, the
  // meaning unknown).
  plates_interpreted: 0.10,
  panel_count_agreement: 0.10,
  // What corroborates that the sign was read correctly, other than itself: a plate
  // stating a RULE is independent corroboration, an arrow is not (photograph `050`).
  main_sign_corroborated: 0.10,
  // Whether the frame held enough pixels for the text claimed. The product measures
  // this ITSELF: how many pixels a photograph has is a fact, not an opinion.
  text_fits_the_pixels: 0.10,
  no_repairs_needed: 0.05,
  day_class_known: 0.05,
  model_confidence: 0.05,
};

// Area of frame per printed character, below which a reading is implausible. The
// number comes from the measurement: the three most crowded photographs of the set
// are exactly the three whose answer disagreed with the reference.
export const PIXELS_PER_CHARACTER = 1000;

// Below this share the reading stops being full: more text is claimed than the frame
// can hold.
export const TEXT_PLAUSIBLE_ENOUGH = 0.5;

const parsedOf = (p: Panel): Parsed => p.parsed ?? {};
const platesOf = (doc: SignDoc): Panel[] =>
  (doc.panels ?? []).filter((p) => p.kind === "sign_plate");

/** How far the claimed text fits into the photograph's pixels. An unknown size, or
 *  no text claimed, gives one: there is nothing to penalise. */
function textFits(sign: SignDoc, imagePixels: number | null): number {
  if (!imagePixels) return 1.0;
  const chars = platesOf(sign)
    .reduce((sum, p) => sum + (p.lines ?? []).join("").length, 0);
  if (!chars) return 1.0;
  return Math.min(1.0, imagePixels / (chars * PIXELS_PER_CHARACTER));
}

/** A panel counts as unread if the model said outright that it is illegible, or if
 *  it carries neither text nor a single parsed field. */
function unreadPanels(panels: Panel[]): Panel[] {
  return panels.filter((p) => {
    if (p.kind !== "sign_plate") return false;
    const unreadable = !(p.legibility?.readable ?? true);
    const empty = !(p.lines ?? []).length && Object.keys(parsedOf(p)).length === 0;
    return unreadable || empty;
  });
}

// Fields that speak of the RULE of parking: how long, for whom, when, at what price.
export const RULE_KEYS = new Set([
  "fee", "tariff_code", "payment_method", "duration_limit", "time_windows",
  "eligibility", "vehicle_class", "permit_required", "prohibition",
  "scope_shift", "permits_parking",
]);

// Fields that speak only of PLACE: where, how many metres, how many spaces, how to
// stand. They qualify a rule but do not themselves witness that one exists: an arrow
// on a sign pointing to a car park looks exactly the same. They take no part in the
// count - the list holds the boundary, and a test keeps any of them from reaching
// `RULE_KEYS`.
export const PLACEMENT_KEYS = new Set([
  "arrow", "placement", "stretch_metres", "place_count", "pictogram",
]);

/** Is there any plate corroborating that the sign really is about parking HERE?
 *
 *  Without such plates the whole answer rests on the single field `main_sign.type` -
 *  one reading of one picture, with nothing to set against it (photograph `050`). */
function corroborated(plates: Panel[]): boolean {
  return plates.some((p) => Object.keys(parsedOf(p)).some((k) => RULE_KEYS.has(k)));
}

/** Could an unread panel turn out to be a prohibition? In Sweden prohibiting signs
 *  are yellow; an unreadable colour is the worst case, and it counts too. */
function mayProhibit(panel: Panel): boolean {
  const color = panel.background_color;
  return color === "yellow" || color === "unreadable" || color === "other"
      || color === null || color === undefined;
}

/** Was so little read that there is nothing to speak of? The condition lives here so
 *  the pipeline can ask it BEFORE computing completeness in full.
 *
 *  One sign plate the model calls illegible is enough (decision 183, replacing the
 *  partial answer of decision 30 for this case). A plate nobody read names no rule,
 *  so nothing says it does not matter - and a single red line can turn a whole plate
 *  round on a Sunday (photograph `095`). A payment board or another road sign does
 *  not count: they are known by their look. A plate that merely came back empty is
 *  still weighed by the share: it may be a symbol the model did not name. */
export function tooLittle(sign: SignDoc): boolean {
  const main = sign.main_sign;
  const plates = platesOf(sign);
  const unread = unreadPanels(sign.panels ?? []);
  const readShare = plates.length ? (plates.length - unread.length) / plates.length : 1.0;
  return main.type === "unknown"
      || !(main.legibility?.readable ?? true)
      || plates.some((p) => !(p.legibility?.readable ?? true))
      || readShare < 0.5;
}

export type GradeOptions = {
  triageCategory?: string;
  schemaValid?: boolean;
  flags?: string[];
  repairs?: string[];
  evaluation?: Evaluation | null;
  imagePixels?: number | null;
};

/** The category and the confidence, from what stages 0-1 and the engine returned. */
export function grade(sign: SignDoc | null, options: GradeOptions = {}): Assessment {
  const { triageCategory = "parking_sign", schemaValid = true,
          flags = [], repairs = [], evaluation = null, imagePixels = null } = options;

  const empty = { signals: {}, reasons: [], unreadPanels: [],
                  mayHideProhibition: false, uninterpretedPlates: [] };

  if (triageCategory !== "parking_sign") {
    return { ...empty, category: NOT_A_PARKING_SIGN, confidence: 1.0,
             reasons: [`triage:${triageCategory}`] };
  }
  if (!schemaValid || sign === null) {
    return { ...empty, category: INSUFFICIENT, confidence: 0.0,
             reasons: ["schema_invalid"] };
  }

  const panels = sign.panels ?? [];
  const plates = platesOf(sign);
  const unread = unreadPanels(panels);
  const unreadIdx = unread.map((p) => p.index as number);
  const hides = unread.some(mayProhibit);

  const main = sign.main_sign;
  const mainOk = main.type !== "unknown";
  const mainReadable = main.legibility?.readable ?? true;
  const disagreement = flags.some((f) => f.startsWith("panel_count_disagreement"));
  // Plates whose text was captured but whose meaning was not found in the reference:
  // for the product that is not "read" but "read and not understood".
  const plateIdx = new Set(plates.map((p) => p.index));
  const uninterpretedIdx = [...new Set(
    flags.filter((f) => f.startsWith("uninterpreted_panels:"))
         .flatMap((f) => f.split(":").slice(1).join(":").split(","))
         .map((n) => n.trim())
         .filter((n) => /^\d+$/.test(n))
         .map(Number))]
    .sort((a, b) => a - b)
    .filter((i) => plateIdx.has(i));

  const readShare = plates.length ? (plates.length - unread.length) / plates.length : 1.0;
  const isCorroborated = corroborated(plates);
  const fits = textFits(sign, imagePixels);
  const dayKnown = !(evaluation
                     && evaluation.uncertainties.includes("date_outside_calendar"));

  const signals: Record<string, number> = {
    schema_valid: 1.0,
    main_sign_identified: mainOk ? 1.0 : 0.0,
    main_sign_readable: mainReadable ? 1.0 : 0.0,
    panels_read_share: readShare,
    plates_interpreted: uninterpretedIdx.length ? 0.0 : 1.0,
    panel_count_agreement: disagreement ? 0.0 : 1.0,
    main_sign_corroborated: isCorroborated ? 1.0 : 0.0,
    text_fits_the_pixels: round(fits, 3),
    no_repairs_needed: repairs.length ? 0.0 : 1.0,
    day_class_known: dayKnown ? 1.0 : 0.0,
    model_confidence: Number(sign.model_confidence ?? 0.5) || 0.5,
  };
  const confidence = round(
    Object.entries(signals).reduce((sum, [k, v]) => sum + WEIGHTS[k] * v, 0), 3);

  // --- the category: it is set by what is missing ---
  const reasons: string[] = [];
  if (!mainOk) reasons.push("main_sign_unknown");
  if (!mainReadable) reasons.push("main_sign_unreadable");
  if (disagreement) reasons.push("panel_count_disagreement");
  if (unreadIdx.length) reasons.push(`unread_panels:${unreadIdx.join(",")}`);
  if (uninterpretedIdx.length) {
    reasons.push(`uninterpreted_plates:${uninterpretedIdx.join(",")}`);
  }
  if (!isCorroborated) reasons.push("main_sign_uncorroborated");
  if (fits < TEXT_PLAUSIBLE_ENOUGH) reasons.push("text_exceeds_the_pixels");
  if (!dayKnown) reasons.push("day_class_unknown");

  // A disagreement in the panel count is a signal, not a verdict: it lowers the
  // confidence and joins the reasons, but it does not take the answer away.
  // Measured over 22 answers: the flag fired 5 times, all five false alarms, and the
  // price of silence is the product's most expensive mistake by its own table of
  // risks.
  let category: string;
  if (tooLittle(sign) || fits < TEXT_PLAUSIBLE_ENOUGH) {
    // The pixel budget is a REFUSAL, not a weight (decision 156). More text is claimed
    // than the frame can carry, so the words on the plates are evidence of nothing -
    // and, unlike the model's own admission of illegibility, this signal does not
    // depend on the model admitting anything at all.
    //
    // Measured over the 57 answered photographs of the set: two fall below the share
    // and both disagree with their ground truth, while every photograph that agrees
    // sits at the top of the scale. The gate refuses nothing that was right.
    category = INSUFFICIENT;
  } else if (unreadIdx.length || uninterpretedIdx.length || !isCorroborated) {
    // A plate that was not understood is precisely PARTIAL: part of the sign never
    // reached the product. A sign without a single rule-bearing plate is PARTIAL too,
    // from the other side: there is nothing to understand, because there is no
    // corroboration. The answer remains either way.
    category = PARTIAL;
  } else {
    category = FULL;
  }

  return { category, confidence, signals, reasons, unreadPanels: unreadIdx,
           mayHideProhibition: hides, uninterpretedPlates: uninterpretedIdx };
}

/** Rounding "the way Python does it": a half goes away from zero.
 *
 *  `Math.round` always moves a half upwards, while Python's `round()` moves it to
 *  the even neighbour, and on `.5` the two disagree. Here agreement matters down to
 *  the digit: the confidence is compared with the 0.9 threshold, and a difference in
 *  the third place changes the colour of a line. */
function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  // Python: banker's rounding exactly on the half.
  if (Math.abs(scaled - Math.trunc(scaled) ) === 0.5) {
    const down = Math.floor(scaled);
    return (down % 2 === 0 ? down : down + 1) / factor;
  }
  return rounded / factor;
}

// --- the asymmetry rule ----------------------------------------------------

/** Narrowing is allowed, widening is not.
 *
 *  On a partial reading the answer has no right to assert what an unread panel could
 *  overturn: if that panel MAY BE A PROHIBITION, no period is presented as
 *  permitting; and if it more likely qualifies a permission, a period with an empty
 *  list of conditions is marked - "at other times there are no restrictions" on an
 *  incomplete reading is a claim founded on the absence of data. */
export function applyAsymmetry(evaluation: Evaluation, assessment: Assessment): Evaluation {
  // Too little was read to speak about time at all. Until now the answer passed
  // through untouched here, so the screen said "too little of the sign was read" and
  // drew a full timeline underneath it - on photographs `074` and `080` a green line
  // promising a day of free parking beneath a sign nobody could read. A refusal that
  // still answers is not a refusal.
  if (assessment.category === INSUFFICIENT) {
    return {
      ...evaluation,
      regimes: evaluation.regimes.map((r) => ({
        ...r, periods: [], durationExpiresAt: null, durationSource: null,
      })),
    };
  }
  if (assessment.category !== PARTIAL) return evaluation;

  const out: Evaluation = {
    ...evaluation,
    uncertainties: [...evaluation.uncertainties],
    regimes: evaluation.regimes.map((r) => ({
      ...r,
      periods: r.periods.map((p) => ({ ...p })),
    })),
  };
  for (const regime of out.regimes) {
    for (const period of regime.periods) {
      if (period.state !== ALLOWED) continue;
      if (assessment.mayHideProhibition) {
        period.state = UNCERTAIN;
        period.note = MAY_PROHIBIT;
      } else if (!period.conditions.length) {
        period.note = MAY_BE_INCOMPLETE;
      }
    }
  }
  if (assessment.mayHideProhibition) out.uncertainties.push(MAY_PROHIBIT);
  return out;
}

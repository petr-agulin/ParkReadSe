// The measurement. Ported from `parkread/accuracy.py`.
//
// TWO DIFFERENT THINGS are measured, and they must not be confused:
//
// - **extraction accuracy** - the fields of the model's reading against the
//   developer's reference reading;
// - **disagreement of the ANSWER** - what a person would read, computed twice: from
//   the reference reading and from the model's.
//
// The 0.9 threshold stands on the second. Fields disagree on nineteen photographs,
// the answer on three: a plate's colour, a stray line break and the order of panels
// are visible in the reading yet never reach the person, and calibrating on them
// would mean tuning a caveat to something the user will not see.
//
// **This is a developer's tool, not part of the product.** It never reaches the
// page: nothing in the application imports it.

import { Calendar } from "./calendar";
import { addMinutes, isoNaive, type Naive } from "./civil";
import { INSUFFICIENT, tooLittle } from "./completeness";
import { evaluateParkingRules, type Evaluation } from "./engine";
import type { Panel, SignDoc, TimeWindow } from "./sign";

const plates = (doc: SignDoc): Panel[] =>
  (doc.panels ?? []).filter((p) => p.kind === "sign_plate");

/** All the text of a plate on one line, without case or extra spaces.
 *
 *  A line break INSIDE a plate has no consequence: the lines of one plate apply
 *  jointly, and how they were broken when printed changes no rule. */
function text(panel: Panel): string {
  return (panel.lines ?? [])
    .filter((x) => x.trim())
    .map((x) => x.split(/\s+/).filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
}

/** What distinguishes a panel from its neighbours: needed to measure ORDER apart
 *  from content. */
function signature(panel: Panel): string {
  const t = text(panel);
  if (t) return t;
  const parsed = panel.parsed ?? {};
  return String(parsed.arrow ?? parsed.pictogram ?? "?");
}

/** Pairs of "the same panel here and there", matched by text. Panels without a pair
 *  stay silent on purpose: their disagreement is already counted in
 *  `panels.content`. */
function* matched(expected: SignDoc, actual: SignDoc): Generator<[Panel, Panel]> {
  const bySig = new Map<string, Panel[]>();
  for (const p of actual.panels ?? []) {
    const key = signature(p);
    if (!bySig.has(key)) bySig.set(key, []);
    bySig.get(key)!.push(p);
  }
  for (const e of expected.panels ?? []) {
    const same = bySig.get(signature(e));
    if (same && same.length) yield [e, same.shift() as Panel];
  }
}

const MONTH_LEN: Record<number, number> = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
                                            7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };
const ALL_DAYS: number[] = [];
for (let m = 1; m <= 12; m += 1) {
  for (let d = 1; d <= MONTH_LEN[m]; d += 1) ALL_DAYS.push(m * 100 + d);
}

/** The set of days on which a window applies.
 *
 *  `Augusti-Juni` gets written two ways - "only from 1 August to 30 June" and
 *  "except July" - and it is ONE AND THE SAME rule. Comparing the records literally
 *  would measure the form of writing rather than what was read. */
export function coveredDays(dates: NonNullable<TimeWindow["dates"]>): number[] {
  const hit = new Set<number>();
  for (const rng of dates.ranges ?? []) {
    const [sm, sd] = rng.from.split("-").map(Number);
    const [em, ed] = rng.to.split("-").map(Number);
    const start = sm * 100 + sd;
    const end = em * 100 + ed;
    for (const day of ALL_DAYS) {
      const inside = start <= end ? start <= day && day <= end
                                  : day >= start || day <= end;
      if (inside) hit.add(day);
    }
  }
  const kept = dates.mode === "only" ? [...hit] : ALL_DAYS.filter((d) => !hit.has(d));
  return kept.sort((a, b) => a - b);
}

/** Windows brought to a comparable form: dates as a set of days, the rest as it is. */
function normaliseWindows(value: TimeWindow[] | undefined): unknown[] {
  return (value ?? []).map((w) => {
    const out: Record<string, unknown> = { ...w };
    if (w.dates) out.dates = coveredDays(w.dates);
    return out;
  });
}

/** A value the way Python prints it (`repr`): single quotes, `True`, `None`. The
 *  measurement is read by a person, and its output was compared with Python's line
 *  by line - so values had to be written the same way. */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") {
    return QUOTE + value.split(QUOTE).join(ESCAPED) + QUOTE;
  }
  if (Array.isArray(value)) return "[" + value.map(pyRepr).join(", ") + "]";
  if (typeof value === "object") {
    const body = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => pyRepr(k) + ": " + pyRepr(v)).join(", ");
    return "{" + body + "}";
  }
  return String(value);
}

const QUOTE = "'";
const ESCAPED = "\\'";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Field = { name: string; hits: number; total: number };

export type Report = {
  fields: Map<string, Field>;
  photos: number;
  mistakes: string[];
};

export const emptyReport = (): Report => ({ fields: new Map(), photos: 0, mistakes: [] });

function add(rep: Report, name: string, ok: boolean, note = ""): void {
  const field = rep.fields.get(name) ?? { name, hits: 0, total: 0 };
  field.total += 1;
  if (ok) field.hits += 1;
  rep.fields.set(name, field);
  if (!ok && note) rep.mistakes.push(note);
}

const PARSED_FIELDS = ["duration_limit", "time_windows", "fee", "permit_required",
                       "scope_shift", "eligibility", "vehicle_class", "arrow",
                       "place_count", "stretch_metres", "placement", "prohibition",
                       "payment_method", "permits_parking"] as const;

/** Extraction accuracy: the fields of the model's reading against the developer's
 *  reference reading. */
export function compare(expected: SignDoc, actual: SignDoc, label: string,
                        rep: Report): void {
  rep.photos += 1;

  const me: any = expected.main_sign;
  const ma: any = actual.main_sign;
  add(rep, "main_sign.type", me.type === ma.type,
      `${label}: main sign ${ma.type} instead of ${me.type}`);
  add(rep, "main_sign.background_color", me.background_color === ma.background_color,
      `${label}: sign colour ${ma.background_color} instead of ${me.background_color}`);
  add(rep, "main_sign.form", me.form === ma.form,
      `${label}: sign form ${ma.form} instead of ${me.form}`);

  const pe = plates(expected);
  const pa = plates(actual);
  add(rep, "panel_count", pe.length === pa.length,
      `${label}: ${pa.length} plates instead of ${pe.length}`);

  const sigE = pe.map(signature);
  const sigA = pa.map(signature);
  add(rep, "panels.content", same([...sigE].sort(), [...sigA].sort()),
      `${label}: the content of the plates disagrees`);
  // Order is measured SEPARATELY: the rule depends on it.
  add(rep, "panels.order", same(sigE, sigA),
      `${label}: plate order ${pyRepr(sigA)} instead of ${pyRepr(sigE)}`);

  // Whether a panel carries a rule is the only thing here with a consequence:
  // taking a rule-bearing plate for a non-rule one means losing an instruction.
  for (const [e, a] of matched(expected, actual)) {
    add(rep, "panel.rule_bearing",
        (e.kind === "sign_plate") === (a.kind === "sign_plate"),
        `${label}: panel ${a.index} marked ${a.kind} instead of ${e.kind}`
        + " - this changes which rules apply");
  }

  // phrase-by-phrase comparison only where the lengths matched
  for (let i = 0; i < Math.min(pe.length, pa.length); i += 1) {
    const e = pe[i];
    const a = pa[i];
    add(rep, "panel.lines", text(e) === text(a),
        `${label}: panel ${a.index} read as ${pyRepr(a.lines)}`
        + ` instead of ${pyRepr(e.lines)}`);
    add(rep, "panel.background_color", e.background_color === a.background_color);
    const ep: any = e.parsed ?? {};
    const ap: any = a.parsed ?? {};
    for (const key of PARSED_FIELDS) {
      if (key in ep || key in ap) {
        let want: unknown = ep[key];
        let got: unknown = ap[key];
        if (key === "time_windows") {
          want = normaliseWindows(want as TimeWindow[] | undefined);
          got = normaliseWindows(got as TimeWindow[] | undefined);
        }
        add(rep, `parsed.${key}`, same(want, got),
            `${label}: panel ${a.index} field ${key} = ${pyRepr(ap[key])}`
            + ` instead of ${pyRepr(ep[key])}`);
      }
    }
  }
}

export function table(rep: Report): string {
  const rows = ["| Field | Matched | Total | Accuracy |", "|---|---|---|---|"];
  for (const name of [...rep.fields.keys()].sort()) {
    const f = rep.fields.get(name)!;
    const share = f.total ? Math.round((f.hits / f.total) * 100) : 0;
    rows.push(`| \`${name}\` | ${f.hits} | ${f.total} | ${share}% |`);
  }
  return `Photographs measured: ${rep.photos}\n\n` + rows.join("\n");
}

// --- triage -----------------------------------------------------------------

export type TriageReport = {
  realSigns: number;
  falseRejects: number;
  falseRejectShare: number;
  /** Parking signs nobody can read (decision 176): turning them away is right. */
  unreadableSigns: number;
  unreadableTurnedAway: number;
  junkFrames: number;
  junkLetThrough: number;
  junkLetThroughShare: number;
};

/** The share of false rejects - the most expensive mistake of stage 0: a person
 *  stands at a sign and gets nothing. Rubbish let through is counted separately: it
 *  costs an extra call rather than an answer. */
export function triageReport(expectedIsParking: Record<string, boolean>,
                             triage: Record<string, string>,
                             unreadable: Set<string> = new Set()): TriageReport {
  const names = Object.keys(expectedIsParking).filter((k) => k in triage);
  // A sign nobody can read is a parking sign, but turning it away is the right answer,
  // not a false reject: counted as one, the five far-off signs of the set read as five
  // mistakes of the triage (decision 189, the same gap as in the readings).
  const unreadableHere = names.filter((k) => expectedIsParking[k] && unreadable.has(k));
  const real = names.filter((k) => expectedIsParking[k] && !unreadable.has(k));
  const junk = names.filter((k) => !expectedIsParking[k]);
  const falseRejects = real.filter((k) => triage[k] !== "parking_sign").length;
  const letThrough = junk.filter((k) => triage[k] === "parking_sign").length;
  return {
    realSigns: real.length,
    falseRejects,
    falseRejectShare: real.length ? falseRejects / real.length : 0,
    unreadableSigns: unreadableHere.length,
    unreadableTurnedAway: unreadableHere.filter((k) => triage[k] !== "parking_sign").length,
    junkFrames: junk.length,
    junkLetThrough: letThrough,
    junkLetThroughShare: junk.length ? letThrough / junk.length : 0,
  };
}

// --- calibrating the threshold ----------------------------------------------

export const HORIZON_HOURS = 24 * 7;

/** The state AND the conditions at this hour: to a person that is one message. */
function stateAt(ev: Evaluation, moment: Naive): [string, string[]] {
  const m = isoNaive(moment);
  for (const regime of ev.regimes) {
    for (const period of regime.periods) {
      if (isoNaive(period.start) <= m && m < isoNaive(period.end)) {
        return [period.state, period.conditions];
      }
    }
  }
  return ["unknown", []];
}

export type Verdict = {
  permitsParking: boolean;
  eligibility: string[];
  states: [string, string[]][];
};

/** The answer about a sign in a comparable form: whether one may stand here, who the
 *  spaces are for, and what happens in each hour of the week ahead. */
export function verdictSlice(doc: SignDoc, moment: Naive, cal: Calendar): Verdict {
  const ev = evaluateParkingRules(doc, moment, cal);
  const states: [string, string[]][] = [];
  for (let h = 0; h < HORIZON_HOURS; h += 1) {
    states.push(stateAt(ev, addMinutes(moment, h * 60)));
  }
  return {
    permitsParking: ev.permitsParking,
    eligibility: ev.regimes.flatMap((r) => r.eligibility).sort(),
    states,
  };
}

export const REFUSAL_DUE = "answered where the reference expects a refusal";

/** Whether an answer agrees with its reference - the one place that decides it.
 *
 *  Where the reference itself shows too little can be read - a plate or the main
 *  sign nobody can make out - the only right answer is a refusal (decision 183), and
 *  a refusal agrees whatever hours either side would draw; any other answer differs
 *  (decision 189). On `085` the product refused as it should and the comparison of
 *  hours called it wrong; on `090` it answered in full over a plate hidden behind a
 *  car and the comparison called it right. Everywhere else the verdicts are compared.
 *  `category` is the answer's own grade; `actual` is the reading as shown. */
export function divergence(expected: SignDoc, actual: SignDoc, category: string,
                           moment: Naive, cal: Calendar): string[] {
  if (tooLittle(expected)) return category === INSUFFICIENT ? [] : [REFUSAL_DUE];
  return verdictDifferences(verdictSlice(expected, moment, cal),
                            verdictSlice(actual, moment, cal));
}

/** How the answer from the reading differs from the answer from the reference.
 *
 *  Hours where the reading is WIDER than the reference are counted separately: an
 *  error in that direction costs the user a tow, in the other direction only extra
 *  caution. */
export function verdictDifferences(expected: Verdict, actual: Verdict): string[] {
  const out: string[] = [];
  if (expected.permitsParking !== actual.permitsParking) {
    out.push(`parking here: ${pyBool(actual.permitsParking)} instead of `
           + `${pyBool(expected.permitsParking)}`);
  }
  if (!same(expected.eligibility, actual.eligibility)) {
    out.push(`who may park: ${pyList(actual.eligibility)} instead of `
           + `${pyList(expected.eligibility)}`);
  }
  const pairs = expected.states.map((e, i) => [e, actual.states[i]] as const);
  // State and conditions are kept apart on purpose: "forbidden instead of allowed"
  // and "a fee on the wrong days" are mistakes of different cost.
  const byState = pairs.filter(([e, a]) => e[0] !== a[0]);
  if (byState.length) {
    const wider = byState.filter(([, a]) => a[0] === "allowed").length;
    out.push(`hours differing by state ${byState.length}/${pairs.length},`
           + ` of which wider ${wider}`);
  }
  const byCond = pairs.filter(([e, a]) => e[0] === a[0] && !same(e[1], a[1]));
  if (byCond.length) {
    const examples = [...new Set(byCond.map(([e, a]) =>
      (a[1].join(", ") || "-") + " instead of " + (e[1].join(", ") || "-")))].sort();
    out.push(`hours differing by conditions ${byCond.length}/${pairs.length}: `
           + examples.slice(0, 2).join("; "));
  }
  return out;
}

const pyBool = (v: boolean) => pyRepr(v);
const pyList = (v: string[]) => (v.length ? pyRepr(v) : "-");

export type ThresholdRow = { confidence: number; category: string; diverged: boolean;
                             label: string };

/** How many disagreeing answers each threshold catches, and at what cost. */
export function thresholdTable(rows: ThresholdRow[],
                               thresholds = [0.85, 0.875, 0.9, 0.92, 0.95]): string {
  const lines = ["| Threshold | Flagged | Of those diverged | Passed as full | Of those diverged |",
                 "|---|---|---|---|---|"];
  for (const t of thresholds) {
    const flagged = rows.filter((r) => r.confidence < t || r.category !== "full");
    const passed = rows.filter((r) => r.confidence >= t && r.category === "full");
    lines.push(`| ${t.toFixed(3)} | ${flagged.length} | `
             + `${flagged.filter((r) => r.diverged).length} | ${passed.length} | `
             + `${passed.filter((r) => r.diverged).length} |`);
  }
  return lines.join("\n");
}

/** Signals that never once changed across the set.
 *
 *  The conclusion is NOT "drop the weight": a signal can be constant because the set
 *  holds no photograph that would have moved it. */
export function deadSignals(seen: Map<string, Set<number>>): string[] {
  return [...seen.entries()].filter(([, v]) => v.size <= 1)
                            .map(([k]) => k).sort();
}

/** The prompt's fingerprint: an answer obtained with a DIFFERENT question does not
 *  enter the measurement. */
export async function fingerprint(prompt: string): Promise<string> {
  const bytes = new TextEncoder().encode(prompt);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

// The reference answers of the double run: TypeScript computes and rewrites them.
//
// Python used to compute them (`cli.py parity --write`) and the browser only checked
// itself against them. Python is gone, so the command lives here. The reference
// answers are regenerated deliberately, never as a side effect.
//
//     npm run goldens            - are the reference answers current
//     npm run goldens:write      - rewrite them
//
// Rewriting is a SEPARATE command rather than a side effect of a run: when the
// product's answer changes, that shows up as a line in `git diff` instead of being
// guessed at. Otherwise the reference answers get rewritten one day to "make it
// green", and the disagreement disappears along with the red.
//
// Since the Python side was retired, the comparison is a TypeScript-against-itself
// regression snapshot: it still catches an answer that changed by accident, but it
// is no longer evidence of agreement between two implementations. That evidence is
// the Python-era content of `parity/`, which stays recoverable from git history.
//
// **No photographs here, and there must never be any** - only readings.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Calendar, SELECTABLE_FROM, SELECTABLE_TO, holidays } from "../src/lib/calendar";
import { addDays, addMinutes, isoNaive, parseNaive } from "../src/lib/civil";
import { add, autumnBack, offset, realMinutes, springForward,
         switchBetween } from "../src/lib/clock";
import { applyAsymmetry, grade } from "../src/lib/completeness";
import { evaluateParkingRules, type Period, type Regime } from "../src/lib/engine";
import { compare, divergence, emptyReport, fingerprint, thresholdTable,
         type ThresholdRow } from "../src/lib/measure";
import { toJson } from "../src/lib/present";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { recognise, recognitionFlags } from "../src/lib/reference";
import { valid } from "../src/lib/schema";
import { SIGN_SCHEMA } from "../src/lib/schema.data";
import type { SignDoc } from "../src/lib/sign";
import { ok as resultOk, sign as validateSign } from "../src/lib/validation";
import { asShown, photoPixels } from "./testset";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DIR = `${ROOT}parity/`;

/** The layers of the port, bottom upwards. The order here is the order they moved. */
export const LAYERS = ["calendar", "clock", "engine", "reference", "completeness",
                       "present", "schema", "validation", "prompts", "measure"];

// The shared moment is the same Monday the measurement stands on: an ordinary
// working day outside holidays, where nothing has landed on anything.
export const BASE_MOMENT = "2026-03-02T00:00";

// The awkward moments. Each was chosen because something real once broke on it, and
// each is named - otherwise the list becomes a set of numbers with no reason.
export const SPECIAL = [
  { label: "eve", moment: "2026-10-30T14:00",
    why: "the eve of Alla helgons dag: the hours in brackets apply" },
  { label: "red", moment: "2026-12-25T10:00",
    why: "Juldagen: a red day, and the next day is red too" },
  { label: "dst-back", moment: "2026-10-24T20:00",
    why: "the night the clocks go back: the day lasts 25 hours" },
  { label: "dst-forward", moment: "2027-03-27T20:00",
    why: "the night the clocks go forward: the day lasts 23 hours" },
  { label: "season-edge", moment: "2026-09-30T23:30",
    why: "the last half hour of the 1/4-30/9 season" },
  { label: "midnight", moment: "2026-06-10T00:00",
    why: "midnight: the edge of the day, where segments were being cut" },
];

// The readings on which the awkward moments change something. Running the whole set
// at every moment would be pointless: the reference answers would swell and say
// nothing new.
export const SPECIAL_DOCS = [
  "005-2tim-8-18-parentes-8-15-dubbelpil",      // weekday and eve windows
  "019-forbud-7-18-avgift-ovrig-tid",           // a prohibition with a window and "ovrig tid"
  "026-zon-e-boende",                           // a zone sign
  "038-scandic-buss-besokande-pil",             // a pictogram on a plate of its own
  "049-moped-sasong-avgift-tva-taxor",          // audience, season, "ovrig tid"
  "064-motorcykel-tisd-9-17-beskuren",          // audience and a named weekday
];

export type Case = { id: string; doc: string; moment: string };

const stem = (f: string) => f.replace(/\.[^.]+$/, "");
const round6 = (v: number) => Number(v.toFixed(6));

// --- JSON the way Python wrote it -------------------------------------------
//
// The reference answers were written by `json.dumps(..., ensure_ascii=False,
// indent=1)`, and the move had to reproduce it to the byte. Strings, integers,
// indentation and key order agree between JS and Python on their own. ONE thing
// differs: Python distinguishes a float from an integer and writes `1.0`, while
// `JSON.stringify` writes `1` - and there are three and a half thousand such
// numbers in the reference answers.
//
// So floatness is declared by field name rather than guessed from the value:
// `confidence`, everything inside `signals`, and the first column of the
// measurement rows. Everything else in the reference answers is an integer. This is
// checked by rewriting rather than promised: let one number differ, and `git diff`
// stops being empty.

type Mode = "plain" | "float" | "signals" | "rows" | "row";

function modeFor(key: string): Mode {
  if (key === "confidence") return "float";
  if (key === "signals") return "signals";
  if (key === "rows") return "rows";
  return "plain";
}

function number(value: number, asFloat: boolean): string {
  if (!Number.isFinite(value)) throw new Error(`will not serialise: ${value}`);
  return asFloat && Number.isInteger(value) ? `${value}.0` : String(value);
}

function dump(value: unknown, level: number, mode: Mode): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return number(value, mode === "float");
  if (typeof value === "string") return JSON.stringify(value);

  const pad = " ".repeat(level + 1);
  const close = " ".repeat(level);

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((item, i) => {
      // A measurement row is `[confidence, category, diverged, photograph]`.
      const inner: Mode = mode === "rows" ? "row"
                        : mode === "row" ? (i === 0 ? "float" : "plain")
                        : "plain";
      return pad + dump(item, level + 1, inner);
    });
    return `[\n${items.join(",\n")}\n${close}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  const items = entries.map(([key, item]) =>
    pad + JSON.stringify(key) + ": "
        + dump(item, level + 1, mode === "signals" ? "float" : modeFor(key)));
  return `{\n${items.join(",\n")}\n${close}}`;
}

/** A value as Python would have written it, with a trailing newline. */
export function pyDump(value: unknown): string {
  return dump(value, 0, "plain") + "\n";
}

// --- the readings the comparison runs on ------------------------------------

/** Every reading of the set: the model's answers from `testset/answers/` and the developer's
 *  reference readings.
 *
 *  Both kinds on purpose: the model's answers contain merged panels and odd fields
 *  that a tidy reference reading never has, and the port must behave the same on
 *  both. */
export function documents(): Record<string, SignDoc> {
  const out: Record<string, SignDoc> = {};
  for (const file of readdirSync(`${ROOT}testset/answers`).filter((f) => f.endsWith(".extract.json")).sort()) {
    const doc = JSON.parse(readFileSync(`${ROOT}testset/answers/${file}`, "utf-8")).response;
    if (doc && typeof doc === "object" && doc.main_sign) {
      out[`answers/${file.slice(0, -".extract.json".length)}`] = doc;
    }
  }
  for (const file of readdirSync(`${ROOT}testset/expected`).filter((f) => f.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(`${ROOT}testset/expected/${file}`, "utf-8"));
    if (doc && typeof doc === "object" && doc.main_sign) out[`expected/${stem(file)}`] = doc;
  }
  return out;
}

/** The cases: every reading at the shared moment, plus the awkward moments on the
 *  readings where they change something. */
export function buildCases(docs = documents()): Case[] {
  const cases: Case[] = Object.keys(docs)
    .map((name) => ({ id: `${name}@base`, doc: name, moment: BASE_MOMENT }));
  for (const special of SPECIAL) {
    for (const name of SPECIAL_DOCS) {
      for (const full of [`answers/${name}`, `expected/${name}`]) {
        if (full in docs) {
          cases.push({ id: `${full}@${special.label}`, doc: full, moment: special.moment });
        }
      }
    }
  }
  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- recipes for breaking a reading -----------------------------------------

export type Mutation = { label: string; op: string; path: string[]; value?: unknown };

/** Breakages for checking the SCHEMA: the document must stop being valid. */
export const MUTATIONS: Mutation[] = [
  { label: "as it is", op: "keep", path: [] },
  { label: "no main_sign", op: "delete", path: ["main_sign"] },
  { label: "sign type outside the enumeration", op: "set",
    path: ["main_sign", "type"], value: "no-such-sign" },
  { label: "panel_count as a string", op: "set", path: ["panel_count"], value: "three" },
  { label: "extra field at the root", op: "set", path: ["new_field"], value: 1 },
  { label: "negative panel_count", op: "set", path: ["panel_count"], value: -1 },
  { label: "a different schema version", op: "set", path: ["schema_version"], value: 2 },
  { label: "panel has no kind", op: "delete", path: ["panels", "0", "kind"] },
  { label: "time not in the required form", op: "set",
    path: ["panels", "0", "parsed", "time_windows"],
    value: [{ from: "eight", to: "18:00" }] },
  { label: "extra field in a panel", op: "set",
    path: ["panels", "0", "odd_field"], value: true },
  { label: "panel colour outside the enumeration", op: "set",
    path: ["panels", "0", "background_color"], value: "grey" },
];

/** Damage that wakes the REPAIRS. The fixtures are already repaired: on a clean set
 *  the repairs never fire once, and there would be nothing to compare. */
export const DAMAGE: Mutation[] = [
  { label: "as it is", op: "keep", path: [] },
  { label: "duplicate of the main sign", op: "append", path: ["panels"],
    value: { index: 99, kind: "sign_plate", lines: [], background_color: "blue",
             legibility: { readable: true }, parsed: { pictogram: "parking" } } },
  { label: "an empty line in a panel", op: "append",
    path: ["panels", "0", "lines"], value: "  " },
  { label: "a knocked-out panel index", op: "set",
    path: ["panels", "0", "index"], value: 7 },
  { label: "panel_count does not add up", op: "set", path: ["panel_count"], value: 99 },
  { label: "a value outside the enumeration", op: "set",
    path: ["panels", "0", "parsed", "payment_method"], value: "mobile" },
  { label: "panel colour outside the enumeration", op: "set",
    path: ["panels", "0", "background_color"], value: "grey" },
  { label: "sign colour outside the enumeration", op: "set",
    path: ["main_sign", "background_color"], value: "grey" },
];

/** A recipe applied to a copy of the reading. The path is by key; a number in the
 *  path is an index. */
export function applyMutation(doc: unknown, mutation: Mutation): unknown {
  const out = JSON.parse(JSON.stringify(doc));
  if (mutation.op === "keep") return out;
  let node: any = out;
  const path = mutation.path;
  for (const part of path.slice(0, -1)) {
    node = Array.isArray(node) ? node[Number(part)] : node[part];
    if (node === undefined || node === null) return out;
  }
  const last = path[path.length - 1];
  const key: any = Array.isArray(node) ? Number(last) : last;
  if (mutation.op === "delete") {
    if (Array.isArray(node)) node.splice(key, 1);
    else delete node[key];
  } else if (mutation.op === "append") {
    node[key].push(mutation.value);
  } else {
    node[key] = mutation.value;
  }
  return out;
}

// --- the probes, layer by layer ---------------------------------------------
//
// A probe's job is to compute the product's answer on declared inputs. Each probe
// derives those inputs ITSELF: while Python wrote the reference answers they could
// be taken from the reference answer itself, but the command that writes it cannot
// do that - the file would be setting its own exercise.

export function probeCalendar(): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (let year = SELECTABLE_FROM.y; year <= SELECTABLE_TO.y; year += 1) {
    let classes = "";
    for (let d = { y: year, m: 1, d: 1 }; d.y === year; d = addDays(d, 1)) {
      classes += cal.dayClass(d)[0];                 // w | e | r
    }
    out[String(year)] = { classes, holidays: Object.fromEntries([...holidays(year)].sort()) };
  }
  return out;
}

export function probeClock(): Record<string, unknown> {
  const switches: Record<string, unknown> = {};
  for (let year = SELECTABLE_FROM.y; year <= SELECTABLE_TO.y; year += 1) {
    switches[String(year)] = { forward: isoNaive(springForward(year)),
                               back: isoNaive(autumnBack(year)) };
  }
  const moments = ["2026-01-15T12:00", "2026-07-15T12:00", "2026-03-29T01:30",
                   "2026-03-29T02:30", "2026-03-29T03:30", "2026-10-25T02:30",
                   "2026-10-25T03:30", "2026-10-24T20:00", "2027-03-27T20:00"];
  return {
    switches,
    moments: moments.map((moment) => {
      const t = parseNaive(moment);
      return {
        moment,
        offset: offset(t),
        plus_2h: isoNaive(add(t, 120)),
        plus_24h: isoNaive(add(t, 1440)),
        minutes_to_next_day: realMinutes(t, addMinutes(t, 1440)),
        switch_within_8_days: switchBetween(t, addMinutes(t, 8 * 1440)),
      };
    }),
  };
}

export function probeEngine(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
    const ev = evaluateParkingRules(docs[c.doc], parseNaive(c.moment), cal);
    out[c.id] = {
      permits_parking: ev.permitsParking,
      uncertainties: ev.uncertainties,
      note: ev.note,
      regimes: ev.regimes.map((r: Regime) => ({
        extent: r.extent,
        audience: r.audience,
        audience_excluded: r.audienceExcluded,
        eligibility: r.eligibility,
        place_notes: r.placeNotes,
        duration_expires_at: r.durationExpiresAt ? isoNaive(r.durationExpiresAt) : null,
        duration_source: r.durationSource,
        periods: r.periods.map((p: Period) => ({
          start: isoNaive(p.start),
          end: isoNaive(p.end),
          state: p.state,
          conditions: p.conditions,
          max_duration_minutes: p.maxDurationMinutes,
          note: p.note,
        })),
      })),
    };
  }
  return out;
}

export function probePresent(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
    const doc = docs[c.doc];
    const moment = parseNaive(c.moment);
    const ev = evaluateParkingRules(doc, moment, cal);
    // Graded with the flags the live pipeline raises (step 27): without them the
    // snapshot called "full" a reading the phone shows as partial.
    const rec = recognise(doc);
    const a = grade(doc, { flags: recognitionFlags(rec), evaluation: ev });
    out[c.id] = toJson({ doc, recognised: rec, assessment: a,
                         evaluation: applyAsymmetry(ev, a) }, moment, cal);
  }
  return out;
}

export function probeReference(docs: Record<string, SignDoc>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(docs).sort()) {
    const rec = recognise(docs[name]);
    // Python writes object keys as strings, in ascending order of index.
    const byIndex = (o: Record<number, string[]>) => Object.fromEntries(
      Object.entries(o).sort((a, b) => Number(a[0]) - Number(b[0])));
    out[name] = {
      main_sign_key: rec.mainSignKey,
      panel_keys: byIndex(rec.panelKeys),
      uninterpreted: byIndex(rec.uninterpreted),
      missing_keys: rec.missingKeys,
    };
  }
  return out;
}

export function probeCompleteness(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
    const doc = docs[c.doc];
    const ev = evaluateParkingRules(doc, parseNaive(c.moment), cal);
    const a = grade(doc, { flags: recognitionFlags(recognise(doc)), evaluation: ev });
    out[c.id] = {
      category: a.category,
      confidence: round6(a.confidence),
      // Python writes the signals rounded to six places and in alphabetical order.
      // The share of panels read is 2/3, and without rounding the two sides differ
      // at the fifteenth place, where it means nothing.
      signals: Object.fromEntries(
        Object.entries(a.signals).sort().map(([k, v]) => [k, round6(v)])),
      reasons: a.reasons,
      unread_panels: a.unreadPanels,
      may_hide_prohibition: a.mayHideProhibition,
      uninterpreted_plates: a.uninterpretedPlates,
    };
  }
  return out;
}

/** Mutation testing of the schema: the same recipe is applied to the same reading,
 *  and what is compared is the VERDICT - valid or not (decision 124). */
export function probeSchema(docs: Record<string, SignDoc>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(docs).sort().slice(0, 20)) {
    for (const mutation of MUTATIONS) {
      out[`${name}::${mutation.label}`] = valid(applyMutation(docs[name], mutation), SIGN_SCHEMA);
    }
  }
  return out;
}

/** Repairing the model's answer: what was fixed, what was noticed, whether it passed
 *  the schema. The repair notes are compared too: a fix nobody was told about is the
 *  second source of errors. The panel count from triage is not passed in here: it
 *  comes from the model, and the comparison must be reproducible. */
export function probeValidation(docs: Record<string, SignDoc>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(docs).sort().slice(0, 20)) {
    for (const damage of DAMAGE) {
      const res = validateSign(applyMutation(docs[name], damage) as any);
      out[`${name}::${damage.label}`] = {
        ok: resultOk(res), repairs: res.repairs, flags: res.flags, data: res.data,
      };
    }
  }
  return out;
}

/** Both prompts, in full. What is compared is the STRING, not pieces of it: the
 *  prompt's fingerprint holds every saved answer, and a difference of one space
 *  would mean the browser is asking the model a different question. */
export function probePrompts(): Record<string, unknown> {
  return { triage: triagePrompt(), extract: extractPrompt() };
}

/** The measurement numbers: extraction accuracy, disagreements of the answer, the
 *  threshold table. Repeats what `npm run measure` does, on the same inputs. */
export async function probeMeasure(): Promise<Record<string, unknown>> {
  const cal = new Calendar();
  const moment = parseNaive("2026-03-02T00:00");
  const mark = await fingerprint(extractPrompt());

  // Pairs of "reference reading - model answer". An answer obtained with a DIFFERENT
  // prompt does not enter the measurement: otherwise two versions of the question
  // would be mixed into one number.
  const pairs: { label: string; expected: SignDoc; actual: SignDoc }[] = [];
  const excluded: string[] = [];
  for (const file of readdirSync(`${ROOT}testset/expected`).sort()) {
    if (!file.endsWith(".json")) continue;
    const label = file.slice(0, -".json".length);
    const fx = `${ROOT}testset/answers/${label}.extract.json`;
    if (!existsSync(fx)) continue;
    const fixture = JSON.parse(readFileSync(fx, "utf-8"));
    if ((fixture.origin ?? "model") !== "model") continue;
    if (fixture.prompt_fingerprint !== mark) {
      excluded.push(label);
      continue;
    }
    pairs.push({ label,
                 expected: JSON.parse(readFileSync(`${ROOT}testset/expected/${file}`, "utf-8")),
                 actual: fixture.response });
  }

  const rep = emptyReport();
  const diverged: Record<string, string[]> = {};
  for (const { label, expected, actual } of pairs) compare(expected, actual, label, rep);

  // Confidence is computed the way the pipeline computes it: with the extraction
  // flags, the validator's repairs, gaps in the reference and the area of the frame.
  const rows: ThresholdRow[] = [];
  const seenPixels: Record<string, number | null> = {};
  for (const { label, expected, actual } of pairs) {
    const triageFile = `${ROOT}testset/answers/${label}.triage.json`;
    let panelsSeen: number | null = null;
    if (existsSync(triageFile)) {
      const seen = JSON.parse(readFileSync(triageFile, "utf-8"))?.response?.panels_below_main_sign;
      panelsSeen = typeof seen === "number" ? seen : null;
    }

    const res = validateSign(JSON.parse(JSON.stringify(actual)), panelsSeen);
    const doc = resultOk(res) && res.data ? res.data : actual;
    const flags = [...res.flags, ...recognitionFlags(recognise(doc))];

    const imagePixels = photoPixels(label);
    seenPixels[label] = imagePixels;

    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { flags, repairs: res.repairs, evaluation: ev, imagePixels });
    // Whether it agrees is decided in one place, with the answer's own grade: where the
    // reference expects a refusal, a refusal agrees (decision 189).
    const diff = divergence(expected, asShown(actual), a.category, moment, cal);
    if (diff.length) diverged[label] = diff;
    rows.push({ confidence: Number(a.confidence.toFixed(6)), category: a.category,
                diverged: diff.length > 0, label });
  }
  rows.sort((x, y) => (x.confidence - y.confidence) || x.label.localeCompare(y.label));

  return {
    photos: rep.photos,
    fields: Object.fromEntries([...rep.fields.keys()].sort()
      .map((k) => [k, [rep.fields.get(k)!.hits, rep.fields.get(k)!.total]])),
    mistakes: [...rep.mistakes].sort(),
    diverged,
    pixels: seenPixels,
    fingerprint: mark,
    excluded: excluded.sort(),
    rows: rows.map((r) => [r.confidence, r.category, r.diverged, r.label]),
    threshold_table: thresholdTable(rows),
  };
}

/** The probes by layer name - the same names the reference answers use. */
export const PROBES: Record<string, () => Record<string, unknown> | Promise<Record<string, unknown>>> = {
  calendar: () => probeCalendar(),
  clock: () => probeClock(),
  engine: () => { const docs = documents(); return probeEngine(buildCases(docs), docs); },
  reference: () => probeReference(documents()),
  completeness: () => { const docs = documents(); return probeCompleteness(buildCases(docs), docs); },
  present: () => { const docs = documents(); return probePresent(buildCases(docs), docs); },
  schema: () => probeSchema(documents()),
  validation: () => probeValidation(documents()),
  prompts: () => probePrompts(),
  measure: () => probeMeasure(),
};

// --- writing and checking ---------------------------------------------------

/** Every reference answer at once. Computed from the repository, writing nothing. */
export async function golden(): Promise<Record<string, unknown>> {
  const docs = documents();
  const cases = buildCases(docs);
  return {
    cases,
    calendar: probeCalendar(),
    clock: probeClock(),
    engine: probeEngine(cases, docs),
    reference: probeReference(docs),
    schema: probeSchema(docs),
    validation: probeValidation(docs),
    prompts: probePrompts(),
    measure: await probeMeasure(),
    completeness: probeCompleteness(cases, docs),
    present: probePresent(cases, docs),
  };
}

const fileOf = (name: string) => `${DIR}${name}.json`;

/** Which reference answers differ from what the code computes now. Empty means all
 *  of them are current. */
export async function stale(fresh?: Record<string, unknown>): Promise<string[]> {
  const computed = fresh ?? await golden();
  const out: string[] = [];
  for (const name of ["cases", ...LAYERS]) {
    const path = fileOf(name);
    if (!existsSync(path)) out.push(`${name}.json: no such file`);
    else if (readFileSync(path, "utf-8") !== pyDump(computed[name])) {
      out.push(`${name}.json: the product's answer changed`);
    }
  }
  return out;
}

/** Rewrite the reference answers. Returns the files that changed. */
export async function write(): Promise<string[]> {
  const fresh = await golden();
  const changed: string[] = [];
  for (const name of ["cases", ...LAYERS]) {
    const path = fileOf(name);
    const text = pyDump(fresh[name]);
    if (!existsSync(path) || readFileSync(path, "utf-8") !== text) {
      writeFileSync(path, text, "utf-8");
      changed.push(`${name}.json`);
    }
  }
  return changed;
}

async function main(shouldWrite: boolean): Promise<void> {
  if (!shouldWrite) {
    const outdated = await stale();
    if (outdated.length) {
      console.error("the reference answers are out of date:\n  " + outdated.join("\n  "));
      console.error("see the difference: npm test -- parity");
      console.error("rewrite deliberately: npm run goldens:write");
      process.exitCode = 1;
    } else {
      console.log("the reference answers are current");
    }
    return;
  }
  const changed = await write();
  console.log(changed.length ? "rewritten: " + changed.join(", ") : "nothing to rewrite");
}

if (process.argv[1] && process.argv[1].endsWith("goldens.ts")) {
  main(process.argv.includes("--write")).catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exitCode = 1;
  });
}

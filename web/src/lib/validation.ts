// Validating the model's answer. Ported from `parkread/validation.py`.
//
// The schema rejects the shape (`schema.ts`); what is added here is what JSON Schema
// cannot express, and every rule of it comes from a real failure in a real run.
//
// The module's first rule: **the model's own estimate decides nothing**.
// `boundaries.certain` and `model_confidence` are kept as data for the measurement
// and are never used as grounds.
//
// The second rule: **a repair is written down**. A silent fix nobody knows about is
// the second source of errors, so each one joins the list, and the list feeds the
// `no_repairs_needed` confidence signal.

import { PRINTED_HOURS } from "./engine";
import { PRIVATE_LAND_PHRASE } from "./reference";
import { validate } from "./schema";
import { SIGN_SCHEMA, TRIAGE_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";

export class InvalidModelResponse extends Error {}

export type Result = {
  data: SignDoc | null;
  schemaErrors: string[];
  repairs: string[];
  flags: string[];
};

export const ok = (r: Result): boolean =>
  r.data !== null && r.schemaErrors.length === 0;

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

/** The model sometimes wraps its JSON in a markdown fence, sometimes adds a preamble.
 *  Strip what strips; the rest is an honest error. */
export function parseJson(raw: string): Record<string, any> {
  const text = raw.trim();
  const fenced = FENCE.exec(text);
  const body = fenced ? fenced[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* below: an honest error */
      }
    }
  }
  throw new InvalidModelResponse(
    `the answer does not parse as JSON (length ${raw.length} characters)`);
}

/** Fixes made silently, because they are unambiguous. Each one is written down. */
function repairDoc(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const panels = doc.panels;
  if (!Array.isArray(panels)) return done;

  // The main sign is not a plate. On photograph `010` the model wrote `P` both into
  // `main_sign` and as a first, textless panel.
  const kept = panels.filter((p: any) => {
    if (!p || typeof p !== "object") return true;
    const empty = !(p.lines ?? []).length;
    const pict = (p.parsed ?? {}).pictogram;
    if (empty && ["parking", "p", "main_sign"].includes(pict)) {
      done.push(`panel ${p.index} removed: duplicate of the main sign`);
      return false;
    }
    return true;
  });
  if (kept.length !== panels.length) doc.panels = kept;
  const list: any[] = doc.panels;

  // Empty strings are not text. The model returns an arrow panel sometimes as [],
  // sometimes as [""], and the difference reached the measurement as a reading
  // error, though what was read is the same in both: nothing.
  for (const p of list) {
    if (!p || typeof p !== "object" || !Array.isArray(p.lines)) continue;
    const lines = p.lines.filter((s: unknown) => typeof s === "string" && s.trim());
    if (lines.length !== p.lines.length) {
      done.push(`panel ${p.index}: empty lines removed`);
      p.lines = lines;
    }
  }

  // Indices must run consecutively from the top: everything else refers to them.
  list.forEach((p: any, i: number) => {
    const want = i + 1;
    if (p && typeof p === "object" && p.index !== want) {
      done.push(`panel index ${p.index} -> ${want}`);
      p.index = want;
    }
  });

  if (doc.panel_count !== list.length) {
    done.push(`panel_count ${doc.panel_count} -> ${list.length}`);
    doc.panel_count = list.length;
  }
  return done;
}

/** A colour outside the enumeration becomes `other` instead of taking the whole
 *  reading down with it.
 *
 *  Found by a live run on photograph `014`: the model called a panel's background
 *  `grey` - the back of another sign on the same pole, unpainted metal. A strict
 *  check would have rejected a correctly read sign over a shade absent from a list.
 *
 *  Why this may be fixed silently although the field is required: `other` exists in
 *  the enumeration precisely as "none of those listed", so the model's answer does
 *  mean `other`. And the single place where colour has a consequence is
 *  `mayProhibit` in `completeness`, where `other` already counts as a possible
 *  prohibition. The repair falls on the cautious side and cannot turn a prohibition
 *  into permission.
 *
 *  Only a string is fixed. A missing or non-string field is not "a shade absent from
 *  the list" but an absence of an answer, and that must stay visible. */
function fixUnknownColors(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const allowed: string[] = SIGN_SCHEMA.$defs.color.enum;
  const main = doc.main_sign;
  if (main && typeof main === "object") {
    const value = main.background_color;
    if (typeof value === "string" && !allowed.includes(value)) {
      done.push(`main sign colour ${pyRepr(value)} -> 'other' - not in the schema enumeration`);
      main.background_color = "other";
    }
  }
  for (const panel of doc.panels ?? []) {
    if (!panel || typeof panel !== "object") continue;
    const value = panel.background_color;
    if (typeof value === "string" && !allowed.includes(value)) {
      done.push(`panel ${panel.index}: colour ${pyRepr(value)} -> 'other'`
              + " - not in the schema enumeration");
      panel.background_color = "other";
    }
  }
  return done;
}

/** An optional `parsed` field holding a value outside the enumeration is DROPPED
 *  rather than taking the whole reading down. Required fields are not fixed this
 *  way: there is one exception, the colour above, and it is named with its reason.
 *
 *  Found by the measurement: on photograph `009` the model wrote
 *  `payment_method: mobile` when the schema no longer had that value. A strict check
 *  would have rejected a correctly read sign over an optional field. */
function dropUnknownEnums(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const allowed = SIGN_SCHEMA.$defs.parsed.properties as Record<string, any>;
  for (const panel of doc.panels ?? []) {
    const parsed = panel?.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    for (const key of Object.keys(parsed)) {
      const spec = allowed[key];
      if (!spec || !spec.enum) continue;
      if (!spec.enum.includes(parsed[key])) {
        done.push(`panel ${panel.index}: dropped ${key}=`
                + `${pyRepr(parsed[key])} - not in the schema enumeration`);
        delete parsed[key];
      }
    }
  }
  return done;
}

/** An obstruction the schema does not list is dropped instead of taking the whole
 *  reading down.
 *
 *  Found on photograph `063` - at night, in the rain: the model reported `rain` on the
 *  main sign and on both plates, and a correctly shaped reading was refused whole, run
 *  after run. The list has no `other` to fall back on as the colours do; until it has
 *  one (step 15h) the value goes, and the repair is written down, so the reading pays
 *  for it in its "no repairs" signal instead of vanishing.
 *
 *  Only a string is dropped, as with the colours: anything else is not an unlisted
 *  obstruction but a broken answer, and the schema is left to say so. */
function dropUnknownObstructions(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const allowed: string[] = SIGN_SCHEMA.$defs.legibility.properties.obstructions.items.enum;
  const fix = (where: string, legibility: any) => {
    const list = legibility?.obstructions;
    if (!Array.isArray(list)) return;
    const unknown = list.filter((o: unknown) => typeof o === "string" && !allowed.includes(o));
    if (!unknown.length) return;
    legibility.obstructions = list.filter((o: unknown) => !unknown.includes(o));
    done.push(`${where}: dropped obstruction ${unknown.map(pyRepr).join(", ")}`
            + " - not in the schema enumeration");
  };
  fix("main sign", doc.main_sign?.legibility);
  for (const panel of doc.panels ?? []) fix(`panel ${panel?.index}`, panel?.legibility);
  return done;
}

// A stretch in metres is printed the way hours are - `0-15 m` - and is not hours.
const METRES = /\d+\s*[-–]\s*\d+\s*m\b/gi;

// A `dygn` is a whole day, and a number printed before it is a number of days.
const DAYS_PRINTED = /(\d+)\s*dygn/i;

/** Contradictions inside one reading, settled without knowing the sign (decision
 *  163). Each rule here is a failure seen on a real photograph, and was checked
 *  against the 57 hand-marked readings, where it never fires.
 *
 *  A TICKET AND A FEE ON ONE PLATE. `P-biljett` means parking is free but a ticket
 *  must be shown; a fee means it is paid. On photograph `059` the model took a
 *  parking disc for a ticket beside `därefter avgift`, and on `097` it put a ticket
 *  beside `Avgift / Taxa A`. The fee is what the plate spells out, so the ticket goes.
 *
 *  HOURS ON A FEE PLATE THAT THE FEE DOES NOT CARRY. On `088` the plate read
 *  `Avgift / 8-20 / (8-15)` and arrived as a fee with no hours at all, so the fee ran
 *  round the clock and the answer showed a full paid day where the sign charges in
 *  the daytime only. The lines holding the hours move to `uninterpreted`: the plate
 *  is then plainly incomplete rather than quietly wrong, and its words stay in view
 *  for a reader who can make sense of them.
 *
 *  DAYS GIVEN AS HOURS. On `094` the plate read `7 dygn` and arrived as seven HOURS -
 *  a sixth of the stay the sign grants - while on `062` `14 dygn` arrived as 336 hours,
 *  which is right. A limit equal to the printed number of days was never converted,
 *  and now that the schema knows the unit it is put right rather than dropped. */
function contradictions(doc: Record<string, any>): string[] {
  const done: string[] = [];
  for (const panel of doc.panels ?? []) {
    const parsed = panel?.parsed;
    if (!parsed || typeof parsed !== "object" || panel.kind !== "sign_plate") continue;

    // "Privat parkering" is a sign plate that only informs: the land is private, and
    // the sign above means what it always means (decision 53). It opens no exception.
    // On `068` the model read it as one - parking for a named group under a
    // no-parking board - and the answer drew a window the sign never promised. What
    // drew the window was the exception, not the kind of plate, so the exception is
    // what goes; the plate stays a sign plate and keeps its meaning from the reference.
    if ((panel.lines ?? []).join(" ").toLowerCase().includes(PRIVATE_LAND_PHRASE)
        && (parsed.eligibility !== undefined || parsed.permits_parking !== undefined)) {
      done.push(`panel ${panel.index}: 'Privat parkering' opens no exception - `
              + "dropped eligibility and permits_parking");
      delete parsed.eligibility;
      delete parsed.permits_parking;
      continue;
    }

    // A parking-disc symbol IS the requirement to show a disc. On `063` the model drew
    // the symbol (`pictogram: parking_disc`) and left the requirement out, and the
    // answer said "3 tim" as though no disc were needed - graded full, at 0.975. Filled
    // in only where no method is given: `057` offers a disc OR a free ticket, and the
    // plate's own choice stays the plate's.
    if (parsed.pictogram === "parking_disc" && parsed.payment_method === undefined) {
      done.push(`panel ${panel.index}: payment_method='parking_disc' added - the plate `
              + "shows the parking-disc symbol");
      parsed.payment_method = "parking_disc";
    }

    if (parsed.fee === true && parsed.payment_method === "ticket") {
      done.push(`panel ${panel.index}: dropped payment_method='ticket' - a ticket and `
              + "a fee on one plate contradict each other");
      delete parsed.payment_method;
    }

    const lines: unknown[] = Array.isArray(panel.lines) ? panel.lines : [];
    const windows = Array.isArray(parsed.time_windows) ? parsed.time_windows : [];

    const limit = parsed.duration_limit;
    const days = DAYS_PRINTED.exec(lines.join(" "));
    if (limit && limit.unit === "hours" && days && limit.amount === Number(days[1])) {
      done.push(`panel ${panel.index}: duration ${limit.amount} hours -> `
              + `${limit.amount} days - the plate says 'dygn'`);
      parsed.duration_limit = { amount: limit.amount, unit: "days" };
    }
    if (parsed.fee === true && !windows.length) {
      const hours = lines.filter((line): line is string =>
        typeof line === "string" && PRINTED_HOURS.test(line.replace(METRES, "")));
      if (hours.length) {
        const kept = Array.isArray(parsed.uninterpreted) ? parsed.uninterpreted : [];
        parsed.uninterpreted = [...kept, ...hours.filter((h) => !kept.includes(h))];
        done.push(`panel ${panel.index}: hours ${hours.map(pyRepr).join(", ")} are `
                + "printed on the plate but the fee carries none - kept as uninterpreted");
      }
    }
  }
  return done;
}

/** A value written the way Python would write it: a string in single quotes. */
function pyRepr(value: unknown): string {
  if (typeof value === "string") return `'${value.replace(/'/g, "\\'")}'`;
  return String(value);
}

/** Signals for the confidence formula. Observations only - what to make of them is
 *  decided in `completeness`. */
function flagsOf(doc: Record<string, any>, panelsSeen: number | null): string[] {
  const out: string[] = [];
  const panels: Panel[] = doc.panels ?? [];
  const plates = panels.filter((p) => p.kind === "sign_plate");

  if (doc.main_sign.type === "unknown") out.push("main_sign_unknown");
  if (String(doc.main_sign.type).startsWith("wayfinding")) {
    out.push("wayfinding_sign_permits_nothing");
  }
  if (!plates.length) out.push("no_sign_plates");

  // A boundary cannot be checked by the model's opinion - on photograph `013` two
  // plates were merged into one while the model called the boundaries certain. It
  // is compared against the independent count from the triage stage, over the plates
  // that STATE A RULE.
  if (panelsSeen !== null && panelsSeen !== plates.length) {
    out.push(`panel_count_disagreement:${panelsSeen}!=${plates.length}`);
  }
  if (!(doc.boundaries?.certain ?? true)) out.push("model_reports_uncertain_boundary");

  for (const p of panels) {
    const legibility: any = p.legibility ?? {};
    if (!(legibility.readable ?? true)) out.push(`panel_${p.index}_unreadable`);
    const obs = legibility.obstructions ?? [];
    if (obs.length) out.push(`panel_${p.index}_obstructed:${obs.join(",")}`);
    if (p.kind === "sign_plate" && !(p.lines ?? []).length
        && !Object.keys(p.parsed ?? {}).length) {
      out.push(`panel_${p.index}_empty`);
    }
  }
  if (!(doc.main_sign.legibility?.readable ?? true)) out.push("main_sign_unreadable");
  return out;
}

const errorsOf = (doc: unknown, schema: typeof SIGN_SCHEMA): string[] =>
  validate(doc, schema).slice().sort();

/** Triage is repaired the same way extraction is: a detail of formatting must not
 *  carry off an otherwise good answer. What stays strict is what has a consequence:
 *  a `category` outside the enumeration still rejects the answer. */
export function triage(doc: Record<string, any>): Result {
  const repairs: string[] = [];
  const allowed = TRIAGE_SCHEMA.properties as Record<string, any>;
  for (const key of Object.keys(doc)) {
    if (!(key in allowed)) {
      repairs.push(`extra field '${key}' removed`);
      delete doc[key];
    }
  }

  const seen = doc.what_i_see;
  const limit = allowed.what_i_see?.maxLength ?? 200;
  if (typeof seen === "string" && seen.length > limit) {
    repairs.push(`what_i_see shortened to ${limit} characters`);
    doc.what_i_see = seen.slice(0, limit);
  }

  // A panel count written as a string is a form of writing, not a different answer.
  const n = doc.panels_below_main_sign;
  if (typeof n === "string" && /^\d+$/.test(n.trim())) {
    repairs.push(`panels_below_main_sign '${n}' -> ${Number(n)}`);
    doc.panels_below_main_sign = Number(n);
  }

  const errs = errorsOf(doc, TRIAGE_SCHEMA);
  return { data: errs.length ? null : (doc as SignDoc), schemaErrors: errs,
           repairs, flags: [] };
}

/** `panelsSeen` is the number of panels named by the triage stage: an independent
 *  look at the same photograph, and a disagreement means a boundary was lost. */
export function sign(doc: Record<string, any>,
                     panelsSeen: number | null = null): Result {
  const repairs = [...repairDoc(doc), ...fixUnknownColors(doc), ...dropUnknownEnums(doc),
                   ...dropUnknownObstructions(doc), ...contradictions(doc)];
  const errs = errorsOf(doc, SIGN_SCHEMA);
  const result: Result = {
    data: errs.length ? null : (doc as SignDoc),
    schemaErrors: errs,
    repairs,
    flags: [],
  };
  if (ok(result)) result.flags = flagsOf(doc, panelsSeen);
  return result;
}

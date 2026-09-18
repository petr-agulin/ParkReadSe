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

  // Rule 1 from PROBE_LOG: the main sign is not a plate. On photograph `010` the
  // model wrote `P` both into `main_sign` and as a first, textless panel.
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

  // Rule 3 from PROBE_LOG: a boundary cannot be checked by the model's opinion - it
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
  const repairs = [...repairDoc(doc), ...fixUnknownColors(doc), ...dropUnknownEnums(doc)];
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

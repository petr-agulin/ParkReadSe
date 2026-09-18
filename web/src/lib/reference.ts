// The reference — and the whitelist with it.
//
// What is not in `reference/signs/` the product does not interpret: it shows it word
// for word and marks it. The entries themselves arrive from `reference.data.ts`,
// which `npm run emit` generates out of markdown: there is nothing on the device to
// parse preambles with, and the source stays markdown.

import { ENTRIES, type RefEntry } from "./reference.data";
import type { Parsed, SignDoc } from "./sign";

export type Entry = RefEntry;

/** Whether an entry counts as a rule — that is, whether its absence bears on the
 *  completeness. */
export function countsTowardsRules(e: Entry): boolean {
  return e.category === "main_sign" || e.category === "rule";
}

export function get(key: string): Entry | null {
  return ENTRIES[key] ?? null;
}

export function has(key: string): boolean {
  return key in ENTRIES;
}

export function keys(): string[] {
  return Object.keys(ENTRIES).sort();
}

/** Every entry in order of key — for whoever shows the reference whole. */
export function all(): Entry[] {
  return keys().map((k) => ENTRIES[k]);
}

// --- matching an extracted panel against the reference ----------------------
//
// The keys are taken from the FIELDS of the schema rather than from the text: the
// text is municipal and varies, while the fields are closed by a list. So the
// matching is a deterministic one.

const MAIN: Record<string, string> = {
  parking: "main-parking",
  prohibition_parking: "main-prohibition-parking",
  prohibition_stopping: "main-prohibition-stopping",
  wayfinding_parking_house: "main-wayfinding-parking-house",
  wayfinding_park_and_ride: "main-wayfinding-park-and-ride",
};
const ZONE: Record<string, string> = {
  parking: "main-zone-parking",
  prohibition_parking: "main-zone-prohibition",
};

const DAY: Record<string, string> = {
  weekday: "window-weekday", eve: "window-eve", red: "window-red",
  named_weekday: "named-weekday", all_days: "alla-dagar",
};

const SIMPLE: [keyof Parsed, string][] = [
  ["duration_limit", "duration-limit"],
  ["place_count", "place-count"],
  ["stretch_metres", "stretch-metres"],
  ["permit_required", "sarskilt-p-tillstand"],
  ["operator", "operator-plate"],
  ["tariff_code", "taxa"],
  ["area_code", "omradeskod"],
];

// The only tables mapping "a value of the schema → an entry of the reference". A copy
// of its own has already drifted from the schema once and lost the buses (photograph
// `038`).
export const ELIGIBILITY_KEYS: Record<string, string> = {
  visitors: "besokande",
  rented: "forhyrda-platser",
  permit_holders: "sarskilt-p-tillstand",
  disabled_permit: "pictogram-wheelchair",
  residents: "boende",
};

export const VEHICLE_KEYS: Record<string, string> = {
  motorcycle: "pictogram-motorcycle",
  car_only: "bil-personbil",
  electric: "pictogram-electric-car",
  bus: "pictogram-bus",
  truck: "pictogram-truck",
  // `T8-8`: bicycles and class II mopeds. A class I moped goes with the motorcycles —
  // the one kind of vehicle divided between two pictograms.
  bicycle: "pictogram-bicycle",
};

const PAYMENT: Record<string, string> = { ticket: "p-biljett", parking_disc: "p-skiva" };
const PLACEMENT: Record<string, string> = {
  marked_bay_only: "utanfor-markerad-plats",
  as_shown: "placement-as-shown",
};

export type Recognised = {
  mainSignKey: string | null;
  panelKeys: Record<number, string[]>;        // panel index → keys of the reference
  uninterpreted: Record<number, string[]>;    // panel index → the lines as they are
  missingKeys: string[];                      // the fields are there, the entry is not
};

export const PRIVATE_LAND_PHRASE = "privat parkering";

export function recognise(doc: SignDoc): Recognised {
  const main = doc.main_sign;
  const wayfinding = main.type.startsWith("wayfinding");
  const zone = main.form === "zone";
  let mainKey: string | null =
    (zone ? ZONE[main.type] : undefined) ?? MAIN[main.type] ?? null;
  const missing: string[] = [];
  if (mainKey && !has(mainKey)) {
    missing.push(mainKey);
    mainKey = null;
  }

  const panelKeys: Record<number, string[]> = {};
  const uninterpreted: Record<number, string[]> = {};

  for (const p of doc.panels ?? []) {
    const i = p.index as number;
    const keys: string[] = [];
    if (p.kind === "info_board") keys.push("info-board");
    if (p.kind === "operator_plate") keys.push("operator-plate");
    // `Privat parkering` is the one entry recognised BY TEXT. The schema has no field
    // for it and should have none: free text is not provided for by the regulations.
    // But the consequence is an important one — the land is private, and the owner's
    // conditions are not on the pole.
    if ((p.lines ?? []).join(" ").toLowerCase().includes(PRIVATE_LAND_PHRASE)) {
      keys.push("privat-parkering");
    }
    const parsed: Parsed = p.parsed ?? {};

    for (const [field, key] of SIMPLE) if (parsed[field]) keys.push(key);
    if (parsed.fee) keys.push("avgift");
    if (parsed.prohibition) {
      keys.push(parsed.placement === "marked_bay_only"
        ? "utanfor-markerad-plats" : "main-prohibition-parking");
    }
    if (parsed.scope_shift === "remaining_time") keys.push("ovrig-tid");
    for (const [value, table] of [
      [parsed.eligibility, ELIGIBILITY_KEYS],
      [parsed.vehicle_class, VEHICLE_KEYS],
      [parsed.payment_method, PAYMENT],
      [parsed.placement, PLACEMENT],
    ] as [string | undefined, Record<string, string>][]) {
      if (value && value in table) keys.push(table[value]);
    }
    if (parsed.arrow) {
      // An arrow under a WAYFINDING sign means "that way", not "as far as there"
      // (photograph `037`): `T11` describes the PLACE where one may stand, and a
      // wayfinding sign has no place at all.
      keys.push(wayfinding ? "wayfinding-direction"
                           : `arrow-${parsed.arrow.replace(/_/g, "-")}`);
    }
    for (const w of parsed.time_windows ?? []) {
      const k = w.day_class ? DAY[w.day_class] : undefined;
      if (k) keys.push(k);
      // The parity of the week and the season narrow the window and are obliged to be
      // NAMED: a rule applied in silence is one the user cannot check.
      if (w.week_parity) keys.push(w.week_parity === "even" ? "jamna-veckor" : "udda-veckor");
      if (w.dates) keys.push("datumintervall");
    }

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      if (has(k)) unique.push(k);
      else missing.push(k);
    }
    panelKeys[i] = unique;

    // The unrecognised. A plate carrying a rule out of which NOT ONE key came is not
    // understood — whether there is text on it or not (photograph `042`: a pictogram
    // of an unknown class arrived as `pictogram: other` with no lines of text and fell
    // between the two nets).
    const notUnderstood = unique.length === 0 && p.kind === "sign_plate";
    const leftovers = [...(parsed.uninterpreted ?? [])];
    if (notUnderstood) leftovers.push(...(p.lines ?? []));
    if (leftovers.length || notUnderstood) uninterpreted[i] = leftovers;
  }

  return {
    mainSignKey: mainKey,
    panelKeys,
    uninterpreted,
    missingKeys: [...new Set(missing)].sort(),
  };
}

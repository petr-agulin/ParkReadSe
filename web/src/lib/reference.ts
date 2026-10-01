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

/** The four categories of an entry. `info` is part of what the sign says about
 *  parking, though the engine sets no rule by it: private land draws the line dashed,
 *  a priority road decides whether parking is allowed at all, a tariff says how much
 *  the fee is - which the product does not tell, but a reader takes it for part of
 *  the rules (decision 181). `no_rule` is not about the parking rules at all - the
 *  operator's name, the payment board, another road sign - and its plate is tagged
 *  "Not a parking rule" (decision 180). */
export const CATEGORIES = ["main_sign", "rule", "info", "no_rule"] as const;
export const NO_RULE = "no_rule";

/** Whether a plate is part of the parking rules - the reverse of the tag "Not a
 *  parking rule" (decision 180). Decided by the reference, not by the kind the model
 *  gave the plate: by kind, a priority-road sign was tagged although the engine
 *  decides by it whether parking is allowed at all.
 *
 *  The tag needs all three: the plate matched some entry, every entry it matched is
 *  `no_rule`, and no words are left over. Words nobody understood are never "not a
 *  rule" - they may be a ban. */
export function carriesRule(keys: string[], leftovers: string[] | null): boolean {
  if (leftovers !== null || keys.length === 0) return true;
  return keys.some((k) => get(k)?.category !== NO_RULE);
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
  // `custom` means a circle of drivers none of the listed values fits - which is what
  // a named group IS. It stayed unmapped until there was an entry able to say so
  // (step 15a); unmapped, the engine never learnt that the circle had narrowed, and a
  // bay for `Personal` drew the solid line of a bay open to everyone.
  custom: "reserved-for-named-group",
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
  taxi: "taxi",
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

/** Entries the schema has no field for, matched on the plate's own text.
 *
 *  The regulations provide no code for these, so the text is the only handle there is.
 *  `privat-parkering` was the first; `boende` follows because its article declares
 *  `schema: —` outright, and the named-group plates because in the schema they arrive
 *  as `eligibility: custom` — "nothing listed fitted" — which by the value of the field
 *  alone cannot be told from any other plate that fitted nothing.
 *
 *  A test holds this table in step with the `tokens:` headers of the articles: let the
 *  two drift and the rule stops firing while the article goes on looking as if it works. */
export const BY_TEXT: [string, string[]][] = [
  ["privat-parkering", ["privat parkering"]],
  ["boende", ["boende"]],
  ["reserved-for-named-group",
   ["vaktmästare", "verksamhet", "personal", "regionservice", "blodbil"]],
  // The machine where the fee is paid, not a ticket to display (decision 187). Not the
  // bare "automat": a payment board reads "P-automat" and is a board.
  ["biljettautomat", ["biljettautomat", "biljett automat"]],
  // Why the prohibition above stands: the place is for goods (`089`, `109`).
  ["lastplats", ["lastplats"]],
  // A tariff named by its colour rather than its number: `Röd taxa` on `088`. Numbered
  // ones arrive in `tariff_code`; this one the model left as text (decision 211).
  ["taxa", ["taxa"]],
];

export const PRIVATE_LAND_PHRASE = BY_TEXT[0][1][0];
const RESIDENTS = BY_TEXT.find(([key]) => key === "boende")![1][0];

/** Entries of `BY_TEXT` that the schema also has a field for: the text stands in for
 *  the field, and only when the field is empty. */
const TEXT_STANDS_IN_FOR: Record<string, keyof Parsed> = { taxa: "tariff_code" };

// Hours actually PRINTED on the plate, as opposed to hours the model worked out for
// itself. `7-18`, `(22-10)`, `07:00-19:00`.
export const PRINTED_HOURS = /\d{1,2}([:.]\d{2})?\s*[-–]\s*\d{1,2}([:.]\d{2})?/;

// Words by which a plate says more than WHO: "only", "not", "except", the rest of the
// time, a ban, a fee, a length of stay.
const MORE_THAN_WHO = new Set(["endast", "ej", "utom", "övrig", "övriga", "förbjuden",
                               "förbjudet", "avgift", "tim", "min", "dygn"]);

/** Whether a plate carries anything besides the name of a circle: a word from the
 *  list above, printed hours, or a length of stay (`2h`). */
function saysMore(joined: string): boolean {
  return PRINTED_HOURS.test(joined) || /\d\s*(h|tim|min)\b/.test(joined)
    || joined.split(/[^\p{L}\d]+/u).some((word) => MORE_THAN_WHO.has(word));
}

/** A residents' area as plates write it: one code, no spaces, at least one letter -
 *  `C-NV`, `Tr`, `GK-J`, `C4n`, `51E`. A length of stay (`24h`) is not an area. */
function isAreaCode(s: string): boolean {
  return /^[\p{L}\d]+(-[\p{L}\d]+)*$/u.test(s) && /\p{L}/u.test(s)
    && !/^\d+(h|tim|min)$/.test(s);
}

/** Whether the model's "who" tag on an unrecognised plate narrows the circle.
 *
 *  Off (decision 173). On the first live run the model tagged nine plates "who" and
 *  one or two of them named a group: `Lastplats` three times, `Camping förbjuden`, a
 *  ban on trailers. Its list of kinds had no place for an action or for what a place
 *  is for, and the model filled the gap with the nearest wrong kind - the way it once
 *  wrote "weekday" for "the 1st of every month". The tag is still saved; it narrows
 *  again once step 15h gives those kinds a place and the tag is measured reliable. */
export const WHO_SLOT_NARROWS = false;

/** The flags a recognition raises for the grade: entries missing from the reference,
 *  and plates that were read but not understood. ONE place: the live pipeline, the
 *  measurement and the snapshots all take them from here. When the snapshots raised
 *  none, they called "full" what the phone showed as partial (step 27). */
export function recognitionFlags(rec: Recognised): string[] {
  const flags: string[] = [];
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const uninterpreted = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (uninterpreted.length) flags.push("uninterpreted_panels:" + uninterpreted.join(","));
  return flags;
}

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
    // A road sign on the same post, outside the parking stack. The priority road has
    // an entry of its own because it changes whether parking is allowed at all.
    if (p.kind === "other_sign") {
      keys.push(p.parsed?.road_sign === "priority_road" ? "priority-road" : "other-road-sign");
    }
    // The entries recognised BY TEXT rather than by a field (see `BY_TEXT`). The lines
    // are joined first: a phrase can be broken across two of them, as `Privat` and
    // `parkering` are on photograph `021`.
    // A word broken across two lines keeps its hyphen at the end of the first -
    // `Last-` / `plats` - and is one word again once the break is taken out.
    const joined = (p.lines ?? []).join(" ").toLowerCase().replace(/-\s+/g, "");
    const parsed: Parsed = p.parsed ?? {};
    const spokenFor: string[] = [];
    for (const [key, tokens] of BY_TEXT) {
      if (!tokens.some((token) => joined.includes(token))) continue;
      spokenFor.push(...tokens.filter((token) => joined.includes(token)));
      // Where the schema has a field for the entry and the field is filled, the field
      // names it, in its usual place among the plate's meanings; the text stands in
      // only when the field is missing (`Röd taxa` on `088`, no `tariff_code`).
      const field = TEXT_STANDS_IN_FOR[key];
      if (field && parsed[field]) continue;
      keys.push(key);
    }

    for (const [field, key] of SIMPLE) if (parsed[field]) keys.push(key);
    if (parsed.fee) keys.push("avgift");
    if (parsed.prohibition) {
      keys.push(parsed.placement === "marked_bay_only"
        ? "utanfor-markerad-plats" : "main-prohibition-parking");
    }
    if (parsed.scope_shift === "remaining_time") keys.push("ovrig-tid");
    // A legible plate the model could place only as WHO: its words are not
    // interpreted, but that it names a circle would be enough to narrow (decision
    // 162). Held back (decision 173) - see `WHO_SLOT_NARROWS`.
    if (WHO_SLOT_NARROWS && parsed.unrecognised_slot === "who"
        && !parsed.eligibility && !parsed.vehicle_class) {
      keys.push("reserved-for-named-group");
    }
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
    // A line the text already accounted for is no longer uninterpreted: on `097` and
    // `114` the model named the residents' area (`Boende Solna`, `Boende GK-J`), the
    // product read `Boende` from it, and the screen still called the whole line
    // not interpreted.
    //
    // Struck only when the line carries NO DIGITS. `Boende 8-18` limits the circle by
    // the hour, and what that means is an open question in the plan; a line with
    // figures on it keeps its place in plain sight rather than disappearing into a
    // word we did recognise.
    //
    // The area itself may carry figures, and may come on a line of its own: `C4n`
    // (`110`), `Tr` (`098`), `C-NV` (a live reading of `088`). On a plate that names the
    // residents and nothing else, such a code is the area's name, not a rule (decision
    // 210). A plate that says more - `Endast`, `Ej`, hours, a fee - keeps every leftover
    // in sight: there a code may belong to a rule for everyone.
    const residentsOnly = spokenFor.includes(RESIDENTS) && !saysMore(joined);
    const leftovers = [...(parsed.uninterpreted ?? [])].filter((line) => {
      const low = line.toLowerCase().trim();
      if (residentsOnly && isAreaCode(low.replace(RESIDENTS, "").trim())) return false;
      return /[0-9]/.test(low) || !spokenFor.some((token) => low.includes(token));
    });
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

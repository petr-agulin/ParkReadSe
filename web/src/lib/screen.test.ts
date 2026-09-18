// The product's words and the timeline of periods. Carried over from
// `tests/test_api.py` (step 8).
//
// Most of those tests checked not HTTP but the ANSWER: what is said to a person at a
// sign, in what order and in which words. The server has gone - the checks remain,
// because their subject is a different one: not the handle, but the product.
//
// The answer is assembled by the same path as in the application, only without a
// network: a saved model answer, then the schema check, the reference, completeness,
// the engine, and the presentation.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { FULL, PARTIAL, applyAsymmetry, grade } from "./completeness";
import { ARROW_EXTENT, evaluateParkingRules, horizonEnd, type Period } from "./engine";
import { pixels } from "./photo";
import { CATEGORY_TEXT, CONTRACT, EXTENT_SHORT, EXTENT_TEXT, GOOD_ENOUGH, NOTE_TEXT,
         REASON_TEXT, STATE_TEXT, STAY_END_REASON, STAY_END_TEXT, TIMED_PROHIBITION_TEXT,
         UNCERTAINTY_TEXT, explain, headline, joinLines, merge, notInterpreted, panelFields,
         panelView, periodTone, rangeName, regimeView, timePhrase, toJson, toneOf,
         whoCanPark, windows } from "./present";
import { all as allEntries, recognise } from "./reference";
import { TRIAGE_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";
import { ok, sign as validateSign } from "./validation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CAL = new Calendar();
const DEFAULT_MOMENT = "2026-03-10T12:00";     // an ordinary Tuesday

const read = (path: string) => readFileSync(ROOT + path, "utf-8");
const readJson = (path: string) => JSON.parse(read(path));

/** The product's answer for a photograph of the set: the same path as in the
 *  application, without a network. */
function answerFor(label: string, moment = DEFAULT_MOMENT): Record<string, any> {
  const fixture = readJson(`demo/${label}.extract.json`);
  const triageFile = `${ROOT}demo/${label}.triage.json`;
  const seen = existsSync(triageFile)
    ? readJson(`demo/${label}.triage.json`)?.response?.panels_below_main_sign : null;
  const res = validateSign(structuredClone(fixture.response),
                           typeof seen === "number" ? seen : null);
  const doc: SignDoc = ok(res) && res.data ? res.data : fixture.response;
  const rec = recognise(doc);
  const flags = [...res.flags];
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const un = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (un.length) flags.push("uninterpreted_panels:" + un.join(","));
  const photo = readdirSync(`${ROOT}testset/photos`)
    .find((f) => f.startsWith(`${label}.`) && /\.(jpg|png)$/i.test(f));
  const imagePixels = photo
    ? pixels(new Uint8Array(readFileSync(`${ROOT}testset/photos/${photo}`))) : null;
  const m = parseNaive(moment);
  const ev = evaluateParkingRules(doc, m, CAL);
  const a = grade(doc, { flags, repairs: res.repairs, imagePixels, evaluation: ev });
  return toJson({ doc, recognised: rec, assessment: a, evaluation: applyAsymmetry(ev, a) },
                m, CAL);
}

/** Every photograph of the set that has a saved model answer. */
const answered = () => readdirSync(`${ROOT}demo`)
  .filter((f) => f.endsWith(".extract.json"))
  .map((f) => f.slice(0, -".extract.json".length))
  .sort();

const PHOTO = "005-2tim-8-18-parentes-8-15-dubbelpil";
const period = (state: string, conditions: string[]): Period => ({
  start: parseNaive("2026-09-02T10:00"), end: parseNaive("2026-09-02T12:00"),
  state, conditions, maxDurationMinutes: null, note: null,
});

describe("the answer as a whole", () => {
  // py: test_api::test_analyze_returns_the_four_blocks
  it("consists of the same blocks", () => {
    const b = answerFor(PHOTO);
    expect(["full", "partial"]).toContain(b.completeness.category);
    expect(b.what_we_saw.panels.length, "block 1: the panels").toBeGreaterThan(0);
    expect(b.regimes.length, "block 3: the timeline of periods").toBeGreaterThan(0);
    expect(b.day_class).toBe("weekday");
    expect(b.has_answer).toBe(true);
  });

  // py: test_api::test_response_states_its_contract_version
  it("states the version of its contract", () => {
    expect(answerFor(PHOTO).contract).toBe(CONTRACT);
    expect(Number.isInteger(CONTRACT)).toBe(true);
  });

  // py: test_api::test_forbidden_wording_never_appears
  it("neither permits nor orders", () => {
    const raw = JSON.stringify(answerFor(PHOTO)).toLowerCase();
    for (const bad of ["parking allowed", "you may park", "you need to move the car",
                       "you can park here"]) {
      expect(raw, bad).not.toContain(bad);
    }
  });

  // py: test_api::test_general_rules_never_ride_inside_an_analysis
  it("never carries the general rules inside a reading", () => {
    // They are not on the sign and take no part in the computation: by never
    // travelling with the answer, they cannot accidentally become part of it.
    const b = answerFor(PHOTO);
    expect(b).not.toHaveProperty("general_rules");
    expect(b).not.toHaveProperty("rules");
  });

  // py: test_api::test_wording_comes_from_the_reference_not_from_the_api
  it("takes its wording ready-made from the reference", () => {
    const b = answerFor("006-tillstand-07-17-ovrig-tid-avgift");
    const terms = b.regimes.flatMap((r: any) => r.periods.flatMap((p: any) => p.conditions));
    expect(terms.length, "the conditions are marked with reference keys").toBeGreaterThan(0);
    for (const t of terms) {
      expect(t.known, t.key).toBe(true);
      expect(t.text).not.toBe(t.key);
    }
  });

  // py: test_api::test_state_wording_is_authored_by_the_backend
  it("takes the captions of the states ready-made", () => {
    const b = answerFor(PHOTO);
    const texts = b.regimes.flatMap((r: any) => r.periods.map((p: any) => p.state_text));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.startsWith("The sign"), t).toBe(true);
    expect(b.completeness.category_text).toBeTruthy();
  });

  // py: test_api::test_no_internal_token_is_shown_without_words
  it("never shows an internal token without words", () => {
    // "Stretch: here" was the very mistake the running-in started with.
    const b = answerFor(PHOTO);
    for (const r of b.regimes) {
      expect(r.extent_text.startsWith("The sign"), r.extent_text).toBe(true);
      expect(r.extent_text).not.toBe(r.extent);
    }
    for (const item of [...b.completeness.reasons, ...b.uncertainties]) {
      expect(item.text, `a token with no text: ${item.token}`).not.toBe(item.token);
    }
  });

  // py: test_api::test_an_unknown_token_never_reaches_the_screen_as_itself
  it("never lets an unknown token reach the screen as itself", () => {
    const pair = explain("a_completely_new_reason", REASON_TEXT);
    expect(pair.token).toBe("a_completely_new_reason");
    expect(pair.text).toBe("");
  });

  // py: test_api::test_every_reason_and_uncertainty_token_has_wording
  it("gives every reason and every uncertainty a wording", () => {
    const produced = new Set<string>();
    for (const file of ["completeness.ts", "engine.ts"]) {
      const src = read(`web/src/lib/${file}`);
      for (const m of src.matchAll(/(?:reasons|uncertainties)\.push\("([a-z_0-9:]+)"/g)) {
        produced.add(m[1].replace(/:$/, ""));
      }
    }
    expect(produced.size, "no tokens were found - the check has lost its point")
      .toBeGreaterThan(0);
    const known = new Set([...Object.keys(REASON_TEXT), ...Object.keys(UNCERTAINTY_TEXT),
                           "unread_panels", "uninterpreted_plates"]);
    expect([...produced].filter((t) => !known.has(t))).toEqual([]);
    const extents = new Set([...Object.values(ARROW_EXTENT), "here"]);
    expect([...extents].filter((e) => !(e in EXTENT_TEXT))).toEqual([]);
    expect(CATEGORY_TEXT).toHaveProperty(FULL);
  });

  // py: test_api::test_every_reason_the_code_can_produce_has_a_caption
  it("gives every reason the completeness grading can produce a caption", () => {
    const refusals = (TRIAGE_SCHEMA as Record<string, any>).properties.category.enum
      .filter((c: string) => c !== "parking_sign");
    const reasons = new Set<string>();
    for (const category of refusals) {
      for (const r of grade(null, { triageCategory: category }).reasons) reasons.add(r);
    }
    for (const r of grade(null, { schemaValid: false }).reasons) reasons.add(r);
    // a reading with every conceivable flaw at once
    const bad: SignDoc = {
      schema_version: 1,
      main_sign: { type: "unknown", background_color: "blue", form: "regular",
                   legibility: { readable: false } },
      panels: [{ index: 1, kind: "sign_plate", lines: [], parsed: {},
                 background_color: "yellow", legibility: { readable: false } }],
      panel_count: 1, boundaries: { certain: false },
    };
    for (const r of grade(bad, { flags: ["panel_count_disagreement:1!=2",
                                         "uninterpreted_panels:1"],
                                 repairs: ["something was repaired"], imagePixels: 10 }).reasons) {
      reasons.add(r);
    }
    expect([...reasons].filter((t) => !explain(t, REASON_TEXT).text)).toEqual([]);
  });

  // py: test_api::test_user_facing_text_never_explains_the_machinery
  it("never explains the machinery in the text meant for a person", () => {
    // "Two independent readings counted the plates differently" is a tale about the
    // works, and there is no telling from it what to believe.
    const forbidden = ["independent reading", "triage", "extraction", "fixture", "schema",
                       "panel_count", "validator", "pipeline", "prompt", "the model",
                       "vision api", "json"];
    const texts = [...Object.values(STATE_TEXT), ...Object.values(CATEGORY_TEXT),
                   ...Object.values(EXTENT_TEXT), ...Object.values(REASON_TEXT),
                   ...Object.values(UNCERTAINTY_TEXT)];
    for (const e of allEntries()) texts.push(e.en, e.short, e.label);
    for (const text of texts) {
      for (const bad of forbidden) {
        expect(text.toLowerCase(), `the machinery in the text: ${text}`).not.toContain(bad);
      }
    }
  });

  // py: test_api::test_confidence_caveats_do_not_contradict_the_headline
  it("keeps the confidence caveats from contradicting the heading", () => {
    expect(REASON_TEXT.panel_count_disagreement.startsWith("Confidence is lower")).toBe(true);
    expect(REASON_TEXT.day_class_unknown.startsWith("Confidence is lower")).toBe(true);
  });

  // py: test_api::test_completeness_tone_is_decided_by_the_backend
  it("lets the backend decide the colour of the completeness", () => {
    expect(toneOf("full", 0.975)).toBe("good");
    expect(toneOf("full", GOOD_ENOUGH - 0.01), "a caveat takes the green away").toBe("caution");
    expect(toneOf("partial", 0.99), "not everything was read - not green").toBe("caution");
    expect(toneOf("insufficient", 0.99)).toBe("bad");
    expect(toneOf("not_a_parking_sign", 1.0)).toBe("bad");
  });

  // py: test_api::test_tone_travels_with_the_answer
  it("sends the colour along with the answer", () => {
    const c = answerFor(PHOTO, "2026-09-02T17:11").completeness;
    expect(["good", "caution", "bad"]).toContain(c.tone);
    expect(c.tone === "good").toBe(c.category === "full" && c.confidence >= 0.9);
  });
});

describe("the block \"what we read\"", () => {
  // py: test_api::test_every_shown_value_carries_its_field_name
  it("names the field beside every value shown", () => {
    const w = answerFor(PHOTO).what_we_saw;
    const mainNames = new Set(w.main_sign_fields.map((f: any) => f.name));
    for (const name of ["type", "form", "background_color"]) expect(mainNames).toContain(name);
    for (const p of w.panels) {
      const names = p.fields.map((f: any) => f.name);
      expect(names.slice(0, 2), "the order of the fields is fixed").toEqual(["index", "kind"]);
      expect(names, "an empty list of lines is a fact too").toContain("lines");
      for (const f of p.fields) expect(f.value, f.name).toBeTruthy();
    }
  });

  // py: test_api::test_parsed_fields_are_named_with_their_schema_path
  it("names the parsed fields by their path in the schema", () => {
    const w = answerFor(PHOTO).what_we_saw;
    const rows: Record<string, string> = {};
    for (const p of w.panels) for (const f of p.fields) rows[f.name] = f.value;
    expect(rows["parsed.duration_limit"]).toBe("2 hours");
    expect(rows["parsed.time_windows"]).toContain("08:00–18:00 (weekday)");
  });

  // py: test_api::test_no_parsed_field_is_silently_dropped_from_the_screen
  it("never loses an unfamiliar parsed field in silence", () => {
    const rows = panelFields({ index: 1, kind: "sign_plate", lines: ["x"],
                               parsed: { "invented_field": "a value" } } as unknown as Panel, []);
    expect(rows.some((r) => r.name === "parsed.invented_field")).toBe(true);
  });

  // py: test_api::test_panels_are_titled_panel_without_a_number
  it("titles the panels \"Panel\", without a number", () => {
    const w = answerFor(PHOTO).what_we_saw;
    expect(w.panels.map((p: any) => p.title)).toEqual(w.panels.map(() => "Panel"));
  });

  // py: test_api::test_primary_sign_is_named_and_coded
  it("names the main sign and gives it its code", () => {
    const w = answerFor(PHOTO).what_we_saw;
    expect(w.primary_sign.label).toBe("Parking");
    expect(w.primary_sign.code).toBe("E19");
  });

  // py: test_api::test_info_board_says_what_it_is_and_shows_its_text
  it("lets a payment board say what it is and show its text", () => {
    const w = answerFor("008-rorelsehindrad-avgift").what_we_saw;
    const boards = w.panels.filter((p: any) => p.kind === "info_board");
    expect(boards.length, "008 does carry a payment board").toBeGreaterThan(0);
    expect(boards[0].meanings[0].label).toBe("Info board");
    expect(boards[0].meanings[0].code, "a board has no code").toBe("");
    expect(boards[0].text, "the board's text is shown").toBeTruthy();
  });

  // py: test_api::test_a_time_plate_reads_as_one_sentence
  it("reads a plate about time as one sentence", () => {
    const panel: Panel = { index: 1, kind: "sign_plate",
      lines: ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"],
      background_color: "yellow", legibility: { readable: true },
      parsed: { prohibition: true, time_windows: [{ from: "10:00", to: "14:00",
        day_class: "named_weekday", named_weekday: "thursday", week_parity: "even",
        dates: { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] } }] } };
    const doc: SignDoc = { main_sign: { type: "parking", form: "regular",
      background_color: "blue", legibility: { readable: true } }, panels: [panel] };
    const view = panelView(panel, recognise(doc).panelKeys[1]);
    const meanings = view.meanings as any[];
    expect(meanings).toHaveLength(1);
    expect(meanings[0].label).toBe("No parking");
    expect(meanings[0].code).toBe("C35");
    expect(meanings[0].continues, "one sentence, with no full stop").toBe(true);
    for (const part of ["Thursdays", "10:00", "14:00", "even weeks"]) {
      expect(meanings[0].short).toContain(part);
    }
    expect(meanings[0].short).toContain("all year except July");
  });

  // py: test_api::test_two_plates_with_the_same_code_merge_into_one_line
  it("merges two plates with the same code into one line", () => {
    const merged = merge([
      { key: "avgift", label: "Fee", code: "T16", text: "payment required",
        short: "Parking is not free", continues: false },
      { key: "taxa", label: "Fee", code: "T16", text: "tariff number",
        short: "Municipal tariff number", continues: false },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].short).toContain("Parking is not free");
    expect(merged[0].short).toContain("Municipal tariff number");
  });

  // py: test_api::test_a_hyphenated_word_is_joined_back_into_one_word
  it("joins a hyphenated word back into one word", () => {
    expect(joinLines(["Beskicknings-", "fordon"])).toBe("Beskickningsfordon");
    // a hyphen inside a line is part of a time, not a break
    expect(joinLines(["2 tim", "8-18", "(8-15)"])).toBe("2 tim 8-18 (8-15)");
    expect(joinLines(["0-12 m"])).toBe("0-12 m");
  });

  // py: test_api::test_an_uninterpreted_panel_does_not_repeat_its_own_text
  it("keeps a panel it did not understand from repeating its own text", () => {
    expect(notInterpreted([], ["Beskicknings-", "fordon"]))
      .toBe("Not interpreted — shown above exactly as printed");
    // where a panel has keys that were understood, the remainder is named: the line
    // above is not it
    expect(notInterpreted(["boende"], ["Ci"])).toBe("Not interpreted: Ci");
  });

  // py: test_api::test_a_plate_the_reference_knows_is_not_called_uninterpreted
  it("never calls a plate it understood an uninterpreted one", () => {
    for (const label of ["015-motorcykel", "017-rorelsehindrad",
                         "032-rorelsehindrad-pil-hoger"]) {
      for (const p of answerFor(label).what_we_saw.panels) {
        expect(p.not_interpreted_text, `${label}, panel ${p.index}`).toBeNull();
      }
    }
  });

  // py: test_api::test_a_plate_with_an_unknown_symbol_narrows_instead_of_widening
  it("lets a plate with an unknown drawing narrow rather than widen", () => {
    // Photograph `042`: the pictogram arrived as `other` with no text, and the sign
    // read as parking for everyone.
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panels: [{ index: 1, kind: "sign_plate", lines: [], background_color: "blue",
                 legibility: { readable: true }, parsed: { pictogram: "other" } }],
      panel_count: 1, boundaries: { certain: true } };
    const rec = recognise(doc);
    expect(rec.panelKeys[1]).toEqual([]);
    expect(rec.uninterpreted, "a wordless plate must count as not understood")
      .toHaveProperty("1");
    const a = grade(doc, { flags: ["uninterpreted_panels:1"] });
    expect(a.category).toBe(PARTIAL);
    expect(a.uninterpretedPlates).toEqual([1]);
  });
});

describe("the timeline of periods", () => {
  // py: test_api::test_the_timeline_ends_where_the_stay_ends
  it("ends where the stay ends", () => {
    const r = answerFor("008-rorelsehindrad-avgift", "2026-09-02T17:11").regimes[0];
    expect(r.duration_expires_at).toBe("2026-09-03T17:11");
    expect(r.periods[r.periods.length - 1].end).toBe(r.duration_expires_at);
    expect(r.periods.some((p: any) => p.ends_at_horizon)).toBe(false);
    expect(r.periods[r.periods.length - 1].stay_end_text).toContain("24-hour rule");
  });

  // py: test_api::test_the_stay_end_is_stated_under_its_own_period
  it("states the close of the stay under its own period", () => {
    const r = answerFor(PHOTO, "2026-09-02T17:11").regimes[0];
    const marked = r.periods.filter((p: any) => p.stay_end_text);
    expect(marked, "exactly one period closes the stay").toHaveLength(1);
    expect(marked[0]).toBe(r.periods[r.periods.length - 1]);
    expect(marked[0].stay_end_text.toLowerCase()).toContain("the sign");
  });

  // py: test_api::test_without_a_limit_the_timeline_stops_at_the_first_change
  it("runs to the first change of state when there is no limit", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-02T17:11").regimes[0];
    const states = r.periods.map((p: any) => p.state);
    expect(states[0]).toBe("prohibited");
    expect(states[states.length - 1], "carried to the lifting of the prohibition")
      .not.toBe(states[0]);
    expect(states).toHaveLength(2);
  });

  // py: test_api::test_identical_neighbouring_segments_are_joined
  it("joins identical neighbouring segments", () => {
    const r = answerFor(PHOTO, "2026-09-02T17:11").regimes[0];
    expect(r.periods).toHaveLength(1);
    expect(r.duration_expires_at).toBe("2026-09-03T10:00");
    expect(r.duration_source).toBe("plate");
    expect(r.periods[0].start).toBe("2026-09-02T17:11");
    expect(r.periods[0].end).toBe(r.duration_expires_at);
  });

  // py: test_api::test_joining_never_hides_a_change_of_rule
  it("never lets the joining hide a change of rule", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-01T23:30").regimes[0];
    for (let i = 1; i < r.periods.length; i += 1) {
      const a = r.periods[i - 1];
      const b = r.periods[i];
      expect(a.tone !== b.tone || JSON.stringify(a.notes) !== JSON.stringify(b.notes))
        .toBe(true);
    }
  });

  // py: test_api::test_period_tone_and_headline_come_from_the_rule
  it("makes the colour and the heading of a period a property of the rule", () => {
    expect(periodTone(period("allowed", ["avgift"]))).toBe("paid");
    expect(periodTone(period("allowed", []))).toBe("free");
    expect(periodTone(period("prohibited", []))).toBe("prohibited");
    expect(periodTone(period("uncertain", []))).toBe("uncertain");
    // "Free parking" is allowed where there are no conditions at all: otherwise it
    // would stand next to "a disc is required".
    const free = period("allowed", []);
    const withDisc = period("allowed", ["p-skiva"]);
    expect(headline(free, periodTone(free))).toBe("Free parking");
    expect(headline(withDisc, periodTone(withDisc))).toBe("No fee stated for this period");
    expect(headline(withDisc, periodTone(withDisc)).toLowerCase()).not.toContain("free");
  });

  // py: test_api::test_period_carries_its_duration_and_notes
  it("gives a period its length, without repeating the fee in the notes", () => {
    const r = answerFor(PHOTO, "2026-09-02T22:59").regimes[0];
    for (const p of r.periods) {
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.headline).toBeTruthy();
      expect(p.notes.every((n: any) => n.key !== "avgift"), JSON.stringify(p.notes)).toBe(true);
    }
  });

  // py: test_api::test_stay_end_reason_says_why_without_repeating_when
  it("makes the reason for the close say WHY without repeating WHEN", () => {
    const r = answerFor("008-rorelsehindrad-avgift", "2026-09-02T23:24").regimes[0];
    const last = r.periods[r.periods.length - 1];
    expect(last.stay_end_reason).toBe("general 24-hour rule, not written on the sign");
    expect(last.stay_end_reason, "the when is said by the node").not.toContain("must end here");
  });

  // py: test_api::test_every_duration_source_has_a_reason
  it("gives every source of a limit a reason", () => {
    expect(Object.keys(STAY_END_REASON).sort()).toEqual(Object.keys(STAY_END_TEXT).sort());
    expect(Object.keys(STAY_END_REASON).sort()).toEqual(["24h_default", "plate", "prohibition"]);
    for (const text of Object.values(STAY_END_REASON)) {
      expect(text).toBeTruthy();
      expect(text[0], text).toBe(text[0].toLowerCase());
    }
  });

  // py: test_api::test_an_endless_prohibition_is_marked_as_reaching_the_horizon
  it("marks an endless prohibition as running into the horizon", () => {
    // "169 h 30 min" under a prohibition is a property of the computation, not of
    // the sign.
    const r = answerFor("007-gul-forbud-forhyrda-platser", "2026-09-04T22:29").regimes[0];
    const last = r.periods[r.periods.length - 1];
    expect(last.state).toBe("prohibited");
    expect(last.ends_at_horizon, "a prohibition with no end must be marked").toBe(true);
    expect(r.duration_expires_at).toBeNull();
  });

  // py: test_api::test_the_ban_period_itself_is_still_computed
  it("still computes the prohibition itself", () => {
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 1, boundaries: { certain: true },
      panels: [{ index: 1, kind: "sign_plate", lines: ["Fredag 0-6"],
                 background_color: "yellow", legibility: { readable: true },
                 parsed: { prohibition: true, time_windows: [{ from: "00:00", to: "06:00",
                   day_class: "named_weekday", named_weekday: "friday" }] } }] };
    const r = evaluateParkingRules(doc, parseNaive("2026-09-04T02:15"), CAL).regimes[0];
    expect(r.periods[0].state).toBe("prohibited");
    expect(r.periods[0].end.hh, "the prohibition lifts at 06:00").toBe(6);
  });

  // py: test_api::test_the_day_class_stands_under_the_date_on_the_scale
  it("puts the class of the day under the date", () => {
    // Friday 30 October 2026 is the eve of Alla helgons dag, and the bracketed hours
    // apply.
    let r = answerFor(PHOTO, "2026-10-30T14:00").regimes[0];
    expect(r.periods[0].start_day)
      .toEqual({ text: "Eve of Alla helgons dag (All Saints' Day)", kind: "eve" });
    expect(r.periods[r.periods.length - 1].end_day, "Monday is a weekday").toBeNull();

    r = answerFor(PHOTO, "2026-12-25T10:00").regimes[0];
    expect(r.periods[0].start_day)
      .toEqual({ text: "Red day: Juldagen (Christmas Day)", kind: "red" });

    // An ordinary Sunday and Saturday get no caption (decision 119).
    expect(answerFor(PHOTO, "2026-09-13T10:00").regimes[0].periods[0].start_day).toBeNull();
    expect(answerFor(PHOTO, "2026-09-12T10:00").regimes[0].periods[0].start_day).toBeNull();
    // But the Saturday before Easter does: tomorrow is a named day.
    expect(answerFor(PHOTO, "2026-04-04T10:00").regimes[0].periods[0].start_day)
      .toEqual({ text: "Eve of Påskdagen (Easter Sunday)", kind: "eve" });
  });
});

describe("who the spaces are designated for", () => {
  // py: test_api::test_who_can_park_never_addresses_the_reader
  it("never addresses the reader", () => {
    // The product names the set and stops: whether the person at the sign belongs to
    // it is something only they know.
    const forbidden = ["you may", "you can", "you cannot", "you must", "your car",
                       "not allowed to", "you need"];
    for (const label of ["008-rorelsehindrad-avgift", "015-motorcykel",
                         "009-besokande-avgift", "003-p-2tim"]) {
      const r = answerFor(label, "2026-09-02T17:11").regimes[0];
      expect(r.who_can_park.length, `${label}: the set must be named`).toBeGreaterThan(0);
      for (const term of r.who_can_park) {
        const low = term.text.toLowerCase();
        expect(low.startsWith("the sign"), `${label}: ${term.text}`).toBe(true);
        for (const bad of forbidden) expect(low, `${label}: ${bad}`).not.toContain(bad);
      }
    }
  });

  // py: test_api::test_a_sign_that_narrows_nobody_still_names_the_circle
  it("still names the set on a sign that narrows nobody", () => {
    const r = answerFor("003-p-2tim", "2026-09-02T17:11").regimes[0];
    expect(r.eligibility, "the sign narrows the set for nobody").toEqual([]);
    expect(r.who_can_park[0].text).toContain("all vehicles");
    expect(r.who_can_park[0].text).toContain("general parking rules");
  });

  // py: test_api::test_a_complementary_plate_does_not_replace_the_general_rule
  it("never lets a complementary plate replace the sign's general rule", () => {
    // `Boende` forbids nobody - it says that residents have conditions of their own.
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 1, boundaries: { certain: true },
      panels: [{ index: 1, kind: "sign_plate", lines: ["Boende Solna"],
                 background_color: "white", legibility: { readable: true },
                 parsed: { eligibility: "residents" } }] };
    const r = evaluateParkingRules(doc, parseNaive("2026-09-02T22:52"), CAL).regimes[0];
    const who = whoCanPark(r, "main-parking", false, false);
    expect(who).toHaveLength(2);
    expect(who[0].text, "the general rule comes first").toContain("all vehicles");
    expect(who[1].text, "the addition comes second").toContain("residents");
  });

  // py: test_api::test_a_narrowing_plate_does_replace_the_general_rule
  it("does let a narrowing plate replace the general rule", () => {
    for (const [label, expected] of [
      ["008-rorelsehindrad-avgift", "disabled parking permit"],
      ["009-besokande-avgift", "visitors"],
      ["015-motorcykel", "motorcycles"]] as const) {
      const r = answerFor(label, "2026-09-02T22:52").regimes[0];
      const texts = r.who_can_park.map((x: any) => x.text);
      expect(texts, label).toHaveLength(1);
      expect(texts[0], label).toContain(expected);
      expect(texts[0], label).not.toContain("all vehicles");
    }
  });

  // py: test_api::test_an_unknown_plate_is_named_in_who_can_park
  it("names a plate it did not understand among who may park", () => {
    // `Beskickningsfordon` reported "parking for everyone" - formally true, and
    // dangerous for exactly that reason.
    const r = { extent: "here", eligibility: [], placeNotes: [], periods: [],
                durationExpiresAt: null, durationSource: null, audience: null,
                audienceExcluded: [] };
    const plain = whoCanPark(r, "main-parking", false, false);
    const guarded = whoCanPark(r, "main-parking", true, false);
    expect(guarded).toHaveLength(plain.length + 1);
    expect(guarded[guarded.length - 1].text).toContain("may narrow who these spaces are for");
    expect(guarded[guarded.length - 1].known, "a caveat does not pose as knowledge").toBe(false);
  });

  // py: test_api::test_a_prohibition_with_hours_is_not_stated_as_a_prohibition_always
  it("never states a prohibition with hours as a prohibition always", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-06T19:27").regimes[0];
    const line = r.who_can_park[0].text;
    expect(line).toContain("only during the hours it names");
    expect(line, "\"does not prohibit\" is not \"permits\"").toContain("general parking rules");
  });

  // py: test_api::test_a_prohibition_without_hours_keeps_its_plain_wording
  it("keeps the plain wording on a prohibition with no hours", () => {
    const r = answerFor("055-forbud-stannande-snotackt-pil").regimes[0];
    expect(r.who_can_park[0].text).toBe("The sign prohibits stopping and parking");
  });
});

describe("the caption of the window", () => {
  // py: test_api::test_the_window_says_who_it_is_for_when_it_is_not_for_everyone
  it("says who the window is for when it is not for everyone", () => {
    const r = answerFor("008-rorelsehindrad-avgift").regimes[0];
    expect(r.window_for.map((x: any) => x.text))
      .toEqual(["A disabled parking permit is required"]);
    expect(r.who_can_park.some((x: any) => x.text.includes("disabled parking permit")))
      .toBe(true);
  });

  // py: test_api::test_a_sign_for_everyone_says_nothing_extra_under_the_window
  it("says nothing extra under the window of a sign for everyone", () => {
    expect(answerFor("003-p-2tim").regimes[0].window_for).toEqual([]);
  });

  // py: test_api::test_a_complementary_plate_is_not_mistaken_for_the_circle
  it("never mistakes a complementary plate for the set of the window", () => {
    const regimes = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen").regimes;
    const withNotes = regimes.filter((r: any) => r.notes.length);
    expect(withNotes.length, "no regime with a residents' plate was found").toBeGreaterThan(0);
    for (const r of withNotes) expect(r.window_for).toEqual([]);
  });

  // py: test_api::test_under_a_prohibition_the_circle_is_named_as_an_exception
  it("names the set as an exception under a prohibition", () => {
    const r = answerFor("007-gul-forbud-forhyrda-platser").regimes[0];
    for (const p of r.periods) if (p.aside.length) expect(p.state).toBe("prohibited");
    expect(r.window_for.map((x: any) => x.text))
      .toEqual(["The sign names an exception: Rented spaces"]);
    for (const x of r.window_for) expect(x.text.toLowerCase()).not.toContain(" you ");
  });

  // py: test_api::test_under_a_permission_the_circle_is_not_called_an_exception
  it("never calls the same set an exception under a permission", () => {
    const r = answerFor("004-endast-besokande-pingstkyrkan").regimes[0];
    for (const p of r.periods) if (p.aside.length) expect(p.state).toBe("allowed");
    expect(r.window_for.map((x: any) => x.text)).toEqual(["Visitors only"]);
  });

  // py: test_api::test_each_window_says_which_stretch_it_covers
  it("makes each window say which stretch it covers", () => {
    const regimes = answerFor("010-forhyrda-platser-tva-pilar").regimes;
    expect(regimes).toHaveLength(2);
    expect(regimes.map((r: any) => r.extent_short))
      .toEqual(["To the left of the sign", "To the right of the sign"]);
    expect(regimes[0].who_can_park).not.toEqual(regimes[1].who_can_park);
  });

  // py: test_api::test_every_extent_the_engine_can_produce_has_a_short_caption
  it("gives every stretch the engine can produce a short caption", () => {
    const extents = new Set([...Object.values(ARROW_EXTENT), "here"]);
    expect([...extents].filter((e) => !(e in EXTENT_SHORT))).toEqual([]);
    expect(Object.keys(EXTENT_SHORT).sort()).toEqual(Object.keys(EXTENT_TEXT).sort());
  });

  // py: test_api::test_a_plate_bound_to_hours_is_not_printed_as_the_circle_of_the_window
  it("never prints an instruction spelled out by the hour as the set of the window", () => {
    // `012`: "A special parking permit is required" stood under the NIGHT segment,
    // where the fee is enough.
    const r = answerFor("012-tillstand-7-17-ovrig-tid-avgift", "2026-09-06T16:29").regimes[0];
    expect(r.window_for).toEqual([]);
    const withPermit = r.periods.filter((p: any) =>
      p.notes.some((n: any) => n.text.includes("permit")));
    expect(withPermit.length, "the permit stayed with its own segment").toBeGreaterThan(0);
    for (const p of withPermit) expect(p.start.endsWith("07:00"), p.start).toBe(true);
  });

  // py: test_api::test_no_line_under_a_window_is_printed_twice
  it("never prints a line under a window twice", () => {
    // `010` on the right: one plate came out both as a condition and as the set, in
    // different words.
    const trouble: [string, string[]][] = [];
    for (const label of answered()) {
      for (const r of answerFor(label, "2026-03-02T12:00").regimes) {
        const circle = [...r.window_for.map((t: any) => t.key),
                        ...r.notes.map((t: any) => t.key)];
        for (const p of r.periods) {
          const together = [...p.notes.map((t: any) => t.key), ...circle];
          if (together.length !== new Set(together).size) trouble.push([label, together.sort()]);
        }
      }
    }
    expect(trouble).toEqual([]);
  });

  // py: test_api::test_the_circle_never_names_what_the_timeline_states_by_the_hour
  it("never lets the set of the window name what the timeline states by the hour", () => {
    const trouble: [string, string[]][] = [];
    for (const label of answered()) {
      for (const r of answerFor(label, "2026-03-02T12:00").regimes) {
        const circle = new Set(r.window_for.map((t: any) => t.key));
        const hourly = new Set(r.periods.flatMap((p: any) => p.notes.map((n: any) => n.key)));
        const both = [...circle].filter((k) => hourly.has(k as string));
        if (both.length) trouble.push([label, both as string[]]);
      }
    }
    expect(trouble).toEqual([]);
  });
});

describe("windows by audience", () => {
  /** The sign from Frihamnen, through the presentation. */
  function frihamnenWindows(moment: string) {
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 2, boundaries: { certain: true },
      panels: [
        { index: 1, kind: "sign_plate", lines: ["30 min", "00-24", "(00-14)"],
          background_color: "blue", legibility: { readable: true },
          parsed: { duration_limit: { amount: 30, unit: "minutes" }, time_windows: [
            { from: "00:00", to: "24:00", day_class: "weekday" },
            { from: "00:00", to: "14:00", day_class: "eve" }] } },
        { index: 2, kind: "sign_plate", lines: ["Avgift", "(14-24)", "00-24"],
          background_color: "blue", legibility: { readable: true },
          parsed: { fee: true, vehicle_class: "bus", time_windows: [
            { from: "14:00", to: "24:00", day_class: "eve" },
            { from: "00:00", to: "24:00", day_class: "red" }] } },
      ] };
    const m = parseNaive(moment);
    const ev = evaluateParkingRules(doc, m, CAL);
    return windows(ev.regimes.map((r) => regimeView(r, horizonEnd(m), CAL, "main-parking")));
  }

  // py: test_api::test_a_condition_addressed_to_one_vehicle_class_gets_its_own_window
  it("gives a condition addressed to one class of vehicle a window of its own", () => {
    const wins = frihamnenWindows("2026-09-13T10:00");        // a Sunday
    expect(wins.map((w: any) => w.audience_short))
      .toEqual(["All vehicles except buses", "Buses"]);
    const [everyone, buses] = wins;
    expect(everyone.who_can_park.some((t: any) => t.text.includes("buses"))).toBe(false);
    expect(everyone.periods.some((p: any) => p.conditions.length)).toBe(false);
    expect(buses.periods[0].headline).toBe("Parking fee");
    expect(everyone.periods[0].headline).toBe("Free parking");
    expect(everyone.duration_expires_at).toBeTruthy();
    expect(buses.duration_expires_at).toBeTruthy();
  });

  // py: test_api::test_the_second_window_is_hidden_when_it_says_the_same
  it("hides the second window when it says the same thing", () => {
    const wins = frihamnenWindows("2026-09-10T21:15");
    expect(wins).toHaveLength(1);
    expect(wins[0].audience_short).toBeNull();
    expect(wins[0].periods[0].headline).toBe("Free parking");
    expect(wins[0].periods[0].minutes).toBe(30);
  });

  // py: test_api::test_silence_about_a_fee_is_not_called_free
  it("never calls silence about a fee free", () => {
    // `049`: the fee is named only for "other times", and the boundary of those is
    // set by the moped plate.
    const doc: SignDoc = readJson("testset/expected/049-moped-sasong-avgift-tva-taxor.json");
    const inSeason = parseNaive("2026-07-15T12:00");
    let ev = evaluateParkingRules(doc, inSeason, CAL);
    let wins = windows(ev.regimes.map((r) =>
      regimeView(r, horizonEnd(inSeason), CAL, "main-parking")));
    const [everyone, mopeds] = wins;
    const segment = everyone.periods[0];
    expect(segment.headline).toBe("No fee stated for this period");
    expect(segment.tone).toBe("free");
    const aside = segment.aside.map((t: any) => t.text);
    expect(aside.some((t: string) => t.includes("other times") && t.includes("motorcycles")),
           JSON.stringify(aside)).toBe(true);
    expect(mopeds.periods[0].headline).toBe("Parking fee");

    // Out of season everyone pays, and the caveat has nowhere to come from.
    const offSeason = parseNaive("2026-11-16T12:00");
    ev = evaluateParkingRules(doc, offSeason, CAL);
    wins = windows(ev.regimes.map((r) =>
      regimeView(r, horizonEnd(offSeason), CAL, "main-parking")));
    expect(wins).toHaveLength(1);
    expect(wins[0].periods[0].headline).toBe("Parking fee");
    expect(wins[0].periods[0].aside).toEqual([]);
  });

  // py: test_api::test_a_residents_note_is_repeated_under_every_stretch_of_the_window
  it("repeats a residents' note under every stretch of the window", () => {
    const r = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen",
                        "2026-09-06T21:43").regimes[0];
    expect(r.periods.length, "a sign with several segments is needed").toBeGreaterThan(1);
    for (const p of r.periods) {
      expect(p.aside.some((x: any) => x.text.includes("residents")), p.start).toBe(true);
    }
  });

  // py: test_api::test_boende_alone_never_makes_the_answer_incomplete
  it("never lets `Boende` on its own make the answer incomplete", () => {
    const d = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen",
                        "2026-09-06T21:43");
    expect(d.completeness.category, JSON.stringify(d.completeness.reasons)).toBe("full");
    for (const r of d.regimes) for (const p of r.periods) expect(p.certain).toBe(true);
  });
});

describe("rented spaces and private land", () => {
  // py: test_api::test_a_rented_space_gets_no_parking_window
  it("gives a rented space no parking window", () => {
    // `020`: "Free parking ● 28 h 19 min max" - the number comes entirely from the
    // 24-hour rule.
    const r = answerFor("020-forhyrda-platser-13-och-14-avstand").regimes[0];
    expect(r.no_window_text, "the timeline must be taken away").toBeTruthy();
    expect(r.no_window_text).toContain("rented");
    expect(r.who_can_park.some((x: any) => x.text.includes("rented"))).toBe(true);
  });

  // py: test_api::test_a_rented_sign_that_states_its_own_hours_keeps_the_timeline
  it("keeps the timeline where rented spaces state hours of their own", () => {
    const r = answerFor("007-gul-forbud-forhyrda-platser").regimes[0];
    expect(r.no_window_text).toBeNull();
    expect(r.periods.length, "the timeline must remain").toBeGreaterThan(0);
  });

  // py: test_api::test_only_rented_spaces_lose_the_timeline
  it("keeps the timeline for every other set", () => {
    for (const label of ["004-endast-besokande-pingstkyrkan", "008-rorelsehindrad-avgift",
                         "015-motorcykel", "003-p-2tim"]) {
      for (const r of answerFor(label).regimes) {
        expect(r.no_window_text, label).toBeNull();
      }
    }
  });

  // py: test_api::test_private_land_is_named_in_both_places_and_keeps_its_timeline
  it("names private land in both places and keeps its timeline", () => {
    const r = answerFor("021-privat-parkering-brf").regimes[0];
    expect(r.who_can_park.some((x: any) => x.text.includes("private land"))).toBe(true);
    expect(r.window_for.some((x: any) => x.text.includes("Private land"))).toBe(true);
    expect(r.no_window_text).toBeNull();
    expect(r.periods.length, "the timeline must remain").toBeGreaterThan(0);
    expect(r.who_can_park.some((x: any) => x.text.includes("permits parking"))).toBe(true);
  });

  // py: test_api::test_an_ordinary_sign_says_nothing_about_private_land
  it("says nothing about private land on an ordinary sign", () => {
    const r = answerFor("003-p-2tim").regimes[0];
    for (const x of [...r.who_can_park, ...r.window_for]) {
      expect(x.text.toLowerCase()).not.toContain("private land");
    }
  });
});

describe("what the product vouches for", () => {
  // py: test_api::test_an_incomplete_parse_marks_its_periods_as_not_vouched_for
  it("marks the periods of an incomplete reading", () => {
    for (const label of ["021-privat-parkering-brf",          // private land
                         "029-beskickningsfordon-0-12m",      // a plate not understood
                         "061-lastplats-langt-avstand"]) {    // not enough pixels
      const d = answerFor(label);
      expect(d.completeness.category, label).not.toBe("full");
      for (const r of d.regimes) {
        for (const p of r.periods) expect(p.certain, label).toBe(false);
      }
    }
  });

  // py: test_api::test_a_complete_parse_keeps_a_solid_line
  it("keeps a solid line on a complete reading", () => {
    for (const label of ["003-p-2tim", "008-rorelsehindrad-avgift",
                         "007-gul-forbud-forhyrda-platser"]) {
      const d = answerFor(label);
      expect(d.completeness.category, label).toBe("full");
      for (const r of d.regimes) {
        for (const p of r.periods) expect(p.certain, label).toBe(true);
      }
    }
  });

  // py: test_api::test_certainty_follows_completeness_across_the_whole_set
  it("holds the same connection across the whole set", () => {
    const trouble: [string, boolean, string][] = [];
    for (const label of answered()) {
      const d = answerFor(label, "2026-03-02T12:00");
      const full = d.completeness.category === "full";
      const privateLand = d.regimes.some((r: any) =>
        r.window_for.some((t: any) => t.text.includes("Private land")));
      for (const r of d.regimes) {
        for (const p of r.periods) {
          if (p.certain !== (full && !privateLand)) {
            trouble.push([label, p.certain, d.completeness.category]);
          }
        }
      }
    }
    expect(trouble.slice(0, 5)).toEqual([]);
  });

  // py: test_api::test_the_engine_note_reaches_the_screen_as_a_sentence_not_a_token
  it("lets the engine's note reach the screen as a sentence, not a token", () => {
    // `037`: the page carried the bare token instead.
    const d = answerFor("037-hanvisning-p-med-pil");
    expect(d.note.token).toBe("wayfinding_sign_permits_nothing");
    expect(d.note.text.startsWith("This sign points the way")).toBe(true);
    expect(d.note.text).not.toContain("_");
  });

  // py: test_api::test_every_note_the_engine_can_produce_has_a_caption
  it("gives every note the engine can produce a caption", () => {
    const src = read("web/src/lib/engine.ts");
    const tokens = new Set([...src.matchAll(/note: "([a-z_]+)"/g)].map((m) => m[1]));
    expect(tokens.size, "no notes were found in the engine").toBeGreaterThan(0);
    expect([...tokens].filter((t) => !(t in NOTE_TEXT))).toEqual([]);
  });
});

describe("the markup invents no words", () => {
  const timeline = () => read("web/src/components/PeriodTimeline.tsx");

  // py: test_api::test_the_circle_is_not_repeated_once_per_window
  it("never repeats the set of who may park once per window", () => {
    const page = read("web/src/components/WhoCanPark.tsx");
    expect(page).toContain("distinctCircles(");
    const rule = read("web/src/lib/circles.ts");
    expect(rule).toContain("seen.has(id)");
    expect(rule).toContain('map((t) => t.key).join("|")');
  });

  // py: test_api::test_the_clock_on_screen_is_the_clock_on_the_sign
  it("makes the clock on screen the clock on the sign", () => {
    const fmt = read("web/src/lib/when.ts");
    expect(fmt).toContain("hour12: false");
    expect(fmt).toContain('hourCycle: "h23"');
    expect(fmt).toContain("toLocaleString(LOCALE");
    expect(fmt).not.toContain("undefined");
    expect(timeline()).toContain('from "../lib/when"');
    expect(timeline(), "the format must live in one place").not.toContain("toLocaleString");
  });

  // py: test_api::test_the_scale_stays_continuous_when_a_node_grows
  it("keeps the timeline continuous when a node grows", () => {
    const page = timeline();
    expect(page).toContain("function Rail(");
    expect(page.split("<Rail p=").length - 1).toBeGreaterThanOrEqual(4);
    expect(page).toContain('className="flex items-stretch gap-3"');
    const dayNote = page.split("const DAY_NOTE =")[1].split(";")[0];
    expect(dayNote).toContain("font-semibold");
    expect(dayNote).toContain("text-ink-2");
    // The colours of meaning do not belong here: red on this timeline already means
    // "you may not stand", and the class of the day is an explanation rather than a
    // rule. The prohibition is named by TOKEN names: the former palette words no
    // longer occur in the file at all, and a check on them would have become empty
    // without ceasing to be green.
    for (const meaning of ["text-deny", "text-fee", "text-free"]) {
      expect(dayNote, meaning).not.toContain(meaning);
    }
    expect(page).toContain("note.text");
  });

  // py: test_api::test_the_window_never_claims_to_be_the_driver_s_plan
  it("never lets the window pass itself off as the driver's plan", () => {
    const page = timeline();
    expect(page).toContain('title="Window starts"');
    expect(page).toContain('title="Window ends"');
    expect(page).toContain("the sign carries on");
    expect(page).toContain("more windows to follow");
    expect(page, "the length is named as a limit, not as a plan").toContain("max");
    for (const gone of ['title="Park start"', 'title="Park end"', "end of this stay"]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  // py: test_api::test_a_ban_at_the_selected_time_is_shown_before_the_window
  it("shows a prohibition at the start BEFORE the window", () => {
    const page = timeline();
    const rule = read("web/src/lib/period.ts");
    expect(page).toContain('title="Your selected start time"');
    expect(page).toContain("splitWindow(periods)");
    expect(rule).toContain('periods[i].tone === "prohibited"');
    expect(page).toContain("{last && (");
    expect(page).toContain('title="Window ends"');
    expect(page).toContain("isStayLimit(p.tone)");
    expect(rule).toContain('tone !== "prohibited" && tone !== "not_stated"');
  });
});

describe("dates are named the way the plate names them", () => {
  // py: test_api::test_dates_are_stated_as_the_plate_states_them
  it("keeps an exception an exception", () => {
    const phrase = timePhrase({ time_windows: [{ from: "00:00", to: "06:00",
      day_class: "named_weekday", named_weekday: "friday",
      dates: { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] } }] });
    expect(phrase).toContain("all year except July");
    expect(phrase).not.toContain("January");
    expect(phrase).not.toContain("December");
  });

  // py: test_api::test_single_excluded_days_are_named_as_days
  it("names single excluded days as days", () => {
    const phrase = timePhrase({ time_windows: [{ from: "00:00", to: "06:00",
      day_class: "named_weekday", named_weekday: "friday",
      dates: { mode: "except", ranges: [{ from: "06-15", to: "06-15" },
                                        { from: "08-15", to: "08-15" }] } }] });
    expect(phrase).toContain("all year except 15 June and 15 August");
  });

  // py: test_api::test_a_season_keeps_its_day_precision
  it("keeps a season precise to the day", () => {
    const phrase = timePhrase({ time_windows: [{ from: "12:00", to: "15:00",
      day_class: "named_weekday", named_weekday: "tuesday",
      dates: { mode: "only", ranges: [{ from: "11-01", to: "05-15" }] } }] });
    expect(phrase).toContain("from 1 November to 15 May inclusive");
  });

  // py: test_api::test_a_whole_month_is_named_by_its_month
  it("names a whole month by its month", () => {
    expect(rangeName({ from: "07-01", to: "07-31" })).toBe("July");
    expect(rangeName({ from: "06-15", to: "06-15" })).toBe("15 June");
    expect(rangeName({ from: "11-01", to: "05-15" })).toBe("1 November to 15 May");
  });
});

describe("the reference as the source of the words", () => {
  // py: test_api::test_every_prohibiting_main_sign_has_a_wording_for_the_timed_case
  it("gives every prohibiting sign a wording for the case with hours", () => {
    const prohibiting = allEntries()
      .filter((e) => e.key.startsWith("main-") && e.key.includes("prohibition"))
      .map((e) => e.key);
    expect(prohibiting.filter((k) => !(k in TIMED_PROHIBITION_TEXT))).toEqual([]);
  });
});

// Completeness of a reading, and the asymmetry rule. Carried over from
// `tests/test_completeness.py` in full (step 8): before that the module was held
// only by the comparison with Python.
//
// The key scenario is that **the same photograph, with a panel artificially knocked
// out, yields different categories**. And the governing rule of a partial reading:
// narrowing is allowed, widening is not.

import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { FULL, INSUFFICIENT, MAY_BE_INCOMPLETE, MAY_PROHIBIT, NOT_A_PARKING_SIGN,
         PARTIAL, PLACEMENT_KEYS, RULE_KEYS, applyAsymmetry, grade,
         hasAnswer } from "./completeness";
import { ALLOWED, UNCERTAIN, evaluateParkingRules } from "./engine";
import { toJson } from "./present";
import { recognise } from "./reference";
import { SIGN_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";

const CAL = new Calendar();
const NOW = parseNaive("2026-03-02T12:00");      // an ordinary Monday

/** P + `Avgift 8-18` + `2 tim` + a yellow prohibition plate. Three panels, all read. */
function sign(): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: [
      { index: 1, kind: "sign_plate", lines: ["Avgift", "8-18"],
        background_color: "blue", legibility: { readable: true },
        parsed: { fee: true, time_windows: [
          { from: "08:00", to: "18:00", day_class: "weekday" }] } },
      { index: 2, kind: "sign_plate", lines: ["2 tim"],
        background_color: "blue", legibility: { readable: true },
        parsed: { duration_limit: { amount: 2, unit: "hours" } } },
      { index: 3, kind: "sign_plate", lines: ["Torsd 0-6"],
        background_color: "yellow", legibility: { readable: true },
        parsed: { prohibition: true, time_windows: [
          { from: "00:00", to: "06:00", day_class: "named_weekday",
            named_weekday: "thursday" }] } },
    ],
    panel_count: 3,
    boundaries: { certain: true },
  };
}

/** Knock a panel out: text and parsed fields erased, the colour left. That is what a
 *  plate caked in dirt looks like. */
function blank(s: SignDoc, index: number, color: string): SignDoc {
  const out: SignDoc = structuredClone(s);
  const p = out.panels!.find((x) => x.index === index)!;
  p.lines = [];
  p.parsed = {};
  p.background_color = color;
  p.legibility = { readable: false, obstructions: ["dirt"] } as Panel["legibility"];
  return out;
}

/** A `P` with an arrow and nothing else - in the reading, indistinguishable from a
 *  sign pointing the way to a car park. */
function pointer(): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: [{ index: 1, kind: "sign_plate", lines: [], background_color: "blue",
               legibility: { readable: true }, parsed: { arrow: "right" } }],
    panel_count: 1,
    boundaries: { certain: true },
  };
}

/** As much text as `061` carries: sixty-odd printed characters. */
function wordy(): SignDoc {
  const s = sign();
  s.panels![0].lines = ["Avgift", "7-19", "(11-17)", "Taxa 3"];
  s.panels![1].lines = ["Övrig tid", "3 tim", "P-skiva", "24 h max"];
  s.panels![2].lines = ["Får ej ställas", "på i sidled"];
  return s;
}

const states = (ev: ReturnType<typeof evaluateParkingRules>) =>
  ev.regimes[0].periods.map((p) => p.state);

describe("the four categories", () => {
  // py: test_completeness::test_full_parse
  it("a full reading", () => {
    const a = grade(sign());
    expect(a.category).toBe(FULL);
    expect(a.unreadPanels).toEqual([]);
    expect(a.confidence).toBeGreaterThan(0.9);
  });

  // py: test_completeness::test_not_a_parking_sign_comes_from_triage
  it("\"not a parking sign\" comes from triage", () => {
    const a = grade(null, { triageCategory: "not_a_sign" });
    expect(a.category).toBe(NOT_A_PARKING_SIGN);
    expect(hasAnswer(a)).toBe(false);
  });

  // py: test_completeness::test_schema_invalid_is_insufficient
  it("a reading that fails the schema is insufficient", () => {
    const a = grade(null, { schemaValid: false });
    expect(a.category).toBe(INSUFFICIENT);
    expect(a.confidence).toBe(0);
  });

  // py: test_completeness::test_one_of_three_unread_is_partial
  it("one plate of three unread is partial", () => {
    const a = grade(blank(sign(), 2, "blue"));
    expect(a.category).toBe(PARTIAL);
    expect(a.unreadPanels).toEqual([2]);
  });

  // py: test_completeness::test_most_panels_unread_is_insufficient
  it("most of the plates unread is insufficient", () => {
    expect(grade(blank(blank(sign(), 1, "blue"), 2, "blue")).category).toBe(INSUFFICIENT);
  });

  // py: test_completeness::test_panel_count_disagreement_lowers_confidence_but_keeps_the_answer
  it("a disagreement in the plate count lowers confidence but keeps the answer", () => {
    // A signal, not a verdict: taking the answer away entirely is the product's most
    // expensive mistake - a person stands at a sign and gets nothing.
    const a = grade(sign(), { flags: ["panel_count_disagreement:4!=3"] });
    expect(a.category, "the answer remains").not.toBe(INSUFFICIENT);
    expect(a.reasons, "but the reason is named").toContain("panel_count_disagreement");
    expect(a.confidence, "and the confidence is lower")
      .toBeLessThan(grade(sign()).confidence);
  });

  // py: test_completeness::test_unknown_main_sign_is_insufficient
  it("an unidentified main sign is insufficient", () => {
    const s = sign();
    s.main_sign.type = "unknown";
    expect(grade(s).category).toBe(INSUFFICIENT);
  });

  // py: test_completeness::test_same_photo_different_categories
  it("one and the same photograph yields different categories", () => {
    const base = sign();
    expect(grade(base).category).toBe(FULL);
    expect(grade(blank(base, 2, "blue")).category).toBe(PARTIAL);
    expect(grade(blank(blank(base, 1, "blue"), 2, "blue")).category).toBe(INSUFFICIENT);
  });
});

describe("the colour of an unread plate", () => {
  // py: test_completeness::test_yellow_unread_panel_may_prohibit
  it("a yellow one may turn out to be a prohibition", () => {
    const a = grade(blank(sign(), 3, "yellow"));
    expect(a.category).toBe(PARTIAL);
    expect(a.mayHideProhibition).toBe(true);
  });

  // py: test_completeness::test_blue_unread_panel_does_not_imply_prohibition
  it("a blue one implies no prohibition", () => {
    const a = grade(blank(sign(), 2, "blue"));
    expect(a.category).toBe(PARTIAL);
    expect(a.mayHideProhibition).toBe(false);
  });

  // py: test_completeness::test_unreadable_colour_is_treated_as_worst_case
  it("an unreadable colour is the worst case", () => {
    expect(grade(blank(sign(), 2, "unreadable")).mayHideProhibition).toBe(true);
  });
});

describe("the asymmetry rule", () => {
  // py: test_completeness::test_full_parse_is_not_narrowed
  it("a full reading is not narrowed", () => {
    const s = sign();
    const ev = evaluateParkingRules(s, NOW, CAL);
    expect(states(applyAsymmetry(ev, grade(s)))).toEqual(states(ev));
  });

  // py: test_completeness::test_yellow_unread_forbids_presenting_any_period_as_allowed
  it("a yellow unread plate forbids presenting any period as permitting", () => {
    const s = blank(sign(), 3, "yellow");
    const ev = evaluateParkingRules(s, NOW, CAL);
    expect(states(ev), "before the rule there is permission").toContain(ALLOWED);
    const out = applyAsymmetry(ev, grade(s));
    expect(states(out)).not.toContain(ALLOWED);
    for (const p of out.regimes[0].periods.filter((x) => x.state === UNCERTAIN)) {
      expect(p.note).toBe(MAY_PROHIBIT);
    }
    expect(out.uncertainties).toContain(MAY_PROHIBIT);
  });

  // py: test_completeness::test_blue_unread_keeps_answer_but_marks_empty_periods
  it("a blue unread plate keeps the answer but marks the empty periods", () => {
    // "At other times there are no restrictions" on an incomplete reading is a claim
    // founded on the absence of data. Such a period is marked.
    const s = blank(sign(), 2, "blue");
    const out = applyAsymmetry(evaluateParkingRules(s, NOW, CAL), grade(s));
    const allowed = out.regimes[0].periods.filter((p) => p.state === ALLOWED);
    expect(allowed.length, "the answer survives").toBeGreaterThan(0);
    const empty = allowed.filter((p) => !p.conditions.length);
    expect(empty.length).toBeGreaterThan(0);
    for (const p of empty) expect(p.note).toBe(MAY_BE_INCOMPLETE);
  });

  // py: test_completeness::test_asymmetry_never_widens
  it("the asymmetry never widens", () => {
    // The rule may only remove permitting periods; on no data may it add one.
    for (const color of ["yellow", "blue", "white", "unreadable"]) {
      const s = blank(sign(), 2, color);
      const ev = evaluateParkingRules(s, NOW, CAL);
      const out = applyAsymmetry(ev, grade(s));
      const before = states(ev).filter((x) => x === ALLOWED).length;
      const after = states(out).filter((x) => x === ALLOWED).length;
      expect(after, color).toBeLessThanOrEqual(before);
    }
  });
});

describe("confidence", () => {
  // py: test_completeness::test_confidence_falls_as_data_is_lost
  it("falls as data is lost", () => {
    const full = grade(sign()).confidence;
    const partial = grade(blank(sign(), 2, "blue")).confidence;
    const disagreement = grade(sign(), { flags: ["panel_count_disagreement:4!=3"] }).confidence;
    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(disagreement);
  });

  // py: test_completeness::test_confidence_is_a_number_inside_the_category_not_instead_of_it
  it("the number works inside the category, not instead of it", () => {
    // High confidence from the model does not turn a partial reading into a full one.
    const s = blank(sign(), 2, "blue");
    s.model_confidence = 1.0;
    expect(grade(s).category).toBe(PARTIAL);
  });

  // py: test_completeness::test_an_uninterpreted_plate_is_not_a_full_reading
  it("a plate that was not understood is not a full reading", () => {
    // Reading the text and understanding it are different things:
    // `Beskickningsfordon` came through as full, with 98% confidence.
    const a = grade(sign(), { flags: ["uninterpreted_panels:1"] });
    expect(a.category).toBe(PARTIAL);
    expect(a.confidence).toBeLessThan(grade(sign()).confidence);
    expect(a.uninterpretedPlates).toEqual([1]);
    expect(a.reasons.some((r) => r.startsWith("uninterpreted_plates:"))).toBe(true);
  });

  // py: test_completeness::test_only_rule_bearing_plates_count_as_uninterpreted
  it("only rule-bearing plates count as not understood", () => {
    // An operator's board is uninterpreted by definition and must not lower the
    // confidence.
    const s = sign();
    s.panels!.push({ index: 9, kind: "info_board", lines: ["EasyPark"],
                     background_color: "white", legibility: { readable: true }, parsed: {} });
    const a = grade(s, { flags: ["uninterpreted_panels:9"] });
    expect(a.uninterpretedPlates).toEqual([]);
    expect(a.category !== PARTIAL || a.reasons.length > 0).toBe(true);
  });
});

describe("corroborating the main sign with plates", () => {
  // Photograph `050` - a private sign with an arrow to a car park on another street -
  // was read as `parking` with confidence 0.998, and the product answered "parking is
  // permitted here". Not one signal fired: there was no contradiction.

  // py: test_completeness::test_a_sign_without_a_single_rule_plate_is_not_a_full_parse
  it("a sign without a single rule-bearing plate is not a full reading", () => {
    const a = grade(pointer());
    expect(a.category).toBe(PARTIAL);
    expect(a.reasons).toContain("main_sign_uncorroborated");
    expect(a.confidence).toBeLessThan(0.9);
  });

  // py: test_completeness::test_no_plates_at_all_still_gets_an_answer
  it("with no plates at all there is still an answer", () => {
    // Silence costs the user more than a caveat.
    const s = pointer();
    s.panels = [];
    s.panel_count = 0;
    const a = grade(s);
    expect(a.category).toBe(PARTIAL);
    expect(hasAnswer(a), "the answer must remain").toBe(true);
  });

  // py: test_completeness::test_one_rule_plate_is_enough_to_corroborate
  it("one rule-bearing plate is enough", () => {
    // A sign pointing to a car park does not charge a fee for driving past itself.
    const s = pointer();
    s.panels![0].parsed = { arrow: "right", fee: true };
    const a = grade(s);
    expect(a.category).toBe(FULL);
    expect(a.reasons).not.toContain("main_sign_uncorroborated");
  });

  // py: test_completeness::test_placement_fields_alone_never_corroborate
  it("fields of place never corroborate on their own", () => {
    // This holds the boundary of the list: "any parsed field" would corroborate
    // itself.
    const cases: [string, unknown][] = [
      ["arrow", "right"], ["placement", "as_shown"],
      ["stretch_metres", { from: 0, to: 15 }], ["place_count", 4], ["pictogram", "parking"],
    ];
    for (const [field, value] of cases) {
      const s = pointer();
      s.panels![0].parsed = { [field]: value } as Panel["parsed"];
      expect(grade(s).reasons, field).toContain("main_sign_uncorroborated");
    }
  });

  // py: test_completeness::test_every_rule_key_is_a_field_the_schema_knows
  it("every field in the lists is a field the schema knows", () => {
    // A typo in the list would silently blind the signal to a whole kind of plate.
    const known = new Set(Object.keys((SIGN_SCHEMA as Record<string, any>).$defs.parsed.properties));
    expect([...RULE_KEYS].filter((k) => !known.has(k))).toEqual([]);
    expect([...PLACEMENT_KEYS].filter((k) => !known.has(k))).toEqual([]);
    expect([...RULE_KEYS].filter((k) => PLACEMENT_KEYS.has(k))).toEqual([]);
  });

  // py: test_completeness::test_the_caption_does_not_claim_a_plate_went_unread
  it("the caption does not claim a plate went unread when there is none", () => {
    // Telling someone "part of the sign was not read" about a sign with no plates is
    // untrue: they will go looking on the pole for something that is not there.
    const caption = (doc: SignDoc) => {
      const a = grade(doc);
      const ev = evaluateParkingRules(doc, NOW, CAL);
      return String(toJson({ doc, recognised: recognise(doc), assessment: a,
                             evaluation: applyAsymmetry(ev, a) }, NOW, CAL)
        .completeness.category_text);
    };
    const uncorroborated = caption(pointer());
    expect(uncorroborated).not.toContain("not read");
    expect(uncorroborated.toLowerCase()).toContain("no plate");
    // And where a plate really was not read, the caption is the ordinary one.
    expect(caption(blank(sign(), 2, "blue"))).toContain("not read");
  });
});

describe("whether the pixels can carry the text that was read", () => {
  // On an 82x179 photograph the model returned four plates of fluent Swedish and not
  // one note about conditions. The product measures the resolution itself.

  // py: test_completeness::test_more_text_than_the_pixels_can_carry_is_not_a_full_parse
  it("more text than the pixels can carry is not a full reading", () => {
    const a = grade(wordy(), { imagePixels: 82 * 179 });
    expect(a.category).toBe(PARTIAL);
    expect(a.reasons).toContain("text_exceeds_the_pixels");
    expect(a.signals.text_fits_the_pixels).toBeLessThan(0.5);
  });

  // py: test_completeness::test_a_large_photo_is_not_punished_for_its_text
  it("a large photograph is not punished for its text", () => {
    const a = grade(wordy(), { imagePixels: 1200 * 1600 });
    expect(a.category).toBe(FULL);
    expect(a.signals.text_fits_the_pixels).toBe(1);
  });

  // py: test_completeness::test_a_small_photo_without_text_is_not_punished
  it("a small photograph with no text is not punished", () => {
    // `032` is 103x188 with two plates carrying not a single letter. What must be
    // measured is the text CLAIMED, not the size of the photograph - otherwise
    // "a small photograph" would mean "a bad photograph".
    const s = sign();
    for (const p of s.panels!) p.lines = [];
    const a = grade(s, { imagePixels: 103 * 188 });
    expect(a.signals.text_fits_the_pixels).toBe(1);
    expect(a.reasons).not.toContain("text_exceeds_the_pixels");
  });

  // py: test_completeness::test_an_unknown_image_size_never_punishes_the_parse
  it("an unknown size never punishes the reading", () => {
    const a = grade(sign(), { imagePixels: null });
    expect(a.signals.text_fits_the_pixels).toBe(1);
    expect(a.category).toBe(FULL);
  });

  // py: test_completeness::test_the_signal_is_graded_not_a_cliff
  it("the signal falls gradually rather than off a cliff", () => {
    const fits = (px: number) => grade(wordy(), { imagePixels: px }).signals.text_fits_the_pixels;
    const large = fits(1200 * 1600);
    const medium = fits(125 * 320);
    const small = fits(82 * 179);
    expect(large).toBe(1);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });
});

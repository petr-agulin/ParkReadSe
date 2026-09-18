// The measurement can find a mistake. Carried over from `tests/test_accuracy.py`
// (step 8).
//
// A tool that shows 100% on any input is worse than no tool at all: it creates
// confidence and gives no information. So every check here damages a reference
// reading in a known way and demands that the measurement see it - and that it NOT
// see what makes no difference to the answer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compare, coveredDays, deadSignals, emptyReport, triageReport, verdictDifferences,
         type Report, type Verdict } from "./measure";
import type { SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const expected = (name: string): SignDoc =>
  JSON.parse(readFileSync(`${ROOT}testset/expected/${name}.json`, "utf-8"));

const share = (rep: Report, field: string) => {
  const f = rep.fields.get(field);
  expect(f, `the field ${field} was never measured`).toBeDefined();
  return f!.total ? f!.hits / f!.total : 0;
};

function measure(e: SignDoc, a: SignDoc, label: string): Report {
  const rep = emptyReport();
  compare(e, a, label, rep);
  return rep;
}

const BASE = "005-2tim-8-18-parentes-8-15-dubbelpil";

describe("comparing a reading with the reference", () => {
  // py: test_accuracy::test_identical_gives_full_marks
  it("an identical reading scores full marks and not one mistake", () => {
    const e = expected(BASE);
    const rep = measure(e, structuredClone(e), "005");
    for (const f of rep.fields.values()) expect(f.hits, f.name).toBe(f.total);
    expect(rep.mistakes).toEqual([]);
  });

  // py: test_accuracy::test_detects_merged_panels
  it("finds merged plates", () => {
    // The mistake from photograph `013`: two plates merged into one.
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels = [a.panels![0]];
    a.panel_count = 1;
    const rep = measure(e, a, "005");
    expect(share(rep, "panel_count")).toBe(0);
    expect(share(rep, "panels.content")).toBe(0);
    expect(rep.mistakes.length).toBeGreaterThan(0);
  });

  // py: test_accuracy::test_detects_wrong_order_even_when_content_is_right
  it("order is measured apart: the same plates reordered are a different rule", () => {
    const e = expected("010-forhyrda-platser-tva-pilar");
    const a = structuredClone(e);
    const p = a.panels!;
    a.panels = [p[2], p[1], p[0], p[3]].map((x, i) => ({ ...x, index: i + 1 }));
    const rep = measure(e, a, "010");
    expect(share(rep, "panels.content"), "the content is the same").toBe(1);
    expect(share(rep, "panels.order"), "but the order is not").toBe(0);
  });

  // py: test_accuracy::test_detects_misread_text
  it("finds text that was read wrongly", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].lines = ["2 tim", "8-18", "8-15"];     // the brackets were lost
    expect(share(measure(e, a, "005"), "panel.lines")).toBeLessThan(1);
  });

  // py: test_accuracy::test_detects_non_rule_panel_taken_for_a_plate
  it("finds a payment board taken for a plate that states a rule", () => {
    // Photographs `002`, `004`, `007`: swapping the kind of panel adds an
    // instruction that is not there.
    const e = expected("002-avgift-forbud-utanfor-markerad-plats");
    const a = structuredClone(e);
    a.panels![3].kind = "sign_plate";
    const rep = measure(e, a, "002");
    expect(share(rep, "panel.rule_bearing")).toBeLessThan(1);
    expect(rep.mistakes.some((m) => m.includes("rule_bearing") || m.includes("marked")))
      .toBe(true);
  });

  // py: test_accuracy::test_detects_rule_plate_taken_for_an_operator_plate
  it("finds a rule-bearing plate marked as an operator's plate", () => {
    // The opposite mistake, and the more expensive one: an instruction silently
    // drops out of the reading.
    const e = expected("004-endast-besokande-pingstkyrkan");
    const a = structuredClone(e);
    a.panels![0].kind = "operator_plate";
    const rep = measure(e, a, "004");
    expect(share(rep, "panel.rule_bearing")).toBeLessThan(1);
    expect(share(rep, "panels.content"), "the instruction left the set of rules").toBe(0);
  });

  // py: test_accuracy::test_confusion_inside_the_non_rule_pair_is_not_an_error
  it("confusion inside the pair that states no rule does not count as a mistake", () => {
    // An operator's plate against a payment board: a difference with no consequence,
    // since both stay outside the engine.
    const e = expected("004-endast-besokande-pingstkyrkan");
    const a = structuredClone(e);
    a.panels![1].kind = "info_board";
    expect(share(measure(e, a, "004"), "panel.rule_bearing")).toBe(1);
  });

  // py: test_accuracy::test_line_wrapping_inside_one_plate_is_not_an_error
  it("a line break inside one plate does not count as a mistake", () => {
    const e = expected("023-avgift-4tim-laddande-elbilar");
    const a = structuredClone(e);
    a.panels![2].lines = ["Endast", "laddande", "elbilar"];
    const rep = measure(e, a, "023");
    expect(share(rep, "panel.lines")).toBe(1);
    expect(share(rep, "panels.content")).toBe(1);
  });

  // py: test_accuracy::test_but_moving_words_between_plates_is_an_error
  it("but moving words between plates is a mistake", () => {
    // The boundary BETWEEN plates is strict: the same words on different plates are
    // a different rule.
    const e = expected("023-avgift-4tim-laddande-elbilar");
    const a = structuredClone(e);
    a.panels![1].lines = ["4 tim", "Endast laddande elbilar"];
    a.panels![2].lines = [];
    expect(share(measure(e, a, "023"), "panels.content")).toBe(0);
  });

  // py: test_accuracy::test_detects_wrong_parsed_field
  it("finds a field parsed wrongly", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].parsed!.duration_limit = { amount: 3, unit: "hours" };
    expect(share(measure(e, a, "005"), "parsed.duration_limit")).toBe(0);
  });

  // py: test_accuracy::test_case_and_spacing_do_not_count_as_errors
  it("case and spacing are not mistakes: what is measured is what was read", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].lines = ["2  TIM", "8-18 ", " (8-15)"];
    expect(share(measure(e, a, "005"), "panel.lines")).toBe(1);
  });

  // py: test_accuracy::test_two_encodings_of_the_same_dates_are_equal
  it("two ways of writing the same dates are equal", () => {
    // `Augusti-Juni` is both "only from 1 August to 30 June" and "except July".
    const only = { mode: "only" as const, ranges: [{ from: "08-01", to: "06-30" }] };
    const except = { mode: "except" as const, ranges: [{ from: "07-01", to: "07-31" }] };
    expect(coveredDays(only)).toEqual(coveredDays(except));
    const other = { mode: "except" as const, ranges: [{ from: "06-01", to: "06-30" }] };
    expect(coveredDays(only), "different rules stay different").not.toEqual(coveredDays(other));
  });
});

describe("triage", () => {
  // py: test_accuracy::test_false_reject_is_counted
  it("counts a false reject - the most expensive mistake of triage", () => {
    const t = triageReport({ a: true, b: true, c: false },
                           { a: "parking_sign", b: "not_a_sign", c: "not_a_sign" });
    expect(t.realSigns).toBe(2);
    expect(t.falseRejects).toBe(1);
    expect(t.falseRejectShare).toBe(0.5);
    expect(t.junkLetThrough).toBe(0);
  });

  // py: test_accuracy::test_junk_let_through_is_counted_separately
  it("counts rubbish let through separately", () => {
    const t = triageReport({ a: true, c: false }, { a: "parking_sign", c: "parking_sign" });
    expect(t.falseRejects).toBe(0);
    expect(t.junkLetThrough).toBe(1);
    expect(t.junkLetThroughShare).toBe(1);
  });
});

describe("disagreement of the ANSWER", () => {
  // The threshold is compared against agreement of the answer, not of the fields: a
  // plate's colour and the order of panels are visible in the reading yet never
  // reach the person.

  /** An hour is a pair of state and conditions: to a person that is one message. */
  function verdict({ permits = true, eligibility = [] as string[],
                     states = Array<string>(24).fill("allowed"),
                     conditions = null as string[][] | null } = {}): Verdict {
    const cond = conditions ?? states.map(() => []);
    return { permitsParking: permits, eligibility,
             states: states.map((s, i) => [s, cond[i]] as [string, string[]]) };
  }

  // py: test_accuracy::test_identical_verdicts_have_no_differences
  it("identical answers do not disagree", () => {
    expect(verdictDifferences(verdict(), verdict())).toEqual([]);
  });

  // py: test_accuracy::test_a_pointer_read_as_a_parking_sign_is_the_whole_verdict
  it("a direction sign read as a parking sign disagrees in the whole answer", () => {
    // `050` and `037`: what disagrees is not a field but the whole answer, and in
    // the direction of widening.
    const diff = verdictDifferences(
      verdict({ permits: false, states: Array(24).fill("prohibited") }), verdict());
    expect(diff.some((d) => d.includes("parking here"))).toBe(true);
    expect(diff.some((d) => d.includes("by state 24/24, of which wider 24"))).toBe(true);
  });

  // py: test_accuracy::test_widening_is_counted_apart_from_narrowing
  it("widening is counted apart from narrowing", () => {
    // An error towards widening costs a tow; the other way, only extra caution.
    const wider = verdictDifferences(verdict({ states: Array(24).fill("prohibited") }),
                                     verdict({ states: Array(24).fill("allowed") }));
    const narrower = verdictDifferences(verdict({ states: Array(24).fill("allowed") }),
                                        verdict({ states: Array(24).fill("prohibited") }));
    expect(wider[0]).toContain("of which wider 24");
    expect(narrower[0]).toContain("of which wider 0");
  });

  // py: test_accuracy::test_a_condition_on_the_wrong_days_is_a_difference_too
  it("a condition on the wrong days is a disagreement too, and not one of state", () => {
    // Sign `030`: a fee on Saturdays, and the reading said Sundays. Hour by hour
    // both answers are `allowed`, so the measurement did not see it; the mistake was
    // found in the browser.
    const reference = verdict({ conditions: [...Array(12).fill(["avgift"]), ...Array(12).fill([])] });
    const answer = verdict({ conditions: [...Array(12).fill([]), ...Array(12).fill(["avgift"])] });
    const diff = verdictDifferences(reference, answer);
    expect(diff.some((d) => d.includes("by conditions 24/24"))).toBe(true);
    expect(diff.some((d) => d.includes("by state"))).toBe(false);
  });

  // py: test_accuracy::test_a_narrowed_circle_of_users_is_a_difference_too
  it("a narrowed set of who may park is a disagreement too", () => {
    // `042`: narrowed to motorcycles where the sign is about bicycles.
    const diff = verdictDifferences(verdict(), verdict({ eligibility: ["pictogram-motorcycle"] }));
    expect(diff.some((d) => d.includes("who may park"))).toBe(true);
  });

  // py: test_accuracy::test_dead_signals_are_the_ones_that_never_moved
  it("dead signals are the ones that never moved", () => {
    const seen = new Map([["a", new Set([1])], ["b", new Set([0, 1])], ["c", new Set<number>()]]);
    expect(deadSignals(seen)).toEqual(["a", "c"]);
  });
});

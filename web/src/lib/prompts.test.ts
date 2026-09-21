// What the prompt is obliged to explain. Carried over from `tests/test_prompts.py`
// (step 8).
//
// A prompt is not a guarantee but a request, and only a run can truly check it. One
// thing is checked without the model, though: **whether the prompt names what the
// model is offered to choose from**. The schema skeleton lists the allowed values —
// enough for an answer to pass validation, not enough to choose the right one.
//
// That is what happened with `main_sign.type`: the values were in the skeleton, but
// nobody explained the DIFFERENCE between them, and on photographs `037` and `050` a
// sign pointing to a car park elsewhere was read as permission to stand at the pole —
// the costliest divergence in the measurement.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fingerprint } from "./measure";
import { triagePrompt } from "./prompts";
import { EXTRACT_INSTRUCTIONS } from "./prompts.data";
import { SIGN_SCHEMA } from "./schema.data";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const T = EXTRACT_INSTRUCTIONS;

describe("what the prompt is obliged to explain", () => {
  // py: test_prompts::test_every_kind_of_main_sign_is_explained_not_just_listed
  it("explains every kind of main sign in words, not only lists it", () => {
    // The choice between them decides whether the talk is of parking HERE.
    const schema = SIGN_SCHEMA as Record<string, any>;
    const values: string[] = schema.properties.main_sign.properties.type.enum;
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !T.includes(v))).toEqual([]);
  });

  // py: test_prompts::test_the_two_prohibition_signs_are_told_apart_by_something_countable
  it("tells the two prohibition signs apart by something countable", () => {
    // `C35` and `C39` are one and the same round sign, differing in the number of bars.
    expect(T).toContain("ONE diagonal bar");
    expect(T).toContain("TWO bars");
  });

  // py: test_prompts::test_brackets_and_red_ink_are_told_apart_by_the_days_they_mean
  it("tells brackets and red ink apart by the days they mean", () => {
    // Photograph `030`: the reading said `red` where the plate had brackets, and the
    // product announced a fee on Sundays instead of Saturdays. A prompt edit broke it:
    // the description of the round signs put the word `red` where "red digits mean red".
    expect(T).toContain("SATURDAYS");
    expect(T).toContain("SUNDAYS");
    expect(T).toContain("Brackets are never about Sundays");
    // The description of the round signs runs from `"prohibition_parking"` to
    // "Count the bars.". The Python version of this test checked an EMPTY string: it
    // cut from the round signs to the wayfinding signs, which come earlier in the
    // prompt, so the slice came out empty. Hence a boundary found in the text, and a
    // check that the slice is not empty.
    const from = T.indexOf('"prohibition_parking"');
    const end = T.indexOf("Count the bars.", from);
    expect(from >= 0 && end > from, "the description of the round signs was not found").toBe(true);
    const round = T.slice(from, end + "Count the bars.".length);
    expect(round).toContain("TWO bars");
    expect(round.toLowerCase()).not.toContain("red");
  });

  // py: test_prompts::test_fields_that_changed_the_answer_are_explained_by_name
  it("explains by name the fields that once changed the answer", () => {
    // `042`: `vehicle_class` replaced by the nearest value; `010`: `permit_required`
    // lost beside `eligibility`; `054`: `prohibition` replaced by `scope_shift`.
    const fields = ["vehicle_class", "permit_required", "prohibition",
                    "scope_shift", "eligibility"];
    expect(fields.filter((f) => !T.includes(f))).toEqual([]);
  });

  // py: test_prompts::test_the_prompt_names_the_fields_it_forbids_guessing_into
  it("says what to answer where the enumeration runs out", () => {
    // Otherwise the model substitutes the nearest value, and a substitution cannot be
    // told from a reading.
    expect(T).toContain("bicycle");
    expect(T).toContain('"other" in "pictogram"');
  });

  // py: test_prompts::test_scope_shift_may_not_be_inferred_from_position
  it("sets `scope_shift` by what is written, not by where the plate sits", () => {
    // Photograph `044`: a `Boende` plate was given `remaining_time`, and the product
    // said "Applies outside the hours above" where the plate carried not one hour.
    expect(T).toContain("ONLY when the plate says so IN WRITING");
    expect(T).toContain("Never infer it from where the plate sits in the stack");
  });
});

describe("the triage prompt", () => {
  // py: test_prompts::test_the_triage_prompt_was_not_disturbed
  it("is untouched: every saved triage answer came from this same question", async () => {
    // An edit to the extraction prompt must not cost the triage answers, as it would
    // if the prompts were shared: the fingerprint would change, and every answer would
    // have to be obtained again. A slip in carrying the prompt text over is caught here.
    const mark = await fingerprint(triagePrompt());
    const saved = new Set(
      readdirSync(`${ROOT}demo`)
        .filter((f) => f.endsWith(".triage.json"))
        .map((f) => JSON.parse(readFileSync(`${ROOT}demo/${f}`, "utf-8")))
        .filter((d) => (d.origin ?? "model") === "model")
        .map((d) => d.prompt_fingerprint ?? "no fingerprint"));
    expect([...saved]).toEqual([mark]);
  });
});

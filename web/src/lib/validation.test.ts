// Checking the model's answer: formatting is repaired, anything with a consequence
// is not. Carried over from `tests/test_accuracy.py` (step 8) - the measurement
// found each of these.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ok, sign as validateSign, triage } from "./validation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** A reference reading from the set - a fresh copy per test: the validator repairs
 *  in place. */
const read = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(`${ROOT}testset/expected/${name}.json`, "utf-8"));

describe("the triage answer", () => {
  // py: test_accuracy::test_extra_field_does_not_destroy_a_triage_answer
  it("an extra field does not ruin the answer; it is removed and recorded", () => {
    // Found by the measurement: on three photographs the triage answer was silently
    // not saved, and the measurement read an older seed as a fresh answer instead.
    const res = triage({ category: "parking_sign", what_i_see: "a sign",
                         panels_below_main_sign: 3,
                         reasoning: "an extra field the schema does not have" });
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data as Record<string, unknown>).not.toHaveProperty("reasoning");
    expect(res.repairs.some((r) => r.includes("reasoning"))).toBe(true);
  });

  // py: test_accuracy::test_long_what_i_see_and_numeric_string_are_repaired
  it("a long description is shortened, a number as a string becomes a number", () => {
    const res = triage({ category: "parking_sign", what_i_see: "it ".repeat(200),
                         panels_below_main_sign: "4" });
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    const data = res.data as Record<string, any>;
    expect(data.panels_below_main_sign).toBe(4);
    expect(data.what_i_see.length).toBeLessThanOrEqual(200);
  });

  // py: test_accuracy::test_bad_category_still_rejects_the_whole_triage
  it("an invented category rejects the whole answer", () => {
    // `category` decides the fate of the pipeline - that is not repaired.
    expect(ok(triage({ category: "perhaps", what_i_see: "a sign",
                       panels_below_main_sign: 1 }))).toBe(false);
  });
});

describe("reading a sign", () => {
  // py: test_accuracy::test_unknown_enum_value_does_not_destroy_the_parse
  it("an unknown value in an optional field does not ruin the reading", () => {
    // Photograph `009`: the model wrote `payment_method=mobile` when the schema no
    // longer had that value. The field is dropped with a repair, and the correctly
    // read sign remains.
    const doc = JSON.parse(readFileSync(`${ROOT}testset/expected/009-besokande-avgift.json`, "utf-8"));
    doc.panels[1].parsed.payment_method = "mobile";
    const res = validateSign(doc);
    expect(ok(res), "the reading was not rejected wholesale").toBe(true);
    expect(res.data!.panels![1].parsed).not.toHaveProperty("payment_method");
    expect(res.repairs.some((r) => r.includes("payment_method"))).toBe(true);
  });

  it("a colour outside the enumeration becomes `other`, and the reading stays", () => {
    // A live run on photograph `014`: the model called the background `grey` - the
    // back of another sign on the same pole. Strictness would have cost a correctly
    // read sign in full.
    const doc = read("009-besokande-avgift");
    doc.panels[0].background_color = "grey";
    doc.main_sign.background_color = "greyish-purple";

    const res = validateSign(doc);
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data!.main_sign.background_color).toBe("other");
    expect(res.data!.panels![0].background_color).toBe("other");
    // The repair is recorded verbatim, quoting included.
    expect(res.repairs).toEqual([
      "main sign colour 'greyish-purple' -> 'other' - not in the schema enumeration",
      "panel 1: colour 'grey' -> 'other' - not in the schema enumeration",
    ]);
  });

  it("a missing colour is not repaired: that is an absent answer, not a shade", () => {
    // The boundary of repair. Without this check, "we fix the colour" would one day
    // become "we invent a field the model never gave".
    const doc = read("009-besokande-avgift");
    delete doc.panels[0].background_color;

    const res = validateSign(doc);
    expect(ok(res), "a required field went missing - that must be visible").toBe(false);
    expect(res.repairs.some((r) => r.includes("colour"))).toBe(false);
  });
});

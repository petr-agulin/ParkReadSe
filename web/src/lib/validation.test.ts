// Checking the model's answer: formatting is repaired, anything with a consequence
// is not. Carried over from `tests/test_accuracy.py` (step 8) - the measurement
// found each of these.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ok, sign as validateSign, triage } from "./validation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** A reference reading from the set - a fresh copy per test: the validator repairs
 *  in place. */
const read = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(`${ROOT}testset/expected/${name}.json`, "utf-8"));

describe("the triage answer", () => {
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

  it("a long description is shortened, a number as a string becomes a number", () => {
    const res = triage({ category: "parking_sign", what_i_see: "it ".repeat(200),
                         panels_below_main_sign: "4" });
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    const data = res.data as Record<string, any>;
    expect(data.panels_below_main_sign).toBe(4);
    expect(data.what_i_see.length).toBeLessThanOrEqual(200);
  });

  it("an invented category rejects the whole answer", () => {
    // `category` decides the fate of the pipeline - that is not repaired.
    expect(ok(triage({ category: "perhaps", what_i_see: "a sign",
                       panels_below_main_sign: 1 }))).toBe(false);
  });
});

describe("reading a sign", () => {
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

describe("contradictions inside one reading", () => {
  const P059 = "059-avstand-p-skiva-2tim-darefter-avgift";

  it("drops a ticket claimed beside a fee on the same plate", () => {
    // Photograph `059` exactly as the model read it: the parking disc taken for a
    // ticket, beside `därefter avgift`. `P-biljett` means free with a ticket shown, a
    // fee means paid - one plate cannot mean both, and the fee is what it spells out.
    const doc = read(P059);
    doc.panels[0].parsed.payment_method = "ticket";
    const res = validateSign(doc);
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data!.panels![0].parsed).not.toHaveProperty("payment_method");
    expect(res.data!.panels![0].parsed!.fee).toBe(true);
    expect(res.repairs.some((r) => r.includes("ticket") && r.includes("fee"))).toBe(true);
  });

  it("leaves a ticket alone where no fee stands beside it", () => {
    const doc = read(P059);
    delete doc.panels[0].parsed.fee;
    doc.panels[0].parsed.payment_method = "ticket";
    const res = validateSign(doc);
    expect(res.data!.panels![0].parsed!.payment_method).toBe("ticket");
    expect(res.repairs).toEqual([]);
  });

  it("keeps the hours a fee lost in plain sight, instead of charging round the clock", () => {
    // Photograph `088`: `Avgift / 8-20 / (8-15)` arrived as a fee with no hours, and
    // the answer showed a full paid day. The lines with the hours move to
    // `uninterpreted`, so the plate reads as incomplete rather than as wrong.
    const doc = read(P059);
    delete doc.panels[0].parsed.time_windows;
    const res = validateSign(doc);
    expect(res.data!.panels![0].parsed!.uninterpreted)
      .toEqual(["07-20", "(08-17)", "09-16"]);
    expect(res.repairs.some((r) => r.includes("printed on the plate"))).toBe(true);
  });

  it("does not take a stretch in metres for hours", () => {
    const doc = read(P059);
    delete doc.panels[0].parsed.time_windows;
    doc.panels[0].lines = ["Avgift", "0-15 m"];
    const res = validateSign(doc);
    expect(res.data!.panels![0].parsed).not.toHaveProperty("uninterpreted");
    expect(res.repairs).toEqual([]);
  });

  it("never fires on a reading marked by hand", () => {
    // The claim the code comment makes, held by a test: over every hand-marked
    // reading of the set, neither contradiction is ever found. A check that fired on
    // the ground truth would be repairing correct answers.
    const dir = `${ROOT}testset/expected/`;
    const fired = readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) =>
      validateSign(JSON.parse(readFileSync(dir + f, "utf-8"))).repairs
        .filter((r) => r.includes("contradict") || r.includes("printed on the plate")
                   || r.includes("dygn") || r.includes("dropped obstruction")
                   || r.includes("parking-disc symbol") || r.includes("Privat parkering"))
        .map((r) => `${f}: ${r}`));
    expect(fired).toEqual([]);
  });
});

describe("a stay given in days", () => {
  const P062 = "062-klass-i-14-dygn-slapfordon-forbud";
  const limitOf = (doc: Record<string, any>) =>
    doc.panels.find((p: any) => p.parsed?.duration_limit).parsed.duration_limit;

  it("is put right where the days arrived as hours", () => {
    // `094`: `7 dygn` came back as seven HOURS, a sixth of the stay. The schema has
    // the unit now, so the figure equal to the printed number of days is corrected
    // rather than dropped, and the repair is written down.
    const doc = read(P062);
    const plate = doc.panels.find((p: any) => p.parsed?.duration_limit);
    plate.lines = ["7 dygn"];
    plate.parsed.duration_limit = { amount: 7, unit: "hours" };
    const res = validateSign(doc);
    expect(limitOf(res.data!)).toEqual({ amount: 7, unit: "days" });
    expect(res.repairs.some((r) => r.includes("dygn"))).toBe(true);
  });

  it("is left alone where the arithmetic was done", () => {
    // `062` itself: `14 dygn` as 336 hours is right, and must not be touched.
    const doc = read(P062);
    const before = JSON.stringify(limitOf(doc));
    const res = validateSign(doc);
    expect(JSON.stringify(limitOf(res.data!))).toBe(before);
    expect(res.repairs.filter((r) => r.includes("dygn"))).toEqual([]);
  });
});

describe("the second-post flag", () => {
  it("is kept with the reading, though the screen does not show it yet", () => {
    // Decision 172: collected now, measured in step 15g. A flag dropped on the way in
    // would leave 15g nothing to measure.
    const doc = read("003-p-2tim");
    doc.another_post_in_frame = true;
    const res = validateSign(doc);
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data!.another_post_in_frame).toBe(true);
  });
});

describe("an obstruction the schema does not list", () => {
  it("is dropped, and the reading stays", () => {
    // Photograph `063`, at night in the rain: the model reported `rain` on the main
    // sign and both plates, and a correctly shaped reading was refused whole, run
    // after run. The list has no `other`, so the value goes and the repair is kept.
    const doc = read("063-natt-p-tillstand-06-16-p-skiva-3tim");
    doc.main_sign.legibility = { readable: true, obstructions: ["rain", "glare"] };
    doc.panels[0].legibility = { readable: true, obstructions: ["rain"] };
    const res = validateSign(doc);
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data!.main_sign.legibility!.obstructions).toEqual(["glare"]);
    expect(res.data!.panels![0].legibility!.obstructions).toEqual([]);
    expect(res.repairs.filter((r) => r.includes("'rain'"))).toHaveLength(2);
  });

  it("does not hide a broken answer behind the same repair", () => {
    // A number where a word belongs is not an unlisted obstruction but a broken
    // answer, and the schema must still refuse it - as with the colours.
    const doc = read("063-natt-p-tillstand-06-16-p-skiva-3tim");
    doc.main_sign.legibility = { readable: true, obstructions: [7] };
    expect(ok(validateSign(doc))).toBe(false);
  });
});

describe("a parking-disc symbol with no requirement beside it", () => {
  const P063 = "063-natt-p-tillstand-06-16-p-skiva-3tim";

  it("gets the requirement the symbol states", () => {
    // `063` as the model read it on the 15f run: the disc drawn, the requirement left
    // out, and "3 tim" said as though no disc were needed - graded full at 0.975.
    const doc = read(P063);
    delete doc.panels[1].parsed.payment_method;
    doc.panels[1].parsed.pictogram = "parking_disc";
    const res = validateSign(doc);
    expect(res.data!.panels![1].parsed!.payment_method).toBe("parking_disc");
    expect(res.repairs.some((r) => r.includes("parking-disc symbol"))).toBe(true);
  });

  it("leaves a method the plate does name alone", () => {
    // `057` offers a disc OR a free ticket; the symbol does not overrule what is written.
    const doc = read(P063);
    doc.panels[1].parsed.pictogram = "parking_disc";
    doc.panels[1].parsed.payment_method = "ticket";
    const res = validateSign(doc);
    expect(res.data!.panels![1].parsed!.payment_method).toBe("ticket");
    expect(res.repairs.filter((r) => r.includes("parking-disc symbol"))).toEqual([]);
  });
});

describe("a plate reading \"Privat parkering\"", () => {
  it("opens no exception, and stays the sign plate it is", () => {
    // `068` as the model read it: under a no-parking board, "Privat parkering" became
    // parking for a named group, and the answer drew them a window. For the public
    // it is no parking, with private parking as the reason (the developer, 2026-09-25).
    const doc = read("068-parkering-forbjuden-privat-parkering");
    doc.panels[0] = { ...doc.panels[0], kind: "sign_plate",
                      parsed: { eligibility: "custom", permits_parking: true } };
    const res = validateSign(doc);
    expect(res.data!.panels![0].kind).toBe("sign_plate");
    expect(res.data!.panels![0].parsed).toEqual({});
    expect(res.repairs.some((r) => r.includes("Privat parkering"))).toBe(true);
  });
});

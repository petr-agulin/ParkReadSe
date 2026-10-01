// The layer that SPEAKS TO A PERSON. A mistake here does not fail a run — it changes
// the meaning of a phrase, and only reading notices that. The double run compares the
// finished text whole; what is checked here is what it cannot prove: that the product
// has not begun to permit, to order and to promise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { applyAsymmetry, grade } from "./completeness";
import { evaluateParkingRules } from "./engine";
import { OFFLINE_NOTE } from "./offline";
import { CLOCK_CHANGE_TEXT, NOT_READ_RELIABLY, NO_WINDOW_TOO_LITTLE_READ,
         PERIOD_HEADLINE, REASON_TEXT, STATE_TEXT,
         SHOW_ANOTHER_POST, UNCERTAINTY_TEXT, timePhrase, toJson } from "./present";
import { recognise } from "./reference";
import type { SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();

function answers(): string {
  // The whole set at once: a forbidden wording may come out on one sign in fifty, and
  // checking one convenient photograph means not checking.
  const cases = JSON.parse(readFileSync(`${ROOT}parity/cases.json`, "utf-8"));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cases as { doc: string; moment: string }[]) {
    const id = `${c.doc}@${c.moment}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [where, stem] = c.doc.split("/");
    const path = where === "answers" ? `${ROOT}testset/answers/${stem}.extract.json`
                                  : `${ROOT}testset/expected/${stem}.json`;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const doc: SignDoc = where === "answers" ? raw.response : raw;
    const moment = parseNaive(c.moment);
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev });
    out.push(JSON.stringify(toJson({
      doc, recognised: recognise(doc), assessment: a,
      evaluation: applyAsymmetry(ev, a),
    }, moment, cal)));
  }
  return out.join("\n").toLowerCase();
}

describe("the vocabulary of wordings", () => {
  // The product's vocabulary: it speaks ABOUT THE SIGN, and does
  // not permit, order or promise in its own voice. The check moved together with the
  // words: left in Python, it would have gone with Python, and the product would have
  // lost exactly the safeguard the wordings are kept in one place for.
  const FORBIDDEN = ["parking allowed", "you may park", "you can park here",
                     "you need to move the car", "you must", "it is safe to",
                     "we recommend"];

  it("permits and orders nothing in the answer on any sign of the set", () => {
    const text = answers();
    for (const bad of FORBIDDEN) expect(text, bad).not.toContain(bad);
  });

  it("keeps the finished captions to the vocabulary too", () => {
    // The words about being offline are the product's words too, and the vocabulary
    // covers them: they live in another file only because the service worker reads them.
    const tables = [STATE_TEXT, PERIOD_HEADLINE, REASON_TEXT, UNCERTAINTY_TEXT,
                    CLOCK_CHANGE_TEXT, { offline: OFFLINE_NOTE }];
    for (const table of tables) {
      for (const [key, text] of Object.entries(table)) {
        for (const bad of FORBIDDEN) {
          expect(text.toLowerCase(), `${key}: ${bad}`).not.toContain(bad);
        }
      }
    }
  });

  it('allows "Free parking" as the one exception, and only with no conditions', () => {
    // The vocabulary forbids this wording: it promises no charge where a disc or a
    // ticket may be required. It is allowed exactly where there are no conditions.
    expect(PERIOD_HEADLINE.free).toBe("Free parking");
    expect(PERIOD_HEADLINE.free_with_conditions).toBe("No fee stated for this period");
  });

  it("names every state of a stretch in words about the sign", () => {
    for (const text of Object.values(STATE_TEXT)) {
      expect(text.toLowerCase()).toContain("the sign");
    }
  });
});

describe("a reading too thin to answer from", () => {
  const cal = new Calendar();
  const moment = parseNaive("2026-03-02T12:00");

  const answer = (doc: SignDoc, imagePixels: number | null = null) => {
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev, imagePixels });
    return toJson({ doc, recognised: recognise(doc), assessment: a,
                    evaluation: applyAsymmetry(ev, a) }, moment, cal) as any;
  };

  const doc = (panels: Record<string, unknown>[]): SignDoc => ({
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: panels.map((p, i) => ({ ...p, index: i + 1 })),
    panel_count: panels.length,
  } as unknown as SignDoc);

  const wordy = doc([{
    kind: "sign_plate", background_color: "blue", legibility: { readable: true },
    lines: ["Avgift 8-20", "Endast for boende med tillstand", "Ovrig tid 4 tim"],
    parsed: { fee: true },
  }]);

  it("draws no timeline at all, and says why", () => {
    // `074` and `080`: the screen said "too little of the sign was read" and drew a
    // full day of free parking beneath the words. A refusal that still answers is no
    // refusal. The pixel budget decides it without waiting on the model to admit
    // anything (decision 156).
    const thin = answer(wordy, 60 * 60);
    expect(thin.completeness.category).toBe("insufficient");
    expect(thin.has_answer).toBe(false);
    expect(thin.regimes[0].periods).toEqual([]);
    expect(thin.regimes[0].no_window_text).toBe(NO_WINDOW_TOO_LITTLE_READ);
  });

  it("keeps the window when the photograph is big enough to carry the words", () => {
    // The gate must cost nothing on a good photograph: the same sign, more pixels.
    const fat = answer(wordy, 1600 * 1200);
    expect(fat.completeness.category).not.toBe("insufficient");
    expect(fat.regimes[0].periods.length).toBeGreaterThan(0);
    expect(fat.regimes[0].no_window_text).toBeNull();
  });

  it("does not quote the plates of a reading it refused", () => {
    // The harm is not the refusal, it is the words: printed beside it they read as
    // something that WAS read. On `075` the product quoted a plate off a sign the
    // developer could not make out at all.
    const thin = answer(wordy, 60 * 60);
    expect(thin.what_we_saw.panels[0].text).toBe("");
    expect(thin.what_we_saw.panels[0].unreliable).toBe(true);
    expect(thin.what_we_saw.panels[0].not_interpreted_text).toBe(NOT_READ_RELIABLY);
    // And the words come back when the reading stands.
    expect(answer(wordy, 1600 * 1200).what_we_saw.panels[0].text.length)
      .toBeGreaterThan(0);
  });

  it("does not quote a single plate the model called illegible", () => {
    // Per plate, and at any category: `079`, `085`, `114`. The reading as a whole may
    // be sound while one plate of it is not.
    const mixed = answer(doc([
      { kind: "sign_plate", background_color: "blue", legibility: { readable: true },
        lines: ["Avgift"], parsed: { fee: true } },
      { kind: "sign_plate", background_color: "blue", legibility: { readable: false },
        lines: ["Forhyrda platser"], parsed: { eligibility: "rented" } },
    ]), 1600 * 1200);
    expect(mixed.what_we_saw.panels[0].text).toBe("Avgift");
    expect(mixed.what_we_saw.panels[0].unreliable).toBe(false);
    expect(mixed.what_we_saw.panels[1].text).toBe("");
    expect(mixed.what_we_saw.panels[1].unreliable).toBe(true);
  });
});

describe("a window addressed to a named circle", () => {
  const cal = new Calendar();
  const moment = parseNaive("2026-03-02T12:00");

  const periods = (parsed: Record<string, unknown>, lines: string[] = ["TAXI"]) => {
    const doc = {
      schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panels: [{ index: 1, kind: "sign_plate", background_color: "blue",
                 legibility: { readable: true }, lines, parsed }],
      panel_count: 1,
    } as unknown as SignDoc;
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev });
    return (toJson({ doc, recognised: recognise(doc), assessment: a,
                     evaluation: applyAsymmetry(ev, a) }, moment, cal) as any)
      .regimes[0].periods;
  };

  it("is drawn broken, because it is not addressed to whoever is reading", () => {
    // Photograph `071`: a taxi bay drew a solid line, which answers "you may park
    // here" to a driver who is not a taxi. The developer's rule (2026-09-22): a
    // narrowed circle breaks the line, an open one does not.
    expect(periods({ eligibility: "rented" })[0].restricted).toBe(true);
  });

  it("is drawn solid where the sign narrows nobody", () => {
    // `097`: paid parking open to everyone was drawn broken for no reason. A plate
    // that merely ADDS - `Boende` - narrows no circle and must not break the line.
    expect(periods({ fee: true })[0].restricted).toBe(false);
    expect(periods({ eligibility: "residents" })[0].restricted).toBe(false);
  });

  const permitted = (p: any) => p.conditions.some((t: any) => t.key === "sarskilt-p-tillstand");

  it("is drawn broken in the hours a permit is spelled for, and only in them", () => {
    // Photograph `006`: the permit's 07-17 stretch was drawn solid. A circle spelled
    // out by the hour leaves the window's audience so its line is not repeated
    // (`012`), but it narrows those hours all the same (developer, 2026-10-01).
    const allowed = periods({ permit_required: true,
                              time_windows: [{ from: "07:00", to: "17:00", day_class: "weekday" }] },
                            ["Särskilt P-tillstånd", "erfordras 7-17"])
      .filter((p: any) => p.state === "allowed");
    const inHours = allowed.filter(permitted);
    const outside = allowed.filter((p: any) => !permitted(p));
    expect(inHours.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
    expect(inHours.every((p: any) => p.restricted)).toBe(true);
    expect(outside.some((p: any) => p.restricted)).toBe(false);
  });

  it("is drawn broken throughout where the permit names no hours", () => {
    // `018`: a permit with no hours narrows the whole window.
    const allowed = periods({ permit_required: true }, ["Särskilt P-tillstånd", "erfordras"])
      .filter((p: any) => p.state === "allowed");
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed.every((p: any) => p.restricted)).toBe(true);
  });
});

describe("the fields step 15f added, in words", () => {
  const cal = new Calendar();
  const moment = parseNaive("2026-09-23T12:00");
  const answer = (doc: SignDoc) => {
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev });
    return toJson({ doc, recognised: recognise(doc), assessment: a,
                    evaluation: applyAsymmetry(ev, a) }, moment, cal) as any;
  };
  const doc = (panels: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: panels.map((p, i) => ({ background_color: "blue", legibility: { readable: true },
                                    lines: [], ...p, index: i + 1 })),
    panel_count: panels.length, ...extra,
  } as unknown as SignDoc);

  it("says a monthly window is monthly", () => {
    // `114` and `120` were told "on weekdays", a daily ban for a monthly one.
    expect(timePhrase({ time_windows: [{ from: "08:00", to: "12:00", day_class: "all_days",
                                         day_of_month: 1 }] }))
      .toBe("on the 1st of every month between 08:00 and 12:00");
    expect(timePhrase({ time_windows: [{ from: "08:00", to: "12:00",
                                         day_class: "named_weekday",
                                         named_weekday: "tuesday", nth_of_month: 3 }] }))
      .toBe("on the 3rd Tuesday of every month between 08:00 and 12:00");
  });

  it("shows a road sign on the post as a sign, not as a plate it failed to read", () => {
    // `118`: the priority-road diamond came back as a plate that could not be
    // interpreted, and took the confidence of the whole reading down with it.
    const d = answer(doc([
      { kind: "sign_plate", lines: ["2 tim"], parsed: { duration_limit: { amount: 2, unit: "hours" } } },
      { kind: "other_sign", parsed: { road_sign: "priority_road" } },
    ]));
    const road = d.what_we_saw.panels[1];
    // Not tagged "Not a parking rule": the engine decides by it whether parking is
    // allowed at all (decision 180).
    expect(road.carries_rule).toBe(true);
    expect(road.meanings[0].key).toBe("priority-road");
    expect(d.completeness.category).toBe("full");
  });

  it("tags a plate \"Not a parking rule\" only when it is not about the rules at all", () => {
    // Decided by the reference, not by the kind the model gave the plate (decision
    // 180): every entry the plate matched is `no_rule`, and no words are left over.
    // A tariff is not tagged: the product does not say how much the fee is, but a
    // reader takes the plate for part of the rules (decision 181).
    const plates: [string, Record<string, unknown>, boolean][] = [
      ["an operator plate", { kind: "operator_plate", lines: ["Mölndals Parkerings AB", "031-87 54 79"],
        parsed: { operator: { name: "Mölndals Parkerings AB", phone: "031-87 54 79" } } }, true],
      ["a payment board", { kind: "info_board", lines: ["Områdeskod 31370"],
        parsed: { area_code: "31370" } }, true],
      ["an app area code on a plate", { kind: "sign_plate", lines: ["Områdeskod 31370"],
        parsed: { area_code: "31370" } }, true],
      ["a tariff number alone", { kind: "sign_plate", lines: ["Taxa 3"],
        parsed: { tariff_code: "3" } }, false],
      ["a fee with its tariff", { kind: "sign_plate", lines: ["Avgift", "Taxa 3"],
        parsed: { fee: true, tariff_code: "3" } }, false],
      ["private land", { kind: "sign_plate", lines: ["Privat", "parkering"], parsed: {} }, false],
      ["a priority road", { kind: "other_sign", parsed: { road_sign: "priority_road" } }, false],
      ["a plate nobody understood", { kind: "sign_plate", lines: ["Camping förbjuden"],
        parsed: {} }, false],
      ["a tariff with words left over", { kind: "sign_plate", lines: ["Taxa 3", "Gäller ej lastbil"],
        parsed: { tariff_code: "3", uninterpreted: ["Gäller ej lastbil"] } }, false],
    ];
    const seen = answer(doc(plates.map(([, p]) => p))).what_we_saw.panels;
    expect(plates.map(([name], i) => `${name}: ${seen[i].carries_rule ? "no tag" : "tagged"}`))
      .toEqual(plates.map(([name, , tagged]) => `${name}: ${tagged ? "tagged" : "no tag"}`));
  });

  it("holds the second-post line back until the flag is measured", () => {
    // `096` is what the line is for, but on the first live run the model set the flag
    // on 18 of 127 photographs, most with no second post at all (decision 172). The
    // line stays off the screen until step 15g shows the flag can be trusted; switching
    // it on before that fails here.
    expect(SHOW_ANOTHER_POST, "measure the flag in 15g before showing it").toBe(false);
    const two = answer(doc([{ kind: "sign_plate", lines: ["2 tim"],
                              parsed: { duration_limit: { amount: 2, unit: "hours" } } }],
                           { another_post_in_frame: true }));
    expect(two.uncertainties.map((u: any) => u.text).join(" ")).not.toContain("Another sign post");
  });

  it("does not claim there is no sign at all when triage turns a photograph away", () => {
    // Triage files a sign too far away to read with photographs showing no sign, and
    // the screen said "no road sign at all" of `074` and `080`, which are full of them.
    expect(REASON_TEXT["triage:not_a_sign"]).not.toMatch(/no road sign at all/i);
    expect(REASON_TEXT["triage:not_a_sign"]).toMatch(/too far/);
  });
});

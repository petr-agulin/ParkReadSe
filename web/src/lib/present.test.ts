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
import { CLOCK_CHANGE_TEXT, PERIOD_HEADLINE, REASON_TEXT, STATE_TEXT,
         UNCERTAINTY_TEXT, toJson } from "./present";
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
    const path = where === "demo" ? `${ROOT}demo/${stem}.extract.json`
                                  : `${ROOT}testset/expected/${stem}.json`;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const doc: SignDoc = where === "demo" ? raw.response : raw;
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

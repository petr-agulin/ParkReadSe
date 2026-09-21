// The honesty of the set and the measurement. Carried over from
// `tests/test_accuracy.py` (step 8).
//
// The measurement rests on the set, and the set is obliged to be declared: every
// photograph has a named state, every answer a ground truth, the coverage shows as a
// number, and the threshold still stands on what it was counted on.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { FULL } from "../src/lib/completeness";
import { fingerprint, verdictDifferences, verdictSlice } from "../src/lib/measure";
import { GOOD_ENOUGH } from "../src/lib/present";
import { extractPrompt } from "../src/lib/prompts";
import { ANSWERS, EXPECTED, PENDING_GROUND_TRUTH, ROOT, assessAnswer, loadPairs,
         loadTriageExpectations, marked, photos } from "./testset";

const intersect = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x)).sort();

describe("the coverage of the measurement", () => {
  it("keeps a hand-marked seed out of the measurement", () => {
    // A seed is the ground truth itself; measuring by it compares the ground truth
    // with itself. The check builds its own answers rather than looking into `testset/answers/`:
    // there are no seeds there any more, and a test leaning on the working folder would
    // fall silent just when the protection is needed.
    const label = "005-2tim-8-18-parentes-8-15-dubbelpil";
    const doc = JSON.parse(readFileSync(join(EXPECTED, `${label}.json`), "utf-8"));
    const dir = mkdtempSync(join(tmpdir(), "parkread-pairs-"));
    try {
      writeFileSync(join(dir, `${label}.extract.json`),
                    JSON.stringify({ origin: "model", response: doc }));
      writeFileSync(join(dir, "010-forhyrda-platser-tva-pilar.extract.json"),
                    JSON.stringify({ origin: "hand_marked", response: doc }));
      const pairs = loadPairs(EXPECTED, dir, { onlyModel: true });
      const everything = loadPairs(EXPECTED, dir, { onlyModel: false });
      expect(pairs).toHaveLength(1);
      expect(everything).toHaveLength(2);
      expect(pairs[0].label).toBe(label);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pairs every saved answer with its ground truth", () => {
    // Catches a mismatch: the answer is there, the ground truth is there, but the pair
    // does not form because a name drifted in a rename.
    const pairs = new Set(loadPairs(EXPECTED, ANSWERS, { onlyModel: true }).map((p) => p.label));
    const answered = new Set(readdirSync(ANSWERS).filter((f) => f.endsWith(".extract.json"))
                                              .map((f) => f.slice(0, -".extract.json".length)));
    expect(intersect(marked(), answered)).toEqual([...pairs].sort());
  });

  it("shows the coverage as a number no larger than the ground truths", () => {
    // The number itself is not pinned: it changes with every run.
    expect(loadPairs(EXPECTED, ANSWERS).length).toBeLessThanOrEqual(marked().size);
  });
});

describe("every photograph's state is declared", () => {
  const notASign = new Set(Object.keys(loadTriageExpectations()));

  it("has every photograph marked, declared not a sign, or awaiting marking", () => {
    // Without the third state "forgot to mark" cannot be told from "not marked yet";
    // without the second, an unmarked sign is confused with rubbish.
    const done = marked();
    const unaccounted = [...photos()].filter((p) => !done.has(p) && !notASign.has(p)
                                                    && !PENDING_GROUND_TRUTH.has(p));
    expect(unaccounted.sort()).toEqual([]);
  });

  it("never has a photograph in two states at once", () => {
    expect(intersect(marked(), notASign)).toEqual([]);
    expect(intersect(PENDING_GROUND_TRUTH, notASign)).toEqual([]);
  });

  it("empties the pending list: once a ground truth appears, the photograph leaves it", () => {
    expect(intersect(PENDING_GROUND_TRUTH, marked())).toEqual([]);
  });

  it("has a verbatim transcript for every photograph", () => {
    // The transcript is the first layer of the set: without it a photograph cannot be
    // marked.
    const text = readFileSync(join(ROOT, "testset", "TRANSCRIPTS.md"), "utf-8");
    const sections = new Set([...text.matchAll(/^## (\d{3}) /gm)].map((m) => m[1]));
    const numbers = new Set([...photos()].map((p) => p.slice(0, 3)));
    expect([...numbers].sort()).toEqual([...sections].sort());
  });
});

describe("the threshold", () => {
  it("still stands on what it was counted on", async () => {
    // The 0.9 threshold was not chosen but counted, and the count must hold tomorrow
    // too. If an edit to the prompt, the weights or the engine shifts the picture, the
    // test names the photograph, and the threshold has to be recounted deliberately.
    const cal = new Calendar();
    const moment = parseNaive("2026-03-02T00:00");
    const pairs = loadPairs(EXPECTED, ANSWERS, { promptFingerprint: await fingerprint(extractPrompt()) });
    // There may be no pairs if the prompt was just edited and there was no run. Passing
    // silently is not allowed here: "0 checks" looks like "everything agreed".
    expect(pairs.length, "no answers to the current prompt: it was edited without a run")
      .toBeGreaterThan(0);

    const escaped: string[] = [];
    for (const { label, expected, actual } of pairs) {
      const diff = verdictDifferences(verdictSlice(expected, moment, cal),
                                      verdictSlice(actual, moment, cal));
      if (!diff.length) continue;
      const a = assessAnswer(label, actual, moment, cal);
      if (a.category === FULL && a.confidence >= GOOD_ENOUGH) escaped.push(label);
    }
    // One escape is left: `059`. Confidence 0.998, and the threshold does not catch it —
    // the reading is internally consistent; it simply read the wrong set of conditions.
    expect(escaped).toEqual(["059-avstand-p-skiva-2tim-darefter-avgift"]);
  });
});

// The honesty of the set and the measurement. Carried over from
// `tests/test_accuracy.py` (step 8).
//
// The measurement rests on the set, and the set is obliged to be declared: every
// photograph has a named state, every answer a ground truth, the coverage shows as a
// number, and the threshold still stands on what it was counted on.

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { FULL, INSUFFICIENT } from "../src/lib/completeness";
import { fingerprint, verdictDifferences, verdictSlice } from "../src/lib/measure";
import { GOOD_ENOUGH } from "../src/lib/present";
import { extractPrompt } from "../src/lib/prompts";
import { ANSWERS, EXPECTED, PENDING_GROUND_TRUTH, PHOTOS, ROOT, assessAnswer, loadPairs,
         answersFromAnotherPrompt, asShown, buildPhotoIndex, loadTriageExpectations,
         loadUnreadable, marked, photoIndex, photos, triageAnswers } from "./testset";

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

  it("names an answer to an older prompt aloud, and leaves it out of the count", () => {
    // After the full run of step 15f the set holds no outdated answer at all, so the
    // mechanism is proved on answers built here, not on the working folder.
    const label = "005-2tim-8-18-parentes-8-15-dubbelpil";
    const doc = JSON.parse(readFileSync(join(EXPECTED, `${label}.json`), "utf-8"));
    const dir = mkdtempSync(join(tmpdir(), "parkread-outdated-"));
    try {
      writeFileSync(join(dir, `${label}.extract.json`),
                    JSON.stringify({ response: doc, prompt_fingerprint: "older-prompt" }));
      expect(answersFromAnotherPrompt(EXPECTED, dir, "current-prompt")).toEqual([label]);
      expect(loadPairs(EXPECTED, dir, { promptFingerprint: "current-prompt" })).toEqual([]);
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

describe("the index of the photographs", () => {
  // The photographs stay on the developer's disk (decision 185); the index is what
  // the repository carries. On a clone without them there is nothing to compare, and
  // the test says so by skipping rather than passing.
  it.skipIf(!existsSync(PHOTOS))("matches the photographs, where they are", () => {
    expect(photoIndex()).toEqual(buildPhotoIndex());
  });

  it("knows the pixels of every photograph", () => {
    const unknown = Object.entries(photoIndex()).filter(([, e]) => !e.pixels).map(([k]) => k);
    expect(unknown).toEqual([]);
    expect(photos().size).toBeGreaterThan(0);
  });
});

describe("every photograph's state is declared", () => {
  const notASign = new Set(Object.keys(loadTriageExpectations()));
  const unreadable = loadUnreadable();

  it("has every photograph marked, declared not a sign, declared unreadable, or awaiting marking", () => {
    // Without the pending state "forgot to mark" cannot be told from "not marked yet";
    // without "not a sign", an unmarked sign is confused with rubbish; without
    // "unreadable", a parking sign nobody can read would have to pose as one of those
    // (decision 176).
    const done = marked();
    const unaccounted = [...photos()].filter((p) => !done.has(p) && !notASign.has(p)
                                                    && !unreadable.has(p)
                                                    && !PENDING_GROUND_TRUTH.has(p));
    expect(unaccounted.sort()).toEqual([]);
  });

  it("never has a photograph in two states at once", () => {
    expect(intersect(marked(), notASign)).toEqual([]);
    expect(intersect(PENDING_GROUND_TRUTH, notASign)).toEqual([]);
    expect(intersect(unreadable, marked())).toEqual([]);
    expect(intersect(unreadable, notASign)).toEqual([]);
    expect(intersect(unreadable, PENDING_GROUND_TRUTH)).toEqual([]);
  });

  it("gets a refusal on every photograph nobody can read", () => {
    // The right answer to an unreadable sign is no answer, whichever way it comes:
    // triage turning the photograph away, or a reading graded insufficient, which
    // draws no window. A window here would be a guess dressed as a reading.
    expect(unreadable.size, "the list of unreadable photographs is empty").toBeGreaterThan(0);
    const triage = triageAnswers();
    const cal = new Calendar();
    const moment = parseNaive("2026-03-02T00:00");
    const answered: string[] = [];
    for (const label of unreadable) {
      if (triage[label] && triage[label] !== "parking_sign") { answered.push(`${label}: refused`); continue; }
      const file = join(ANSWERS, `${label}.extract.json`);
      const category = assessAnswer(label, JSON.parse(readFileSync(file, "utf-8")).response,
                                    moment, cal).category;
      answered.push(`${label}: ${category === INSUFFICIENT ? "refused" : category}`);
    }
    expect(answered.filter((line) => !line.endsWith(": refused"))).toEqual([]);
  });

  it("does not grade 085 full: its two illegible plates are not operator plates", () => {
    // The model filed both illegible plates as operator plates, which state no rule and
    // so cost the reading nothing - full, at 0.975. One of them is yellow with a
    // no-parking symbol. An operator plate is known only by its words (decision 182).
    const label = "085-p-med-plattor-bakom-bom";
    const answer = JSON.parse(readFileSync(join(ANSWERS, `${label}.extract.json`), "utf-8")).response;
    expect(answer.panels.filter((p: any) => p.kind === "operator_plate"
                                           && p.legibility?.readable === false),
           "the saved answer no longer shows the case").toHaveLength(2);
    expect(assessAnswer(label, answer, parseNaive("2026-03-02T00:00"), new Calendar()).category)
      .not.toBe(FULL);
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
                                      verdictSlice(asShown(actual), moment, cal));
      if (!diff.length) continue;
      const a = assessAnswer(label, actual, moment, cal);
      if (a.category === FULL && a.confidence >= GOOD_ENOUGH) escaped.push(label);
    }
    // One escape is left: `059`. The model misses the parking disc beside `därefter
    // avgift` - on the 15f run it named no method at all; an earlier run wrote a ticket,
    // which the cross-check now drops. Either way the disc is gone, nothing on the plate
    // contradicts itself for a rule to catch, and 0.975 clears the threshold.
    // `097` joined with its ground truth (step 15g): the model reads "Biljett-automat"
    // as a ticket to display, where the plate names the machine. The prompt learns the
    // difference in step 15h, with the next run.
    // `116` escaped the same way until step 15l: the model dropped the no-parking
    // symbol of a yellow plate with hours, and the repair now puts it back.
    expect(escaped).toEqual(["059-avstand-p-skiva-2tim-darefter-avgift",
                             "097-avgift-taxa-a-boende-solna-onsdag"]);
  });
});

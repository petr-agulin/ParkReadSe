// When to ask about a photograph again, and when not. Carried over from
// `tests/test_accuracy.py` (step 8).
//
// A mistake either way is costly: skip a stale answer and the measurement quietly
// mixes two versions of the prompt; ask too much and every run pays for the same thing.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { refused, save, stale } from "./fixtures";

const IMG = "testset/photos/001-p-30min.jpg";
let root = "";

beforeEach(() => { root = mkdtempSync(join(tmpdir(), "parkread-fixtures-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("an answer going stale", () => {
  // py: test_accuracy::test_changed_prompt_makes_a_saved_answer_stale
  it("makes a saved answer stale when the prompt is edited", async () => {
    // Found on a run: after a prompt edit the command skipped all 26 photographs,
    // because it checked that the file existed, not which question it answered.
    expect(await stale(root, IMG, "extract", "prompt A"), "no answer at all").toBe(true);
    await save(root, IMG, "extract", { ok: true }, "model", null, "prompt A");
    expect(await stale(root, IMG, "extract", "prompt A"), "the same question").toBe(false);
    expect(await stale(root, IMG, "extract", "prompt B"), "the question changed").toBe(true);
  });

  // py: test_accuracy::test_a_stale_triage_answer_alone_makes_the_photo_stale
  it("makes the photograph stale on a stale triage answer alone", async () => {
    // An edit to the triage prompt does not touch the extraction prompt: look only at
    // the extraction, and a triage edit quietly never reaches the run.
    await save(root, IMG, "extract", { ok: true }, "m", null, "extraction A");
    await save(root, IMG, "triage", { ok: true }, "m", null, "triage A");
    const fresh = [await stale(root, IMG, "triage", "triage A"),
                   await stale(root, IMG, "extract", "extraction A")];
    expect(fresh.some(Boolean), "both answers are to the current questions").toBe(false);
    const triageChanged = [await stale(root, IMG, "triage", "triage B"),
                           await stale(root, IMG, "extract", "extraction A")];
    expect(triageChanged.some(Boolean), "a triage prompt edit must ask about the photograph again")
      .toBe(true);
  });

  // py: test_accuracy::test_hand_marked_and_unfingerprinted_answers_are_stale
  it("always asks again about a hand-marked answer and one with no fingerprint", async () => {
    const path = await save(root, IMG, "extract", { ok: true }, "m", null, "P");
    expect(await stale(root, IMG, "extract", "P")).toBe(false);

    const doc = JSON.parse(readFileSync(path, "utf-8"));
    writeFileSync(path, JSON.stringify({ ...doc, origin: "hand_marked" }));
    expect(await stale(root, IMG, "extract", "P"), "hand-marked").toBe(true);

    writeFileSync(path, JSON.stringify({ ...doc, origin: "model", prompt_fingerprint: null }));
    expect(await stale(root, IMG, "extract", "P"), "no fingerprint").toBe(true);
  });
});

describe("a triage refusal", () => {
  // py: test_accuracy::test_a_refused_photo_is_not_asked_again_forever
  it("does not ask about a refused photograph for ever", async () => {
    // It has and will have no extraction answer: the pipeline never gets that far.
    expect(refused(root, IMG), "no triage answer yet").toBe(false);
    await save(root, IMG, "triage", { category: "other_road_sign" }, "m", null, "triage A");
    expect(refused(root, IMG)).toBe(true);
    expect(await stale(root, IMG, "triage", "triage A"), "the triage itself is fresh").toBe(false);
  });

  // py: test_accuracy::test_a_parking_photo_still_needs_its_extraction
  it("still expects an extraction for a photograph the triage let through", async () => {
    // The relief must not extend to photographs the triage LET THROUGH.
    await save(root, IMG, "triage", { category: "parking_sign" }, "m", null, "triage A");
    expect(refused(root, IMG)).toBe(false);
    expect(await stale(root, IMG, "extract", "extraction A"), "no reading — ask again")
      .toBe(true);
  });

  // py: test_accuracy::test_a_changed_triage_prompt_reopens_a_refusal
  it("reopens a refusal when the triage prompt is edited", async () => {
    await save(root, IMG, "triage", { category: "not_a_sign" }, "m", null, "triage A");
    expect(refused(root, IMG)).toBe(true);
    expect(await stale(root, IMG, "triage", "triage B"), "the question changed — check again")
      .toBe(true);
  });
});

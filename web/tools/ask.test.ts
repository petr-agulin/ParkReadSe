// A live run of the set — against a fake provider. Requirement 11 of step 8.
//
// The real call is made by the developer: it spends the key and the quota. Everything
// else is checked here — what is saved, what is skipped, and what the run does not
// stumble on.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fingerprint } from "../src/lib/measure";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { ROOT, ask, expand, photoOf, providerFromEnv } from "./ask";

const PHOTO = join(ROOT, "testset", "photos", "001-p-30min.jpg");
const SIGN = JSON.parse(readFileSync(
  join(ROOT, "demo", "001-p-30min.extract.json"), "utf-8")).response;
const TRIAGE_OK = { category: "parking_sign", what_i_see: "a blue P",
                    panels_below_main_sign: 1 };

const provider = { baseUrl: "https://example.invalid/v1", apiKey: "key",
                   visionModel: "model" };

/** A provider that answers from a list and counts the calls. */
function fake(...replies: unknown[]) {
  let calls = 0;
  const fetchImpl = (async () => {
    const body = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
      usage: { total_tokens: 11 },
    }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

let dir = "";
const deps = (f: { fetchImpl: typeof fetch }) =>
  ({ fetchImpl: f.fetchImpl, pause: async () => {}, fixturesDir: dir,
     out: () => {}, provider });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "parkread-ask-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("asking the model again", () => {
  it("saves both stages in the same form as before", async () => {
    const f = fake(TRIAGE_OK, SIGN);
    expect(await ask([PHOTO], {}, deps(f))).toBe(0);

    const triage = JSON.parse(readFileSync(join(dir, "001-p-30min.triage.json"), "utf-8"));
    const extract = JSON.parse(readFileSync(join(dir, "001-p-30min.extract.json"), "utf-8"));
    expect(triage.image).toBe("001-p-30min.jpg");
    expect(triage.stage).toBe("triage");
    expect(triage.model).toBe("model");
    expect(triage.response.category).toBe("parking_sign");
    expect(triage.usage.total_tokens).toBe(11);
    expect(triage.prompt_fingerprint).toBe(await fingerprint(triagePrompt()));
    expect(extract.prompt_fingerprint).toBe(await fingerprint(extractPrompt()));
    expect(extract.response.main_sign.type).toBe("parking");
  });

  it("does not ask a second time: answers to the same prompts exist", async () => {
    const first = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(first));
    const again = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(again));
    expect(again.calls(), "the photograph must be skipped").toBe(0);
  });

  it("`--refresh` asks again even about fresh answers", async () => {
    const first = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(first));
    const again = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], { refresh: true }, deps(again));
    expect(again.calls()).toBe(2);
  });

  it("asks no extraction for a refused photograph, and does not ask again for ever", async () => {
    // It has and will have no extraction answer: the pipeline never gets that far.
    const f = fake({ category: "not_a_sign", what_i_see: "a wall",
                     panels_below_main_sign: 0 });
    expect(await ask([PHOTO], {}, deps(f))).toBe(0);
    expect(f.calls(), "the extraction did not run").toBe(1);
    expect(existsSync(join(dir, "001-p-30min.extract.json"))).toBe(false);
    expect(existsSync(join(dir, "001-p-30min.triage.json"))).toBe(true);

    const again = fake({ category: "not_a_sign", what_i_see: "a wall",
                         panels_below_main_sign: 0 });
    await ask([PHOTO], {}, deps(again));
    expect(again.calls(), "the refusal is on record — nothing to ask").toBe(0);
  });

  it("keeps a rejected answer out of the fixtures", async () => {
    // Written down, it would be read by the measurement as a real one.
    const f = fake(TRIAGE_OK, { entirely: "wrong" });
    expect(await ask([PHOTO], {}, deps(f))).toBe(1);
    expect(existsSync(join(dir, "001-p-30min.extract.json"))).toBe(false);
    expect(existsSync(join(dir, "001-p-30min.triage.json")), "the triage passed and was saved")
      .toBe(true);
  });

  it("does not bring the whole run down on a failed call", async () => {
    const dead = (async () => { throw new Error("the network is down"); }) as unknown as typeof fetch;
    expect(await ask([PHOTO], {}, { ...deps({ fetchImpl: dead }), fetchImpl: dead }))
      .toBe(1);
    expect(existsSync(join(dir, "001-p-30min.triage.json"))).toBe(false);
  });
});

describe("the command's arguments", () => {
  it("expands the asterisk itself: PowerShell does not", () => {
    const found = expand(["testset/photos/001-*.jpg"]);
    expect(found).toHaveLength(1);
    expect(found[0].endsWith("001-p-30min.jpg")).toBe(true);
  });

  it("reads the photograph into memory, with no temporary file", () => {
    const photo = photoOf(PHOTO);
    expect(photo.name).toBe("001-p-30min.jpg");
    expect(photo.data.type).toBe("image/jpeg");
    expect(photo.data.size).toBeGreaterThan(0);
  });

  it("refuses on an empty field in `.env` rather than defaulting", () => {
    // Quietly asking the wrong model costs more than not asking at all.
    expect(() => providerFromEnv({ VISION_API_BASE_URL: "https://x/v1" } as NodeJS.ProcessEnv))
      .toThrow(/VISION_API_KEY/);
    const good = providerFromEnv({ VISION_API_BASE_URL: "https://x/v1",
                                   VISION_API_KEY: "k", VISION_MODEL: "m" } as NodeJS.ProcessEnv);
    expect(good.visionModel).toBe("m");
  });
});

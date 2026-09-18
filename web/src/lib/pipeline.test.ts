// The order of the stages: triage, extraction, the engine, completeness - and what
// happens when one of them does not fire.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { analyze, answer, run } from "./pipeline";
import type { Photo, Provider } from "./vision";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();
const moment = parseNaive("2026-03-02T12:00");

const provider: Provider = {
  baseUrl: "https://example.invalid/v1",
  apiKey: "a-key",
  visionModel: "a-reader",
};

const photo: Photo = { name: "sign.jpg",
                       data: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) };

/** A real photograph of the set: its size is read from its own bytes, as in the
 *  browser. */
function realPhoto(file: string): Photo {
  const bytes = new Uint8Array(readFileSync(`${ROOT}testset/photos/${file}`));
  return { name: file,
           data: new Blob([bytes],
                          { type: file.endsWith(".png") ? "image/png" : "image/jpeg" }) };
}

/** A real reading of a sign from the set - the same one the measurement reads. */
function realSign(stem: string) {
  return JSON.parse(readFileSync(`${ROOT}demo/${stem}.extract.json`, "utf-8")).response;
}

const reply = (content: unknown) => () => new Response(JSON.stringify({
  choices: [{ message: { content: typeof content === "string"
                                  ? content : JSON.stringify(content) } }],
}), { status: 200 });

const TRIAGE_OK = { category: "parking_sign", what_i_see: "a blue P",
                    panels_below_main_sign: 1 };

function fakeProvider(...replies: (() => Response)[]) {
  let i = 0;
  const fetchImpl = (async () => replies[Math.min(i++, replies.length - 1)]()
                    ) as unknown as typeof fetch;
  return { fetchImpl, calls: () => i };
}

const deps = (f: { fetchImpl: typeof fetch }) =>
  ({ pause: async () => {}, fetchImpl: f.fetchImpl });

describe("the pipeline", () => {
  it("stops at triage and makes no second call", async () => {
    const f = fakeProvider(reply({ category: "not_a_sign", what_i_see: "a wall",
                                   panels_below_main_sign: 0 }));
    const out = await run(photo, provider, deps(f));
    expect(out.stoppedAt).toBe("triage");
    expect(out.reason).toBe("a wall");
    expect(f.calls(), "extraction never ran").toBe(1);
  });

  // Found by checking `AGENT_SPEC.md` against the code: the area of the frame never
  // reached the grading, because the pipeline passed `null`. Photograph `061` is the
  // very case from the header of `photo.ts`: 82x179, and the model returned fifty-odd
  // characters of fluent Swedish with not one note about conditions.
  it("carries the area of the frame through to the completeness grading", async () => {
    const sign = realSign("061-lastplats-langt-avstand");
    const assess = (p: Photo) => analyze(p, provider, moment, cal,
      deps(fakeProvider(reply(TRIAGE_OK), reply(sign))));

    const onBig = await assess(realPhoto("003-p-2tim.jpg"));
    const onTiny = await assess(realPhoto("061-lastplats-langt-avstand.png"));

    expect(onBig.assessment.signals.text_fits_the_pixels,
           "a large frame does hold this text").toBe(1);
    expect(onTiny.assessment.signals.text_fits_the_pixels,
           "a tight one does not - or the size never reached the grading")
      .toBeLessThan(1);
    expect(onTiny.assessment.reasons, "and the reason must reach the person")
      .toContain("text_exceeds_the_pixels");
  });

  it("does not stop on a triage label when it is not enforced", async () => {
    const f = fakeProvider(reply({ category: "other_road_sign", what_i_see: "a sign",
                                   panels_below_main_sign: 1 }),
                           reply(realSign("001-p-30min")));
    const out = await run(photo, provider, { ...deps(f), triageEnforce: false });
    expect(out.stoppedAt).toBeNull();
    expect(out.flags).toContain("triage_said:other_road_sign");
  });

  // py: test_api::test_a_reading_that_says_too_little_is_asked_once_more
  it("asks once more, and exactly once, when too little was read", async () => {
    // Found by the developer in the browser: `049` and `056` said "too little" on the
    // first attempt and were read in full on the second.
    const scant = { schema_version: 1,
                    main_sign: { type: "unknown", background_color: "blue",
                                 form: "regular", legibility: { readable: true } },
                    panels: [], panel_count: 0, boundaries: { certain: true } };
    const f = fakeProvider(reply(TRIAGE_OK), reply(scant), reply(realSign("001-p-30min")));
    const out = await run(photo, provider, deps(f));
    expect(f.calls(), "triage plus two attempts at reading").toBe(3);
    expect(out.flags).toContain("extraction_retried");
    expect(out.stoppedAt).toBeNull();
    expect(out.extraction?.data?.main_sign.type, "the better answer was taken").toBe("parking");
  });

  // py: test_api::test_a_good_reading_is_never_asked_twice
  it("never asks twice about a good reading", () => {
    // A second ask costs a call, and there is no reason to spend one on a reading the
    // product is satisfied with.
    const f = fakeProvider(reply(TRIAGE_OK), reply(realSign("001-p-30min")),
                           reply({ nothing: "like it" }));
    return run(photo, provider, deps(f)).then((out) => {
      expect(f.calls(), "triage plus one reading").toBe(2);
      expect(out.flags).not.toContain("extraction_retried");
    });
  });

  // py: test_api::test_the_retry_happens_once_and_not_in_a_loop
  it("does not take the second answer when it is no better", async () => {
    const scant = { schema_version: 1,
                    main_sign: { type: "unknown", background_color: "blue",
                                 form: "regular", legibility: { readable: true } },
                    panels: [], panel_count: 0, boundaries: { certain: true } };
    const f = fakeProvider(reply(TRIAGE_OK), reply(scant), reply(scant));
    const out = await run(photo, provider, deps(f));
    expect(f.calls()).toBe(3);
    expect(out.stoppedAt).toBeNull();          // there is an answer, merely a thin one
    expect(out.extraction?.data?.main_sign.type).toBe("unknown");
  });

  it("stops at extraction on an answer that fails the schema, and names why", async () => {
    const f = fakeProvider(reply(TRIAGE_OK), reply({ nothing: "like it" }));
    const out = await run(photo, provider, deps(f));
    expect(out.stoppedAt).toBe("extraction");
    expect(out.reason).toBeTruthy();
  });

  it("carries a whole photograph through to a finished answer", async () => {
    const f = fakeProvider(reply(TRIAGE_OK), reply(realSign("005-2tim-8-18-parentes-8-15-dubbelpil")));
    const analysis = await analyze(photo, provider, moment, cal, deps(f));
    expect(analysis.assessment.category).toBe("full");

    const body = answer(analysis, moment, cal);
    expect(body.has_answer).toBe(true);
    expect(body.contract).toBeGreaterThan(0);
    expect(body.regimes.length).toBeGreaterThan(0);
    expect(body.regimes[0].periods[0].headline).toBeTruthy();
    // The stages are recorded: triage is visible in the answer, as before.
    expect(body.triage?.category).toBe("parking_sign");
  });

  it("stopping at triage gives the same answer, only without a reading", async () => {
    const f = fakeProvider(reply({ category: "not_a_sign", what_i_see: "a cat",
                                   panels_below_main_sign: 0 }));
    const body = answer(await analyze(photo, provider, moment, cal, deps(f)), moment, cal);
    expect(body.has_answer).toBe(false);
    expect(body.completeness.category).toBe("not_a_parking_sign");
    expect(body.regimes).toEqual([]);
    // The shape of the answer does not change: a refusal is the same answer with no
    // reading in it.
    expect(body).toHaveProperty("what_we_saw");
    expect(body).toHaveProperty("uncertainties");
  });
});

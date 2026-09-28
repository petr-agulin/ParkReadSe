// The order of the stages: triage, extraction, the engine, completeness - and what
// happens when one of them does not fire.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { jpegOf, pngOf } from "./image.testkit";
import { analyze, answer, run, type Progress } from "./pipeline";
import { RUN_PATIENCE, type Photo, type Provider } from "./vision";

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

/** A photograph the size of one in the set: its size is read from its own bytes, as
 *  in the browser. The header is built - the set's photographs are not published. */
function sizedPhoto(file: string, width: number, height: number): Photo {
  const png = file.endsWith(".png");
  const bytes = png ? pngOf(width, height) : jpegOf(width, height);
  return { name: file, data: new Blob([bytes], { type: png ? "image/png" : "image/jpeg" }) };
}

/** A real reading of a sign from the set - the same one the measurement reads. */
function realSign(stem: string) {
  return JSON.parse(readFileSync(`${ROOT}testset/answers/${stem}.extract.json`, "utf-8")).response;
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

    const onBig = await assess(sizedPhoto("003-p-2tim.jpg", 576, 1280));
    const onTiny = await assess(sizedPhoto("061-lastplats-langt-avstand.png", 82, 179));

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

describe("the pipeline tells the screen where it is (step 16)", () => {
  it("the check, then the reading; a retry says why and which attempt comes", async () => {
    let i = 0;
    const replies = [() => new Response("high demand", { status: 503 }),
                     reply(TRIAGE_OK), reply(realSign("061-lastplats-langt-avstand"))];
    const fetchImpl = (async () => replies[Math.min(i++, replies.length - 1)]()
                      ) as unknown as typeof fetch;
    const seen: Progress[] = [];
    await run(photo, provider, { pause: async () => {}, fetchImpl,
                                 onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([
      { stage: "check" },
      { stage: "check", retry: { inMs: 3_000, next: 2, kind: "busy" } },
      { stage: "read" },
    ]);
  });

  it("the person's stop reaches the call", async () => {
    const f = fakeProvider(reply(TRIAGE_OK));
    const stop = new AbortController();
    stop.abort();
    const e = await run(photo, provider, { ...deps(f), signal: stop.signal }).catch((x) => x);
    expect(e.kind).toBe("cancelled");
    expect(f.calls()).toBe(0);
  });

  it("the patience asked for is the patience used", async () => {
    const f = fakeProvider(() => new Response("busy", { status: 503 }));
    const e = await run(photo, provider, { ...deps(f), patience: RUN_PATIENCE })
      .catch((x) => x);
    expect(e.message).toMatch(/attempts: 4/);
    expect(f.calls()).toBe(4);
  });
});

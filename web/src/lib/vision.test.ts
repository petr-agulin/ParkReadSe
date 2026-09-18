// The conversation with the provider: retries, refusals and the key.
//
// The comparison with the reference answers does not cover this - those hold the
// model's ANSWERS, not the calls made to it - so every outcome is checked here,
// against a fake `fetch`.

import { describe, expect, it } from "vitest";

import { RETRY_PAUSE_MS, VisionCallFailed, call, classifyImage, extractSignData,
         type Photo, type Provider } from "./vision";

const provider: Provider = {
  baseUrl: "https://example.invalid/v1/",
  apiKey: "user-key",
  visionModel: "reading-model",
};

const photo: Photo = { name: "sign.jpg", data: new Blob([new Uint8Array([1, 2, 3])],
                                                        { type: "image/jpeg" }) };

/** A fake provider: it answers from a list, counts the calls and remembers the
 *  requests.
 *
 *  The answers are held as CLOSURES rather than as ready-made objects: the body of a
 *  `Response` is read once, and handing out the same object again would break on the
 *  second retry - in the fake provider, not in the code under test. */
function fake(...replies: (() => Response | Error)[]) {
  const seen: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const reply = replies[Math.min(i, replies.length - 1)]();
    i += 1;
    if (reply instanceof Error) throw reply;
    return reply;
  }) as unknown as typeof fetch;
  return { fetchImpl, seen, calls: () => i };
}

const answer = (body: unknown, status = 200) =>
  () => new Response(JSON.stringify(body), { status });

const good = () => answer({
  choices: [{ message: { content: '{"category":"parking_sign",'
                                + '"what_i_see":"blue P","panels_below_main_sign":1}' } }],
  usage: { total_tokens: 10 },
});

describe("calling the provider", () => {
  it("the key goes into the header and nowhere else", async () => {
    const f = fake(good());
    await call(provider, "model", "question", photo, async () => {}, f.fetchImpl);

    const { init, url } = f.seen[0];
    expect((init.headers as Record<string, string>).Authorization)
      .toBe("Bearer user-key");
    // The key must appear neither in the address nor in the body of the request.
    expect(url).not.toContain("user-key");
    expect(String(init.body)).not.toContain("user-key");
    expect(url).toBe("https://example.invalid/v1/chat/completions");
  });

  // py: test_vision::test_a_busy_provider_is_retried_not_reported_as_failure
  it("a busy provider is retried, a bad request is not", async () => {
    const busy = fake(answer({}, 503), answer({}, 503), good());
    const paused: number[] = [];
    await call(provider, "m", "q", photo, async (ms) => { paused.push(ms); }, busy.fetchImpl);
    expect(busy.calls()).toBe(3);
    expect(paused).toEqual([RETRY_PAUSE_MS[0], RETRY_PAUSE_MS[1]]);

    const wrong = fake(answer({ error: "bad key" }, 401));
    await expect(call(provider, "m", "q", photo, async () => {}, wrong.fetchImpl))
      .rejects.toThrow(VisionCallFailed);
    expect(wrong.calls(), "a 401 must not be retried: that is a second spend of the quota")
      .toBe(1);
  });

  it("a dropped connection is also a reason to retry, not a refusal", async () => {
    const flaky = fake(() => new Error("network down"), good());
    const res = await call(provider, "m", "q", photo, async () => {}, flaky.fetchImpl);
    expect(flaky.calls()).toBe(2);
    expect(res.text).toContain("parking_sign");
  });

  // py: test_vision::test_a_timeout_is_retried_too
  it("an expired wait is a reason to retry too: there is no answer, not a refusal", async () => {
    // A timeout arrives as an abort on a signal, and it looks different from a
    // network that fell over. The path for both must be the same - a retry.
    const timeout = Object.assign(new Error("the wait expired"), { name: "AbortError" });
    const slow = fake(() => timeout, good());
    await call(provider, "m", "q", photo, async () => {}, slow.fetchImpl);
    expect(slow.calls()).toBe(2);
  });

  // py: test_vision::test_a_rejected_request_is_not_retried
  it("a rejected request is not retried: 400, 401, 403, 404", async () => {
    // There is no overload there - there is a wrong request or a wrong key, and a
    // second identical request would only spend the quota a second time. This keeps
    // the list of retryable codes narrow.
    for (const code of [400, 401, 403, 404]) {
      const rejected = fake(answer({ error: "no" }, code), good());
      await expect(call(provider, "m", "q", photo, async () => {}, rejected.fetchImpl))
        .rejects.toThrow(String(code));
      expect(rejected.calls(), `${code} must not be retried`).toBe(1);
    }
  });

  // py: test_vision::test_giving_up_says_why_and_how_many_tries
  it("giving up, it says why and how many times it tried", async () => {
    const dead = fake(answer({ error: "busy" }, 503));
    await expect(call(provider, "m", "q", photo, async () => {}, dead.fetchImpl))
      .rejects.toThrow(/HTTP 503.*attempts: 4/s);
    expect(dead.calls()).toBe(RETRY_PAUSE_MS.length + 1);
  });

  it("an unexpected shape of answer is a refusal, not an empty screen", async () => {
    const odd = fake(answer({ choices: [] }));
    await expect(call(provider, "m", "q", photo, async () => {}, odd.fetchImpl))
      .rejects.toThrow(/unexpected shape/);
  });

  it("with no key and no address it never reaches the network", async () => {
    // These messages reach the person on screen, so they are checked as the person
    // would read them.
    const f = fake(good());
    await expect(call({ ...provider, apiKey: "" }, "m", "q", photo, async () => {}, f.fetchImpl))
      .rejects.toThrow(/API key/);
    await expect(call({ ...provider, baseUrl: "" }, "m", "q", photo, async () => {}, f.fetchImpl))
      .rejects.toThrow(/provider address/);
    expect(f.calls()).toBe(0);
  });

  it("the triage answer passes through the validator rather than being trusted", async () => {
    // An extra field is repaired and the label survives: strictness where there is a
    // consequence.
    const messy = fake(answer({
      choices: [{ message: { content: '{"category":"parking_sign","what_i_see":"P",'
                                    + '"panels_below_main_sign":"2","extra":1}' } }],
    }));
    const out = await classifyImage(photo, provider,
                                    { pause: async () => {}, fetchImpl: messy.fetchImpl });
    expect(out.category).toBe("parking_sign");
    expect(out.panelsBelowMainSign).toBe(2);       // the string "2" repaired into a number
    expect(out.validation?.repairs.length).toBeGreaterThan(0);
  });

  it("triage and extraction go to the same model - the one the person entered", async () => {
    // Decision 134: there is one model field. A second model does not exist even in
    // the type, and both calls must go where the person directed them.
    const f = fake(good());
    const deps = { pause: async () => {}, fetchImpl: f.fetchImpl };
    await classifyImage(photo, provider, deps);
    // The answer here is a triage one and will not do for extraction - but what is
    // checked is not the reading, it is the address.
    await extractSignData(photo, provider, null, deps).catch(() => null);
    const models = f.seen.map((s) => JSON.parse(String(s.init.body)).model);
    expect(models).toEqual(["reading-model", "reading-model"]);
  });
});

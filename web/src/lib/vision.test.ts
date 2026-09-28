// The conversation with the provider: retries, refusals and the key.
//
// The comparison with the reference answers does not cover this - those hold the
// model's ANSWERS, not the calls made to it - so every outcome is checked here,
// against a fake `fetch`.

import { describe, expect, it } from "vitest";

import { APP_PATIENCE, RUN_PATIENCE, VisionCallFailed, call, classifyImage,
         extractSignData, type Failure, type Photo, type Provider } from "./vision";

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

  it("a busy provider is retried, a bad request is not", async () => {
    const busy = fake(answer({}, 503), answer({}, 503), good());
    const paused: number[] = [];
    await call(provider, "m", "q", photo, async (ms) => { paused.push(ms); }, busy.fetchImpl,
               { patience: RUN_PATIENCE });
    expect(busy.calls()).toBe(3);
    expect(paused).toEqual([RUN_PATIENCE.pausesMs[0], RUN_PATIENCE.pausesMs[1]]);

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

  it("an expired wait is a reason to retry too: there is no answer, not a refusal", async () => {
    // A timeout arrives as an abort on a signal, and it looks different from a
    // network that fell over. The path for both must be the same - a retry.
    const timeout = Object.assign(new Error("the wait expired"), { name: "AbortError" });
    const slow = fake(() => timeout, good());
    await call(provider, "m", "q", photo, async () => {}, slow.fetchImpl);
    expect(slow.calls()).toBe(2);
  });

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

  it("giving up, it says why and how many times it tried", async () => {
    const dead = fake(answer({ error: "busy" }, 503));
    await expect(call(provider, "m", "q", photo, async () => {}, dead.fetchImpl,
                      { patience: RUN_PATIENCE }))
      .rejects.toThrow(/HTTP 503.*attempts: 4/s);
    expect(dead.calls()).toBe(RUN_PATIENCE.pausesMs.length + 1);
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

describe("patience: the person at the sign against the run over the set (step 16)", () => {
  // A clock that moves only when told: the provider "takes" `answerMs` to refuse, and
  // every pause moves it by its length. The budget is kept by this clock alone. A
  // request still running at the end of the minute is cut there, as the real timer
  // cuts it - that the timer is bounded so is checked on its own, in real time, below.
  function timed(answerMs: number, reply: () => Response) {
    let t = 0;
    let calls = 0;
    const paused: number[] = [];
    const fetchImpl = (async () => {
      calls += 1;
      if (t + answerMs > 60_000) {
        t = 60_000;
        throw Object.assign(new Error("the wait expired"), { name: "AbortError" });
      }
      t += answerMs;
      return reply();
    }) as unknown as typeof fetch;
    const pause = async (ms: number) => { paused.push(ms); t += ms; };
    return { fetchImpl, pause, now: () => t, paused, calls: () => calls, elapsed: () => t };
  }

  it("unless told otherwise, the call is the application's: a minute for everything", async () => {
    // The developer waited two and a half minutes on "Reading…" while a busy provider
    // was retried three times; the worst case was twenty. The app must not.
    expect(APP_PATIENCE.budgetMs).toBe(60_000);
    expect(APP_PATIENCE.timeoutMs).toBeLessThanOrEqual(APP_PATIENCE.budgetMs!);
  });

  it("a provider that refuses at once gets five attempts in the minute (step 16a)", async () => {
    // The developer's case: `503` in about a second. Two attempts used to leave most
    // of the minute unused.
    const busy = timed(1_000, answer({ error: "high demand" }, 503));
    const e = await call(provider, "m", "q", photo, busy.pause, busy.fetchImpl,
                         { now: busy.now }).catch((x) => x);
    expect(e.kind).toBe("busy");
    expect(busy.calls()).toBe(5);
    expect(busy.paused).toEqual([3_000, 6_000, 10_000, 15_000]);
    expect(busy.elapsed()).toBeLessThanOrEqual(60_000);
  });

  it("a slow refusal gets fewer attempts, and the minute is never overrun", async () => {
    for (const answerMs of [1_000, 5_000, 12_000, 25_000, 40_000, 59_000]) {
      const slow = timed(answerMs, answer({ error: "busy" }, 503));
      await call(provider, "m", "q", photo, slow.pause, slow.fetchImpl, { now: slow.now })
        .catch(() => null);
      expect(slow.elapsed(), `answers in ${answerMs} ms`).toBeLessThanOrEqual(60_000);
    }
    // 12 s a refusal: 12, +3, 27, +6, 45 - and a pause of 10 would leave five seconds
    // for an answer that takes twelve. It is not made.
    const twelve = timed(12_000, answer({ error: "busy" }, 503));
    await call(provider, "m", "q", photo, twelve.pause, twelve.fetchImpl, { now: twelve.now })
      .catch(() => null);
    expect(twelve.calls()).toBe(3);
    expect(twelve.paused).toEqual([3_000, 6_000]);
  });

  it("no retry is made that would have less than ten seconds left", async () => {
    const busy = timed(1_000, answer({ error: "busy" }, 503));
    await call(provider, "m", "q", photo, busy.pause, busy.fetchImpl, { now: busy.now })
      .catch(() => null);
    // Before every attempt after the first, at least the minimum was left.
    let t = 0;
    for (const ms of busy.paused) {
      t += 1_000 + ms;
      expect(60_000 - t).toBeGreaterThanOrEqual(APP_PATIENCE.minAttemptMs!);
    }
  });

  it("a request limit gets one retry, after a longer pause", async () => {
    const limited = timed(500, answer({ error: "rate limit" }, 429));
    const e = await call(provider, "m", "q", photo, limited.pause, limited.fetchImpl,
                         { now: limited.now }).catch((x) => x);
    expect(e.kind).toBe("limit");
    expect(limited.calls()).toBe(2);
    expect(limited.paused).toEqual([20_000]);
  });

  it("the last attempt waits no longer than the budget has left", async () => {
    // A provider that never answers, and a budget of fifty milliseconds: without the
    // bound the request would wait the full timeout of a minute.
    const silent = (async (_url: string, init: RequestInit) =>
      new Promise((_, fail) => init.signal!.addEventListener("abort", () =>
        fail(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    ) as unknown as typeof fetch;
    const e = await call(provider, "m", "q", photo, async () => {}, silent,
                         { patience: { timeoutMs: 60_000, budgetMs: 50, pausesMs: [] } })
      .catch((x) => x);
    expect(e.kind).toBe("timeout");
  });

  it("the run over the set keeps its patience", () => {
    expect(RUN_PATIENCE.pausesMs).toEqual([20_000, 45_000, 90_000]);
    expect(RUN_PATIENCE.timeoutMs).toBe(120_000);
  });

  it("the wait for one answer is the patience's own", async () => {
    // A provider that never answers: the request ends only when its signal aborts.
    const silent = (async (_url: string, init: RequestInit) =>
      new Promise((_, fail) => init.signal!.addEventListener("abort", () =>
        fail(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    ) as unknown as typeof fetch;
    const e = await call(provider, "m", "q", photo, async () => {}, silent,
                         { patience: { timeoutMs: 5, pausesMs: [] } }).catch((x) => x);
    expect(e).toBeInstanceOf(VisionCallFailed);
    expect(e.kind).toBe("timeout");
  });
});

describe("the kind of failure travels with it (step 16)", () => {
  const kindOf = async (...replies: (() => Response | Error)[]) => {
    const e = await call(provider, "m", "q", photo, async () => {}, fake(...replies).fetchImpl)
      .catch((x) => x);
    expect(e).toBeInstanceOf(VisionCallFailed);
    return { kind: (e as VisionCallFailed).kind, status: (e as VisionCallFailed).status };
  };

  it("by the code, never by the provider's words", async () => {
    const cases: [number, Failure][] = [
      [401, "key"], [403, "key"], [429, "limit"], [500, "busy"], [502, "busy"],
      [503, "busy"], [504, "busy"], [400, "other"], [404, "other"],
    ];
    for (const [code, kind] of cases) {
      // The words say something else on purpose: they must not decide.
      expect(await kindOf(answer({ error: "quota exceeded, invalid key" }, code)), String(code))
        .toEqual({ kind, status: code });
    }
  });

  it("no answer in time, no network at all, and an answer we cannot read", async () => {
    const timeout = () => Object.assign(new Error("expired"), { name: "AbortError" });
    expect((await kindOf(timeout)).kind).toBe("timeout");
    expect((await kindOf(() => new TypeError("Failed to fetch"))).kind).toBe("network");
    expect((await kindOf(answer({ choices: [] }))).kind).toBe("reply");
    expect((await kindOf(() => new Response("<html>not json</html>", { status: 200 }))).kind)
      .toBe("reply");
  });

  it("missing settings are said before anything is sent", async () => {
    const f = fake(good());
    for (const broken of [{ ...provider, apiKey: "" }, { ...provider, baseUrl: "" }]) {
      const e = await call(broken, "m", "q", photo, async () => {}, f.fetchImpl).catch((x) => x);
      expect(e.kind).toBe("settings");
    }
    expect(f.calls()).toBe(0);
  });

  it("the pause is told the kind and the number of attempts", async () => {
    const told: unknown[] = [];
    await call(provider, "m", "q", photo,
               async (_ms, _why, attempt, info) => { told.push({ attempt, ...info }); },
               fake(answer({}, 429), good()).fetchImpl);
    expect(told).toEqual([{ attempt: 1, kind: "limit", of: 2 }]);
  });
});

describe("the person can stop a reading (step 16)", () => {
  it("stopped before it began, nothing is sent", async () => {
    const f = fake(good());
    const stop = new AbortController();
    stop.abort();
    const e = await call(provider, "m", "q", photo, async () => {}, f.fetchImpl,
                         { signal: stop.signal }).catch((x) => x);
    expect(e.kind).toBe("cancelled");
    expect(f.calls()).toBe(0);
  });

  it("a request in flight is ended, and not retried", async () => {
    const stop = new AbortController();
    let calls = 0;
    const hanging = (async (_url: string, init: RequestInit) => {
      calls += 1;
      return new Promise((_, fail) => init.signal!.addEventListener("abort", () =>
        fail(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }) as unknown as typeof fetch;
    const pending = call(provider, "m", "q", photo, async () => {}, hanging,
                         { signal: stop.signal }).catch((x) => x);
    await new Promise((done) => setTimeout(done, 5));
    stop.abort();
    const e = await pending;
    // An abort by the person looks like our own timeout from inside `fetch`: it must
    // not be taken for one and retried.
    expect(e.kind).toBe("cancelled");
    expect(calls).toBe(1);
  });

  it("stopped on the last attempt, it is still a stop, not a provider that fell silent", async () => {
    // No pause follows the last attempt, so nothing downstream would notice the stop:
    // the call itself must tell the person's abort from its own timer.
    const stop = new AbortController();
    const hanging = (async (_url: string, init: RequestInit) =>
      new Promise((_, fail) => init.signal!.addEventListener("abort", () =>
        fail(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    ) as unknown as typeof fetch;
    const pending = call(provider, "m", "q", photo, async () => {}, hanging,
                         { signal: stop.signal, patience: { timeoutMs: 60_000, pausesMs: [] } })
      .catch((x) => x);
    await new Promise((done) => setTimeout(done, 5));
    stop.abort();
    expect((await pending).kind).toBe("cancelled");
  });

  it("a pause before a retry is cut short", async () => {
    const stop = new AbortController();
    const f = fake(answer({}, 503), good());
    const forever = () => new Promise(() => {});
    const pending = call(provider, "m", "q", photo, forever, f.fetchImpl,
                         { signal: stop.signal }).catch((x) => x);
    await new Promise((done) => setTimeout(done, 5));
    stop.abort();
    expect((await pending).kind).toBe("cancelled");
    expect(f.calls()).toBe(1);
  });
});

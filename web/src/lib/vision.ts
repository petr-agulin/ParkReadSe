// The two stages on which the model is called. A port of `parkread/vision.py`.
//
// `classifyImage` is stage 0, triage. `extractSignData` is stage 1, extraction.
// The model has no tools on either; both return data, and the decisions about that
// data are taken by code.
//
// The dialect is OpenAI-compatible: Google understands it through a compatible
// endpoint, as do Mistral and OpenRouter. The price is that the provider does not
// accept our schema and cannot make the model answer strictly by it. The shape is
// explained in words in the prompt, and the real guarantee remains our validator.
//
// **This is where the user's key first appears in the browser.** It goes to exactly
// one place - the header of the request to the provider - and to no other: not to a
// log, not to an error message, not into the body of a report. The provider's error
// body is truncated before it is shown (decision 125).

import { extractPrompt, triagePrompt } from "./prompts";
import { InvalidModelResponse, parseJson, sign as validateSign,
         triage as validateTriage, type Result } from "./validation";
import type { SignDoc } from "./sign";

// The codes on which a retry makes sense: the provider is busy or asks us to wait.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

/** How long to wait for one answer, and the pauses between attempts. The number of
 *  pauses is what sets the most retries; a budget can end them sooner. */
export type Patience = {
  timeoutMs: number;
  pausesMs: readonly number[];
  /** The whole call, retries included. None - no limit. */
  budgetMs?: number;
  /** A retry is not made unless at least this much of the budget is left for it. */
  minAttemptMs?: number;
  /** The pauses a `429` gets instead. None - the same as any other. */
  limitPausesMs?: readonly number[];
};

/** The person standing at a sign (steps 16, 16a, 16c).
 *
 *  A minute for the whole call - a ceiling, not a target: when the pauses run out, the
 *  call ends. A `503` comes back in a second, so short pauses fit six attempts into
 *  the minute, the last near its fiftieth second; a provider that does not answer at
 *  all takes the minute with one. No retry is made that would be left less than ten
 *  seconds: a model reading a sign needs several, and an attempt cut off before its
 *  answer spends the quota for nothing. (3/6/10/15 ended at the fortieth second with a
 *  third of the minute unused.) A `429` gets one retry after a longer pause: with a
 *  per-minute limit, quick repeats hit the same wall and spend more requests. */
export const APP_PATIENCE: Patience = {
  timeoutMs: 60_000,
  budgetMs: 60_000,
  minAttemptMs: 10_000,
  pausesMs: [2_000, 4_000, 8_000, 12_000, 16_000],
  limitPausesMs: [20_000],
};

/** The run over the test set, where waiting costs nothing.
 *
 *  Found by a run: of fourteen photographs eleven failed on a `503` "high demand",
 *  and a retry would have carried them through. A `429` is our own haste and is cured
 *  by seconds; a `503` is somebody else's overload and does not clear at once, which
 *  is why the pause grows. */
export const RUN_PATIENCE: Patience = { timeoutMs: 120_000, pausesMs: [20_000, 45_000, 90_000] };

/** What kind of failure it was. The screen chooses its words by this, never by the
 *  provider's text: the text differs from provider to provider, the codes do not. */
export type Failure =
  | "key"         // 401, 403
  | "limit"       // 429
  | "busy"        // 5xx
  | "timeout"     // no answer in time
  | "network"     // the provider could not be reached at all
  | "reply"       // an answer came, but not in a shape we can read
  | "settings"    // nothing was sent: something the settings name is missing
  | "cancelled"   // the person stopped it
  | "other";      // any other refusal: 400, 404 and the like

export class VisionCallFailed extends Error {
  readonly kind: Failure;
  readonly status: number | null;
  /** What happened, in one line, for "Details" (steps 16b, 16c): the last real refusal
   *  in the provider's own sentence, how many attempts and how long. The message keeps
   *  the last attempt only, and the last alone misled: refusals and a cut-off read as
   *  "no answer". A line per attempt was tried and was too much for a phone. */
  readonly summary: string | null;
  /** Which of the reading's calls failed: the check of the photo or the reading of
   *  the sign (step 16d). The call does not know; the pipeline says. */
  readonly stage: "check" | "read" | null;
  constructor(message: string, kind: Failure = "other", status: number | null = null,
              summary: string | null = null, stage: "check" | "read" | null = null) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.summary = summary;
    this.stage = stage;
  }

  /** The same failure, told which call it happened on. */
  during(stage: "check" | "read"): VisionCallFailed {
    return new VisionCallFailed(this.message, this.kind, this.status, this.summary, stage);
  }
}

/** The provider's own sentence out of its error body, or `null`.
 *
 *  Only for "Details", and only as far as it goes: the words on screen are chosen by
 *  the code of the answer, never by this. OpenAI-compatible providers put it in
 *  `error.message`; Google wraps the same in a list. */
export function providerSays(body: string): string | null {
  try {
    const doc = JSON.parse(body);
    const first = Array.isArray(doc) ? doc[0] : doc;
    const said = first?.error?.message ?? first?.message;
    if (typeof said === "string" && said.trim()) return said.trim().slice(0, 300);
  } catch {
    /* below: a body cut short or not JSON at all */
  }
  const found = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(body);
  return found ? found[1].replace(/\\"/g, '"').trim().slice(0, 300) || null : null;
}

export function failureOf(status: number): Failure {
  if (status === 401 || status === 403) return "key";
  if (status === 429) return "limit";
  if (status >= 500) return "busy";
  return "other";
}

/** A pause is told why it waits, which attempt failed and how many there are. */
export type Pause = (ms: number, why?: string, attempt?: number,
                     info?: { kind: Failure; of: number }) => Promise<unknown>;

export type CallOptions = {
  patience?: Patience;
  signal?: AbortSignal;
  /** The clock the budget is kept by. Tests pass their own. */
  now?: () => number;
};

const cancelled = () => new VisionCallFailed("Stopped by the person.", "cancelled");

/** The same promise, except that it gives up the moment the person stops. */
function unlessStopped<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise<T>((done, fail) => {
    const stop = () => fail(cancelled());
    signal.addEventListener("abort", stop, { once: true });
    work.then(done, fail).finally(() => signal.removeEventListener("abort", stop));
  });
}

/** One model serves both stages (decision 134). That does not stop triage being an
 *  independent look: a different call, a different prompt, no shared context. */
export type Provider = {
  baseUrl: string;
  apiKey: string;
  visionModel: string;
};

export type Photo = { name: string; data: Blob | File };

async function dataUrl(photo: Photo): Promise<string> {
  // The photograph goes to the provider straight from memory: no temporary file is
  // ever created.
  const buffer = await photo.data.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const mime = photo.data.type || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type CallResult = { text: string; usage: Record<string, unknown> };

/** One call to the provider, with retries where a retry makes sense. Without a word
 *  about patience it is the application's: the tools that can wait say so. */
export async function call(provider: Provider, model: string, prompt: string,
                           image: Photo, pause: Pause = sleep,
                           fetchImpl: typeof fetch = fetch,
                           { patience = APP_PATIENCE, signal, now = Date.now }: CallOptions = {},
                          ): Promise<CallResult> {
  // These reach the person on screen, so they say what is missing in the same words
  // the settings use.
  if (!model) throw new VisionCallFailed("The model name is not set.", "settings");
  if (!provider.baseUrl) {
    throw new VisionCallFailed("The provider address is not set.", "settings");
  }
  if (!provider.apiKey) throw new VisionCallFailed("Your API key is not set.", "settings");
  if (signal?.aborted) throw cancelled();
  const { timeoutMs, pausesMs, budgetMs = Infinity, minAttemptMs = 0,
          limitPausesMs = pausesMs } = patience;
  const began = now();
  const left = () => budgetMs - (now() - began);

  const body = {
    model,
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: await dataUrl(image) } },
    ] }],
    temperature: 0,
    response_format: { type: "json_object" },
  };
  const endpoint = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  let why = "";
  let kind: Failure = "other";
  let status: number | null = null;
  let response: Response | null = null;
  let made = 0;
  // The kind of the last failure that was the provider's doing rather than the end of
  // the budget, and that failure in a line.
  let earlier: Failure | null = null;
  let decisive = "";
  let cutAfter: number | null = null;   // seconds the cut-off attempt had
  for (let attempt = 0; ; attempt += 1) {
    const stop = new AbortController();
    // The last attempt waits no longer than the budget has left. The timer marks its
    // own abort: from inside `fetch` it cannot be told from any other.
    const limit = Math.min(timeoutMs, left());
    let expired = false;
    let cut = false;
    const timer = setTimeout(() => { expired = true; stop.abort(); }, limit);
    made += 1;
    // The person's stop ends the request in flight, not only the next one.
    const relay = () => stop.abort();
    signal?.addEventListener("abort", relay, { once: true });
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          // The only place the key leaves the device.
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: stop.signal,
      });
    } catch (e) {
      response = null;
      if (signal?.aborted) throw cancelled();
      const name = (e as Error).name;
      if (expired && limit < timeoutMs && earlier) {
        // Cut off by the end of the minute, not by its own wait. That says nothing new
        // about the provider: the failure keeps the kind of the attempts before it.
        // Four `503`s and a cut-off are an overloaded provider, not a silent one.
        why = `no answer in the ${Math.round(limit / 1000)} s left`;
        kind = earlier;
        cut = true;
      } else if (expired) {
        // Our own words: the browser's for this are "signal is aborted without reason".
        why = `no answer within ${Math.round(limit / 1000)} s`;
        kind = "timeout";
        status = null;
      } else {
        why = `${name}: ${String((e as Error).message).slice(0, 200)}`;
        // A network that fell over, as a rule. A fake in the tests throws an abort of
        // its own, and that is a wait that expired.
        kind = name === "AbortError" || name === "TimeoutError" ? "timeout" : "network";
        status = null;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    }

    if (response && response.status === 200) break;
    let line = why;
    if (response) {
      // The provider's error body carries no key; it is truncated all the same.
      const text = await response.text();
      why = `HTTP ${response.status}: ${text.slice(0, 400)}`;
      line = `HTTP ${response.status}: ${providerSays(text) ?? text.slice(0, 200)}`;
      status = response.status;
      kind = failureOf(response.status);
    }
    if (cut) {
      cutAfter = Math.round(limit / 1000);
    } else {
      earlier = kind;
      decisive = line;
    }
    if (response && !RETRY_STATUS.has(response.status)) break;
    // The pause is told WHY it waits. On a live run a busy provider, a quota wall and a
    // dropped connection looked the same - minutes of silence on one photograph - and
    // the command that prints nothing cannot be told from one that hangs.
    const pauses = kind === "limit" ? limitPausesMs : pausesMs;
    const wait = pauses[attempt];
    // Out of pauses, or out of time: a retry left too little to be answered in is not
    // made at all.
    if (wait === undefined || left() - wait < Math.max(minAttemptMs, 1)) break;
    await unlessStopped(
      Promise.resolve(pause(wait, why, attempt + 1, { kind, of: pauses.length + 1 })),
      signal);
  }

  if (!response || response.status !== 200) {
    const spent = Math.round((now() - began) / 1000);
    const summary = `${decisive} (${made} ${made === 1 ? "attempt" : "attempts"} in ${spent} s`
      + (cutAfter !== null ? `; the last had ${cutAfter} s and no answer)` : ")");
    throw new VisionCallFailed(`${why} (attempts: ${made})`, kind, status, summary);
  }
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new VisionCallFailed("the answer is not JSON", "reply");
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new VisionCallFailed(
      `unexpected shape of answer: ${JSON.stringify(payload).slice(0, 400)}`, "reply");
  }
  return { text, usage: payload.usage ?? {} };
}

export type TriageOutcome = {
  category: string;
  whatISee: string;
  panelsBelowMainSign: number | null;
  usage: Record<string, unknown>;
  validation: Result | null;
};

export const isParkingSign = (t: TriageOutcome) => t.category === "parking_sign";

export type ExtractOutcome = {
  data: SignDoc | null;
  validation: Result;
  usage: Record<string, unknown>;
};

/** What the stages pass on to `call`. */
export type Deps = Partial<{ pause: Pause; fetchImpl: typeof fetch } & CallOptions>;

/** Stage 0: is this a parking sign. It answers with a LABEL, not a decision:
 *  whether to stop the pipeline is decided by the calling code. */
export async function classifyImage(image: Photo, provider: Provider,
                                    deps: Deps = {},
                                   ): Promise<TriageOutcome> {
  const { text, usage } = await call(provider, provider.visionModel, triagePrompt(),
                                     image, deps.pause, deps.fetchImpl, deps);
  const doc = parseJson(text);
  const res = validateTriage(doc);
  const data: any = res.data ?? {};
  return {
    category: String(data.category ?? "unreadable"),
    whatISee: String(data.what_i_see ?? ""),
    panelsBelowMainSign: typeof data.panels_below_main_sign === "number"
      ? data.panels_below_main_sign : null,
    usage,
    validation: res,
  };
}

/** Stage 1: reading the sign into JSON. `panelsSeen` comes from the triage stage -
 *  an independent look at the same photograph. */
export async function extractSignData(image: Photo, provider: Provider,
                                      panelsSeen: number | null = null,
                                      deps: Deps = {},
                                     ): Promise<ExtractOutcome> {
  const { text, usage } = await call(provider, provider.visionModel, extractPrompt(),
                                     image, deps.pause, deps.fetchImpl, deps);
  const doc = parseJson(text);
  const res = validateSign(doc, panelsSeen);
  return { data: res.data, validation: res, usage };
}

export { InvalidModelResponse };

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

export const TIMEOUT_MS = 120_000;

// The codes on which a retry makes sense: the provider is busy or asks us to wait.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

// The pauses between attempts. Their number is what sets the number of retries.
//
// Found by a run: of fourteen photographs eleven failed on a `503` "high demand",
// and a retry would have carried them through. A `429` is our own haste and is cured
// by seconds; a `503` is somebody else's overload and does not clear at once, which
// is why the pause grows. A `400` or a `401` must not be retried: there the request
// or the key is wrong, and a second attempt is simply a second spend of the quota.
export const RETRY_PAUSE_MS = [20_000, 45_000, 90_000];

export class VisionCallFailed extends Error {}

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

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type CallResult = { text: string; usage: Record<string, unknown> };

/** One call to the provider, with retries where a retry makes sense. */
export async function call(provider: Provider, model: string, prompt: string,
                           image: Photo,
                           pause: (ms: number) => Promise<unknown> = sleep,
                           fetchImpl: typeof fetch = fetch): Promise<CallResult> {
  // These reach the person on screen, so they say what is missing in the same words
  // the settings use.
  if (!model) throw new VisionCallFailed("The model name is not set.");
  if (!provider.baseUrl) throw new VisionCallFailed("The provider address is not set.");
  if (!provider.apiKey) throw new VisionCallFailed("Your API key is not set.");

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
  let response: Response | null = null;
  let attempt = 0;
  for (; attempt <= RETRY_PAUSE_MS.length; attempt += 1) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
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
      why = `${(e as Error).name}: ${String((e as Error).message).slice(0, 200)}`;
    } finally {
      clearTimeout(timer);
    }

    if (response && response.status === 200) break;
    if (response) {
      // The provider's error body carries no key; it is truncated all the same.
      why = `HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`;
      if (!RETRY_STATUS.has(response.status)) break;
    }
    if (attempt < RETRY_PAUSE_MS.length) await pause(RETRY_PAUSE_MS[attempt]);
  }

  if (!response || response.status !== 200) {
    throw new VisionCallFailed(`${why} (attempts: ${Math.min(attempt + 1, RETRY_PAUSE_MS.length + 1)})`);
  }
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new VisionCallFailed(
      `unexpected shape of answer: ${JSON.stringify(payload).slice(0, 400)}`);
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

/** Stage 0: is this a parking sign. It answers with a LABEL, not a decision:
 *  whether to stop the pipeline is decided by the calling code. */
export async function classifyImage(image: Photo, provider: Provider,
                                    deps: Partial<{ pause: (ms: number) => Promise<unknown>;
                                                    fetchImpl: typeof fetch }> = {},
                                   ): Promise<TriageOutcome> {
  const { text, usage } = await call(provider, provider.visionModel, triagePrompt(),
                                     image, deps.pause, deps.fetchImpl);
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
                                      deps: Partial<{ pause: (ms: number) => Promise<unknown>;
                                                      fetchImpl: typeof fetch }> = {},
                                     ): Promise<ExtractOutcome> {
  const { text, usage } = await call(provider, provider.visionModel, extractPrompt(),
                                     image, deps.pause, deps.fetchImpl);
  const doc = parseJson(text);
  const res = validateSign(doc, panelsSeen);
  return { data: res.data, validation: res, usage };
}

export { InvalidModelResponse };

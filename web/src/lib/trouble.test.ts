// The words for a reading under way and for a reading that failed (step 16).
//
// There is no DOM in the suite (decision 151): what the screen says is decided here,
// and checked here.

import { describe, expect, it } from "vitest";

import { explain, hostOf, progressLine } from "./trouble";
import { InvalidModelResponse, VisionCallFailed, call, type Failure,
         type Provider } from "./vision";

const PROVIDER_TEXT = 'HTTP 503: {"error":{"code":503,"message":"This model is currently '
                      + 'experiencing high demand.","status":"UNAVAILABLE"}} (attempts: 2)';

describe("a failure in words", () => {
  it("the developer's case: a 503 says the provider is overloaded, in one sentence", () => {
    const t = explain(new VisionCallFailed(PROVIDER_TEXT, "busy", 503))!;
    expect(t.message).toBe("The provider is overloaded right now. Try again in a few minutes.");
    expect(t.settings).toBe(false);
    // The provider's text is kept - under "Details", not as the message.
    expect(t.details).toBe(PROVIDER_TEXT);
  });

  it("every kind has its own sentence, and none of them is the provider's text", () => {
    const kinds: Failure[] = ["key", "limit", "busy", "timeout", "network", "reply", "other"];
    const said = kinds.map((kind) => explain(new VisionCallFailed(PROVIDER_TEXT, kind))!);
    expect(new Set(said.map((t) => t.message)).size).toBe(kinds.length);
    for (const t of said) {
      expect(t.message).not.toMatch(/HTTP|\{|attempts|UNAVAILABLE/);
      expect(t.details).toBe(PROVIDER_TEXT);
    }
  });

  it("where the way out lies in the settings, a link there is offered", () => {
    const withLink = (kind: Failure) => explain(new VisionCallFailed("x", kind))!.settings;
    expect(withLink("key")).toBe(true);
    expect(withLink("network")).toBe(true);
    expect(withLink("other")).toBe(true);
    expect(withLink("busy")).toBe(false);
    expect(withLink("limit")).toBe(false);
    expect(withLink("timeout")).toBe(false);
  });

  it("the time named in the sentence is the time actually waited", () => {
    expect(explain(new VisionCallFailed("x", "timeout"))!.message).toContain("60 seconds");
  });

  it("stopped by the person: nothing to say", () => {
    expect(explain(new VisionCallFailed("Stopped by the person.", "cancelled"))).toBeNull();
  });

  it("missing settings keep their own words: they are ours already", () => {
    const t = explain(new VisionCallFailed("Your API key is not set.", "settings"))!;
    expect(t).toEqual({ message: "Your API key is not set.", settings: true, details: null });
  });

  it("a reply that does not parse is the model's, not the provider's", () => {
    const t = explain(new InvalidModelResponse("the answer does not parse as JSON", "{oops"))!;
    expect(t.message).toBe("The model's answer could not be understood. Try again.");
    // The model's own text never reaches the screen.
    expect(JSON.stringify(t)).not.toContain("{oops");
  });

  it("anything else is still a sentence, with the rest under Details", () => {
    const t = explain(new Error("image decode failed"))!;
    expect(t.message).toBe("Something went wrong while reading the sign. Try again.");
    expect(t.details).toBe("image decode failed");
  });

  it("the key reaches neither the sentence nor the details", async () => {
    const provider: Provider = { baseUrl: "https://example.invalid/v1", apiKey: "secret-key",
                                 visionModel: "m" };
    const photo = { name: "p.jpg", data: new Blob([new Uint8Array([1])]) };
    const refuse = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    const e = await call(provider, "m", "q", photo, async () => {}, refuse).catch((x) => x);
    expect(JSON.stringify(explain(e))).not.toContain("secret-key");
  });
});

describe("the line while reading", () => {
  const base = "https://generativelanguage.googleapis.com/v1beta/openai";

  it("names the provider and the stage", () => {
    expect(progressLine({ stage: "check" }, base))
      .toBe("Asking the AI model at generativelanguage.googleapis.com to check the photo…");
    expect(progressLine({ stage: "read" }, base))
      .toBe("Asking the AI model at generativelanguage.googleapis.com to read the sign…");
  });

  it("a retry says why, how long, and which attempt comes", () => {
    expect(progressLine({ stage: "read", retry: { inMs: 10_000, next: 3, kind: "busy" } }, base))
      .toBe("The provider is busy. Trying again in 10 s (attempt 3).");
    expect(progressLine({ stage: "check", retry: { inMs: 3_000, next: 2, kind: "timeout" } },
                        base))
      .toMatch(/^The provider did not answer\. /);
  });

  it("an address that is not a URL is shown as typed rather than breaking", () => {
    expect(hostOf("https://api.mistral.ai/v1")).toBe("api.mistral.ai");
    expect(hostOf("not a url")).toBe("not a url");
  });
});

describe("details are one line (steps 16b, 16c)", () => {
  it("the summary, when there is one, rather than the last attempt", () => {
    const summary = "HTTP 503: high demand (6 attempts in 49 s; the last had 12 s and no answer)";
    const e = new VisionCallFailed("no answer in the 12 s left (attempts: 6)", "busy", 503,
                                   summary);
    const t = explain(e)!;
    expect(t.message).toBe("The provider is overloaded right now. Try again in a few minutes.");
    expect(t.details).toBe(summary);
  });
});

describe("the wait before a retry counts down (step 16c)", () => {
  const busy = { stage: "read" as const, retry: { inMs: 8_000, next: 4, kind: "busy" as const } };
  const base = "https://generativelanguage.googleapis.com/v1beta/openai";

  it("by the time that has passed since the wait began", () => {
    expect(progressLine(busy, base, 0)).toBe("The provider is busy. Trying again in 8 s (attempt 4).");
    expect(progressLine(busy, base, 900)).toBe("The provider is busy. Trying again in 8 s (attempt 4).");
    expect(progressLine(busy, base, 1_000)).toBe("The provider is busy. Trying again in 7 s (attempt 4).");
    expect(progressLine(busy, base, 7_500)).toBe("The provider is busy. Trying again in 1 s (attempt 4).");
  });

  it("at the end of the wait it says now, never a negative number", () => {
    expect(progressLine(busy, base, 8_000)).toBe("The provider is busy. Trying again now (attempt 4).");
    expect(progressLine(busy, base, 20_000)).toBe("The provider is busy. Trying again now (attempt 4).");
  });
});

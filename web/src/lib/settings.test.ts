import { describe, expect, it } from "vitest";

import { EMPTY_SETTINGS, MASK, NOT_SET, canAnswerHere, canForget, forget, load,
         missing, readiness, rememberToggle, row, save, type Store } from "./settings";

/** A store in memory - the same as the browser's, only visible to the test. */
function store(): Store & { seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return {
    seen,
    getItem: (k) => seen.get(k) ?? null,
    setItem: (k, v) => { seen.set(k, v); },
    removeItem: (k) => { seen.delete(k); },
  };
}

const provider = { baseUrl: "https://provider.invalid/v1", visionModel: "sharp-eye" };

describe("the user's key", () => {
  it("is stored nowhere without the checkbox", () => {
    const s = store();
    save(s, { apiKey: "secret", remember: false, provider });
    expect([...s.seen.values()].join("|")).not.toContain("secret");
    expect(load(s).apiKey).toBe("");
  });

  it("with the checkbox it is remembered and comes back next time", () => {
    const s = store();
    save(s, { apiKey: "secret", remember: true, provider });
    const again = load(s);
    expect(again.apiKey).toBe("secret");
    expect(again.remember).toBe(true);
    expect(again.provider).toEqual(provider);
  });

  it("unticking the box erases what was stored at once, not some day", () => {
    const s = store();
    save(s, { apiKey: "secret", remember: true, provider });
    save(s, { apiKey: "secret", remember: false, provider });
    expect(load(s).apiKey).toBe("");
  });

  it("\"forget\" takes the key away but not the provider's address", () => {
    const s = store();
    save(s, { apiKey: "secret", remember: true, provider });
    const after = forget(s);
    expect(after.apiKey).toBe("");
    expect(after.provider).toEqual(provider);       // no reason to type it again
  });

  it("there may be no store at all - the product does not break on that", () => {
    // A private tab, a site denied storage, an old phone: then we simply do not
    // remember.
    expect(() => save(null, { apiKey: "secret", remember: true, provider })).not.toThrow();
    expect(load(null)).toEqual(EMPTY_SETTINGS);
    expect(forget(null).apiKey).toBe("");
  });

  it("a corrupted record reads as its absence", () => {
    const s = store();
    s.setItem("parkread.provider", "{this is not json");
    expect(load(s).provider.baseUrl).toBe("");
  });
});

describe("readiness to answer in the browser", () => {
  it("a key, an address and one model are needed - a second is never asked for", () => {
    expect(canAnswerHere({ apiKey: "k", remember: false, provider })).toBe(true);
    expect(Object.keys(provider).sort()).toEqual(["baseUrl", "visionModel"]);
    expect(canAnswerHere({ apiKey: "", remember: false, provider })).toBe(false);
    expect(canAnswerHere({ apiKey: "k", remember: false,
                           provider: { ...provider, visionModel: "" } })).toBe(false);
  });

  it("what is missing is said in words, not as \"an error\"", () => {
    expect(missing(EMPTY_SETTINGS))
      .toEqual(["your API key", "the provider address", "the model name"]);
    expect(missing({ apiKey: "k", remember: false, provider })).toEqual([]);
  });
});

describe("a row of the settings", () => {
  it("an empty one says \"not set yet\" and offers to add", () => {
    expect(row("")).toEqual({ shown: NOT_SET, action: "Add", filled: false });
    expect(row("   ")).toEqual({ shown: NOT_SET, action: "Add", filled: false });
  });

  it("a filled one shows the value and offers to edit", () => {
    expect(row(provider.baseUrl))
      .toEqual({ shown: provider.baseUrl, action: "Edit", filled: true });
  });

  it("the key is shown as a mask, and the mask does not give away its length", () => {
    // A number of dots matching the length of the key would tell the size of a paid
    // credential to anyone glancing over a shoulder or seeing a screenshot.
    const short = row("abc", { secret: true });
    const long = row("a".repeat(120), { secret: true });
    expect(short.shown).toBe(MASK);
    expect(long.shown).toBe(MASK);
    expect(short.shown).toBe(long.shown);
    expect(MASK).not.toContain("abc");
  });
});

describe("the \"remember\" switch (decision 146)", () => {
  it("with an empty field it is shown on, but cannot be pressed", () => {
    // It shows the default. There is nothing to choose yet: there is no key.
    expect(rememberToggle("")).toEqual({ on: true, disabled: true });
    expect(rememberToggle("  ")).toEqual({ on: true, disabled: true });
  });

  it("it comes alive with the first character typed, and stays on", () => {
    expect(rememberToggle("k")).toEqual({ on: true, disabled: false });
  });

  it("it can be switched off BEFORE saving - that is the whole point", () => {
    expect(rememberToggle("key", false)).toEqual({ on: false, disabled: false });
    expect(rememberToggle("key", true)).toEqual({ on: true, disabled: false });
  });
});

describe("whether it is visible that the application is configured", () => {
  it("empty settings are named by the chip and in words alike", () => {
    // A person must not leave the settings without noticing there is still nothing
    // to read with: the price of that inattention is paid at a sign, not here.
    const r = readiness(EMPTY_SETTINGS);
    expect(r.ready).toBe(false);
    expect(r.chip).toBe("Configure");
    expect(r.missing).toEqual(["your API key", "the provider address", "the model name"]);
  });

  it("complete ones say \"All set\", with nothing left to list", () => {
    const r = readiness({ apiKey: "k", remember: true, provider });
    expect(r).toEqual({ ready: true, chip: "All set", missing: [] });
  });

  it("half the settings is still \"not configured\"", () => {
    expect(readiness({ apiKey: "k", remember: true,
                       provider: { ...provider, baseUrl: "" } }).ready).toBe(false);
  });
});

describe("\"forget the key\"", () => {
  it("is shown only when there is something to forget", () => {
    expect(canForget(EMPTY_SETTINGS)).toBe(false);
    expect(canForget({ apiKey: "  ", remember: false, provider })).toBe(false);
    expect(canForget({ apiKey: "k", remember: false, provider })).toBe(true);
  });
});

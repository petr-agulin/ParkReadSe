// The rules of the service worker. Checked here rather than by watching a browser:
// the worker outlives the closing of a tab, and a fault in it is not cured by a
// reload but by the hands of a person who does not know it exists.
//
// The most expensive thing here is requirement 7: the answer about a sign is NEVER
// cached. Yesterday's answer handed over as today's is something a person at a sign
// cannot tell apart, and it costs them a fine.

import { describe, expect, it } from "vitest";

import { CACHE, OFFLINE_NOTE, OFFLINE_PAGE, SHELL, STRATEGY, outdated, respond,
         route, type CacheLike, type Env } from "./offline";

const SCOPE = "https://example.org/ParkReadSe/";

/** A cache and a network that tell you everything about themselves. */
function world(opts: { kept?: Record<string, string>; offline?: boolean } = {}) {
  const kept: Record<string, string> = { ...(opts.kept ?? {}) };
  const asked: string[] = [];
  const put: string[] = [];
  const cache: CacheLike<string> = {
    async match(url) { return kept[url]; },
    async put(url, value) { put.push(url); kept[url] = value; },
  };
  const env: Env<string> = {
    scope: SCOPE,
    async fetch(url) {
      asked.push(url);
      if (opts.offline) throw new Error("no network");
      return `fresh:${url}`;
    },
    async cache() { return cache; },
    copy: (value) => value,
    offline: () => OFFLINE_PAGE,
  };
  return { env, kept, asked, put };
}

const get = (url: string, navigate = false) => ({ method: "GET", url, navigate });

describe("what is cached", () => {
  it("the shell is the page, the manifest and the icons, all by relative paths", () => {
    expect(SHELL).toContain("./index.html");
    expect(SHELL).toContain("./manifest.webmanifest");
    expect(SHELL).toContain("./icon-192.png");
    expect(SHELL).toContain("./icon-maskable-512.png");
    // The address of the host is not known in advance: an absolute path would tie
    // the shell to the root of a domain and break it in any folder.
    for (const path of SHELL) expect(path.startsWith("./")).toBe(true);
  });

  it("build files are not part of the shell: only the bundler knows their names", () => {
    expect(SHELL.some((p) => p.includes("assets"))).toBe(false);
  });

  it("the page is taken from the network first, build files from the cache", () => {
    expect(STRATEGY.page).toBe("network-first");
    expect(STRATEGY.asset).toBe("cache-first");
    expect(STRATEGY.network).toBe("never-cached");
  });
});

describe("what goes past the cache", () => {
  it("the call to the model is not cached: it is a POST and it is not ours", () => {
    expect(route({ method: "POST", url: "https://api.provider.com/v1/messages",
                   navigate: false }, SCOPE)).toBe("network");
  });

  it("and a GET to somebody else's address goes past as well", () => {
    expect(route(get("https://api.provider.com/v1/models"), SCOPE)).toBe("network");
  });

  it("even our own POST is never cached", () => {
    expect(route({ method: "POST", url: `${SCOPE}index.html`, navigate: true }, SCOPE))
      .toBe("network");
  });

  it("somebody else's folder on the same domain is none of our business", () => {
    expect(route(get("https://example.org/other/index.html"), SCOPE)).toBe("network");
  });

  it("we take our own: the page as a page, a file as a file", () => {
    expect(route(get(`${SCOPE}`, true), SCOPE)).toBe("page");
    expect(route(get(`${SCOPE}assets/index-a1b2c3.js`), SCOPE)).toBe("asset");
  });

  it("we do not interfere with somebody else's request at all - nor touch the cache", async () => {
    const { env, put, asked } = world();
    const answer = await respond({ method: "POST", url: "https://api.provider.com/v1/messages",
                                   navigate: false }, env);
    expect(answer).toBeNull();
    expect(put).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe("what a person sees with no network", () => {
  it("the shell opens from the cache", async () => {
    const { env } = world({ offline: true,
                            kept: { [`${SCOPE}index.html`]: "the shell" } });
    expect(await respond(get(`${SCOPE}index.html`, true), env)).toBe("the shell");
  });

  it("the page at the folder's address is taken from the stored index.html", async () => {
    const { env } = world({ offline: true,
                            kept: { [`${SCOPE}index.html`]: "the shell" } });
    expect(await respond(get(SCOPE, true), env)).toBe("the shell");
  });

  it("with no shell either, it says what is missing", async () => {
    const { env } = world({ offline: true });
    const answer = await respond(get(SCOPE, true), env);
    expect(answer).toBe(OFFLINE_PAGE);
    expect(answer).toContain(OFFLINE_NOTE);
  });

  it("it says the network, not \"an error\"", () => {
    expect(OFFLINE_NOTE.toLowerCase()).toContain("network");
    // And with no promise it cannot keep: reading a sign does not work offline.
    expect(OFFLINE_NOTE.toLowerCase()).not.toContain("works offline");
  });

  it("a build file is served from the cache without asking the network", async () => {
    const url = `${SCOPE}assets/index-a1b2c3.js`;
    const { env, asked } = world({ kept: { [url]: "old, but the very same" } });
    expect(await respond(get(url), env)).toBe("old, but the very same");
    expect(asked).toEqual([]);
  });

  it("an unfamiliar build file is fetched from the network and stays in the cache", async () => {
    const url = `${SCOPE}assets/index-d4e5f6.js`;
    const { env, put } = world();
    expect(await respond(get(url), env)).toBe(`fresh:${url}`);
    expect(put).toEqual([url]);
  });
});

describe("updating", () => {
  it("with a live network the page is always fresh, and the cache only a way out", async () => {
    const { env, asked, kept } = world({ kept: { [`${SCOPE}index.html`]: "yesterday's" } });
    const answer = await respond(get(`${SCOPE}index.html`, true), env);
    expect(answer).toBe(`fresh:${SCOPE}index.html`);
    expect(asked).toEqual([`${SCOPE}index.html`]);
    expect(kept[`${SCOPE}index.html`]).toBe(`fresh:${SCOPE}index.html`);
  });

  it("past shells are erased: one remains on the device", () => {
    expect(outdated(["parkread-shell-0", CACHE, "someone-elses-cache"]))
      .toEqual(["parkread-shell-0", "someone-elses-cache"]);
    expect(outdated([CACHE])).toEqual([]);
  });
});

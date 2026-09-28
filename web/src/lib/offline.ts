// What the application can do without a network — and what it can never do.
//
// What lives here are the RULES of the service worker, not the worker itself: `sw.ts`
// is twenty lines of wrapping over these functions. They are kept apart for the sake
// of checking. The service worker is the one part of the product that survives the
// closing of a tab, and a fault in it is cured not by a reload but by the hands of a
// person who does not know it is there. So its decisions have to be checked by a
// test, not by observation.
//
// Three rules, and each answers a question of its own.
//
// **The page — the network first.** Otherwise a person sticks on yesterday's version
// and never learns of it: a shell out of the cache looks exactly like a fresh one.
//
// **The files of the build — the cache first.** Their names carry a hash of the
// contents: under the same name there is never an older one, and there is nothing to
// ask the network about.
//
// **Everything else — past us.** A call to the model goes to the provider and is NOT
// cached under any circumstances: a cached answer about a sign is yesterday's answer
// served as today's, and a person at a sign has no way of telling it from a real one.

/** Changes together with what the shell is made of. Old caches are wiped when a new
 *  worker starts, so a change of version means a clean shell on every device. */
export const VERSION = "1";
export const CACHE = `parkread-shell-${VERSION}`;

/** The shell: what goes into the cache at once, so the application opens with no
 *  network. The paths are relative — the address of the host is not known in advance.
 *  The files of the build are not here: their names contain a hash and are known to
 *  the bundler alone; they reach the cache by themselves, at the first opening. */
export const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

/** What is said to a person when there is no network. Reading offline cannot be
 *  promised, and keeping quiet about the reason still less: the photograph is read by
 *  the model, and with no network there is no reaching it. */
export const OFFLINE_NOTE =
  "No connection. Reading a sign needs the network: the photo goes to the model "
  + "that reads it.";

/** The page for when there is neither a network nor a shell in the cache. With no
 *  styles and no scripts: this is the last screen, and it is obliged to show itself
 *  on its own. */
export const OFFLINE_PAGE =
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
  + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
  + "<title>ParkRead Sweden — offline</title></head>"
  + "<body style=\"font:16px system-ui,sans-serif;margin:2rem;color:#0f172a\">"
  + "<h1 style=\"font-size:1.1rem\">ParkRead Sweden</h1><p>" + OFFLINE_NOTE + "</p></body></html>";

export type Req = { method: string; url: string; navigate: boolean };

/** `page` — the network first, `asset` — the cache first, `network` — we do not step
 *  in. */
export type Route = "page" | "asset" | "network";

export const STRATEGY: Record<Route, string> = {
  page: "network-first",
  asset: "cache-first",
  network: "never-cached",
};

/** The folder the application lives in: everything past its edge belongs to somebody
 *  else. */
function folder(scope: string): string {
  const path = new URL(scope).pathname;
  return path.slice(0, path.lastIndexOf("/") + 1);
}

export function route(req: Req, scope: string): Route {
  // A non-GET is never cached: a call to the model is a POST, and it goes untouched.
  if (req.method.toUpperCase() !== "GET") return "network";

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return "network";
  }
  const home = new URL(scope);
  if (url.origin !== home.origin) return "network";
  if (!url.pathname.startsWith(folder(scope))) return "network";

  return req.navigate ? "page" : "asset";
}

export interface CacheLike<R> {
  match(url: string): Promise<R | undefined>;
  put(url: string, response: R): Promise<void>;
}

export interface Env<R> {
  /** The address of the application's folder, as the worker knows it. */
  scope: string;
  fetch(url: string): Promise<R>;
  cache(): Promise<CacheLike<R>>;
  /** A response is read once: a copy goes into the cache, the original to the
   *  person. */
  copy(response: R): R;
  offline(): R;
}

/** The answer to a request — or `null`, if stepping in is not our business. */
export async function respond<R>(req: Req, env: Env<R>): Promise<R | null> {
  const kind = route(req, env.scope);
  if (kind === "network") return null;

  const cache = await env.cache();

  if (kind === "asset") {
    const kept = await cache.match(req.url);
    if (kept) return kept;
    const fresh = await env.fetch(req.url);
    await cache.put(req.url, env.copy(fresh));
    return fresh;
  }

  // The page: the network first. The cache here is not a speeding-up but a way out.
  try {
    const fresh = await env.fetch(req.url);
    await cache.put(req.url, env.copy(fresh));
    return fresh;
  } catch {
    return (await cache.match(req.url))
        ?? (await cache.match(new URL("./index.html", env.scope).href))
        ?? env.offline();
  }
}

/** The names of the caches due for deletion: all but the present one. So a change of
 *  version leaves no previous shell behind it. */
export function outdated(names: readonly string[]): string[] {
  return names.filter((name) => name !== CACHE);
}

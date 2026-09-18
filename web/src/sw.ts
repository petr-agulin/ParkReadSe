// The service worker: a wrapper over `lib/offline.ts`.
//
// There is not one decision here — they all live in `offline.ts`, where a test checks
// them. This file only translates them into the browser's language: put the shell in
// the cache, wipe the previous one, answer a request.
//
// Written by hand rather than by a plugin (a requirement of step 9): a plugin would
// have brought a generator, a config and its own idea of what to cache — and deciding
// what gets cached matters more here than saving forty lines.

import { CACHE, OFFLINE_PAGE, SHELL, outdated, respond, route,
         type Req } from "./lib/offline";

type Extendable = { waitUntil(work: Promise<unknown>): void };
type Fetching = Extendable & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};

interface Worker {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", on: (event: Extendable) => void): void;
  addEventListener(type: "fetch", on: (event: Fetching) => void): void;
}

const worker = globalThis as unknown as Worker;

const env = {
  get scope() { return worker.registration.scope; },
  fetch: (url: string) => fetch(url),
  cache: () => caches.open(CACHE),
  copy: (response: Response) => response.clone(),
  offline: () => new Response(OFFLINE_PAGE, {
    status: 200, headers: { "Content-Type": "text/html; charset=utf-8" },
  }),
};

worker.addEventListener("install", (event) => {
  const scope = worker.registration.scope;
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new URL(path, scope).href)))
      // A new worker does not wait for every tab to close: otherwise a fix would
      // reach the person a day later, and with no explanation at all.
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(outdated(names).map((name) => caches.delete(name))))
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener("fetch", (event) => {
  const req: Req = {
    method: event.request.method,
    url: event.request.url,
    navigate: event.request.mode === "navigate",
  };
  // The decision is taken AT ONCE and by the same rules: somebody else's request — a
  // call to the model included — does not pass through the worker at all, and what
  // does not pass is not cached either.
  if (route(req, worker.registration.scope) === "network") return;
  event.respondWith(
    respond(req, env).then((answer) => answer ?? fetch(event.request)),
  );
});

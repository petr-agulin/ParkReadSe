// Служебный работник: обвязка над `lib/offline.ts`.
//
// Здесь нет ни одного решения — они все в `offline.ts`, где их проверяет тест.
// Этот файл только переводит их на язык браузера: поставить оболочку в кэш,
// стереть прошлую, ответить на запрос.
//
// Написан руками, а не плагином (требование шага 9): плагин принёс бы генератор,
// конфиг и своё представление о том, что кэшировать, — а решать, что кэшируется,
// здесь важнее, чем сэкономить сорок строк.

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
      // Новый работник не ждёт, пока закроются все вкладки: иначе правка
      // доезжала бы до человека через день и без всякого объяснения.
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
  // Решение принимается СРАЗУ и по тем же правилам: чужой запрос — вызов модели
  // в том числе — не проходит через работника вовсе, а не проходит и не кэшируется.
  if (route(req, worker.registration.scope) === "network") return;
  event.respondWith(
    respond(req, env).then((answer) => answer ?? fetch(event.request)),
  );
});

// Что приложение умеет без сети — и чего не умеет никогда.
//
// Здесь ПРАВИЛА служебного работника, а не он сам: `sw.ts` — двадцать строк обвязки
// над этими функциями. Разделено ради проверки. Служебный работник — единственная
// часть продукта, которая переживает закрытие вкладки, и ошибка в нём чинится не
// перезагрузкой, а руками человека, который о нём не знает. Значит, его решения
// должны проверяться тестом, а не наблюдением.
//
// Три правила, и каждое отвечает на свой вопрос.
//
// **Страница — сеть первой.** Иначе человек залипнет на вчерашней версии и никогда
// об этом не узнает: оболочка в кэше выглядит точно так же, как свежая.
//
// **Файлы сборки — кэш первым.** В их именах хэш содержимого: под тем же именем
// старого не бывает, и спрашивать сеть незачем.
//
// **Всё остальное — мимо нас.** Вызов модели уходит к провайдеру и НЕ кэшируется
// ни при каких условиях: закэшированный ответ знака — это вчерашний ответ, выданный
// за сегодняшний, и отличить его от настоящего человек у знака не сможет.

/** Меняется вместе с составом оболочки. Старые кэши стираются при запуске нового
 *  работника, так что смена версии — это чистая оболочка на всех устройствах. */
export const VERSION = "1";
export const CACHE = `parkread-shell-${VERSION}`;

/** Оболочка: то, что кладётся в кэш сразу, чтобы приложение открылось без сети.
 *  Пути относительные — адрес хостинга заранее неизвестен. Файлов сборки здесь нет:
 *  их имена содержат хэш и известны только сборщику; они попадают в кэш сами,
 *  при первом же открытии. */
export const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

/** Что сказано человеку, когда сети нет. Обещать офлайн-разбор нельзя, а молчать
 *  о причине — тем более: снимок читает модель, и без сети до неё не дойти. */
export const OFFLINE_NOTE =
  "No connection. The app, the reference and the general rules are here, "
  + "but reading a sign is not: the photo goes to the model that reads it, "
  + "and that needs the network.";

/** Страница на случай, когда нет ни сети, ни оболочки в кэше. Без стилей и скриптов:
 *  это последний экран, и он обязан показаться сам по себе. */
export const OFFLINE_PAGE =
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
  + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
  + "<title>ParkRead — offline</title></head>"
  + "<body style=\"font:16px system-ui,sans-serif;margin:2rem;color:#0f172a\">"
  + "<h1 style=\"font-size:1.1rem\">ParkRead</h1><p>" + OFFLINE_NOTE + "</p></body></html>";

export type Req = { method: string; url: string; navigate: boolean };

/** `page` — сеть первой, `asset` — кэш первым, `network` — не вмешиваемся. */
export type Route = "page" | "asset" | "network";

export const STRATEGY: Record<Route, string> = {
  page: "network-first",
  asset: "cache-first",
  network: "never-cached",
};

/** Папка, в которой живёт приложение: всё за её пределами — чужое. */
function folder(scope: string): string {
  const path = new URL(scope).pathname;
  return path.slice(0, path.lastIndexOf("/") + 1);
}

export function route(req: Req, scope: string): Route {
  // Не-GET не кэшируется никогда: вызов модели — это POST, и он уходит нетронутым.
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
  /** Адрес папки приложения, как его знает работник. */
  scope: string;
  fetch(url: string): Promise<R>;
  cache(): Promise<CacheLike<R>>;
  /** Ответ читается один раз: в кэш кладётся копия, человеку уходит оригинал. */
  copy(response: R): R;
  offline(): R;
}

/** Ответ на запрос — или `null`, если вмешиваться не наше дело. */
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

  // Страница: сеть первой. Кэш здесь — не ускорение, а запасной выход.
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

/** Имена кэшей, подлежащих удалению: все, кроме нынешнего. Так смена версии
 *  не оставляет за собой прошлую оболочку. */
export function outdated(names: readonly string[]): string[] {
  return names.filter((name) => name !== CACHE);
}

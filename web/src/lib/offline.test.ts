// Правила служебного работника. Проверяются здесь, а не наблюдением в браузере:
// работник переживает закрытие вкладки, и его ошибка чинится не перезагрузкой,
// а руками человека, который о нём не знает.
//
// Самое дорогое здесь — требование 7: ответ знака НЕ кэшируется никогда. Вчерашний
// ответ, выданный за сегодняшний, человек у знака отличить не сможет, а стоит
// это штрафа.

import { describe, expect, it } from "vitest";

import { CACHE, OFFLINE_NOTE, OFFLINE_PAGE, SHELL, STRATEGY, outdated, respond,
         route, type CacheLike, type Env } from "./offline";

const SCOPE = "https://example.org/ParkReadSe/";

/** Кэш и сеть, которые всё про себя рассказывают. */
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
      if (opts.offline) throw new Error("сети нет");
      return `свежее:${url}`;
    },
    async cache() { return cache; },
    copy: (value) => value,
    offline: () => OFFLINE_PAGE,
  };
  return { env, kept, asked, put };
}

const get = (url: string, navigate = false) => ({ method: "GET", url, navigate });

describe("что кэшируется", () => {
  it("оболочка — это страница, манифест и иконки, и все пути относительные", () => {
    expect(SHELL).toContain("./index.html");
    expect(SHELL).toContain("./manifest.webmanifest");
    expect(SHELL).toContain("./icon-192.png");
    expect(SHELL).toContain("./icon-maskable-512.png");
    // Адрес хостинга заранее неизвестен: абсолютный путь привязал бы оболочку
    // к корню домена и сломал бы её в любой папке.
    for (const path of SHELL) expect(path.startsWith("./")).toBe(true);
  });

  it("файлы сборки в оболочку не входят: их имена знает только сборщик", () => {
    expect(SHELL.some((p) => p.includes("assets"))).toBe(false);
  });

  it("страница берётся из сети первой, файлы сборки — из кэша", () => {
    expect(STRATEGY.page).toBe("network-first");
    expect(STRATEGY.asset).toBe("cache-first");
    expect(STRATEGY.network).toBe("never-cached");
  });
});

describe("что мимо кэша", () => {
  it("вызов модели не кэшируется: он POST и он чужой", () => {
    expect(route({ method: "POST", url: "https://api.provider.com/v1/messages",
                   navigate: false }, SCOPE)).toBe("network");
  });

  it("и GET к чужому адресу — тоже мимо", () => {
    expect(route(get("https://api.provider.com/v1/models"), SCOPE)).toBe("network");
  });

  it("даже свой POST не кэшируется никогда", () => {
    expect(route({ method: "POST", url: `${SCOPE}index.html`, navigate: true }, SCOPE))
      .toBe("network");
  });

  it("чужая папка на том же домене — не наше дело", () => {
    expect(route(get("https://example.org/other/index.html"), SCOPE)).toBe("network");
  });

  it("своё берём: страницу как страницу, файл как файл", () => {
    expect(route(get(`${SCOPE}`, true), SCOPE)).toBe("page");
    expect(route(get(`${SCOPE}assets/index-a1b2c3.js`), SCOPE)).toBe("asset");
  });

  it("в чужой запрос не вмешиваемся вовсе — и кэша не касаемся", async () => {
    const { env, put, asked } = world();
    const answer = await respond({ method: "POST", url: "https://api.provider.com/v1/messages",
                                   navigate: false }, env);
    expect(answer).toBeNull();
    expect(put).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe("что видит человек без сети", () => {
  it("оболочка открывается из кэша", async () => {
    const { env } = world({ offline: true,
                            kept: { [`${SCOPE}index.html`]: "оболочка" } });
    expect(await respond(get(`${SCOPE}index.html`, true), env)).toBe("оболочка");
  });

  it("страница по адресу папки берётся из сохранённой index.html", async () => {
    const { env } = world({ offline: true,
                            kept: { [`${SCOPE}index.html`]: "оболочка" } });
    expect(await respond(get(SCOPE, true), env)).toBe("оболочка");
  });

  it("если нет и оболочки — сказано, чего не хватает", async () => {
    const { env } = world({ offline: true });
    const answer = await respond(get(SCOPE, true), env);
    expect(answer).toBe(OFFLINE_PAGE);
    expect(answer).toContain(OFFLINE_NOTE);
  });

  it("сказано именно про сеть, а не «ошибка»", () => {
    expect(OFFLINE_NOTE.toLowerCase()).toContain("network");
    // И без обещания, которого не сдержать: разбор знака офлайн не работает.
    expect(OFFLINE_NOTE.toLowerCase()).not.toContain("works offline");
  });

  it("файл сборки отдаётся из кэша, не спрашивая сеть", async () => {
    const url = `${SCOPE}assets/index-a1b2c3.js`;
    const { env, asked } = world({ kept: { [url]: "старое, но то же самое" } });
    expect(await respond(get(url), env)).toBe("старое, но то же самое");
    expect(asked).toEqual([]);
  });

  it("незнакомый файл сборки берётся из сети и остаётся в кэше", async () => {
    const url = `${SCOPE}assets/index-d4e5f6.js`;
    const { env, put } = world();
    expect(await respond(get(url), env)).toBe(`свежее:${url}`);
    expect(put).toEqual([url]);
  });
});

describe("обновление", () => {
  it("страница при живой сети всегда свежая, а кэш — только запасной выход", async () => {
    const { env, asked, kept } = world({ kept: { [`${SCOPE}index.html`]: "вчерашняя" } });
    const answer = await respond(get(`${SCOPE}index.html`, true), env);
    expect(answer).toBe(`свежее:${SCOPE}index.html`);
    expect(asked).toEqual([`${SCOPE}index.html`]);
    expect(kept[`${SCOPE}index.html`]).toBe(`свежее:${SCOPE}index.html`);
  });

  it("прошлые оболочки стираются: на устройстве остаётся одна", () => {
    expect(outdated(["parkread-shell-0", CACHE, "чужой-кэш"]))
      .toEqual(["parkread-shell-0", "чужой-кэш"]);
    expect(outdated([CACHE])).toEqual([]);
  });
});

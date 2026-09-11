// Страница как приложение: манифест, иконки, относительные пути и то, что
// в собранную страницу не должно попасть.
//
// Проверяются ФАЙЛЫ, а не поведение: манифест читает система, а не наш код,
// и ошибка в нём не роняет ничего — приложение просто не ставится на телефон,
// и понять почему можно только вручную. Такое ловится тестом или не ловится вовсе.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SHELL } from "./lib/offline";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(WEB + path, "utf-8");

const manifest = JSON.parse(read("public/manifest.webmanifest"));
const BLUE = "#0057a8";                       // синий шведского знака (`design.md`)

describe("манифест", () => {
  it("назван так, как человек найдёт его на телефоне", () => {
    expect(manifest.name).toContain("ParkRead");
    expect(manifest.short_name).toBe("ParkRead");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("открывается как приложение, а не как вкладка", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("цвета — те же, что на экране и на иконке", () => {
    expect(manifest.theme_color.toLowerCase()).toBe(BLUE);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("адреса относительные: хостинг заранее неизвестен", () => {
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    for (const icon of manifest.icons) expect(icon.src.startsWith("./")).toBe(true);
  });

  it("иконки настоящие: файл на месте, размер как заявлено", () => {
    for (const icon of manifest.icons) {
      const file = icon.src.replace("./", "");
      expect(existsSync(`${WEB}public/${file}`), file).toBe(true);
      expect(icon.type).toBe("image/png");
      // Размер в манифесте — обещание системе; имя файла его повторяет.
      expect(file, icon.sizes).toContain(icon.sizes.split("x")[0]);
    }
  });

  it("есть иконка под маску — иначе система обрежет рисунок по-своему", () => {
    const maskable = manifest.icons.filter((i: { purpose: string }) =>
      i.purpose === "maskable");
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
  });
});

describe("страница", () => {
  const html = read("index.html");

  it("ссылается на манифест и иконку относительным путём", () => {
    expect(html).toContain('href="./manifest.webmanifest"');
    expect(html).toContain('href="./icon-192.png"');
    expect(html).not.toContain('href="/manifest.webmanifest"');
  });

  it("цвет системной полосы совпадает с манифестом", () => {
    expect(html).toContain(`content="${BLUE}"`);
  });

  it("сборка идёт с относительной базой: страница живёт в любой папке", () => {
    expect(read("vite.config.ts")).toMatch(/base:\s*"\.\/"/);
  });
});

describe("оболочка и папка public", () => {
  it("в кэш кладётся ровно то, что лежит рядом со страницей", () => {
    const onDisk = readdirSync(`${WEB}public`).sort();
    const listed = SHELL.filter((p) => p !== "./" && p !== "./index.html")
                        .map((p) => p.replace("./", "")).sort();
    // Добавить иконку и забыть про оболочку — значит остаться без неё офлайн,
    // и заметить это можно только в самолёте.
    expect(listed).toEqual(onDisk);
  });
});

describe("чего нет в собранной странице", () => {
  const app = read("src/App.tsx");

  it("питон подключается только внутри ветки разработки", () => {
    // Импорт наверху файла попал бы в сборку целиком — вместе с адресом `/api`,
    // которого у собранной страницы нет.
    expect(app).not.toMatch(/^import .*from "\.\/api"/m);
    expect(app).toMatch(/import\.meta\.env\.DEV[\s\S]{0,400}await import\("\.\/api"\)/);
  });

  it("переключатель «браузер/питон» стоит за признаком разработки", () => {
    const lines = app.split("\n");
    const at = lines.findIndex((line) => line.includes("Read on this device"));
    expect(at, "переключатель не найден — правь тест вместе с экраном")
      .toBeGreaterThan(-1);
    const before = lines.slice(Math.max(0, at - 8), at).join("\n");
    expect(before).toContain("import.meta.env.DEV");
  });

  it("служебный работник регистрируется только в собранной странице", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("import.meta.env.PROD");
    // Относительный путь: работник управляет своей папкой, а не корнем домена.
    expect(main).toContain('register("./sw.js")');
  });
});

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
// Хром приложения: цвет системной полосы. Это шестнадцатеричный двойник токена
// `accent` из `design.md` — манифест и `<meta>` читает система, а не наш CSS,
// и значения `oklch` там разбирает не всякий телефон. Меняются они вдвоём.
const BLUE = "#2a6099";

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

  it("сервера нет ни строкой: ни импорта, ни адреса, ни ветки разработки", () => {
    // Питон удалён (шаг 8, этап 6). Пока ветка разработки жива, жива и половина,
    // которой некуда ходить, — а выглядит это как работающий выбор.
    expect(app).not.toContain('from "./api"');
    expect(app).not.toContain("/api/");
    expect(app).not.toContain("import.meta.env.DEV");
  });

  it("переключателя «браузер/питон» нет вовсе", () => {
    // Выбора больше не существует: отвечает браузер, и отвечать больше некому.
    expect(app).not.toContain("Read on this device");
    expect(app).not.toContain("server.py");
  });

  it("оформление живёт в токенах, а не в разметке", () => {
    // Требование 1 шага 11. Цвет, вписанный в компонент, расходится с остальными
    // экранами молча: правят один файл, а про три забывают. Значения живут
    // в `index.css`, в разметке остаются только имена.
    const sources = (dir: string): string[] =>
      readdirSync(`${WEB}src/${dir}`, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? sources(`${dir}${e.name}/`)
        : e.name.endsWith(".tsx") ? [`src/${dir}${e.name}`] : []);

    const PALETTE = /\b(?:bg|text|border|fill|stroke|ring|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

    for (const file of sources("")) {
      const text = read(file);
      // Отрицательный просмотр назад — ради `&#9679;`: это знак-сущность,
      // а не цвет, и попадаться он тут не должен.
      expect(text, `${file}: цвет вписан прямо в разметку`)
        .not.toMatch(/(?<!&)#[0-9a-fA-F]{3,8}\b/);
      // Функции цвета — такие же литералы, как `#rrggbb`. Проверялись только
      // `rgb()` и `rgba()`, и дыра нашлась на этапе 5: градиент нижнего слоя
      // был вписан в стиль прямо через `oklch()` — в той самой записи, которой
      // в этом проекте заданы все цвета, — и сторож его пропустил.
      expect(text, `${file}: функция цвета мимо токенов`)
        .not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/);
      expect(text, `${file}: палитра сборщика вместо токена`).not.toMatch(PALETTE);
    }
  });

  it("имя кегля не занято цветом, и наоборот", () => {
    // Утилиты `text-*` общие для размера и для цвета текста. Токен размера,
    // названный как токен цвета, МОЛЧА становится краской: заголовок уезжает
    // и в кегле, и в цвете, а сборка не жалуется ни словом.
    //
    // Поймано на `--text-hero`: цвет `--color-hero` уже был занят тёмной плашкой,
    // и `text-hero` начал красить. Нашлось случайно, при взгляде в собранный CSS,
    // — потому и сторож.
    const css = read("src/index.css");
    const names = (prefix: string) =>
      [...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):`, "g"))]
        .map((m) => m[1])
        // `--text-display--line-height` — не отдельное имя, а свойство размера.
        .filter((n) => !n.includes("--"));

    const sizes = new Set(names("text"));
    const clash = names("color").filter((n) => sizes.has(n));
    expect(clash, "имя занято и кеглем, и цветом").toEqual([]);
    // Проверка проверки: если имена перестали находиться, молчание не считается.
    expect(sizes.size).toBeGreaterThan(5);
  });

  it("служебный работник регистрируется только в собранной странице", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("import.meta.env.PROD");
    // Относительный путь: работник управляет своей папкой, а не корнем домена.
    expect(main).toContain('register("./sw.js")');
  });
});

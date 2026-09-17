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

/** Все компоненты страницы: `.tsx` из `src`, включая вложенные папки. */
const sources = (dir = ""): string[] =>
  readdirSync(`${WEB}src/${dir}`, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}${e.name}/`)
    : e.name.endsWith(".tsx") ? [`src/${dir}${e.name}`] : []);

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

  // Сторож имён кеглей и цветов уехал в `tokens.test.ts`, к сторожу контраста:
  // оба читают один файл токенов и проверяют его свойства, а не страницу.

  it("служебный работник регистрируется только в собранной странице", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("import.meta.env.PROD");
    // Относительный путь: работник управляет своей папкой, а не корнем домена.
    expect(main).toContain('register("./sw.js")');
  });
});

describe("экран настроек", () => {
  const screen = read("src/components/SettingsScreen.tsx");

  it("«запомнить» — флажок, а не переключатель", () => {
    // Разработчик выбрал флажок и отменил ради него правило `design.md`
    // «переключатель, не флажок». Вернуться к прежнему виду молча нельзя:
    // решение принималось отдельно и с оговорками.
    expect(screen).toContain('type="checkbox"');
    expect(screen).not.toContain('role="switch"');
  });

  it("длинное значение не выталкивает кнопку за экран", () => {
    // Длинный ключ уезжал вправо и уносил кнопку с собой — у строки не было
    // `min-w-0`. Ищется в АТРИБУТЕ, а не по всему файлу: то же слово стоит рядом
    // в комментарии, и проверка по тексту зеленела бы при пустой разметке.
    expect(screen).toMatch(/className="[^"]*\bmin-w-0\b/);
  });
});

describe("высота окна", () => {
  it("окно меряет одна оболочка, и меряет в svh", () => {
    // `vh` на телефоне считается так, будто адресной строки нет: страница выходит
    // ровно на её высоту длиннее окна — всё уместилось, а прокрутка всё равно есть.
    // Ровно это и нашёл разработчик на двух телефонах сразу.
    //
    // `dvh` не спасает: он меняется на ходу, и экран, смеренный при спрятанной
    // строке, перестаёт помещаться в ту секунду, когда строка выезжает.
    // `svh` — наименьшая высота окна: в неё влезает всегда и одинаково.
    const app = read("src/App.tsx");
    expect(app).toContain("min-h-[100svh]");
    // Имя запрещённого класса собрано из кусков НАРОЧНО, и целиком его нельзя
    // написать даже в комментарии рядом. Сборщик ищет имена классов по всем файлам
    // проекта, включая тесты: целый литерал — хоть в коде, хоть в тексте — сам
    // добавляет в собранный CSS мёртвое правило со старым замером окна. Разметка
    // его не применяет, но проверка «ушёл ли старый замер из сборки» после этого
    // отвечает «нет» на исправном коде. Проверено: так и было, дважды.
    expect(app).not.toContain("min-h-" + "screen");
    expect(app).not.toMatch(/\d+dvh/);
  });

  it("ни один экран не меряет окно сам", () => {
    // Экран, вычитавший отступы оболочки, держал её число в чужом файле: поменяли
    // бы отступ — прокрутка вернулась бы молча. Мерить окно может ровно один файл,
    // и это оболочка.
    for (const file of sources().filter((f) => f !== "src/App.tsx")) {
      expect(read(file), `${file}: экран меряет окно сам`).not.toMatch(/\d+[sdl]?vh/);
    }
  });

  it("полоса во всю ширину выходит ровно на поля оболочки", () => {
    // `-mx-4` у полосы и `px-4` у оболочки — одно и то же число, записанное
    // в двух файлах. Разъедутся — полоса перестанет доходить до краёв, и заметить
    // это можно будет только глазом на телефоне.
    // Числа берутся из атрибута `className`, а не из файла целиком: названные
    // в соседнем комментарии, они удовлетворили бы проверку, ничего не рисуя.
    const shell = read("src/App.tsx").match(/<main className="([^"]*)"/)?.[1] ?? "";
    const pad = shell.match(/\bpx-(\d+)\b/)?.[1];
    const band = read("src/components/Home.tsx")
      .match(/className="([^"]*\B-mx-\d+[^"]*)"/)?.[1]
      ?.match(/-mx-(\d+)/)?.[1];
    expect(pad, "у оболочки нет горизонтальных полей").toBeTruthy();
    expect(band, "полоса не выходит за поля").toBeTruthy();
    expect(band, "полоса и поля оболочки разошлись").toBe(pad);
  });

  it("на коротком экране полоса ужимается, и правило это настоящее", () => {
    // Сначала было написано утилитой `[@media(max-height:760px)]:`, и сборщик
    // молча не выпустил ни её, ни кегль, который она включала: в собранном CSS
    // не было ни одного такого правила. Забота о коротком экране существовала
    // только в разметке. Теперь это обычный `@media`, и проверяется он здесь.
    const css = read("src/index.css");
    expect(css).toMatch(/@media\s*\(max-height:\s*\d+px\)/);
    expect(css).toContain(".tight-on-short");
    // Класс ищется В АТРИБУТЕ, а не где угодно в файле. Сначала было написано
    // `toContain`, и саботаж его не уронил: класс назван ещё и в комментарии
    // над самой полосой, поэтому проверка зеленела при пустой разметке.
    expect(read("src/components/Home.tsx"))
      .toMatch(/className="[^"]*\btight-on-short\b/);
  });

  it("подпись момента не переносится", () => {
    // С выбранной датой строка раздвигалась, и «Reading for» уезжало в две
    // строки — читается это не как строка списка, а как обрывок. Поймано
    // на телефоне; здесь закреплено, потому что вернуть перенос можно одним
    // случайно снятым классом.
    expect(read("src/components/Home.tsx"))
      .toMatch(/className="[^"]*\bwhitespace-nowrap\b[^"]*"\s*>\s*Reading for/);
  });

  it("фон лежит на странице, а не только на оболочке", () => {
    // С `svh` оболочка при спрятанной адресной строке НИЖЕ окна, и снизу
    // проглядывало бы белое — там, где его никто не красил.
    expect(read("src/index.css")).toMatch(/body\s*\{[^}]*--color-ground-2/);
  });
});

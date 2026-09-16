// Проверка СОБРАННОЙ страницы: `npm run test:build`.
//
// Отдельно от обычного прогона, потому что сборка занимает секунды, а платить их
// за каждый запуск тестов незачем. Сборка запускается здесь же — проверять то,
// что лежит в `dist` с прошлого раза, значит проверять прошлый раз.
//
// Вопрос у всей проверки один: **работает ли страница без питона и из любой папки**.
// Ответ на него нельзя получить чтением исходников — в сборке остаётся не то,
// что написано, а то, что уцелело после сборщика.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const DIST = `${WEB}dist/`;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}${name}`;
    return statSync(full).isDirectory() ? files(`${full}/`) : [full];
  });
}

let built: string[] = [];

beforeAll(() => {
  // `NODE_ENV` задаётся явно: тестовый прогон выставляет своё значение, дочерняя
  // сборка его наследует, и Vite собирает страницу как отладочную — с ветками
  // разработки внутри. Проверка тогда проверяла бы не то, что уедет на хостинг.
  execFileSync("npm", ["run", "build"], {
    cwd: WEB, stdio: "pipe", shell: true,
    env: { ...process.env, NODE_ENV: "production" },
  });
  built = files(DIST);
}, 300_000);

describe("собранная страница", () => {
  it("состоит из страницы, работника, манифеста и иконок", () => {
    for (const file of ["index.html", "sw.js", "manifest.webmanifest",
                        "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      expect(existsSync(DIST + file), file).toBe(true);
    }
  });

  it("не обращается к серверу: строки `/api` в ней нет", () => {
    // Половина с питоном спрятана за `import.meta.env.DEV`, и сборщик её выбрасывает.
    // Если она уцелеет, страница будет молча стучаться в сервер, которого нет.
    for (const file of built.filter((f) => /\.(js|html|css)$/.test(f))) {
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("/api/analyze");
      expect(text, file).not.toContain("/api/general-rules");
    }
  });

  it("независимый судья схемы остался в тестах", () => {
    // `ajv` нужен, чтобы сверять СВОЮ проверку схемы (решение 138), и только там.
    // Уехал бы в страницу — человек у знака платил бы связью и памятью за то,
    // что нужно одному тесту.
    for (const file of built.filter((f) => f.endsWith(".js"))) {
      const text = readFileSync(file, "utf-8");
      // Строка самого `ajv`: своя проверка говорит о том же другими словами.
      expect(text, file).not.toContain("must be equal to one of the allowed values");
      expect(text, file).not.toContain("ajv/dist");
    }
    const pkg = JSON.parse(readFileSync(`${WEB}package.json`, "utf-8"));
    expect(pkg.devDependencies, "`ajv` обязан быть только в разработческих").toHaveProperty("ajv");
    expect(pkg.dependencies ?? {}, "`ajv` уехал бы в страницу").not.toHaveProperty("ajv");
  });

  it("переключателя «браузер/питон» в ней нет", () => {
    for (const file of built.filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(file, "utf-8"), file).not.toContain("Read on this device");
    }
  });

  it("пути относительные: страница живёт хоть в корне, хоть в папке", () => {
    const html = readFileSync(DIST + "index.html", "utf-8");
    expect(html).toContain("./assets/");
    // Абсолютный путь привязал бы страницу к корню домена.
    expect(html).not.toMatch(/(src|href)="\/[^/]/);
  });

  it("работник лежит рядом со страницей и всё нужное несёт в себе", () => {
    const sw = readFileSync(DIST + "sw.js", "utf-8");
    expect(sw).toContain("parkread-shell-");
    expect(sw).toContain("./manifest.webmanifest");
    // Ни одного импорта: модульные служебные работники есть не везде, и промах
    // был бы тихим — приложение работает, офлайна просто нет.
    expect(sw).not.toMatch(/^\s*import[\s({]/m);
  });
});

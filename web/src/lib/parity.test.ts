// Двойной прогон: одна и та же задача — двум реализациям, ответ сравнивается.
//
// Считает ответы `web/tools/goldens.ts`, он же их и пишет; здесь они сверяются
// с тем, что лежит в `parity/`. Пробы живут там, а не тут, ровно по одной причине:
// команда, которая пишет эталоны, и прогон, который их проверяет, обязаны считать
// ОДНИМ кодом. Две копии одной пробы разъедутся молча — а это та самая беда,
// против которой весь двойной прогон и заведён.
//
// Расхождение должно ЧИТАТЬСЯ: «не сошлось» бесполезно, когда случаев под две
// сотни, а в каждом — режимы, отрезки и подписи. Поэтому путь до поля собирается
// целиком (`differences`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { differences, report } from "./parity";
import { LAYERS, PROBES } from "../../tools/goldens";

// Эталоны лежат вне `web/`: они об ответе продукта, а не о сборке страницы.
const DIR = fileURLToPath(new URL("../../../parity/", import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${DIR}${name}.json`, "utf-8"));

describe("двойной прогон", () => {
  it("эталоны на месте и случаи объявлены", () => {
    const cases = read("cases");
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.length).toBeGreaterThan(100);
    for (const layer of LAYERS) expect(read(layer)).toBeTruthy();
  });

  it("список портированных слоёв объявлен и состоит из известных", () => {
    const ported: string[] = read("PORTED").layers;
    expect(Array.isArray(ported)).toBe(true);
    for (const layer of ported) expect(LAYERS).toContain(layer);
  });

  it("портированный слой сходится с эталоном, непортированный назван вслух", async () => {
    const ported: string[] = read("PORTED").layers;
    const pending = LAYERS.filter((l) => !ported.includes(l));
    // Не украшение: строка в выводе — единственное, что не даёт забыть,
    // что половина ответа ещё нигде не проверяется.
    if (pending.length) console.log(`двойной прогон: ждут порта — ${pending.join(", ")}`);

    for (const layer of ported) {
      const probe = PROBES[layer];
      // Слой объявлен портированным, а считать его нечем — это ошибка списка.
      expect(probe, `слой ${layer} объявлен портированным, но пробы нет`).toBeTruthy();
      const lines = report(layer, read(layer), await probe!());
      expect(lines, lines.join("\n")).toEqual([]);
    }
  }, 120_000);
});

describe("расхождение читается", () => {
  it("путь ведёт до поля, а не до случая", () => {
    const было = { regimes: [{ periods: [{ state: "allowed" }] }] };
    const стало = { regimes: [{ periods: [{ state: "prohibited" }] }] };
    expect(differences(было, стало)).toEqual([
      'regimes[0].periods[0].state: "prohibited" ≠ "allowed"',
    ]);
  });

  it("пропавшее и лишнее поле различаются", () => {
    expect(differences({ a: 1, b: 2 }, { a: 1 })).toEqual(["b: поля нет"]);
    expect(differences({ a: 1 }, { a: 1, b: 2 })).toEqual(["b: лишнее поле — 2"]);
  });

  it("разная длина списка называется числом", () => {
    const lines = differences({ p: [1, 2] }, { p: [1] });
    expect(lines[0]).toBe("p: элементов 1, а не 2");
  });

  it("у длинной строки называется первый разошедшийся знак", () => {
    // Календарь отдаёт по букве на день: две простыни рядом не показывают ничего.
    const было = "w".repeat(60) + "e" + "w".repeat(60);
    const стало = "w".repeat(60) + "r" + "w".repeat(60);
    expect(differences({ classes: было }, { classes: стало }))
      .toEqual(['classes: расходится со знака 60: "wwwwwrwwwww" ≠ "wwwwwewwwww"']);
  });

  it("короткая строка показывается целиком", () => {
    expect(differences({ state: "allowed" }, { state: "prohibited" }))
      .toEqual(['state: "prohibited" ≠ "allowed"']);
  });

  it("совпадение молчит", () => {
    const answer = { a: [1, { b: "x" }], c: null };
    expect(differences(answer, structuredClone(answer))).toEqual([]);
  });

  it("отчёт называет слой и случай", () => {
    const lines = report("engine", { "demo/005@base": { permits: true } },
                         { "demo/005@base": { permits: false } });
    expect(lines).toEqual(["engine · demo/005@base · permits: false ≠ true"]);
  });

  it("непосчитанный случай — тоже расхождение", () => {
    expect(report("engine", { "demo/005@base": {} }, {}))
      .toEqual(["engine · demo/005@base: случай не посчитан"]);
  });
});

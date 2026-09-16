// Свежесть порождённых данных. Перенесено из `tests/test_parity.py` (шаг 8, этап 3).
//
// Справочник, общие правила, схемы и промпты живут источниками — markdown, JSON
// и текстовые файлы, — а в браузер едут порождёнными модулями. Правили источник
// и не пересобрали: падает здесь, а не у человека, которому показали вчерашнюю
// формулировку.
//
//     npm run emit

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EMITTED_FIELDS, ROOT, TARGETS, emitPrompts, emitReference, emitRules,
         emitSchema } from "./emit";

const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");

describe("порождённое свежее", () => {
  // py: test_parity::test_the_browser_reference_is_current
  it("справочник для браузера собран из markdown и не устарел", () => {
    expect(read("web/src/lib/reference.data.ts"), "пересобрать: npm run emit")
      .toBe(emitReference());
  });

  // py: test_parity::test_the_browser_schemas_are_current
  it("схемы в браузере — копия `schema/*.json`", () => {
    expect(read("web/src/lib/schema.data.ts"), "пересобрать: npm run emit")
      .toBe(emitSchema());
  });

  it("тексты промптов в браузере — копия файлов `prompts/`", () => {
    // Промпт — это САМ ВОПРОС к модели: его отпечаток держит все сохранённые
    // ответы, и правка здесь стоит полного прогона набора.
    expect(read("web/src/lib/prompts.data.ts"), "пересобрать: npm run emit")
      .toBe(emitPrompts());
  });

  it("все четыре цели пересобираются одной командой", () => {
    expect(TARGETS.map((t) => t.path)).toEqual([
      "web/src/lib/reference.data.ts", "web/src/lib/rules.data.ts",
      "web/src/lib/schema.data.ts", "web/src/lib/prompts.data.ts"]);
  });

  // py: test_parity::test_the_emitted_reference_carries_what_the_screen_shows
  it("переезжают поля, которые показ берёт у записи", () => {
    // `body` и `tokens` не переезжают: первое — многоабзацный markdown справки,
    // второе — подсказка модели; на экране разбора не участвует ни то, ни другое.
    for (const field of ["en", "short", "label", "code", "category"]) {
      expect(EMITTED_FIELDS as readonly string[]).toContain(field);
    }
    expect(EMITTED_FIELDS as readonly string[]).not.toContain("body");
    expect(EMITTED_FIELDS as readonly string[]).not.toContain("tokens");
    expect(read("web/src/lib/reference.data.ts")).toContain("Руками не правится");
  });

  // py: test_parity::test_the_general_rules_travel_with_the_page
  it("общие правила едут вместе со страницей", () => {
    // Раньше справка приходила с сервера, и отказ был МОЛЧАЛИВЫМ: нет сервера —
    // блок исчезал без единого слова (шаг 6d).
    const emitted = read("web/src/lib/rules.data.ts");
    expect(emitted, "пересобрать: npm run emit").toBe(emitRules());
    for (const field of ["key", "text", "source", "body"]) {
      expect(emitted, field).toContain(`"${field}"`);
    }
    // Страница берёт их локально и в сеть за справкой не ходит.
    const app = read("web/src/App.tsx");
    expect(app).toContain("GENERAL_RULES");
    expect(app, "остался сетевой вызов за справкой").not.toContain("generalRules()");
    // И пометка остаётся: продукт не вправе подать общее правило как прочитанное
    // со столба.
    expect(read("web/src/components/WhatWeSaw.tsx"))
      .toContain("These are general parking rules applied by law in Sweden.");
  });
});

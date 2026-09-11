// Общие правила: справка о том, чего на знаке НЕТ.
//
// Раньше она приходила с сервера, и отказ был молчаливым: нет сервера — блок
// исчезал без единого слова. Теперь она едет вместе со страницей, и пустой
// список означает поломку сборки, а не тишину.

import { describe, expect, it } from "vitest";

import { GENERAL_RULES } from "./rules.data";

describe("общие правила", () => {
  it("приехали все десять и с текстом", () => {
    expect(GENERAL_RULES.length).toBeGreaterThanOrEqual(10);
    for (const rule of GENERAL_RULES) {
      expect(rule.key, "ключ").toBeTruthy();
      expect(rule.text.length, `${rule.key}: подпись`).toBeGreaterThan(5);
      expect(rule.body.length, `${rule.key}: текст`).toBeGreaterThan(50);
      expect(rule.source, `${rule.key}: источник`).toBeTruthy();
    }
  });

  it("ключи не повторяются", () => {
    const keys = GENERAL_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("это справка, а не вывод по знаку", () => {
    // Каждая запись сама говорит, что на знаке её нет: продукт не вправе
    // подать общее правило как прочитанное со столба.
    for (const rule of GENERAL_RULES) {
      expect(rule.body, rule.key).toContain("На знаке этого нет");
    }
  });
});

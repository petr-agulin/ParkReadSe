// Проверка ответа модели: чинится оформление, но не то, у чего есть последствие.
// Перенесено из `tests/test_accuracy.py` (шаг 8) — эти находки сделал замер.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ok, sign as validateSign, triage } from "./validation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Эталон разбора из набора — свежая копия на каждый тест: валидатор чинит на месте. */
const read = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(`${ROOT}testset/expected/${name}.json`, "utf-8"));

describe("ответ отсева", () => {
  // py: test_accuracy::test_extra_field_does_not_destroy_a_triage_answer
  it("лишнее поле не губит ответ, а убирается с записью правки", () => {
    // Найдено замером: на трёх снимках ответ отсева молча не сохранялся, и замер
    // читал вместо него старую затравку как свежий ответ.
    const res = triage({ category: "parking_sign", what_i_see: "знак", panels_below_main_sign: 3,
                         reasoning: "лишнее поле, которого нет в схеме" });
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data as Record<string, unknown>).not.toHaveProperty("reasoning");
    expect(res.repairs.some((r) => r.includes("reasoning"))).toBe(true);
  });

  // py: test_accuracy::test_long_what_i_see_and_numeric_string_are_repaired
  it("длинное описание укорачивается, число строкой становится числом", () => {
    const res = triage({ category: "parking_sign", what_i_see: "оно ".repeat(200),
                         panels_below_main_sign: "4" });
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    const data = res.data as Record<string, any>;
    expect(data.panels_below_main_sign).toBe(4);
    expect(data.what_i_see.length).toBeLessThanOrEqual(200);
  });

  // py: test_accuracy::test_bad_category_still_rejects_the_whole_triage
  it("выдуманная категория отбраковывает ответ целиком", () => {
    // `category` решает судьбу конвейера — такое не чинится.
    expect(ok(triage({ category: "может быть", what_i_see: "знак",
                       panels_below_main_sign: 1 }))).toBe(false);
  });
});

describe("разбор знака", () => {
  // py: test_accuracy::test_unknown_enum_value_does_not_destroy_the_parse
  it("неизвестное значение необязательного поля не губит разбор", () => {
    // Снимок `009`: модель вписала `payment_method=mobile`, когда такого значения
    // в схеме уже не было. Поле выбрасывается с правкой, верно прочитанный знак остаётся.
    const doc = JSON.parse(readFileSync(`${ROOT}testset/expected/009-besokande-avgift.json`, "utf-8"));
    doc.panels[1].parsed.payment_method = "mobile";
    const res = validateSign(doc);
    expect(ok(res), "разбор не отбракован целиком").toBe(true);
    expect(res.data!.panels![1].parsed).not.toHaveProperty("payment_method");
    expect(res.repairs.some((r) => r.includes("payment_method"))).toBe(true);
  });

  it("цвет вне перечисления становится `other`, и разбор остаётся", () => {
    // Живой прогон на снимке `014`: модель назвала фон `grey` — изнанка другого
    // знака на том же столбе. Строгость стоила бы верно прочитанного знака целиком.
    const doc = read("009-besokande-avgift");
    doc.panels[0].background_color = "grey";
    doc.main_sign.background_color = "серо-буро-малиновый";

    const res = validateSign(doc);
    expect(ok(res), res.schemaErrors.join("; ")).toBe(true);
    expect(res.data!.main_sign.background_color).toBe("other");
    expect(res.data!.panels![0].background_color).toBe("other");
    // Правка записывается дословно: эти строки сверяются с питоновскими.
    expect(res.repairs).toEqual([
      "цвет знака 'серо-буро-малиновый' -> 'other' — нет в перечислении схемы",
      "панель 1: цвет 'grey' -> 'other' — нет в перечислении схемы",
    ]);
  });

  it("пропущенный цвет не чинится: это не оттенок, а отсутствие ответа", () => {
    // Граница починки. Без этой проверки «чиним цвет» однажды станет
    // «дописываем поле, которого модель не дала».
    const doc = read("009-besokande-avgift");
    delete doc.panels[0].background_color;

    const res = validateSign(doc);
    expect(ok(res), "обязательное поле пропало — это видно").toBe(false);
    expect(res.repairs.some((r) => r.includes("цвет"))).toBe(false);
  });
});

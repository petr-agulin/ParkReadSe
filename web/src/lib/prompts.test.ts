// Что промпт обязан объяснить. Перенесено из `tests/test_prompts.py` (шаг 8).
//
// Промпт — не гарантия, а просьба, и проверить его по-настоящему может только
// прогон. Но одно проверяется без модели: **названо ли в нём то, из чего модели
// предлагают выбирать**. Скелет схемы перечисляет допустимые значения — этого
// хватает, чтобы ответ прошёл валидацию, но не хватает, чтобы выбрать верное.
//
// Так и вышло с `main_sign.type`: значения были в скелете, а РАЗНИЦЫ между ними
// не объяснял никто, и на снимках `037` и `050` указатель к чужой стоянке был
// прочитан как разрешение стоять у столба — самое дорогое расхождение замера.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fingerprint } from "./measure";
import { triagePrompt } from "./prompts";
import { EXTRACT_INSTRUCTIONS } from "./prompts.data";
import { SIGN_SCHEMA } from "./schema.data";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const T = EXTRACT_INSTRUCTIONS;

describe("что промпт обязан объяснить", () => {
  // py: test_prompts::test_every_kind_of_main_sign_is_explained_not_just_listed
  it("каждый вид основного знака объяснён словами, а не только перечислен", () => {
    // Выбор между ними решает, идёт ли речь о стоянке ЗДЕСЬ.
    const schema = SIGN_SCHEMA as Record<string, any>;
    const values: string[] = schema.properties.main_sign.properties.type.enum;
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !T.includes(v))).toEqual([]);
  });

  // py: test_prompts::test_the_two_prohibition_signs_are_told_apart_by_something_countable
  it("два запрещающих знака различаются тем, что можно сосчитать", () => {
    // `C35` и `C39` — один и тот же круглый знак, отличаются числом полос.
    expect(T).toContain("ONE diagonal bar");
    expect(T).toContain("TWO bars");
  });

  // py: test_prompts::test_brackets_and_red_ink_are_told_apart_by_the_days_they_mean
  it("скобки и красные чернила различаются днями, которые они значат", () => {
    // Снимок `030`: разбор сказал `red` там, где на плате скобки, и продукт объявил
    // плату по воскресеньям вместо суббот. Сломала это правка промпта: описание
    // круглых знаков добавило слово `red` туда, где «красные цифры значат red».
    expect(T).toContain("SATURDAYS");
    expect(T).toContain("SUNDAYS");
    expect(T).toContain("Brackets are never about Sundays");
    // Описание круглых знаков — от `"prohibition_parking"` до «Count the bars.».
    // Питон-версия этого теста проверяла ПУСТУЮ строку: она резала от круглых знаков
    // до указателей, а указатели в промпте стоят раньше, и срез выходил пустым.
    // Отсюда граница, найденная по тексту, и проверка, что срез не пуст.
    const from = T.indexOf('"prohibition_parking"');
    const end = T.indexOf("Count the bars.", from);
    expect(from >= 0 && end > from, "описание круглых знаков не найдено").toBe(true);
    const round = T.slice(from, end + "Count the bars.".length);
    expect(round).toContain("TWO bars");
    expect(round.toLowerCase()).not.toContain("red");
  });

  // py: test_prompts::test_fields_that_changed_the_answer_are_explained_by_name
  it("поля, которые однажды поменяли ответ, объяснены по именам", () => {
    // `042` — `vehicle_class` подменён ближайшим значением; `010` — `permit_required`
    // потерян рядом с `eligibility`; `054` — `prohibition` подменён на `scope_shift`.
    const fields = ["vehicle_class", "permit_required", "prohibition",
                    "scope_shift", "eligibility"];
    expect(fields.filter((f) => !T.includes(f))).toEqual([]);
  });

  // py: test_prompts::test_the_prompt_names_the_fields_it_forbids_guessing_into
  it("там, где перечисление кончается, сказано, что отвечать", () => {
    // Иначе модель подставит ближайшее, и отличить подстановку от прочтения нечем.
    expect(T).toContain("bicycle");
    expect(T).toContain('"other" in "pictogram"');
  });

  // py: test_prompts::test_scope_shift_may_not_be_inferred_from_position
  it("`scope_shift` ставится по написанному, а не по месту таблички в стопке", () => {
    // Снимок `044`: табличка `Boende` получила `remaining_time`, и продукт сообщил
    // «Applies outside the hours above» там, где на табличке нет ни одного часа.
    expect(T).toContain("ONLY when the plate says so IN WRITING");
    expect(T).toContain("Never infer it from where the plate sits in the stack");
  });
});

describe("промпт отсева", () => {
  // py: test_prompts::test_the_triage_prompt_was_not_disturbed
  it("не тронут: все сохранённые ответы отсева получены этим же вопросом", async () => {
    // Правка промпта извлечения не должна стоить ответов отсева, а стоила бы,
    // будь промпты общими: сменился бы отпечаток, и все ответы пришлось бы
    // получать заново. Здесь же ловится и промах при переносе текста промпта.
    const mark = await fingerprint(triagePrompt());
    const saved = new Set(
      readdirSync(`${ROOT}demo`)
        .filter((f) => f.endsWith(".triage.json"))
        .map((f) => JSON.parse(readFileSync(`${ROOT}demo/${f}`, "utf-8")))
        .filter((d) => (d.origin ?? "model") === "model")
        .map((d) => d.prompt_fingerprint ?? "нет отпечатка"));
    expect([...saved]).toEqual([mark]);
  });
});

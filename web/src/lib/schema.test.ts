// Своя проверка схемы — против независимого судьи.
//
// В браузере схему проверяет свой код (решение 124): тащить в страницу библиотеку
// ради одной проверки дороже, чем написать её. Но проверка, которая сверяется
// сама с собой, ничего не стережёт — поэтому рядом стоит `ajv`, настоящий
// валидатор JSON Schema, и обе стороны судят одни и те же нарочно поломанные
// разборы. Расходятся — виновата своя проверка, и это видно здесь, а не у человека
// у знака.
//
// `ajv` живёт ТОЛЬКО в тестах (решение 138). Что он не попал в страницу, стережёт
// `npm run test:build`.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { valid } from "./schema";
import { SIGN_SCHEMA } from "./schema.data";
import { MUTATIONS, applyMutation, documents } from "../../tools/goldens";

// У `ajv` экспорт по-разному приезжает в ESM и CJS — берём то, что пришло.
const Ctor: any = (Ajv2020 as any).default ?? Ajv2020;
// `strict: false`: схема писана для людей и несёт описания, о которых `ajv`
// не спрашивали. Судить он должен правила, а не оформление.
const judge = new Ctor({ allErrors: true, strict: false }).compile(SIGN_SCHEMA);

describe("проверка схемы против независимого судьи", () => {
  // py: test_parity::test_the_schema_check_has_something_to_be_checked_against
  it("на каждом рецепте поломки вердикт тот же, что у `ajv`", () => {
    const docs = documents();
    const names = Object.keys(docs).sort().slice(0, 20);
    expect(names.length, "сверять не на чем").toBeGreaterThanOrEqual(10);

    let broken = 0;
    for (const name of names) {
      for (const mutation of MUTATIONS) {
        const doc = applyMutation(docs[name], mutation);
        const mine = valid(doc, SIGN_SCHEMA);
        expect(mine, `${name}::${mutation.label}`).toBe(judge(doc) as boolean);
        if (!mine) broken += 1;
      }
    }

    // Проверка проверки: рецепты обязаны ЛОМАТЬ документ. Не ломали бы — сверка
    // сравнивала бы две единицы и всегда была зелёной.
    expect(broken, "ни один рецепт ничего не сломал").toBeGreaterThanOrEqual(8 * names.length);
  });

  it("целый разбор проходит у обоих", () => {
    const docs = documents();
    const one = docs[Object.keys(docs).sort()[0]];
    expect(valid(one, SIGN_SCHEMA)).toBe(true);
    expect(judge(one)).toBe(true);
  });
});

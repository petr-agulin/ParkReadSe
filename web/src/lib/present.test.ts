// Слой, который ГОВОРИТ С ЧЕЛОВЕКОМ. Ошибка здесь не роняет прогон — она меняет
// смысл фразы, и заметить это можно только чтением. Сверка сравнивает готовый текст
// целиком; здесь проверяется то, что сверка доказать не может: что продукт
// не начал разрешать, приказывать и обещать.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { applyAsymmetry, grade } from "./completeness";
import { evaluateParkingRules } from "./engine";
import { CLOCK_CHANGE_TEXT, PERIOD_HEADLINE, REASON_TEXT, STATE_TEXT,
         UNCERTAINTY_TEXT, toJson } from "./present";
import { recognise } from "./reference";
import type { SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();

function answers(): string {
  // Весь набор разом: запрещённая формулировка может выйти на одном знаке
  // из полусотни, и проверять один удобный снимок — значит не проверять.
  const cases = JSON.parse(readFileSync(`${ROOT}parity/cases.json`, "utf-8"));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cases as { doc: string; moment: string }[]) {
    const id = `${c.doc}@${c.moment}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [where, stem] = c.doc.split("/");
    const path = where === "demo" ? `${ROOT}demo/${stem}.extract.json`
                                  : `${ROOT}testset/expected/${stem}.json`;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    const doc: SignDoc = where === "demo" ? raw.response : raw;
    const moment = parseNaive(c.moment);
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev });
    out.push(JSON.stringify(toJson({
      doc, recognised: recognise(doc), assessment: a,
      evaluation: applyAsymmetry(ev, a),
    }, moment, cal)));
  }
  return out.join("\n").toLowerCase();
}

describe("словарь формулировок", () => {
  // Словарь из `PROJECT_BRIEF.md`: продукт говорит О ЗНАКЕ и не разрешает,
  // не приказывает и не обещает от своего лица. Проверка переехала вместе
  // со словами: оставь её в питоне — и после его вывода продукт лишится
  // ровно той страховки, ради которой формулировки живут в одном месте.
  const FORBIDDEN = ["parking allowed", "you may park", "you can park here",
                     "you need to move the car", "you must", "it is safe to",
                     "we recommend"];

  it("ответ ни на одном знаке набора не разрешает и не приказывает", () => {
    const text = answers();
    for (const bad of FORBIDDEN) expect(text, bad).not.toContain(bad);
  });

  it("готовые подписи тоже держатся словаря", () => {
    const tables = [STATE_TEXT, PERIOD_HEADLINE, REASON_TEXT, UNCERTAINTY_TEXT,
                    CLOCK_CHANGE_TEXT];
    for (const table of tables) {
      for (const [key, text] of Object.entries(table)) {
        for (const bad of FORBIDDEN) {
          expect(text.toLowerCase(), `${key}: ${bad}`).not.toContain(bad);
        }
      }
    }
  });

  it("«Free parking» — единственное исключение, и только без условий", () => {
    // Словарь эту формулировку запрещает: она обещает бесплатность там, где может
    // требоваться диск или билет. Разрешена ровно там, где условий нет вовсе.
    expect(PERIOD_HEADLINE.free).toBe("Free parking");
    expect(PERIOD_HEADLINE.free_with_conditions).toBe("No fee stated for this period");
  });

  it("каждое состояние отрезка названо словами о знаке", () => {
    for (const text of Object.values(STATE_TEXT)) {
      expect(text.toLowerCase()).toContain("the sign");
    }
  });
});

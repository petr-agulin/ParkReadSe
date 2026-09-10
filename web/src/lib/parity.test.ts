import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar, holidays } from "./calendar";
import { addDays, addMinutes, isoNaive, parseNaive } from "./civil";
import { add, autumnBack, offset, realMinutes, springForward, switchBetween } from "./clock";
import { differences, report } from "./parity";

// Эталоны лежат вне `web/`: их пишет питон, а не сборка фронтенда.
const DIR = fileURLToPath(new URL("../../../parity/", import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${DIR}${name}.json`, "utf-8"));

const LAYERS = ["calendar", "clock", "engine", "completeness", "present"];

type Golden = Record<string, any>;
type Probe = (golden: Golden) => Record<string, unknown>;

// Половина порта на TypeScript. Пока слоя здесь нет, сверять нечего — но молчать
// об этом нельзя: непортированный слой должен быть НАЗВАН, а не забыт.
//
// Задача пробы — повторить ту же работу, что сделал питон, на тех же входных
// данных. Входные данные берутся из самого эталона (годы, моменты, случаи):
// иначе стороны считали бы разные задачи и сходились бы по случайности.
const PROBES: Record<string, Probe | undefined> = {
  calendar: (golden) => {
    const cal = new Calendar();
    const out: Record<string, unknown> = {};
    for (const year of Object.keys(golden)) {
      const y = Number(year);
      let classes = "";
      for (let d = { y, m: 1, d: 1 }; d.y === y; d = addDays(d, 1)) {
        classes += cal.dayClass(d)[0];              // w | e | r
      }
      out[year] = { classes, holidays: Object.fromEntries([...holidays(y)].sort()) };
    }
    return out;
  },

  clock: (golden) => ({
    switches: Object.fromEntries(Object.keys(golden.switches).map((year) => [year, {
      forward: isoNaive(springForward(Number(year))),
      back: isoNaive(autumnBack(Number(year))),
    }])),
    moments: (golden.moments as Golden[]).map((m) => {
      const t = parseNaive(m.moment);
      return {
        moment: m.moment,
        offset: offset(t),
        plus_2h: isoNaive(add(t, 120)),
        plus_24h: isoNaive(add(t, 1440)),
        minutes_to_next_day: realMinutes(t, addMinutes(t, 1440)),
        switch_within_8_days: switchBetween(t, addMinutes(t, 8 * 1440)),
      };
    }),
  }),
};

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

  it("портированный слой сходится с питоном, непортированный назван вслух", () => {
    const ported: string[] = read("PORTED").layers;
    const pending = LAYERS.filter((l) => !ported.includes(l));
    // Не украшение: строка в выводе — единственное, что не даёт забыть,
    // что половина ответа ещё нигде не проверяется.
    if (pending.length) console.log(`двойной прогон: ждут порта — ${pending.join(", ")}`);

    for (const layer of ported) {
      const probe = PROBES[layer];
      // Слой объявлен портированным, а считать его нечем — это ошибка списка.
      expect(probe, `слой ${layer} объявлен портированным, но пробы нет`).toBeTruthy();
      const golden = read(layer);
      const lines = report(layer, golden, probe!(golden));
      expect(lines, lines.join("\n")).toEqual([]);
    }
  });
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

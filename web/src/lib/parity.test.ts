import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar, holidays } from "./calendar";
import { addDays, addMinutes, isoNaive, parseNaive } from "./civil";
import { add, autumnBack, offset, realMinutes, springForward, switchBetween } from "./clock";
import { grade } from "./completeness";
import { applyAsymmetry } from "./completeness";
import { toJson } from "./present";
import { recognise } from "./reference";
import { SIGN_SCHEMA } from "./schema.data";
import { valid } from "./schema";
import { evaluateParkingRules, type Period, type Regime } from "./engine";
import { differences, report } from "./parity";
import type { SignDoc } from "./sign";

// Эталоны лежат вне `web/`: их пишет питон, а не сборка фронтенда.
const DIR = fileURLToPath(new URL("../../../parity/", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${DIR}${name}.json`, "utf-8"));

type Case = { id: string; doc: string; moment: string };

const round6 = (v: number) => Number(v.toFixed(6));

// Рецепты поломок — те же, что у питона (`parkread/parity.py`). Применяются
// к копии разбора: сравнивать надо проверку схемы, а не умение ломать.
type Mutation = { label: string; op: string; path: string[]; value?: unknown };

const MUTATIONS: Mutation[] = [
  { label: "как есть", op: "keep", path: [] },
  { label: "нет main_sign", op: "delete", path: ["main_sign"] },
  { label: "тип знака вне перечисления", op: "set",
    path: ["main_sign", "type"], value: "не-такого-знака" },
  { label: "panel_count строкой", op: "set", path: ["panel_count"], value: "три" },
  { label: "лишнее поле в корне", op: "set", path: ["новое_поле"], value: 1 },
  { label: "отрицательный panel_count", op: "set", path: ["panel_count"], value: -1 },
  { label: "другая версия схемы", op: "set", path: ["schema_version"], value: 2 },
  { label: "у панели нет kind", op: "delete", path: ["panels", "0", "kind"] },
  { label: "время не по образцу", op: "set",
    path: ["panels", "0", "parsed", "time_windows"],
    value: [{ from: "восемь", to: "18:00" }] },
  { label: "лишнее поле в панели", op: "set",
    path: ["panels", "0", "странное"], value: true },
];

function applyMutation(doc: unknown, mutation: Mutation): unknown {
  const out = JSON.parse(JSON.stringify(doc));
  if (mutation.op === "keep") return out;
  let node: any = out;
  const path = mutation.path;
  for (const part of path.slice(0, -1)) {
    node = Array.isArray(node) ? node[Number(part)] : node[part];
    if (node === undefined || node === null) return out;
  }
  const last = path[path.length - 1];
  const key: any = Array.isArray(node) ? Number(last) : last;
  if (mutation.op === "delete") {
    if (Array.isArray(node)) node.splice(key, 1);
    else delete node[key];
  } else {
    node[key] = mutation.value;
  }
  return out;
}

/** Разборы, на которых идёт сверка: те же файлы, что читает питон. */
function documents(): Record<string, SignDoc> {
  const out: Record<string, SignDoc> = {};
  for (const c of read("cases") as Case[]) {
    if (out[c.doc]) continue;
    const [where, stem] = c.doc.split("/");
    const path = where === "demo"
      ? `${ROOT}demo/${stem}.extract.json`
      : `${ROOT}testset/expected/${stem}.json`;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    out[c.doc] = where === "demo" ? raw.response : raw;
  }
  return out;
}

const LAYERS = ["calendar", "clock", "engine", "reference", "completeness", "present",
                "schema"];

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

  engine: () => {
    const cal = new Calendar();
    const docs = documents();
    const out: Record<string, unknown> = {};
    for (const c of read("cases") as Case[]) {
      const ev = evaluateParkingRules(docs[c.doc], parseNaive(c.moment), cal);
      out[c.id] = {
        permits_parking: ev.permitsParking,
        uncertainties: ev.uncertainties,
        note: ev.note,
        regimes: ev.regimes.map((r: Regime) => ({
          extent: r.extent,
          audience: r.audience,
          audience_excluded: r.audienceExcluded,
          eligibility: r.eligibility,
          place_notes: r.placeNotes,
          duration_expires_at: r.durationExpiresAt ? isoNaive(r.durationExpiresAt) : null,
          duration_source: r.durationSource,
          periods: r.periods.map((p: Period) => ({
            start: isoNaive(p.start),
            end: isoNaive(p.end),
            state: p.state,
            conditions: p.conditions,
            max_duration_minutes: p.maxDurationMinutes,
            note: p.note,
          })),
        })),
      };
    }
    return out;
  },

  present: () => {
    const cal = new Calendar();
    const docs = documents();
    const out: Record<string, unknown> = {};
    for (const c of read("cases") as Case[]) {
      const doc = docs[c.doc];
      const moment = parseNaive(c.moment);
      const ev = evaluateParkingRules(doc, moment, cal);
      const a = grade(doc, { evaluation: ev });
      out[c.id] = toJson({
        doc,
        recognised: recognise(doc),
        assessment: a,
        evaluation: applyAsymmetry(ev, a),
      }, moment, cal);
    }
    return out;
  },

  // Мутационная проверка схемы: рецепты поломок приезжают в эталоне, обе стороны
  // применяют их к одному разбору, и сравнивается ВЕРДИКТ — годен или нет
  // (решение 124). Тексты ошибок разные и сравнению не подлежат: на экран
  // они не выходят.
  schema: (golden) => {
    const docs = documents();
    const out: Record<string, unknown> = {};
    for (const id of Object.keys(golden)) {
      const [name, label] = id.split("::");
      const mutation = MUTATIONS.find((m) => m.label === label);
      if (!mutation) throw new Error(`рецепт «${label}» не найден`);
      out[id] = valid(applyMutation(docs[name], mutation), SIGN_SCHEMA);
    }
    return out;
  },

  reference: () => {
    const docs = documents();
    const out: Record<string, unknown> = {};
    for (const name of Object.keys(docs).sort()) {
      const rec = recognise(docs[name]);
      // Ключи объектов питон кладёт строками и по возрастанию индекса.
      const byIndex = (o: Record<number, string[]>) => Object.fromEntries(
        Object.entries(o).sort((a, b) => Number(a[0]) - Number(b[0])));
      out[name] = {
        main_sign_key: rec.mainSignKey,
        panel_keys: byIndex(rec.panelKeys),
        uninterpreted: byIndex(rec.uninterpreted),
        missing_keys: rec.missingKeys,
      };
    }
    return out;
  },

  completeness: () => {
    const cal = new Calendar();
    const docs = documents();
    const out: Record<string, unknown> = {};
    for (const c of read("cases") as Case[]) {
      const doc = docs[c.doc];
      const ev = evaluateParkingRules(doc, parseNaive(c.moment), cal);
      const a = grade(doc, { evaluation: ev });
      out[c.id] = {
        category: a.category,
        confidence: round6(a.confidence),
        // Питон кладёт сигналы округлёнными до шести знаков и по алфавиту.
        // Доля прочитанных панелей — это 2/3, и без округления стороны
        // расходятся на пятнадцатом знаке, ничего при этом не означающем.
        signals: Object.fromEntries(
          Object.entries(a.signals).sort().map(([k, v]) => [k, round6(v)])),
        reasons: a.reasons,
        unread_panels: a.unreadPanels,
        may_hide_prohibition: a.mayHideProhibition,
        uninterpreted_plates: a.uninterpretedPlates,
      };
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

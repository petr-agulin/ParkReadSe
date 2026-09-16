// Эталоны и машинерия сверки. Перенесено из `tests/test_parity.py` (шаг 8).
//
// Эти проверки стерегут не правила, а САМ МЕХАНИЗМ: что в эталоны не попало ничего
// лишнего, что типы выведены из схемы, что время не берётся у машины и что замер
// остаётся инструментом, а не частью продукта. Правила стерегут тесты рядом.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CONTRACT } from "../src/lib/present";
import { LAYERS, PROBES, SPECIAL, buildCases, pyDump, stale } from "./goldens";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");
const readJson = (p: string) => JSON.parse(read(p));
const stem = (f: string) => f.replace(/\.[^.]+$/, "");

/** Все файлы `web/src`, которые уходят в приложение. */
function appSources(dir = join(ROOT, "web", "src")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return appSources(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Все тестовые файлы фронтенда: и в приложении, и в инструментах. */
function testFiles(dir = join(ROOT, "web")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(full).isDirectory()) return testFiles(full);
    return name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("состав эталонов", () => {
  // py: test_parity::test_every_document_of_the_set_is_a_case
  it("каждый разбор набора — случай сверки", () => {
    // Сверка идёт по всему набору, а не по паре удобных снимков: у модели бывают
    // склейки панелей и странные поля, каких в аккуратном эталоне не бывает.
    const docs = [
      ...readdirSync(join(ROOT, "demo")).filter((f) => f.endsWith(".extract.json"))
        .map((f) => `demo/${f.slice(0, -".extract.json".length)}`),
      ...readdirSync(join(ROOT, "testset", "expected")).filter((f) => f.endsWith(".json"))
        .map((f) => `expected/${stem(f)}`),
    ];
    expect(docs.length).toBeGreaterThan(100);
    expect(docs.some((d) => d.startsWith("demo/"))).toBe(true);
    expect(docs.some((d) => d.startsWith("expected/"))).toBe(true);
    const ids = new Set(readJson("parity/cases.json").map((c: any) => c.id));
    expect(docs.filter((d) => !ids.has(`${d}@base`))).toEqual([]);
  });

  // py: test_parity::test_the_engine_golden_holds_the_answer_not_the_innards
  it("эталон движка держит ответ, а не внутренности", () => {
    // Иначе сверка ломалась бы на каждой перестановке кода, ничего не говоря о смысле.
    const golden = readJson("parity/engine.json");
    const one = golden["demo/005-2tim-8-18-parentes-8-15-dubbelpil@base"];
    expect(Object.keys(one).sort())
      .toEqual(["note", "permits_parking", "regimes", "uncertainties"]);
    const regime = one.regimes[0];
    expect(Object.keys(regime).sort()).toEqual([
      "audience", "audience_excluded", "duration_expires_at", "duration_source",
      "eligibility", "extent", "periods", "place_notes"]);
    expect(Object.keys(regime.periods[0]).sort()).toEqual([
      "conditions", "end", "max_duration_minutes", "note", "start", "state"]);
  });

  // py: test_parity::test_the_present_golden_is_the_finished_answer
  it("эталон показа — готовый ответ", () => {
    // Слова — работа показа, и разойтись они могут молча.
    const golden = readJson("parity/present.json");
    const one = golden["expected/049-moped-sasong-avgift-tva-taxor@season-edge"];
    expect(one.contract).toBe(CONTRACT);
    expect(one.regimes.some((w: any) => w.audience_short)).toBe(true);
    expect(one.regimes.some((w: any) => w.periods.some((p: any) => p.headline))).toBe(true);
  });

  // py: test_parity::test_no_photograph_ever_reaches_the_reference_answers
  it("ни одна фотография в эталоны не попадает", () => {
    // Снимки с номерами машин в репозиторий не идут (`AGENTS.md`, §14),
    // и этот путь для них тоже закрыт.
    const dir = join(ROOT, "parity");
    for (const name of readdirSync(dir).sort()) {
      expect([".json", ".txt"], name).toContain(extname(name));
      const text = readFileSync(join(dir, name), "utf-8");
      for (const bad of ["data:image", "base64", ".jpg", ".png"]) {
        expect(text.includes(bad), `${name}: ${bad}`).toBe(false);
      }
    }
  });

  // py: test_parity::test_the_stale_answers_are_named_and_not_counted
  it("устаревшие ответы названы вслух и не посчитаны", () => {
    // Молчаливый пропуск выглядел бы как «такого снимка нет», а снимок есть.
    const golden = readJson("parity/measure.json");
    expect(golden.excluded.length, "на наборе есть устаревшие ответы").toBeGreaterThan(0);
    expect(golden.photos + golden.excluded.length).toBeGreaterThanOrEqual(57);
    expect(golden.fingerprint).toHaveLength(12);
  });

  // py: test_parity::test_the_threshold_table_is_the_one_the_threshold_stands_on
  it("таблица порога — та, на которой порог и стоит", () => {
    // Поля расходятся у девятнадцати снимков, ответ — у трёх; порог стоит на втором.
    const golden = readJson("parity/measure.json");
    expect(golden.threshold_table).toContain("| 0.900 |");
    // Разошедшиеся ответы лежат словарём «снимок → чем разошёлся».
    const diverged = Object.keys(golden.diverged).length;
    expect(diverged, "расхождений ответа мало — так и должно быть").toBeLessThan(10);
    const fieldsOff = Object.values(golden.fields as Record<string, [number, number]>)
      .filter(([hits, total]) => hits < total).length;
    expect(fieldsOff, "поля обязаны расходиться чаще ответа").toBeGreaterThan(diverged);
  });
});

describe("что осталось верным на этой стороне", () => {
  // py: test_parity::test_the_types_match_the_schema
  it("типы разбора выведены из схемы, а не угаданы", () => {
    // Второй экземпляр схемы, написанный по памяти, однажды разойдётся с первым,
    // и первым пострадает поле, которое модель вернула, а браузер не прочёл.
    const schema = readJson("schema/sign.schema.json");
    const types = read("web/src/lib/sign.ts");
    for (const field of Object.keys(schema.$defs.parsed.properties)) {
      expect(types, `поля ${field} нет в типах`).toContain(field);
    }
    for (const field of Object.keys(schema.$defs.panel.properties)) {
      expect(types, `поля панели ${field} нет в типах`).toContain(field);
    }
    for (const field of ["vehicle_class", "eligibility", "arrow", "scope_shift",
                         "payment_method", "placement"]) {
      for (const value of schema.$defs.parsed.properties[field].enum ?? []) {
        expect(types, `${field}: ${value} не назван в типах`).toContain(`"${value}"`);
      }
    }
    for (const value of schema.properties.main_sign.properties.type.enum) {
      expect(types, `тип знака ${value} не назван`).toContain(`"${value}"`);
    }
  });

  // py: test_parity::test_the_ported_engine_touches_no_clock_of_its_own
  it("движок не заводит собственных часов", () => {
    // `Date` — про мгновение, а знак — про календарь: вместе с `Date` в расчёт
    // вошли бы часовой пояс машины, летнее время и месяцы с нуля (риск 5 порта).
    for (const name of ["engine.ts", "calendar.ts", "clock.ts", "civil.ts"]) {
      const source = read(`web/src/lib/${name}`);
      for (const bad of ["new Date", "Date.now", "toLocale", "getTimezoneOffset",
                         "Intl.", "zoneinfo", "tzdata"]) {
        expect(source, `${name}: ${bad}`).not.toContain(bad);
      }
    }
  });

  // py: test_parity::test_the_rulings_moved_with_the_engine
  it("разборы разработчика переехали вместе с движком", () => {
    // Тесты движка говорят, ПОЧЕМУ ответ такой: за каждым стоит решение
    // разработчика или находка на живом снимке.
    const ported = read("web/src/lib/engine.test.ts");
    for (const mark of ["решение 82", "решение 113", "решение 118", "решение 120",
                        "решение 121", "`005`", "`033`", "`038`", "`049`",
                        "знак Б", "Frihamnen"]) {
      expect(ported, mark).toContain(mark);
    }
  });

  // py: test_parity::test_the_forbidden_wording_guard_moved_with_the_words
  it("словарь формулировок сторожит тест на той же стороне, где живут слова", () => {
    // Оставить его только в питоне значит потерять страховку в день, когда питон
    // уйдёт, — а формулировки ради этой страховки и держат в одном месте.
    const guard = read("web/src/lib/present.test.ts");
    for (const bad of ["parking allowed", "you may park", "you can park here"]) {
      expect(guard, bad).toContain(bad);
    }
    expect(guard, "проверяется весь набор, а не один снимок").toContain("parity/cases.json");
  });
});

describe("замер остаётся инструментом", () => {
  // py: test_parity::test_the_measurement_is_a_tool_and_not_part_of_the_product
  it("в страницу замер не попадает", () => {
    for (const path of appSources()) {
      const text = readFileSync(path, "utf-8");
      if (path.endsWith("measure.ts")) continue;
      expect(text, path).not.toContain('from "./measure"');
      expect(text, path).not.toContain('from "../lib/measure"');
    }
    const scripts = readJson("web/package.json").scripts;
    expect(scripts, "нет команды npm run measure").toHaveProperty("measure");
    expect(scripts.measure).toContain("--dir measure");
    expect(scripts.test, "замер попадёт в обычный прогон").toContain("--exclude");
  });

  // py: test_parity::test_the_measurement_reads_the_same_set_from_disk
  it("замер читает с диска тот же набор", () => {
    // Эталоны разработчика, ответы модели и снимки: площадь кадра входит в уверенность.
    const set = read("web/tools/testset.ts");
    for (const path of ["testset", "expected", "demo", "photos"]) {
      expect(set, path).toContain(path);
    }
    const report = read("web/measure/report.test.ts");
    expect(report).toContain("../src/lib/measure");
    expect(report).toContain("../tools/testset");
  });
});

describe("эталоны пишет TypeScript", () => {
  // py: test_parity::test_the_golden_answers_are_current
  it("переписанные этой командой, они совпадают с лежащими — до байта", async () => {
    // Упало — значит, ответ продукта изменился. Это не поломка теста, это его
    // работа: посмотреть расхождение (`npm test -- parity`) и переписать
    // сознательно (`npm run goldens:write`).
    expect(await stale()).toEqual([]);
  }, 120_000);

  // py: test_parity::test_the_case_file_is_read_by_both_sides
  it("случаи объявлены файлом, а не собираются на лету каждым по-своему", () => {
    expect(readJson("parity/cases.json")).toEqual(buildCases());
    // Тот же файл читает и сверка — иначе стороны проверялись бы на разных задачах.
    expect(read("web/src/lib/parity.test.ts")).toContain('read("cases")');
  });

  // py: test_parity::test_the_awkward_moments_are_all_covered
  it("особые моменты покрыты все и у каждого названа причина", () => {
    // На каждом из них уже ломалось что-нибудь живое: канун, красный день,
    // обе ночи перевода, край сезона, полночь.
    expect(SPECIAL.map((s) => s.label).sort()).toEqual(
      ["dst-back", "dst-forward", "eve", "midnight", "red", "season-edge"]);
    const ids = buildCases().map((c) => c.id);
    for (const { label } of SPECIAL) {
      expect(ids.some((i) => i.endsWith(`@${label}`)), label).toBe(true);
    }
    // Без причины список превращается в набор чисел.
    expect(SPECIAL.filter((s) => !s.why)).toEqual([]);
  });

  // py: test_parity::test_the_layers_are_declared_and_none_is_ported_yet
  it("слои объявлены, и у каждого есть проба", () => {
    const ported: string[] = readJson("parity/PORTED.json").layers;
    expect(ported.filter((l) => !LAYERS.includes(l)), "неизвестный слой").toEqual([]);
    expect(LAYERS.filter((l) => !PROBES[l]), "слой без пробы").toEqual([]);
  });

  // py: test_parity::test_rewriting_is_a_separate_command
  it("переписывание — отдельная команда, а не побочный эффект прогона", () => {
    // Иначе эталоны однажды перезапишут, чтобы «стало зелено», и вместе
    // с красным исчезнет расхождение.
    const scripts = readJson("web/package.json").scripts;
    expect(scripts.goldens, "нет команды проверки").toBeTruthy();
    expect(scripts.goldens).not.toContain("--write");
    expect(scripts["goldens:write"]).toContain("--write");

    // Ни один тест не переписывает эталоны сам. Этот файл из проверки исключён:
    // он же эту строку и называет — иначе тест ловил бы сам себя.
    for (const file of testFiles()) {
      if (file.endsWith("goldens.test.ts")) continue;
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("goldens:write");
      const imported = text.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*goldens["']/);
      if (imported) expect(imported[1], file).not.toMatch(/\bwrite\b/);
    }
  });

  it("числа пишутся по-питоновски: дробное остаётся дробным", () => {
    // Питон отличает `1.0` от `1`, а `JSON.stringify` — нет. В эталонах таких
    // чисел три с половиной тысячи, и без этого правила первое же переписывание
    // переставило бы их все.
    const text = pyDump({ confidence: 1, signals: { a: 0, b: 0.5 },
                          rows: [[1, "x", false, "y"]], panels: 2 });
    expect(text).toContain('"confidence": 1.0');
    expect(text).toContain('"a": 0.0');
    expect(text).toContain('"b": 0.5');
    expect(text, "целое обязано остаться целым").toContain('"panels": 2');
    expect(text.split("\n").some((l) => l.trim() === "1.0,"),
           "первый столбец строки замера — дробный").toBe(true);
    expect(text.endsWith("\n")).toBe(true);
  });
});

// Эталоны двойного прогона: считает и переписывает их TypeScript (шаг 8, этап 5).
//
// Раньше эталоны считал питон (`cli.py parity --write`), а браузер только сверялся
// с ними. Питон уходит — и команда переезжает сюда. Первое переписывание обязано
// не изменить НИ ОДНОГО БАЙТА: это и есть доказательство, что при переезде ответ
// продукта остался прежним (требование 6 шага 8). Стережёт это `goldens.test.ts`.
//
//     npm run goldens            — свежи ли эталоны
//     npm run goldens:write      — переписать
//
// Переписывание — ОТДЕЛЬНАЯ команда, а не побочный эффект прогона: изменился ответ
// продукта — это видно строкой в `git diff`, а не угадывается. Иначе эталоны однажды
// перезапишут, чтобы «стало зелено», и вместе с красным исчезнет расхождение.
//
// **Снимков здесь нет и быть не должно** — только разборы (`AGENTS.md`, §14).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Calendar, SELECTABLE_FROM, SELECTABLE_TO, holidays } from "../src/lib/calendar";
import { addDays, addMinutes, isoNaive, parseNaive } from "../src/lib/civil";
import { add, autumnBack, offset, realMinutes, springForward,
         switchBetween } from "../src/lib/clock";
import { applyAsymmetry, grade } from "../src/lib/completeness";
import { evaluateParkingRules, type Period, type Regime } from "../src/lib/engine";
import { compare, emptyReport, fingerprint, thresholdTable, verdictDifferences,
         verdictSlice, type ThresholdRow } from "../src/lib/measure";
import { pixels } from "../src/lib/photo";
import { toJson } from "../src/lib/present";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { recognise } from "../src/lib/reference";
import { valid } from "../src/lib/schema";
import { SIGN_SCHEMA } from "../src/lib/schema.data";
import type { SignDoc } from "../src/lib/sign";
import { ok as resultOk, sign as validateSign } from "../src/lib/validation";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DIR = `${ROOT}parity/`;

/** Слои порта, снизу вверх. Порядок здесь — тот же, в котором они переезжали. */
export const LAYERS = ["calendar", "clock", "engine", "reference", "completeness",
                       "present", "schema", "validation", "prompts", "measure"];

// Общий момент — тот же понедельник, на котором стоит замер: обычный будний день
// вне праздников, где ничто не наложилось на ничто.
export const BASE_MOMENT = "2026-03-02T00:00";

// Особые моменты. Каждый выбран потому, что на нём уже ломалось что-нибудь живое,
// и каждый назван — иначе список превращается в набор чисел без причины.
export const SPECIAL = [
  { label: "eve", moment: "2026-10-30T14:00",
    why: "канун Alla helgons dag: действуют часы в скобках" },
  { label: "red", moment: "2026-12-25T10:00",
    why: "Juldagen: красный день, и следующий тоже красный" },
  { label: "dst-back", moment: "2026-10-24T20:00",
    why: "ночь перевода назад: сутки длятся 25 часов" },
  { label: "dst-forward", moment: "2027-03-27T20:00",
    why: "ночь перевода вперёд: сутки длятся 23 часа" },
  { label: "season-edge", moment: "2026-09-30T23:30",
    why: "последние полчаса сезона 1/4-30/9" },
  { label: "midnight", moment: "2026-06-10T00:00",
    why: "полночь: край суток, на котором резались отрезки" },
];

// Снимки, на которых особые моменты что-то меняют. Весь набор на каждый момент
// гонять незачем: эталон разбухнет, а нового не скажет.
export const SPECIAL_DOCS = [
  "005-2tim-8-18-parentes-8-15-dubbelpil",      // окна будней и канунов
  "019-forbud-7-18-avgift-ovrig-tid",           // запрет с окном и «övrig tid»
  "026-zon-e-boende",                           // зональный знак
  "038-scandic-buss-besokande-pil",             // пиктограмма отдельной табличкой
  "049-moped-sasong-avgift-tva-taxor",          // адресат, сезон, «övrig tid»
  "064-motorcykel-tisd-9-17-beskuren",          // адресат и день недели
];

export type Case = { id: string; doc: string; moment: string };

const stem = (f: string) => f.replace(/\.[^.]+$/, "");
const round6 = (v: number) => Number(v.toFixed(6));

// --- питоновский вид JSON ---------------------------------------------------
//
// Эталоны писал `json.dumps(..., ensure_ascii=False, indent=1)`, и переезд обязан
// повторить его до байта. Строки, целые числа, отступы и порядок ключей у JS
// совпадают с питоном сами. Расходится ОДНО: питон отличает дробное число от
// целого и пишет `1.0`, а `JSON.stringify` пишет `1` — в эталонах таких чисел
// три с половиной тысячи.
//
// Поэтому дробность объявлена по имени поля, а не угадывается по значению:
// `confidence`, всё внутри `signals` и первый столбец строк замера. Всё остальное
// в эталонах — целые. Проверяется это не обещанием, а переписыванием: разойдись
// хоть одно число — и `git diff` перестанет быть пустым.

type Mode = "plain" | "float" | "signals" | "rows" | "row";

function modeFor(key: string): Mode {
  if (key === "confidence") return "float";
  if (key === "signals") return "signals";
  if (key === "rows") return "rows";
  return "plain";
}

function number(value: number, asFloat: boolean): string {
  if (!Number.isFinite(value)) throw new Error(`не сериализуется: ${value}`);
  return asFloat && Number.isInteger(value) ? `${value}.0` : String(value);
}

function dump(value: unknown, level: number, mode: Mode): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return number(value, mode === "float");
  if (typeof value === "string") return JSON.stringify(value);

  const pad = " ".repeat(level + 1);
  const close = " ".repeat(level);

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((item, i) => {
      // Строка замера — это `[уверенность, категория, разошлось, снимок]`.
      const inner: Mode = mode === "rows" ? "row"
                        : mode === "row" ? (i === 0 ? "float" : "plain")
                        : "plain";
      return pad + dump(item, level + 1, inner);
    });
    return `[\n${items.join(",\n")}\n${close}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  const items = entries.map(([key, item]) =>
    pad + JSON.stringify(key) + ": "
        + dump(item, level + 1, mode === "signals" ? "float" : modeFor(key)));
  return `{\n${items.join(",\n")}\n${close}}`;
}

/** Значение так, как его записал бы питон, вместе с переводом строки в конце. */
export function pyDump(value: unknown): string {
  return dump(value, 0, "plain") + "\n";
}

// --- разборы, на которых идёт сверка ---------------------------------------

/** Все разборы набора: ответы модели из `demo/` и эталоны разработчика.
 *
 *  Двух родов намеренно: у модели встречаются склейки панелей и странные поля,
 *  каких в аккуратном эталоне не бывает, и порт обязан вести себя одинаково
 *  и на тех, и на других. */
export function documents(): Record<string, SignDoc> {
  const out: Record<string, SignDoc> = {};
  for (const file of readdirSync(`${ROOT}demo`).filter((f) => f.endsWith(".extract.json")).sort()) {
    const doc = JSON.parse(readFileSync(`${ROOT}demo/${file}`, "utf-8")).response;
    if (doc && typeof doc === "object" && doc.main_sign) {
      out[`demo/${file.slice(0, -".extract.json".length)}`] = doc;
    }
  }
  for (const file of readdirSync(`${ROOT}testset/expected`).filter((f) => f.endsWith(".json")).sort()) {
    const doc = JSON.parse(readFileSync(`${ROOT}testset/expected/${file}`, "utf-8"));
    if (doc && typeof doc === "object" && doc.main_sign) out[`expected/${stem(file)}`] = doc;
  }
  return out;
}

/** Случаи: каждый разбор на общий момент плюс особые моменты на тех снимках,
 *  где они что-то меняют. */
export function buildCases(docs = documents()): Case[] {
  const cases: Case[] = Object.keys(docs)
    .map((name) => ({ id: `${name}@base`, doc: name, moment: BASE_MOMENT }));
  for (const special of SPECIAL) {
    for (const name of SPECIAL_DOCS) {
      for (const full of [`demo/${name}`, `expected/${name}`]) {
        if (full in docs) {
          cases.push({ id: `${full}@${special.label}`, doc: full, moment: special.moment });
        }
      }
    }
  }
  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- рецепты поломок -------------------------------------------------------

export type Mutation = { label: string; op: string; path: string[]; value?: unknown };

/** Поломки для проверки СХЕМЫ: документ обязан перестать быть годным. */
export const MUTATIONS: Mutation[] = [
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
  { label: "цвет панели вне перечисления", op: "set",
    path: ["panels", "0", "background_color"], value: "grey" },
];

/** Порча, будящая ПОЧИНКУ. Фикстуры лежат уже починенными — на чистом наборе
 *  починка не срабатывает ни разу, и сверять было бы нечего. */
export const DAMAGE: Mutation[] = [
  { label: "как есть", op: "keep", path: [] },
  { label: "дубль основного знака", op: "append", path: ["panels"],
    value: { index: 99, kind: "sign_plate", lines: [], background_color: "blue",
             legibility: { readable: true }, parsed: { pictogram: "parking" } } },
  { label: "пустая строка в панели", op: "append",
    path: ["panels", "0", "lines"], value: "  " },
  { label: "сбитый индекс панели", op: "set",
    path: ["panels", "0", "index"], value: 7 },
  { label: "panel_count не сходится", op: "set", path: ["panel_count"], value: 99 },
  { label: "значение вне перечисления", op: "set",
    path: ["panels", "0", "parsed", "payment_method"], value: "mobile" },
  { label: "цвет панели вне перечисления", op: "set",
    path: ["panels", "0", "background_color"], value: "grey" },
  { label: "цвет знака вне перечисления", op: "set",
    path: ["main_sign", "background_color"], value: "grey" },
];

/** Рецепт поломки — к копии разбора. Путь по ключам; число в пути — индекс. */
export function applyMutation(doc: unknown, mutation: Mutation): unknown {
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
  } else if (mutation.op === "append") {
    node[key].push(mutation.value);
  } else {
    node[key] = mutation.value;
  }
  return out;
}

// --- пробы по слоям --------------------------------------------------------
//
// Задача пробы — посчитать ответ продукта на объявленных входных данных. Входные
// данные каждая проба выводит САМА: пока эталоны писал питон, их можно было брать
// из самого эталона, но команда, которая его пишет, так не может — вышло бы,
// что файл задаёт себе задачу.

export function probeCalendar(): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (let year = SELECTABLE_FROM.y; year <= SELECTABLE_TO.y; year += 1) {
    let classes = "";
    for (let d = { y: year, m: 1, d: 1 }; d.y === year; d = addDays(d, 1)) {
      classes += cal.dayClass(d)[0];                 // w | e | r
    }
    out[String(year)] = { classes, holidays: Object.fromEntries([...holidays(year)].sort()) };
  }
  return out;
}

export function probeClock(): Record<string, unknown> {
  const switches: Record<string, unknown> = {};
  for (let year = SELECTABLE_FROM.y; year <= SELECTABLE_TO.y; year += 1) {
    switches[String(year)] = { forward: isoNaive(springForward(year)),
                               back: isoNaive(autumnBack(year)) };
  }
  const moments = ["2026-01-15T12:00", "2026-07-15T12:00", "2026-03-29T01:30",
                   "2026-03-29T02:30", "2026-03-29T03:30", "2026-10-25T02:30",
                   "2026-10-25T03:30", "2026-10-24T20:00", "2027-03-27T20:00"];
  return {
    switches,
    moments: moments.map((moment) => {
      const t = parseNaive(moment);
      return {
        moment,
        offset: offset(t),
        plus_2h: isoNaive(add(t, 120)),
        plus_24h: isoNaive(add(t, 1440)),
        minutes_to_next_day: realMinutes(t, addMinutes(t, 1440)),
        switch_within_8_days: switchBetween(t, addMinutes(t, 8 * 1440)),
      };
    }),
  };
}

export function probeEngine(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
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
}

export function probePresent(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
    const doc = docs[c.doc];
    const moment = parseNaive(c.moment);
    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { evaluation: ev });
    out[c.id] = toJson({ doc, recognised: recognise(doc), assessment: a,
                         evaluation: applyAsymmetry(ev, a) }, moment, cal);
  }
  return out;
}

export function probeReference(docs: Record<string, SignDoc>): Record<string, unknown> {
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
}

export function probeCompleteness(cases: Case[], docs: Record<string, SignDoc>): Record<string, unknown> {
  const cal = new Calendar();
  const out: Record<string, unknown> = {};
  for (const c of cases) {
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
}

/** Мутационная проверка схемы: обе стороны применяют один рецепт к одному разбору,
 *  и сравнивается ВЕРДИКТ — годен или нет (решение 124). */
export function probeSchema(docs: Record<string, SignDoc>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(docs).sort().slice(0, 20)) {
    for (const mutation of MUTATIONS) {
      out[`${name}::${mutation.label}`] = valid(applyMutation(docs[name], mutation), SIGN_SCHEMA);
    }
  }
  return out;
}

/** Починка ответа модели: что поправлено, что замечено, прошёл ли схему.
 *  Сверяются и сами записи о починке: правка, о которой не сказано, — второй
 *  источник ошибок. Число панелей от отсева сюда не передаётся: оно приходит
 *  от модели, а сверка должна быть воспроизводимой. */
export function probeValidation(docs: Record<string, SignDoc>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(docs).sort().slice(0, 20)) {
    for (const damage of DAMAGE) {
      const res = validateSign(applyMutation(docs[name], damage) as any);
      out[`${name}::${damage.label}`] = {
        ok: resultOk(res), repairs: res.repairs, flags: res.flags, data: res.data,
      };
    }
  }
  return out;
}

/** Промпты целиком, оба. Сверяется СТРОКА, а не её куски: отпечаток промпта
 *  держит все сохранённые ответы, и расхождение в одном пробеле означало бы,
 *  что браузер задаёт модели другой вопрос. */
export function probePrompts(): Record<string, unknown> {
  return { triage: triagePrompt(), extract: extractPrompt() };
}

/** Числа замера: точность извлечения, расхождения ответов, таблица порогов.
 *  Повторяет то же, что делает `npm run measure`, и на тех же входных данных. */
export async function probeMeasure(): Promise<Record<string, unknown>> {
  const cal = new Calendar();
  const moment = parseNaive("2026-03-02T00:00");
  const mark = await fingerprint(extractPrompt());

  // Пары «эталон — ответ модели». Ответ, полученный ДРУГИМ промптом, в замер
  // не входит: иначе в одном числе смешаются две версии вопроса.
  const pairs: { label: string; expected: SignDoc; actual: SignDoc }[] = [];
  const excluded: string[] = [];
  for (const file of readdirSync(`${ROOT}testset/expected`).sort()) {
    if (!file.endsWith(".json")) continue;
    const label = file.slice(0, -".json".length);
    const fx = `${ROOT}demo/${label}.extract.json`;
    if (!existsSync(fx)) continue;
    const fixture = JSON.parse(readFileSync(fx, "utf-8"));
    if ((fixture.origin ?? "model") !== "model") continue;
    if (fixture.prompt_fingerprint !== mark) {
      excluded.push(label);
      continue;
    }
    pairs.push({ label,
                 expected: JSON.parse(readFileSync(`${ROOT}testset/expected/${file}`, "utf-8")),
                 actual: fixture.response });
  }

  const rep = emptyReport();
  const diverged: Record<string, string[]> = {};
  for (const { label, expected, actual } of pairs) {
    compare(expected, actual, label, rep);
    const diff = verdictDifferences(verdictSlice(expected, moment, cal),
                                    verdictSlice(actual, moment, cal));
    if (diff.length) diverged[label] = diff;
  }

  // Уверенность считается так же, как её считает конвейер: с флагами извлечения,
  // починкой валидатора, пробелами справочника и площадью кадра.
  const rows: ThresholdRow[] = [];
  const seenPixels: Record<string, number | null> = {};
  for (const { label, actual } of pairs) {
    const triageFile = `${ROOT}demo/${label}.triage.json`;
    let panelsSeen: number | null = null;
    if (existsSync(triageFile)) {
      const seen = JSON.parse(readFileSync(triageFile, "utf-8"))?.response?.panels_below_main_sign;
      panelsSeen = typeof seen === "number" ? seen : null;
    }

    const res = validateSign(JSON.parse(JSON.stringify(actual)), panelsSeen);
    const doc = resultOk(res) && res.data ? res.data : actual;
    const rec = recognise(doc);
    const flags = [...res.flags];
    if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
    const uninterpreted = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
    if (uninterpreted.length) flags.push("uninterpreted_panels:" + uninterpreted.join(","));

    const photo = readdirSync(`${ROOT}testset/photos`)
      .find((f) => f.startsWith(`${label}.`) && /\.(jpg|png)$/i.test(f));
    const imagePixels = photo
      ? pixels(new Uint8Array(readFileSync(`${ROOT}testset/photos/${photo}`)))
      : null;
    seenPixels[label] = imagePixels;

    const ev = evaluateParkingRules(doc, moment, cal);
    const a = grade(doc, { flags, repairs: res.repairs, evaluation: ev, imagePixels });
    rows.push({ confidence: Number(a.confidence.toFixed(6)), category: a.category,
                diverged: label in diverged, label });
  }
  rows.sort((x, y) => (x.confidence - y.confidence) || x.label.localeCompare(y.label));

  return {
    photos: rep.photos,
    fields: Object.fromEntries([...rep.fields.keys()].sort()
      .map((k) => [k, [rep.fields.get(k)!.hits, rep.fields.get(k)!.total]])),
    mistakes: [...rep.mistakes].sort(),
    diverged,
    pixels: seenPixels,
    fingerprint: mark,
    excluded: excluded.sort(),
    rows: rows.map((r) => [r.confidence, r.category, r.diverged, r.label]),
    threshold_table: thresholdTable(rows),
  };
}

/** Пробы по именам слоёв — тем же, что и в эталонах. */
export const PROBES: Record<string, () => Record<string, unknown> | Promise<Record<string, unknown>>> = {
  calendar: () => probeCalendar(),
  clock: () => probeClock(),
  engine: () => { const docs = documents(); return probeEngine(buildCases(docs), docs); },
  reference: () => probeReference(documents()),
  completeness: () => { const docs = documents(); return probeCompleteness(buildCases(docs), docs); },
  present: () => { const docs = documents(); return probePresent(buildCases(docs), docs); },
  schema: () => probeSchema(documents()),
  validation: () => probeValidation(documents()),
  prompts: () => probePrompts(),
  measure: () => probeMeasure(),
};

// --- запись и сверка -------------------------------------------------------

/** Все эталоны разом. Считается из репозитория и ничего никуда не пишет. */
export async function golden(): Promise<Record<string, unknown>> {
  const docs = documents();
  const cases = buildCases(docs);
  return {
    cases,
    calendar: probeCalendar(),
    clock: probeClock(),
    engine: probeEngine(cases, docs),
    reference: probeReference(docs),
    schema: probeSchema(docs),
    validation: probeValidation(docs),
    prompts: probePrompts(),
    measure: await probeMeasure(),
    completeness: probeCompleteness(cases, docs),
    present: probePresent(cases, docs),
  };
}

const fileOf = (name: string) => `${DIR}${name}.json`;

/** Какие эталоны разошлись с тем, что считает код сейчас. Пусто — всё свежее. */
export async function stale(fresh?: Record<string, unknown>): Promise<string[]> {
  const computed = fresh ?? await golden();
  const out: string[] = [];
  for (const name of ["cases", ...LAYERS]) {
    const path = fileOf(name);
    if (!existsSync(path)) out.push(`${name}.json: файла нет`);
    else if (readFileSync(path, "utf-8") !== pyDump(computed[name])) {
      out.push(`${name}.json: ответ продукта изменился`);
    }
  }
  return out;
}

/** Переписать эталоны. Возвращает список изменившихся файлов. */
export async function write(): Promise<string[]> {
  const fresh = await golden();
  const changed: string[] = [];
  for (const name of ["cases", ...LAYERS]) {
    const path = fileOf(name);
    const text = pyDump(fresh[name]);
    if (!existsSync(path) || readFileSync(path, "utf-8") !== text) {
      writeFileSync(path, text, "utf-8");
      changed.push(`${name}.json`);
    }
  }
  return changed;
}

async function main(shouldWrite: boolean): Promise<void> {
  if (!shouldWrite) {
    const outdated = await stale();
    if (outdated.length) {
      console.error("эталоны устарели:\n  " + outdated.join("\n  "));
      console.error("посмотреть расхождение: npm test -- parity");
      console.error("переписать сознательно: npm run goldens:write");
      process.exitCode = 1;
    } else {
      console.log("эталоны свежие");
    }
    return;
  }
  const changed = await write();
  console.log(changed.length ? "переписано: " + changed.join(", ") : "нечего переписывать");
}

if (process.argv[1] && process.argv[1].endsWith("goldens.ts")) {
  main(process.argv.includes("--write")).catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exitCode = 1;
  });
}

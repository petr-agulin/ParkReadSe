// Замер. Порт `parkread/accuracy.py`.
//
// Мерятся ДВЕ РАЗНЫЕ ВЕЩИ, и путать их нельзя:
//
// - **точность извлечения** — поля разбора модели против эталона разработчика;
// - **расхождение ОТВЕТА** — что прочтёт человек, посчитанное дважды: по эталону
//   и по разбору модели.
//
// Порог 0.9 стоит на втором. Поля расходятся у девятнадцати снимков, ответ — у трёх:
// цвет таблички, лишний перенос строки и порядок панелей в разборе видны, а до
// человека не доходят, и калибровать по ним значило бы настраивать оговорку на то,
// чего пользователь не увидит.
//
// **Это инструмент разработчика, а не часть продукта.** В страницу он не попадает:
// его никто не импортирует из приложения.

import { Calendar } from "./calendar";
import { addMinutes, isoNaive, type Naive } from "./civil";
import { evaluateParkingRules, type Evaluation } from "./engine";
import type { Panel, SignDoc, TimeWindow } from "./sign";

const plates = (doc: SignDoc): Panel[] =>
  (doc.panels ?? []).filter((p) => p.kind === "sign_plate");

/** Весь текст таблички одной строкой, без регистра и лишних пробелов.
 *
 *  Перенос строк ВНУТРИ таблички последствия не имеет: строки одной таблички
 *  действуют совместно, а как они разбиты при печати, правила не меняет. */
function text(panel: Panel): string {
  return (panel.lines ?? [])
    .filter((x) => x.trim())
    .map((x) => x.split(/\s+/).filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();
}

/** Чем панель отличается от соседей: нужна, чтобы мерить ПОРЯДОК отдельно
 *  от содержания. */
function signature(panel: Panel): string {
  const t = text(panel);
  if (t) return t;
  const parsed = panel.parsed ?? {};
  return String(parsed.arrow ?? parsed.pictogram ?? "?");
}

/** Пары «та же панель здесь и там», сопоставленные по тексту. Панели без пары
 *  молчат намеренно: их расхождение уже посчитано в `panels.content`. */
function* matched(expected: SignDoc, actual: SignDoc): Generator<[Panel, Panel]> {
  const bySig = new Map<string, Panel[]>();
  for (const p of actual.panels ?? []) {
    const key = signature(p);
    if (!bySig.has(key)) bySig.set(key, []);
    bySig.get(key)!.push(p);
  }
  for (const e of expected.panels ?? []) {
    const same = bySig.get(signature(e));
    if (same && same.length) yield [e, same.shift() as Panel];
  }
}

const MONTH_LEN: Record<number, number> = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
                                            7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };
const ALL_DAYS: number[] = [];
for (let m = 1; m <= 12; m += 1) {
  for (let d = 1; d <= MONTH_LEN[m]; d += 1) ALL_DAYS.push(m * 100 + d);
}

/** Множество дней, в которые окно действует.
 *
 *  `Augusti-Juni` записывается двумя способами — «только с 1 августа по 30 июня»
 *  и «кроме июля», — и это ОДНО И ТО ЖЕ правило. Сравнивать записи буквально
 *  значит мерить форму записи, а не прочитанное. */
export function coveredDays(dates: NonNullable<TimeWindow["dates"]>): number[] {
  const hit = new Set<number>();
  for (const rng of dates.ranges ?? []) {
    const [sm, sd] = rng.from.split("-").map(Number);
    const [em, ed] = rng.to.split("-").map(Number);
    const start = sm * 100 + sd;
    const end = em * 100 + ed;
    for (const day of ALL_DAYS) {
      const inside = start <= end ? start <= day && day <= end
                                  : day >= start || day <= end;
      if (inside) hit.add(day);
    }
  }
  const kept = dates.mode === "only" ? [...hit] : ALL_DAYS.filter((d) => !hit.has(d));
  return kept.sort((a, b) => a - b);
}

/** Окна к сравнимому виду: даты — множеством дней, остальное как есть. */
function normaliseWindows(value: TimeWindow[] | undefined): unknown[] {
  return (value ?? []).map((w) => {
    const out: Record<string, unknown> = { ...w };
    if (w.dates) out.dates = coveredDays(w.dates);
    return out;
  });
}

/** Значение так, как его печатает питон (`repr`): одинарные кавычки, `True`,
 *  `None`. Замер читает человек, и его вывод сверяется с питоновским строка
 *  в строку — значит, и запись значений должна совпадать. */
export function pyRepr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") {
    return QUOTE + value.split(QUOTE).join(ESCAPED) + QUOTE;
  }
  if (Array.isArray(value)) return "[" + value.map(pyRepr).join(", ") + "]";
  if (typeof value === "object") {
    const body = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => pyRepr(k) + ": " + pyRepr(v)).join(", ");
    return "{" + body + "}";
  }
  return String(value);
}

const QUOTE = "'";
const ESCAPED = "\\'";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Field = { name: string; hits: number; total: number };

export type Report = {
  fields: Map<string, Field>;
  photos: number;
  mistakes: string[];
};

export const emptyReport = (): Report => ({ fields: new Map(), photos: 0, mistakes: [] });

function add(rep: Report, name: string, ok: boolean, note = ""): void {
  const field = rep.fields.get(name) ?? { name, hits: 0, total: 0 };
  field.total += 1;
  if (ok) field.hits += 1;
  rep.fields.set(name, field);
  if (!ok && note) rep.mistakes.push(note);
}

const PARSED_FIELDS = ["duration_limit", "time_windows", "fee", "permit_required",
                       "scope_shift", "eligibility", "vehicle_class", "arrow",
                       "place_count", "stretch_metres", "placement", "prohibition",
                       "payment_method", "permits_parking"] as const;

/** Точность извлечения: поля разбора модели против эталона разработчика. */
export function compare(expected: SignDoc, actual: SignDoc, label: string,
                        rep: Report): void {
  rep.photos += 1;

  const me: any = expected.main_sign;
  const ma: any = actual.main_sign;
  add(rep, "main_sign.type", me.type === ma.type,
      `${label}: основной знак ${ma.type} вместо ${me.type}`);
  add(rep, "main_sign.background_color", me.background_color === ma.background_color,
      `${label}: цвет знака ${ma.background_color} вместо ${me.background_color}`);
  add(rep, "main_sign.form", me.form === ma.form,
      `${label}: вид знака ${ma.form} вместо ${me.form}`);

  const pe = plates(expected);
  const pa = plates(actual);
  add(rep, "panel_count", pe.length === pa.length,
      `${label}: табличек ${pa.length} вместо ${pe.length}`);

  const sigE = pe.map(signature);
  const sigA = pa.map(signature);
  add(rep, "panels.content", same([...sigE].sort(), [...sigA].sort()),
      `${label}: содержание табличек разошлось`);
  // Порядок меряется ОТДЕЛЬНО: от него зависит правило.
  add(rep, "panels.order", same(sigE, sigA),
      `${label}: порядок табличек ${pyRepr(sigA)} вместо ${pyRepr(sigE)}`);

  // Несёт панель правило или нет — единственное, что здесь имеет последствие:
  // принять табличку с правилом за нерулевую значит потерять указание.
  for (const [e, a] of matched(expected, actual)) {
    add(rep, "panel.rule_bearing",
        (e.kind === "sign_plate") === (a.kind === "sign_plate"),
        `${label}: панель ${a.index} помечена ${a.kind} вместо ${e.kind}`
        + " — это меняет состав правил");
  }

  // пофразовое сравнение только там, где длины совпали
  for (let i = 0; i < Math.min(pe.length, pa.length); i += 1) {
    const e = pe[i];
    const a = pa[i];
    add(rep, "panel.lines", text(e) === text(a),
        `${label}: панель ${a.index} прочитана как ${pyRepr(a.lines)}`
        + ` вместо ${pyRepr(e.lines)}`);
    add(rep, "panel.background_color", e.background_color === a.background_color);
    const ep: any = e.parsed ?? {};
    const ap: any = a.parsed ?? {};
    for (const key of PARSED_FIELDS) {
      if (key in ep || key in ap) {
        let want: unknown = ep[key];
        let got: unknown = ap[key];
        if (key === "time_windows") {
          want = normaliseWindows(want as TimeWindow[] | undefined);
          got = normaliseWindows(got as TimeWindow[] | undefined);
        }
        add(rep, `parsed.${key}`, same(want, got),
            `${label}: панель ${a.index} поле ${key} = ${pyRepr(ap[key])}`
            + ` вместо ${pyRepr(ep[key])}`);
      }
    }
  }
}

export function table(rep: Report): string {
  const rows = ["| Поле | Совпало | Всего | Точность |", "|---|---|---|---|"];
  for (const name of [...rep.fields.keys()].sort()) {
    const f = rep.fields.get(name)!;
    const share = f.total ? Math.round((f.hits / f.total) * 100) : 0;
    rows.push(`| \`${name}\` | ${f.hits} | ${f.total} | ${share}% |`);
  }
  return `Снимков в замере: ${rep.photos}\n\n` + rows.join("\n");
}

// --- отсев -----------------------------------------------------------------

export type TriageReport = {
  realSigns: number;
  falseRejects: number;
  falseRejectShare: number;
  junkFrames: number;
  junkLetThrough: number;
  junkLetThroughShare: number;
};

/** Доля ложных отсевов — самая дорогая ошибка стадии 0: человек стоит перед знаком
 *  и не получает ничего. Мусор, пропущенный дальше, считается отдельно: он стоит
 *  лишнего вызова, а не ответа. */
export function triageReport(expectedIsParking: Record<string, boolean>,
                             triage: Record<string, string>): TriageReport {
  const names = Object.keys(expectedIsParking).filter((k) => k in triage);
  const real = names.filter((k) => expectedIsParking[k]);
  const junk = names.filter((k) => !expectedIsParking[k]);
  const falseRejects = real.filter((k) => triage[k] !== "parking_sign").length;
  const letThrough = junk.filter((k) => triage[k] === "parking_sign").length;
  return {
    realSigns: real.length,
    falseRejects,
    falseRejectShare: real.length ? falseRejects / real.length : 0,
    junkFrames: junk.length,
    junkLetThrough: letThrough,
    junkLetThroughShare: junk.length ? letThrough / junk.length : 0,
  };
}

// --- калибровка порога -----------------------------------------------------

export const HORIZON_HOURS = 24 * 7;

/** Состояние И условия в этот час: для человека это одно сообщение. */
function stateAt(ev: Evaluation, moment: Naive): [string, string[]] {
  const m = isoNaive(moment);
  for (const regime of ev.regimes) {
    for (const period of regime.periods) {
      if (isoNaive(period.start) <= m && m < isoNaive(period.end)) {
        return [period.state, period.conditions];
      }
    }
  }
  return ["unknown", []];
}

export type Verdict = {
  permitsParking: boolean;
  eligibility: string[];
  states: [string, string[]][];
};

/** Ответ по знаку в сравнимом виде: можно ли тут стоять, кому отведены места
 *  и что происходит в каждый час недели вперёд. */
export function verdictSlice(doc: SignDoc, moment: Naive, cal: Calendar): Verdict {
  const ev = evaluateParkingRules(doc, moment, cal);
  const states: [string, string[]][] = [];
  for (let h = 0; h < HORIZON_HOURS; h += 1) {
    states.push(stateAt(ev, addMinutes(moment, h * 60)));
  }
  return {
    permitsParking: ev.permitsParking,
    eligibility: ev.regimes.flatMap((r) => r.eligibility).sort(),
    states,
  };
}

/** Чем ответ по разбору отличается от ответа по эталону.
 *
 *  Часы, в которые разбор ШИРЕ эталона, считаются отдельно: ошибка в эту сторону
 *  стоит пользователю эвакуации, в обратную — лишней осторожности. */
export function verdictDifferences(expected: Verdict, actual: Verdict): string[] {
  const out: string[] = [];
  if (expected.permitsParking !== actual.permitsParking) {
    out.push(`стоянка здесь: ${pyBool(actual.permitsParking)} вместо `
           + `${pyBool(expected.permitsParking)}`);
  }
  if (!same(expected.eligibility, actual.eligibility)) {
    out.push(`круг стоящих: ${pyList(actual.eligibility)} вместо `
           + `${pyList(expected.eligibility)}`);
  }
  const pairs = expected.states.map((e, i) => [e, actual.states[i]] as const);
  // Состояние и условия разводятся намеренно: «нельзя вместо можно» и «плата
  // не в те дни» — ошибки разной цены.
  const byState = pairs.filter(([e, a]) => e[0] !== a[0]);
  if (byState.length) {
    const wider = byState.filter(([, a]) => a[0] === "allowed").length;
    out.push(`часов расходится по состоянию ${byState.length}/${pairs.length},`
           + ` из них шире ${wider}`);
  }
  const byCond = pairs.filter(([e, a]) => e[0] === a[0] && !same(e[1], a[1]));
  if (byCond.length) {
    const примеры = [...new Set(byCond.map(([e, a]) =>
      (a[1].join(", ") || "—") + " вместо " + (e[1].join(", ") || "—")))].sort();
    out.push(`часов расходится по условиям ${byCond.length}/${pairs.length}: `
           + примеры.slice(0, 2).join("; "));
  }
  return out;
}

const pyBool = (v: boolean) => pyRepr(v);
const pyList = (v: string[]) => (v.length ? pyRepr(v) : "—");

export type ThresholdRow = { confidence: number; category: string; diverged: boolean;
                             label: string };

/** Сколько разошедшихся ответов ловит каждый порог и какой ценой. */
export function thresholdTable(rows: ThresholdRow[],
                               thresholds = [0.85, 0.875, 0.9, 0.92, 0.95]): string {
  const lines = ["| Порог | Помечено | Из них разошлись | Пропущено как «полный» | Из них разошлись |",
                 "|---|---|---|---|---|"];
  for (const t of thresholds) {
    const flagged = rows.filter((r) => r.confidence < t || r.category !== "full");
    const passed = rows.filter((r) => r.confidence >= t && r.category === "full");
    lines.push(`| ${t.toFixed(3)} | ${flagged.length} | `
             + `${flagged.filter((r) => r.diverged).length} | ${passed.length} | `
             + `${passed.filter((r) => r.diverged).length} |`);
  }
  return lines.join("\n");
}

/** Сигналы, ни разу не менявшиеся на наборе.
 *
 *  Вывод отсюда НЕ «убрать вес»: сигнал может быть постоянным потому, что
 *  в наборе нет снимков, которые его сдвинули бы. */
export function deadSignals(seen: Map<string, Set<number>>): string[] {
  return [...seen.entries()].filter(([, v]) => v.size <= 1)
                            .map(([k]) => k).sort();
}

/** Отпечаток промпта: ответ, полученный ДРУГИМ вопросом, в замер не входит. */
export async function fingerprint(prompt: string): Promise<string> {
  const bytes = new TextEncoder().encode(prompt);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

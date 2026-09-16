// Набор снимков и сохранённые ответы модели — то, на чём держится замер.
// Порт загрузки пар и ожиданий отсева из `parkread/accuracy.py` (шаг 8).
//
// **Только для разработчика и только на Node:** читает диск. Приложение этот файл
// не импортирует и в сборку он не попадает — как и `measure/`, `build/`.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Calendar } from "../src/lib/calendar";
import type { Naive } from "../src/lib/civil";
import { grade } from "../src/lib/completeness";
import { evaluateParkingRules } from "../src/lib/engine";
import { pixels } from "../src/lib/photo";
import { recognise } from "../src/lib/reference";
import type { SignDoc } from "../src/lib/sign";
import { ok, sign as validateSign } from "../src/lib/validation";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const EXPECTED = join(ROOT, "testset", "expected");
export const DEMO = join(ROOT, "demo");
export const PHOTOS = join(ROOT, "testset", "photos");
export const TRIAGE_EXPECTED = join(ROOT, "testset", "triage_expected.json");

// Снимки, добавленные в набор, но ещё не размеченные. Список временный и обязан
// пустеть: пока снимок здесь, он в замер не входит и качества не подтверждает.
// Держать его явно честнее, чем ослабить проверку: «эталона нет» и «эталон забыли» —
// разные вещи, и различить их можно только назвав ожидаемое.
export const PENDING_GROUND_TRUTH = new Set<string>();

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const stem = (file: string) => file.replace(/\.[^.]+$/, "");

/** Все снимки набора. Расширение проверяется обоими: часть набора пришла в png,
 *  и маска `*.jpg` однажды просто не видела четырнадцать снимков из сорока. */
export function photos(): Set<string> {
  return new Set(readdirSync(PHOTOS).filter((f) => /\.(jpg|png)$/i.test(f)).map(stem));
}

/** Размеченные снимки — у которых есть эталон разбора. */
export function marked(dir = EXPECTED): Set<string> {
  return new Set(readdirSync(dir).filter((f) => f.endsWith(".json")).map(stem));
}

export type Pair = { label: string; expected: SignDoc; actual: SignDoc };

/** Пары «эталон — ответ модели».
 *
 *  `onlyModel` отсекает затравку `hand_marked`: мерить модель по эталону, написанному
 *  не моделью, значит сравнивать эталон с самим собой. `promptFingerprint` отсекает
 *  ответы, полученные ДРУГИМ промптом: смешать две версии промпта в одном числе —
 *  ровно то, от чего отпечаток и заводился (снимок `038`). */
export function loadPairs(expectedDir: string, fixturesDir: string,
                          { onlyModel = true, promptFingerprint = null }:
                            { onlyModel?: boolean; promptFingerprint?: string | null } = {},
                          ): Pair[] {
  const out: Pair[] = [];
  for (const file of readdirSync(expectedDir).filter((f) => f.endsWith(".json")).sort()) {
    const label = stem(file);
    const fx = join(fixturesDir, `${label}.extract.json`);
    if (!existsSync(fx)) continue;
    const fixture = readJson(fx);
    if (onlyModel && (fixture.origin ?? "model") !== "model") continue;
    if (promptFingerprint !== null && fixture.prompt_fingerprint !== promptFingerprint) continue;
    out.push({ label, expected: readJson(join(expectedDir, file)), actual: fixture.response });
  }
  return out;
}

/** Снимки, чей сохранённый ответ получен другим промптом. Их нельзя ни считать,
 *  ни молча забыть: молчаливый пропуск выглядит как «такого снимка нет». */
export function answersFromAnotherPrompt(expectedDir: string, fixturesDir: string,
                                         promptFingerprint: string): string[] {
  const out: string[] = [];
  for (const file of readdirSync(expectedDir).filter((f) => f.endsWith(".json")).sort()) {
    const fx = join(fixturesDir, `${stem(file)}.extract.json`);
    if (!existsSync(fx)) continue;
    const fixture = readJson(fx);
    if ((fixture.origin ?? "model") !== "model") continue;
    if (fixture.prompt_fingerprint !== promptFingerprint) out.push(stem(file));
  }
  return out;
}

/** Снимки, которые парковочными знаками НЕ являются, и чем они должны оказаться
 *  на отсеве. Отдельным файлом, а не выводом из отсутствия эталона: «эталон ещё
 *  не написан» и «эталона не будет» — разные вещи. */
export function loadTriageExpectations(path = TRIAGE_EXPECTED): Record<string, string> {
  return existsSync(path) ? readJson(path).photos ?? {} : {};
}

/** Что ответил отсев на каждый снимок — только настоящие ответы модели. */
export function triageAnswers(fixturesDir = DEMO): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".triage.json")).sort()) {
    const d = readJson(join(fixturesDir, file));
    if ((d.origin ?? "model") !== "model") continue;
    out[file.slice(0, -".triage.json".length)] = String(d.response?.category ?? "");
  }
  return out;
}

export type Assessed = { confidence: number; category: string; signals: Record<string, number> };

/** Полнота и уверенность ответа — так, как их посчитал бы конвейер на этом снимке:
 *  с независимым счётом табличек отсева и с размером самого снимка. */
export function assessAnswer(label: string, actual: SignDoc, moment: Naive,
                             cal: Calendar): Assessed {
  const triageFile = join(DEMO, `${label}.triage.json`);
  const seen = existsSync(triageFile)
    ? readJson(triageFile)?.response?.panels_below_main_sign : null;
  const res = validateSign(structuredClone(actual), typeof seen === "number" ? seen : null);
  const doc = ok(res) && res.data ? res.data : actual;
  const rec = recognise(doc);
  const flags = [...res.flags];
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const uninterpreted = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (uninterpreted.length) flags.push("uninterpreted_panels:" + uninterpreted.join(","));
  const photo = readdirSync(PHOTOS).find((f) => f.startsWith(`${label}.`) && /\.(jpg|png)$/i.test(f));
  const imagePixels = photo ? pixels(new Uint8Array(readFileSync(join(PHOTOS, photo)))) : null;
  const a = grade(doc, { flags, repairs: res.repairs, imagePixels,
                         evaluation: evaluateParkingRules(doc, moment, cal) });
  return { confidence: Number(a.confidence.toFixed(6)), category: a.category, signals: a.signals };
}

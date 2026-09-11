// `npm run measure` — тот же замер, что `cli.py accuracy` и `cli.py calibrate`,
// только считает его TypeScript: та реализация, которая уходит в браузер.
//
// **Инструмент разработчика, а не часть продукта.** Живёт вне `src/`, приложением
// не импортируется и в сборку страницы не попадает. В обычный прогон (`npm test`)
// тоже не входит: печатать таблицы на каждый прогон незачем.
//
// Числа сверяются с питоновскими слоем `measure` двойного прогона — здесь они
// печатаются для человека.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { grade } from "../src/lib/completeness";
import { evaluateParkingRules } from "../src/lib/engine";
import { compare, emptyReport, fingerprint, table, thresholdTable,
         verdictDifferences, verdictSlice, type ThresholdRow } from "../src/lib/measure";
import { pixels } from "../src/lib/photo";
import { extractPrompt } from "../src/lib/prompts";
import { recognise } from "../src/lib/reference";
import type { SignDoc } from "../src/lib/sign";
import { ok as resultOk, sign as validateSign } from "../src/lib/validation";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MOMENT = "2026-03-02T00:00";      // обычный понедельник, как в питоне

type Pair = { label: string; expected: SignDoc; actual: SignDoc };

async function pairs(): Promise<{ kept: Pair[]; excluded: string[]; mark: string }> {
  const mark = await fingerprint(extractPrompt());
  const kept: Pair[] = [];
  const excluded: string[] = [];
  for (const file of readdirSync(`${ROOT}testset/expected`).sort()) {
    if (!file.endsWith(".json")) continue;
    const label = file.slice(0, -".json".length);
    const fx = `${ROOT}demo/${label}.extract.json`;
    if (!existsSync(fx)) continue;
    const fixture = JSON.parse(readFileSync(fx, "utf-8"));
    if ((fixture.origin ?? "model") !== "model") continue;
    // Ответ, полученный ДРУГИМ промптом, в замер не входит.
    if (fixture.prompt_fingerprint !== mark) {
      excluded.push(label);
      continue;
    }
    kept.push({
      label,
      expected: JSON.parse(readFileSync(`${ROOT}testset/expected/${file}`, "utf-8")),
      actual: fixture.response,
    });
  }
  return { kept, excluded, mark };
}

describe("замер", () => {
  it("печатает точность извлечения и калибровку порога", async () => {
    const cal = new Calendar();
    const moment = parseNaive(MOMENT);
    const { kept, excluded } = await pairs();

    const rep = emptyReport();
    const diverged: Record<string, string[]> = {};
    for (const { label, expected, actual } of kept) {
      compare(expected, actual, label, rep);
      const diff = verdictDifferences(verdictSlice(expected, moment, cal),
                                      verdictSlice(actual, moment, cal));
      if (diff.length) diverged[label] = diff;
    }

    const rows: ThresholdRow[] = [];
    for (const { label, actual } of kept) {
      const triageFile = `${ROOT}demo/${label}.triage.json`;
      const seen = existsSync(triageFile)
        ? JSON.parse(readFileSync(triageFile, "utf-8"))?.response?.panels_below_main_sign
        : null;
      const res = validateSign(JSON.parse(JSON.stringify(actual)),
                               typeof seen === "number" ? seen : null);
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

      const a = grade(doc, { flags, repairs: res.repairs, imagePixels,
                             evaluation: evaluateParkingRules(doc, moment, cal) });
      rows.push({ confidence: Number(a.confidence.toFixed(6)), category: a.category,
                  diverged: label in diverged, label });
    }
    rows.sort((x, y) => (x.confidence - y.confidence) || x.label.localeCompare(y.label));

    const out: string[] = [];
    out.push(table(rep), "");
    out.push(`Ответ совпал с эталоном: ${kept.length - Object.keys(diverged).length};`
           + ` разошёлся: ${Object.keys(diverged).length}`, "");
    out.push("Разошедшиеся ответы:");
    for (const row of rows.filter((r) => r.diverged)) {
      out.push(`  ${row.confidence}  ${row.category}  ${row.label}`);
      for (const line of diverged[row.label]) out.push(`           ${line}`);
    }
    out.push("", thresholdTable(rows), "");
    if (excluded.length) {
      out.push(`В замер НЕ вошли ${excluded.length}: ответ получен другим промптом.`);
      for (const label of excluded) out.push(`  ${label}`);
    }
    console.log(out.join("\n"));
  });
});

// `npm run measure` — замер точности и калибровка порога, как их печатали
// `cli.py accuracy` и `cli.py calibrate`. Эталон вывода снят с питона, пока он был
// цел: `parity/python-report.txt` (шаг 8, требование 12).
//
// **Инструмент разработчика, а не часть продукта.** Живёт вне `src/`, приложением
// не импортируется и в сборку не попадает. В обычный прогон (`npm test`) не входит:
// печатать таблицы на каждый прогон незачем.

import { describe, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { WEIGHTS } from "../src/lib/completeness";
import { compare, deadSignals, emptyReport, fingerprint, table, thresholdTable, triageReport,
         verdictDifferences, verdictSlice, type ThresholdRow } from "../src/lib/measure";
import { GOOD_ENOUGH } from "../src/lib/present";
import { extractPrompt } from "../src/lib/prompts";
import { DEMO, EXPECTED, answersFromAnotherPrompt, assessAnswer, loadPairs,
         loadTriageExpectations, marked, triageAnswers } from "../tools/testset";

const MOMENT = "2026-03-02T00:00";      // обычный понедельник, вне праздников
const percent = (x: number) => `${Math.round(x * 100)}%`;

describe("замер", () => {
  it("печатает точность извлечения и калибровку порога", async () => {
    const cal = new Calendar();
    const moment = parseNaive(MOMENT);
    const mark = await fingerprint(extractPrompt());
    const pairs = loadPairs(EXPECTED, DEMO, { promptFingerprint: mark });
    const totalExpected = marked().size;
    const outdated = answersFromAnotherPrompt(EXPECTED, DEMO, mark);
    const out: string[] = [];

    // Ответы, полученные другим промптом, называются вслух в обоих разделах.
    const nameOutdated = () => {
      if (!outdated.length) return;
      out.push("", `В замер НЕ вошли ${outdated.length}: ответ получен другим промптом.`);
      for (const label of outdated) out.push(`  ${label}`);
    };

    // --- точность извлечения ------------------------------------------------
    out.push("===== точность извлечения =====");
    if (!pairs.length) {
      out.push(`Нет ни одного настоящего ответа модели. Эталонов: ${totalExpected}.`);
      console.log(out.join("\n"));
      return;
    }
    const rep = emptyReport();
    for (const { label, expected, actual } of pairs) compare(expected, actual, label, rep);
    out.push(table(rep), "",
             `Покрытие замера: ${pairs.length} из ${totalExpected} эталонов `
             + `(${percent(pairs.length / totalExpected)}). Остальные ждут живого прогона.`);
    nameOutdated();
    if (rep.mistakes.length) {
      out.push("", "Типовые ошибки извлечения:");
      for (const m of rep.mistakes.slice(0, 20)) out.push(`  - ${m}`);
    }

    // Парковочный снимок или нет — из объявленного списка, а не из наличия эталона:
    // неразмеченный знак — не мусор.
    const notParking = loadTriageExpectations();
    const triage = triageAnswers(DEMO);
    if (Object.keys(triage).length) {
      const isParking = Object.fromEntries(Object.keys(triage).map((k) => [k, !(k in notParking)]));
      const t = triageReport(isParking, triage);
      out.push("", `Отсев: настоящих знаков ${t.realSigns}, ошибочно отсеяно ${t.falseRejects} `
                 + `(${percent(t.falseRejectShare)}); кадров не о парковке ${t.junkFrames}, `
                 + `пропущено дальше ${t.junkLetThrough}`);
    }

    // --- калибровка порога ---------------------------------------------------
    out.push("", "===== калибровка порога =====");
    const rows: ThresholdRow[] = [];
    const diverged = new Map<string, string[]>();
    const seen = new Map<string, Set<number>>();
    for (const { label, expected, actual } of pairs) {
      const diff = verdictDifferences(verdictSlice(expected, moment, cal),
                                      verdictSlice(actual, moment, cal));
      const a = assessAnswer(label, actual, moment, cal);
      for (const [k, v] of Object.entries(a.signals)) {
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k)!.add(Number(v.toFixed(3)));
      }
      rows.push({ confidence: a.confidence, category: a.category, diverged: diff.length > 0, label });
      if (diff.length) diverged.set(label, diff);
    }
    rows.sort((x, y) => (x.confidence - y.confidence) || x.category.localeCompare(y.category)
                     || Number(x.diverged) - Number(y.diverged) || x.label.localeCompare(y.label));

    out.push(`Снимков в калибровке: ${rows.length}`,
             `Ответ совпал с эталоном: ${rows.length - diverged.size}; разошёлся: ${diverged.size}`,
             "", "Разошедшиеся ответы:");
    for (const row of rows.filter((r) => r.diverged)) {
      out.push(`  ${String(row.confidence).padEnd(6)} ${row.category.padEnd(8)} ${row.label}`);
      for (const line of diverged.get(row.label)!) out.push(`           ${line}`);
    }
    out.push("", thresholdTable(rows), "", `Порог сейчас: ${GOOD_ENOUGH}`);
    nameOutdated();

    const dead = deadSignals(seen);
    if (dead.length) {
      const weight = dead.reduce((sum, k) => sum + WEIGHTS[k], 0);
      out.push("", `Сигналы, ни разу не изменившиеся на наборе (вес ${weight.toFixed(2)} из 1.00):`);
      for (const k of dead) out.push(`  ${k} (вес ${WEIGHTS[k].toFixed(2)})`);
      out.push("  Это НЕ повод переложить их вес на остальные: постоянны они потому,",
               "  что в наборе нет снимков, которые их сдвинули бы. Нужны плохие кадры.");
    }
    console.log(out.join("\n"));
  });
});

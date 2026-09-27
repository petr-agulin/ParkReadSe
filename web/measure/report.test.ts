// `npm run measure` - the accuracy measurement and the threshold calibration, as
// `cli.py accuracy` and `cli.py calibrate` used to print them.
//
// **A developer's tool, not part of the product.** It lives outside `src/`, is never
// imported by the application and never reaches the build. It stays out of the
// ordinary run (`npm test`): printing tables on every run is pointless.

import { describe, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { WEIGHTS } from "../src/lib/completeness";
import { compare, deadSignals, divergence, emptyReport, fingerprint, table, thresholdTable,
         triageReport, type ThresholdRow } from "../src/lib/measure";
import { GOOD_ENOUGH } from "../src/lib/present";
import { extractPrompt } from "../src/lib/prompts";
import { ANSWERS, EXPECTED, answersFromAnotherPrompt, assessAnswer, loadPairs,
         asShown, loadTriageExpectations, marked, triageAnswers } from "../tools/testset";

const MOMENT = "2026-03-02T00:00";      // an ordinary Monday, outside holidays
const percent = (x: number) => `${Math.round(x * 100)}%`;

describe("the measurement", () => {
  it("prints the extraction accuracy and the threshold calibration", async () => {
    const cal = new Calendar();
    const moment = parseNaive(MOMENT);
    const mark = await fingerprint(extractPrompt());
    const pairs = loadPairs(EXPECTED, ANSWERS, { promptFingerprint: mark });
    const totalExpected = marked().size;
    const outdated = answersFromAnotherPrompt(EXPECTED, ANSWERS, mark);
    const out: string[] = [];

    // Answers obtained with a different prompt are named aloud in both sections.
    const nameOutdated = () => {
      if (!outdated.length) return;
      out.push("", `NOT included, ${outdated.length}: the answer came from another prompt.`);
      for (const label of outdated) out.push(`  ${label}`);
    };

    // --- extraction accuracy ------------------------------------------------
    out.push("===== extraction accuracy =====");
    if (!pairs.length) {
      out.push(`Not one real answer from the model. Reference readings: ${totalExpected}.`);
      console.log(out.join("\n"));
      return;
    }
    const rep = emptyReport();
    for (const { label, expected, actual } of pairs) compare(expected, actual, label, rep);
    out.push(table(rep), "",
             `Coverage of the measurement: ${pairs.length} of ${totalExpected} reference `
             + `readings (${percent(pairs.length / totalExpected)}). The rest await a live run.`);
    nameOutdated();
    if (rep.mistakes.length) {
      out.push("", "Typical extraction mistakes:");
      for (const m of rep.mistakes.slice(0, 20)) out.push(`  - ${m}`);
    }

    // Whether a photograph is a parking one comes from the declared list rather than
    // from having a reference reading: an unmarked sign is not rubbish.
    const notParking = loadTriageExpectations();
    const triage = triageAnswers(ANSWERS);
    if (Object.keys(triage).length) {
      const isParking = Object.fromEntries(Object.keys(triage).map((k) => [k, !(k in notParking)]));
      const t = triageReport(isParking, triage);
      out.push("", `Triage: real signs ${t.realSigns}, wrongly rejected ${t.falseRejects} `
                 + `(${percent(t.falseRejectShare)}); frames not about parking ${t.junkFrames}, `
                 + `let through ${t.junkLetThrough}`);
    }

    // --- calibrating the threshold -------------------------------------------
    out.push("", "===== threshold calibration =====");
    const rows: ThresholdRow[] = [];
    const diverged = new Map<string, string[]>();
    const seen = new Map<string, Set<number>>();
    for (const { label, expected, actual } of pairs) {
      const a = assessAnswer(label, actual, moment, cal);
      const diff = divergence(expected, asShown(actual), a.category, moment, cal);
      for (const [k, v] of Object.entries(a.signals)) {
        if (!seen.has(k)) seen.set(k, new Set());
        seen.get(k)!.add(Number(v.toFixed(3)));
      }
      rows.push({ confidence: a.confidence, category: a.category, diverged: diff.length > 0, label });
      if (diff.length) diverged.set(label, diff);
    }
    rows.sort((x, y) => (x.confidence - y.confidence) || x.category.localeCompare(y.category)
                     || Number(x.diverged) - Number(y.diverged) || x.label.localeCompare(y.label));

    out.push(`Photographs in the calibration: ${rows.length}`,
             `Answer matched the reference: ${rows.length - diverged.size}; disagreed: ${diverged.size}`,
             "", "Disagreeing answers:");
    for (const row of rows.filter((r) => r.diverged)) {
      out.push(`  ${String(row.confidence).padEnd(6)} ${row.category.padEnd(8)} ${row.label}`);
      for (const line of diverged.get(row.label)!) out.push(`           ${line}`);
    }
    out.push("", thresholdTable(rows), "", `Threshold now: ${GOOD_ENOUGH}`);
    nameOutdated();

    const dead = deadSignals(seen);
    if (dead.length) {
      const weight = dead.reduce((sum, k) => sum + WEIGHTS[k], 0);
      out.push("", `Signals that never changed across the set (weight ${weight.toFixed(2)} of 1.00):`);
      for (const k of dead) out.push(`  ${k} (weight ${WEIGHTS[k].toFixed(2)})`);
      out.push("  This is NOT a reason to move their weight onto the others: they are",
               "  constant because the set holds no photograph that would shift them.");
    }
    console.log(out.join("\n"));
  });
});

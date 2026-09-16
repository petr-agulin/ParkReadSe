// Честность набора и замера. Перенесено из `tests/test_accuracy.py` (шаг 8).
//
// Замер держится на наборе, и набор обязан быть объявлен: у каждого снимка
// названо состояние, у каждого ответа есть эталон, покрытие видно числом, а порог
// по-прежнему стоит на том, на чём его посчитали.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { FULL } from "../src/lib/completeness";
import { fingerprint, verdictDifferences, verdictSlice } from "../src/lib/measure";
import { GOOD_ENOUGH } from "../src/lib/present";
import { extractPrompt } from "../src/lib/prompts";
import { DEMO, EXPECTED, PENDING_GROUND_TRUTH, ROOT, assessAnswer, loadPairs,
         loadTriageExpectations, marked, photos } from "./testset";

const intersect = <T>(a: Set<T>, b: Set<T>) => [...a].filter((x) => b.has(x)).sort();

describe("покрытие замера", () => {
  // py: test_accuracy::test_hand_marked_fixtures_are_excluded_from_measurement
  it("затравка в замер не входит", () => {
    // Затравка — тот же эталон; мерить по ней — сравнивать эталон с самим собой.
    // Проверка строит свои ответы, а не смотрит в `demo/`: там затравки уже нет,
    // и тест, опирающийся на рабочий каталог, замолчал бы, когда защита нужна.
    const label = "005-2tim-8-18-parentes-8-15-dubbelpil";
    const doc = JSON.parse(readFileSync(join(EXPECTED, `${label}.json`), "utf-8"));
    const dir = mkdtempSync(join(tmpdir(), "parkread-pairs-"));
    try {
      writeFileSync(join(dir, `${label}.extract.json`),
                    JSON.stringify({ origin: "model", response: doc }));
      writeFileSync(join(dir, "010-forhyrda-platser-tva-pilar.extract.json"),
                    JSON.stringify({ origin: "hand_marked", response: doc }));
      const pairs = loadPairs(EXPECTED, dir, { onlyModel: true });
      const everything = loadPairs(EXPECTED, dir, { onlyModel: false });
      expect(pairs).toHaveLength(1);
      expect(everything).toHaveLength(2);
      expect(pairs[0].label).toBe(label);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // py: test_accuracy::test_every_saved_answer_pairs_with_its_ground_truth
  it("каждый сохранённый ответ находит свой эталон", () => {
    // Ловит рассинхрон: ответ есть, эталон есть, а пара не складывается, потому
    // что имя разошлось при переименовании.
    const pairs = new Set(loadPairs(EXPECTED, DEMO, { onlyModel: true }).map((p) => p.label));
    const answered = new Set(readdirSync(DEMO).filter((f) => f.endsWith(".extract.json"))
                                              .map((f) => f.slice(0, -".extract.json".length)));
    expect(intersect(marked(), answered)).toEqual([...pairs].sort());
  });

  // py: test_accuracy::test_measurement_coverage_is_visible
  it("покрытие — число, и оно не больше числа эталонов", () => {
    // Само число не закрепляется: оно меняется с каждым прогоном.
    expect(loadPairs(EXPECTED, DEMO).length).toBeLessThanOrEqual(marked().size);
  });
});

describe("состояние каждого снимка объявлено", () => {
  const notASign = new Set(Object.keys(loadTriageExpectations()));

  // py: test_accuracy::test_every_photo_is_marked_pending_or_declared_not_a_sign
  it("снимок либо размечен, либо объявлен не знаком, либо ждёт разметки", () => {
    // Без третьего состояния «забыли разметить» неотличимо от «ещё не размечали»,
    // без второго — неразмеченный знак путается с мусором.
    const done = marked();
    const unaccounted = [...photos()].filter((p) => !done.has(p) && !notASign.has(p)
                                                    && !PENDING_GROUND_TRUTH.has(p));
    expect(unaccounted.sort()).toEqual([]);
  });

  // py: test_accuracy::test_a_photo_is_never_in_two_states_at_once
  it("снимок никогда не в двух состояниях сразу", () => {
    expect(intersect(marked(), notASign)).toEqual([]);
    expect(intersect(PENDING_GROUND_TRUTH, notASign)).toEqual([]);
  });

  // py: test_accuracy::test_pending_list_does_not_rot
  it("список ожидающих тает: появился эталон — снимок уходит из списка", () => {
    expect(intersect(PENDING_GROUND_TRUTH, marked())).toEqual([]);
  });

  // py: test_accuracy::test_every_photo_has_a_transcript_section
  it("у каждого снимка есть дословная расшифровка", () => {
    // Расшифровка — первый слой набора: без неё снимок не разметить.
    const text = readFileSync(join(ROOT, "testset", "TRANSCRIPTS.md"), "utf-8");
    const sections = new Set([...text.matchAll(/^## (\d{3}) /gm)].map((m) => m[1]));
    const numbers = new Set([...photos()].map((p) => p.slice(0, 3)));
    expect([...numbers].sort()).toEqual([...sections].sort());
  });
});

describe("порог", () => {
  // py: test_accuracy::test_the_threshold_still_earns_its_value
  it("по-прежнему стоит на том, на чём его посчитали", async () => {
    // Порог 0.9 не выбран, а посчитан, и счёт обязан сходиться и завтра. Сдвинет
    // картину правка промпта, весов или движка — тест назовёт снимок поимённо,
    // и порог придётся пересчитать сознательно.
    const cal = new Calendar();
    const moment = parseNaive("2026-03-02T00:00");
    const pairs = loadPairs(EXPECTED, DEMO, { promptFingerprint: await fingerprint(extractPrompt()) });
    // Пар может не оказаться, если промпт только что правили, а прогона не было.
    // Молча пройти тут нельзя: «проверок 0» выглядит как «всё сошлось».
    expect(pairs.length, "ответов на текущий промпт нет: промпт правили, а прогона не было")
      .toBeGreaterThan(0);

    const escaped: string[] = [];
    for (const { label, expected, actual } of pairs) {
      const diff = verdictDifferences(verdictSlice(expected, moment, cal),
                                      verdictSlice(actual, moment, cal));
      if (!diff.length) continue;
      const a = assessAnswer(label, actual, moment, cal);
      if (a.category === FULL && a.confidence >= GOOD_ENOUGH) escaped.push(label);
    }
    // Побег остался один: `059`. Уверенность 0.998, порогом он не ловится — разбор
    // внутренне непротиворечив, просто прочитан не тот набор условий.
    expect(escaped).toEqual(["059-avstand-p-skiva-2tim-darefter-avgift"]);
  });
});

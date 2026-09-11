// Снимок → ответ. Порт `parkread/pipeline.py`.
//
// Порядок стадий обязательный и обратного хода не имеет: отсев → извлечение →
// движок → полнота. Категория полноты считается ПОСЛЕ движка, потому что ей нужны
// и флаги извлечения, и неопределённости движка. Правило асимметрии применяется
// последним: сузить можно, расширить нельзя.

import { Calendar } from "./calendar";
import type { Naive } from "./civil";
import { applyAsymmetry, grade, tooLittle, type Assessment } from "./completeness";
import { evaluateParkingRules, type Evaluation } from "./engine";
import { toJson } from "./present";
import { recognise, type Recognised } from "./reference";
import type { SignDoc } from "./sign";
import { classifyImage, extractSignData, isParkingSign,
         type ExtractOutcome, type Photo, type Provider,
         type TriageOutcome } from "./vision";

export type Outcome = {
  image: string;
  stoppedAt: string | null;             // "triage" | "extraction" | null
  reason: string | null;
  triage: TriageOutcome | null;
  extraction: ExtractOutcome | null;
  recognised: Recognised | null;
  flags: string[];
};

export type Analysis = {
  outcome: Outcome;
  assessment: Assessment;
  evaluation: Evaluation | null;
};

export type RunOptions = {
  triageEnforce?: boolean;
  pause?: (ms: number) => Promise<unknown>;
  fetchImpl?: typeof fetch;
};

/** Один снимок через обе стадии.
 *
 *  Отсев возвращает МЕТКУ; останавливает конвейер этот код. */
export async function run(image: Photo, provider: Provider,
                          options: RunOptions = {}): Promise<Outcome> {
  const { triageEnforce = true, pause, fetchImpl } = options;
  const deps = { pause, fetchImpl };

  const tri = await classifyImage(image, provider, deps);

  if (!isParkingSign(tri) && triageEnforce) {
    return { image: image.name, stoppedAt: "triage",
             reason: tri.whatISee || tri.category,
             triage: tri, extraction: null, recognised: null, flags: [] };
  }

  let ext = await extractSignData(image, provider, tri.panelsBelowMainSign, deps);

  // Прочитано слишком мало — спросить ЕЩЁ РАЗ, но ровно один.
  //
  // Найдено разработчиком в браузере: `049` и `056` с первой попытки дали
  // «прочитано слишком мало», со второй разобрались целиком. Отказ провайдера
  // тут ни при чём — он повторяется сам и в разбор не превращается. Это разброс
  // самой модели: один снимок, один вопрос, разные ответы.
  let retried = false;
  if (ext.validation.data !== null && !ext.validation.schemaErrors.length
      && ext.data !== null && tooLittle(ext.data)) {
    const again = await extractSignData(image, provider, tri.panelsBelowMainSign, deps);
    retried = true;
    // Второй ответ берётся, только если он лучше: одинаково плохие ответы
    // менять местами незачем.
    if (again.data !== null && !again.validation.schemaErrors.length
        && !tooLittle(again.data)) {
      ext = again;
    }
  }

  if (ext.data === null || ext.validation.schemaErrors.length) {
    return { image: image.name, stoppedAt: "extraction",
             reason: ext.validation.schemaErrors.slice(0, 3).join("; "),
             triage: tri, extraction: ext, recognised: null, flags: [] };
  }

  const rec = recognise(ext.data);
  const flags = [...ext.validation.flags];
  if (retried) flags.push("extraction_retried");
  // Не остановились только потому, что отсев не обязателен.
  if (!isParkingSign(tri)) flags.push(`triage_said:${tri.category}`);
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const uninterpreted = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (uninterpreted.length) {
    flags.push("uninterpreted_panels:" + uninterpreted.join(","));
  }

  return { image: image.name, stoppedAt: null, reason: null,
           triage: tri, extraction: ext, recognised: rec, flags };
}

/** Снимок → полный разбор. Полнота считается после движка; асимметрия — последней. */
export async function analyze(image: Photo, provider: Provider, moment: Naive,
                              cal: Calendar, options: RunOptions = {}): Promise<Analysis> {
  const outcome = await run(image, provider, options);

  if (outcome.stoppedAt === "triage") {
    return { outcome,
             assessment: grade(null, { triageCategory: outcome.triage!.category }),
             evaluation: null };
  }
  if (outcome.stoppedAt === "extraction") {
    return { outcome, assessment: grade(null, { schemaValid: false }), evaluation: null };
  }

  const doc = outcome.extraction!.data as SignDoc;
  const ev = evaluateParkingRules(doc, moment, cal);
  const assessment = grade(doc, {
    flags: outcome.flags,
    repairs: outcome.extraction!.validation.repairs,
    evaluation: ev,
    imagePixels: null,           // размер снимка знает вызывающий экран
  });
  return { outcome, assessment, evaluation: applyAsymmetry(ev, assessment) };
}

/** Ответ в той же форме, в какой его отдавал питон: страница не различает,
 *  кто его посчитал. */
export function answer(analysis: Analysis, moment: Naive, cal: Calendar) {
  const out = analysis.outcome;
  return toJson({
    doc: out.extraction?.data ?? null,
    recognised: out.recognised,
    assessment: analysis.assessment,
    evaluation: analysis.evaluation,
    stoppedAt: out.stoppedAt,
    reason: out.reason,
    flags: out.flags,
    triage: out.triage
      ? { category: out.triage.category, what_i_see: out.triage.whatISee,
          panels_below_main_sign: out.triage.panelsBelowMainSign }
      : null,
  }, moment, cal);
}

// Photograph → answer. A port of `parkread/pipeline.py`.
//
// The order of the stages is obligatory and has no way back: triage → extraction →
// engine → completeness. The category of completeness is counted AFTER the engine,
// because it needs both the flags of the extraction and the uncertainties of the
// engine. The rule of asymmetry is applied last: narrowing is allowed, widening is
// not.

import { Calendar } from "./calendar";
import type { Naive } from "./civil";
import { applyAsymmetry, grade, tooLittle, type Assessment } from "./completeness";
import { evaluateParkingRules, type Evaluation } from "./engine";
import { pixels } from "./photo";
import { toJson } from "./present";
import { recognise, type Recognised } from "./reference";
import type { SignDoc } from "./sign";
import { classifyImage, extractSignData, isParkingSign, sleep,
         type ExtractOutcome, type Failure, type Patience, type Pause, type Photo,
         type Provider, type TriageOutcome } from "./vision";

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

/** Where the reading is, for the screen: which call is under way, and - when the
 *  provider refused and a retry waits - why, how long, and which attempt comes next. */
export type Progress = {
  stage: "check" | "read";
  // No "of how many": a budget of time, not a count, decides when the retries end.
  retry?: { inMs: number; next: number; kind: Failure };
};

export type RunOptions = {
  triageEnforce?: boolean;
  pause?: Pause;
  fetchImpl?: typeof fetch;
  patience?: Patience;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
};

/** One photograph through both stages.
 *
 *  The triage returns a MARK; stopping the pipeline is this code's doing. */
export async function run(image: Photo, provider: Provider,
                          options: RunOptions = {}): Promise<Outcome> {
  const { triageEnforce = true, fetchImpl, patience, signal, onProgress } = options;
  const pause = options.pause ?? sleep;
  let stage: Progress["stage"] = "check";
  const tell = onProgress ?? (() => {});
  const deps = {
    fetchImpl, patience, signal,
    // A retry is waited out in the open: the screen learns why and for how long.
    pause: ((ms, why, attempt, info) => {
      tell({ stage, retry: { inMs: ms, next: (attempt ?? 0) + 1,
                             kind: info?.kind ?? "other" } });
      return pause(ms, why, attempt, info);
    }) as Pause,
  };

  tell({ stage });
  const tri = await classifyImage(image, provider, deps);

  if (!isParkingSign(tri) && triageEnforce) {
    return { image: image.name, stoppedAt: "triage",
             reason: tri.whatISee || tri.category,
             triage: tri, extraction: null, recognised: null, flags: [] };
  }

  stage = "read";
  tell({ stage });
  let ext = await extractSignData(image, provider, tri.panelsBelowMainSign, deps);

  // Too little was read — ask AGAIN, but exactly once.
  //
  // Found by the developer in the browser: `049` and `056` gave "too little was read"
  // at the first attempt and were read whole at the second. A refusal by the provider
  // has nothing to do with it — that repeats itself and does not turn into a reading.
  // This is the spread of the model itself: one photograph, one question, different
  // answers.
  let retried = false;
  if (ext.validation.data !== null && !ext.validation.schemaErrors.length
      && ext.data !== null && tooLittle(ext.data)) {
    tell({ stage });
    const again = await extractSignData(image, provider, tri.panelsBelowMainSign, deps);
    retried = true;
    // The second answer is taken only if it is the better one: there is no sense in
    // swapping two equally poor answers around.
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
  // We did not stop, and only because the triage is not obligatory.
  if (!isParkingSign(tri)) flags.push(`triage_said:${tri.category}`);
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const uninterpreted = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (uninterpreted.length) {
    flags.push("uninterpreted_panels:" + uninterpreted.join(","));
  }

  return { image: image.name, stoppedAt: null, reason: null,
           triage: tri, extraction: ext, recognised: rec, flags };
}

/** Photograph → the full reading. The completeness is counted after the engine; the
 *  asymmetry last of all. */
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
  // The area of the frame is counted by the pipeline itself. `null` used to go here —
  // "the calling screen knows the size" — and not one screen ever passed it: the
  // signal always gave a full mark at a weight of 0.10, and the reason about too few
  // pixels was out of reach. The real size was known to the measurement and the tests
  // alone, that is, to precisely what the threshold was calibrated on. The photograph
  // lies in `image.data`, and there is no need to ask the caller for it.
  const assessment = grade(doc, {
    flags: outcome.flags,
    repairs: outcome.extraction!.validation.repairs,
    evaluation: ev,
    imagePixels: pixels(new Uint8Array(await image.data.arrayBuffer())),
  });
  return { outcome, assessment, evaluation: applyAsymmetry(ev, assessment) };
}

/** The answer in the same shape Python used to give it: the page does not tell who
 *  counted it. */
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

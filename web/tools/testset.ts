// The set of photographs and the model's saved answers — what the measurement rests
// on. A port of the loading of pairs and triage expectations from
// `parkread/accuracy.py` (step 8).
//
// **For the developer only, and on Node only:** it reads the disk. The application
// does not import this file and it does not reach the build — like `measure/` and
// `build/`.

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
export const ANSWERS = join(ROOT, "testset", "answers");
export const PHOTOS = join(ROOT, "testset", "photos");
export const TRIAGE_EXPECTED = join(ROOT, "testset", "triage_expected.json");

// Photographs added to the set but not yet marked. The list is temporary and must
// empty out: while a photograph is here it is not in the measurement and confirms no
// quality. Keeping it explicit is more honest than loosening the check: "no ground
// truth" and "ground truth forgotten" are different things, told apart only by naming
// what is expected.
export const PENDING_GROUND_TRUTH = new Set<string>([
  "110-avgift-2tim-smal-gata",
  "111-2tim-gul-skylt-vid-klippa",
  "112-p-1tim-parkeringsyta",
  "113-avgift-alla-dagar-utanfor-platser",
  "114-avgift-taxa-boende-vid-vaggmalning",
  "115-avgift-taxa-pil-ned",
  "116-p-gul-skylt-vid-restaurang",
  "117-p-0-6m-plus-huvudled",
  "118-p-plus-huvudled-pa-avstand",
  "119-p-liten-skylt-vid-hack",
  "120-p-7-dygn-plus-huvudled",
  "121-p-med-pil-vid-vag",
  "122-p-3tim-pil-hoger",
  "123-p-med-plattor-vid-torg",
  "124-p-gul-skylt-i-gronska",
  "125-p-gula-plattor-vid-port",
  "126-avgift-7-19-fred-0-6",
  "127-cykel-0-12m",
  "128-rorelsehindrad-0-6m-avgift",
  "129-laddning-plus-overgangsstalle-30",
  "130-2tim-avgift-torsd-vid-butik",
  "131-p-uppstallning-pil-i-sno",
  "132-avgift-boende-i-sno",
  "133-24tim-besokande-tillstand-1-plats",
  "134-p-plattor-plus-forbud-stannande",
  "135-avgift-boende-rott-tegelhus",
  "136-forhyrda-platser-pilar-1-plats",
  "137-forhyrda-platser-securitas",
  "138-forhyrda-platser-2-platser",
  "139-p-1tim-alla-dagar-avgift-torsdag",
]);

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));
const stem = (file: string) => file.replace(/\.[^.]+$/, "");

/** Every photograph of the set. Both extensions are checked: part of the set came as
 *  png, and a `*.jpg` mask once simply failed to see fourteen photographs in forty. */
export function photos(): Set<string> {
  return new Set(readdirSync(PHOTOS).filter((f) => /\.(jpg|png)$/i.test(f)).map(stem));
}

/** The marked photographs — those with a ground-truth reading. */
export function marked(dir = EXPECTED): Set<string> {
  return new Set(readdirSync(dir).filter((f) => f.endsWith(".json")).map(stem));
}

export type Pair = { label: string; expected: SignDoc; actual: SignDoc };

/** Pairs of "ground truth — the model's answer".
 *
 *  `onlyModel` cuts out the `hand_marked` seed: measuring the model against a ground
 *  truth the model did not write means comparing the ground truth with itself.
 *  `promptFingerprint` cuts out answers obtained with ANOTHER prompt: mixing two
 *  versions of the prompt into one number is exactly what the fingerprint was
 *  introduced against (photograph `038`). */
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

/** Photographs whose saved answer came from another prompt. They may be neither
 *  counted nor quietly forgotten: a silent skip looks like "there is no such photo". */
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

/** The photographs that are NOT parking signs, and what the triage should find them
 *  to be. A file of their own rather than a conclusion from a missing ground truth:
 *  "not written yet" and "never to be written" are different things. */
export function loadTriageExpectations(path = TRIAGE_EXPECTED): Record<string, string> {
  return existsSync(path) ? readJson(path).photos ?? {} : {};
}

export const UNREADABLE = join(ROOT, "testset", "unreadable.json");

/** Parking signs nobody can read in the photograph (decision 176). A state of their
 *  own: they are parking signs, so they do not belong with the photographs triage
 *  should call something else, and there is nothing to read for a ground truth. */
export function loadUnreadable(path = UNREADABLE): Set<string> {
  return new Set(existsSync(path) ? readJson(path).photos ?? [] : []);
}

/** What the triage answered on each photograph — the model's real answers only. */
export function triageAnswers(fixturesDir = ANSWERS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith(".triage.json")).sort()) {
    const d = readJson(join(fixturesDir, file));
    if ((d.origin ?? "model") !== "model") continue;
    out[file.slice(0, -".triage.json".length)] = String(d.response?.category ?? "");
  }
  return out;
}

export type Assessed = { confidence: number; category: string; signals: Record<string, number> };

/** The completeness and confidence of an answer — as the pipeline would count them on
 *  this photograph: with the triage's independent count of plates, and the size of the
 *  photograph itself. */
/** The reading as the product would use it TODAY: validated, and repaired.
 *
 *  A saved answer was repaired by the rules there were when it was saved, not by any
 *  added since. The VERDICT must come from the same reading the confidence is graded
 *  on: after step 15f the repair for a disc symbol lowered `063`'s confidence while its
 *  verdict was still taken from the unrepaired answer, and the measurement called it an
 *  escape the product would never show. The field-by-field comparison stays on the raw
 *  answer - that one measures what the MODEL read, and a repair is not the model's. */
export function asShown(actual: SignDoc): SignDoc {
  const res = validateSign(structuredClone(actual));
  return ok(res) && res.data ? res.data : actual;
}

export function assessAnswer(label: string, actual: SignDoc, moment: Naive,
                             cal: Calendar): Assessed {
  const triageFile = join(ANSWERS, `${label}.triage.json`);
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

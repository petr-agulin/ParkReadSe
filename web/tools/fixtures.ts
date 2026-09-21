// The model's saved answers, and the rules by which they go stale. A port of
// `parkread/fixtures.py` (step 8).
//
// Every real answer of the model on a photograph of the set is saved: the measurement
// is built from them, and the same input gives the same output. The main question of
// this module is **whether a photograph must be asked about again**: only an answer
// to THE SAME question may be skipped, or the measurement would quietly mix two
// versions of the prompt into one number.
//
// For the developer only, and on Node only. Users' photographs never come here: what
// is saved is the model's answer on a photograph from the author's set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { fingerprint } from "../src/lib/measure";

const fileOf = (root: string, image: string, stage: string) =>
  join(root, `${basename(image, extname(image))}.${stage}.json`);

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));

/** Whether to ask about a photograph again: yes — if there is no answer, if it was
 *  marked by hand, or if it came from another prompt. With no fingerprint too: there
 *  is then nothing to prove which prompt the answer came from. */
export async function stale(root: string, image: string, stage: string,
                            prompt: string): Promise<boolean> {
  const p = fileOf(root, image, stage);
  if (!existsSync(p)) return true;
  const doc = readJson(p);
  if ((doc.origin ?? "model") !== "model") return true;
  return doc.prompt_fingerprint !== await fingerprint(prompt);
}

/** The triage has already answered that the photograph is not a parking sign. Then
 *  there was and will be no extraction, and its missing answer is no reason to ask
 *  about the photograph for ever.
 *
 *  What is looked at is the saved ANSWER, not the freshness of the prompt: if the
 *  triage prompt changes, the photograph goes stale through its own stage anyway. */
export function refused(root: string, image: string): boolean {
  const p = fileOf(root, image, "triage");
  if (!existsSync(p)) return false;
  const doc = readJson(p);
  if ((doc.origin ?? "model") !== "model") return false;
  return (doc.response ?? {}).category !== "parking_sign";
}

export function load(root: string, image: string, stage: string): unknown {
  const p = fileOf(root, image, stage);
  return existsSync(p) ? readJson(p).response : null;
}

/** Save an answer of the model. The format is the one Python wrote: the measurement
 *  and the freshness check read old and new answers alike. */
export async function save(root: string, image: string, stage: string, response: unknown,
                           model: string, usage: unknown,
                           prompt: string | null = null): Promise<string> {
  mkdirSync(root, { recursive: true });
  const p = fileOf(root, image, stage);
  const doc = {
    image: basename(image),
    stage,
    model,
    prompt_fingerprint: prompt !== null ? await fingerprint(prompt) : null,
    saved_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    usage,
    response,
  };
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n", "utf-8");
  return p;
}

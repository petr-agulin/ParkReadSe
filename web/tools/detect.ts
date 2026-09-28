// How well the frame suggested on a photograph from the gallery catches the sign
// (step 17). For the developer only, and on Node only: it needs the photographs.
//
//     npm run detect      # judge every marked photograph, write testset/detect.json
//
// The frame judged is the one the screen would show: the suggestion, and without one
// the centred frame. The suggestion comes through the same code as in the browser -
// `regionsFromPixels` and `suggestFromRegions` - fed from a decoded file instead of a
// canvas.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { regionsFromPixels, scanSize, suggestFromRegions } from "../src/lib/anchor";
import { defaultBox, type Box } from "../src/lib/crop";
import { judge, rounded, type FramesFile, type Grade } from "./frames";
import { photo, reduce } from "./pixels";
import { PHOTOS, ROOT, photoIndex } from "./testset";

export const FRAMES = join(ROOT, "testset", "frames.json");
export const DETECT = join(ROOT, "testset", "detect.json");

export type Judged = {
  grade: Grade;
  covers: number;
  fills: number;
  /** Whether the detector proposed a frame at all, or the screen centred one. */
  suggested: boolean;
  frame: Box;
};

/** The frame the screen would show on these bytes. */
export function frameFor(bytes: Uint8Array): { frame: Box; suggested: boolean } {
  const full = photo(bytes);
  const image = { w: full.w, h: full.h };
  const small = reduce(full, scanSize(image));
  const suggestion = suggestFromRegions(regionsFromPixels(small.data, small.w, small.h, image),
                                        image);
  return { frame: suggestion ?? defaultBox(image), suggested: suggestion !== null };
}

function main() {
  if (!existsSync(PHOTOS)) {
    console.log("no testset/photos/ here - nothing to measure");
    return;
  }
  if (!existsSync(FRAMES)) {
    console.log("no testset/frames.json yet - mark the photographs on mark.html first");
    return;
  }
  const truth = (JSON.parse(readFileSync(FRAMES, "utf-8")) as FramesFile).frames;
  const index = photoIndex();
  const results: Record<string, Judged> = {};
  let noSign = 0;
  const unmarked: string[] = [];

  for (const [name, entry] of Object.entries(index)) {
    if (!(name in truth)) { unmarked.push(name); continue; }
    const sign = truth[name];
    if (sign === null) { noSign++; continue; }
    const { frame, suggested } = frameFor(new Uint8Array(readFileSync(join(PHOTOS, entry.file))));
    const v = judge(sign, frame);
    results[name] = { ...v, covers: +v.covers.toFixed(3), fills: +v.fills.toFixed(3),
                      suggested, frame: rounded(frame) };
  }

  const count = (g: Grade) => Object.values(results).filter((r) => r.grade === g).length;
  const summary = { good: count("good"), tolerable: count("tolerable"), wrong: count("wrong"),
                    centred: Object.values(results).filter((r) => !r.suggested).length,
                    noSign, unmarked: unmarked.length };
  writeFileSync(DETECT, JSON.stringify({
    _: "How the frame suggested on each marked photograph catches the sign (npm run detect, "
       + "step 17). good: covers >= 95% of the sign, the sign fills >= 30% of the frame; "
       + "tolerable: >= 80% and >= 10%; otherwise wrong. centred: no suggestion, the "
       + "screen's centred frame was judged.",
    summary, photos: results,
  }, null, 1) + "\n");

  const judged = Object.keys(results).length;
  console.log(`judged ${judged}: good ${summary.good}, tolerable ${summary.tolerable}, `
              + `wrong ${summary.wrong} (of them centred: ${summary.centred})`);
  console.log(`no sign ${noSign}, not marked yet ${unmarked.length}`);
  const wrong = Object.entries(results).filter(([, r]) => r.grade === "wrong")
    .map(([n, r]) => `${n.slice(0, 3)}${r.suggested ? "" : "*"}`);
  if (wrong.length) console.log(`wrong: ${wrong.join(" ")}   (* - centred, no suggestion)`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/detect.ts")) main();

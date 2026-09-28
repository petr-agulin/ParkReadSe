// Where the sign really is on each photograph of the set, and how a suggested frame is
// judged against it (step 17).
//
// Pure: no disk, no page. The marking page (`mark.html`) and the measurement
// (`npm run detect`) both judge by this one code.

import type { Box } from "../src/lib/crop";

/** The sign's box in the pixels of the upright photograph, or `null`: no sign on it. */
export type Frames = Record<string, Box | null>;

export type FramesFile = { _: string; frames: Frames };

export const FRAMES_NOTE = "Where the sign is on each photograph of the set: a box in the "
  + "pixels of the upright photograph (EXIF orientation applied, as a browser shows it), "
  + "or null where there is no sign. Marked by the developer on mark.html (npm run dev); "
  + "judged by npm run detect. The photographs themselves stay on the developer's disk.";

/** Good: the frame holds (nearly) all of the sign, and the sign is a fair part of it. */
export const GOOD = { covers: 0.95, fills: 0.3 };
/** Tolerable: most of the sign, and the sign still findable in the frame. */
export const TOLERABLE = { covers: 0.8, fills: 0.1 };

export type Grade = "good" | "tolerable" | "wrong";

export type Verdict = {
  grade: Grade;
  /** The share of the sign inside the frame. */
  covers: number;
  /** The share of the frame the sign takes up. */
  fills: number;
};

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** How well a frame catches the sign. */
export function judge(sign: Box, frame: Box): Verdict {
  const common = overlap(sign, frame);
  const covers = area(sign) ? common / area(sign) : 0;
  const fills = area(frame) ? common / area(frame) : 0;
  const grade: Grade =
    covers >= GOOD.covers && fills >= GOOD.fills ? "good"
    : covers >= TOLERABLE.covers && fills >= TOLERABLE.fills ? "tolerable"
    : "wrong";
  return { grade, covers, fills };
}

/** A box as it is stored: whole pixels. */
export const rounded = (b: Box): Box => ({
  x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h),
});

// A suggestion for the frame: where the main sign is on the photograph.
//
// This is NOT a detector. A search like this was already tried as one and failed: it
// lost white plates and never gathered a whole stack. Here its job is easier - put
// the frame where the sign probably is, so that most of the time the person only has
// to press "send". A mistake is visible on screen and corrected with one movement,
// so a wrong suggestion costs a second rather than an answer.
//
// Only the **main sign** is looked for: it is always coloured - a blue `P` or a
// prohibition. How far the plates run is not guessed but taken generously downwards.

import type { Box, Size } from "./crop";
import { clamp } from "./crop";

/** A patch of colour found, in the pixels of the original photograph. */
export type Region = {
  x: number; y: number; w: number; h: number;
  /** How many pixels are actually filled: the patch has to be solid. */
  area: number;
  kind: "blue" | "yellow";
  /** The share of light pixels inside the patch. A `P` sign has a white letter
   *  inside; the blue strip of a number plate has almost nothing. That is what
   *  tells a sign from a car. */
  white: number;
};

/** The width of the reduced copy the search runs on. Larger is slower and gains
 *  nothing: a sign in a phone photograph covers dozens of points even here. */
export const SCAN_WIDTH = 320;

/** Below this share of the frame it is noise: a glare, a sticker, a piece of sky. */
export const MIN_AREA_SHARE = 0.0006;

/** Above this share it is not a sign but a wall, a car, or the sky itself. */
export const MAX_AREA_SHARE = 0.25;

/** A main sign is close to square: `P` in a square, a prohibition a circle in one. */
export const MIN_ASPECT = 0.45;
export const MAX_ASPECT = 2.2;

/** The patch must fill its own box: on a sign the fill is close to one, on a random
 *  smear it is not. */
export const MIN_FILL = 0.5;

/** How many times wider than the sign the frame is: the plates below it are usually
 *  wider than the sign itself. */
export const WIDTH_FACTOR = 1.9;

/** How many sign heights the frame reaches downwards **when no plates are visible**.
 *  If they are found, the extent is taken from them rather than from this number. */
export const DOWN_FACTOR = 4.5;

/** How far below the anchor plates of the same column are still looked for. */
export const COLUMN_REACH = 6;

/** How much white belongs inside a sign: the letter on a `P`, the words on a
 *  wayfinding sign. Too little happens on the blue strip of a number plate and on a
 *  painted wall; too much happens on a window. */
export const WHITE_MIN = 0.04;
export const WHITE_MAX = 0.65;

/** A little room above the sign, so it does not press against the edge of the frame. */
export const UP_FACTOR = 0.25;

function plausible(r: Region, image: Size): boolean {
  const share = (r.w * r.h) / (image.w * image.h);
  const aspect = r.w / r.h;
  const fill = r.area / (r.w * r.h);
  return (
    share >= MIN_AREA_SHARE && share <= MAX_AREA_SHARE &&
    aspect >= MIN_ASPECT && aspect <= MAX_ASPECT &&
    fill >= MIN_FILL
  );
}

/** Whether this patch holds the anchor inside itself. That is how the zone sign E20
 *  is built: a blue circle sits inside a yellow square, and the square is part of
 *  the same sign rather than a neighbour below it. */
function encloses(r: Region, anchor: Region): boolean {
  const pad = anchor.h * 0.25;
  return (
    r.x <= anchor.x + pad && r.y <= anchor.y + pad &&
    r.x + r.w >= anchor.x + anchor.w - pad &&
    r.y + r.h >= anchor.y + anchor.h - pad
  );
}

/**
 * The patches belonging to the same sign: the plates hanging under the anchor, and
 * the background it sits in.
 *
 * "Below" alone is not enough. On a zone sign (E20) and on "Parkering forbjuden" the
 * blue circle sits INSIDE a yellow shield: vertically the shield starts higher and
 * ends lower, and a rule about neighbours below lost it - the frame cut the sign
 * down to the circle.
 */
export function columnAround(anchor: Region, regions: Region[]): Region[] {
  const reach = anchor.h * COLUMN_REACH;
  return regions.filter((r) => {
    if (r === anchor) return false;
    if (encloses(r, anchor)) return true;
    const overlap = Math.min(r.x + r.w, anchor.x + anchor.w) - Math.max(r.x, anchor.x);
    if (overlap < Math.min(r.w, anchor.w) * 0.35) return false;
    const gapBelow = r.y - (anchor.y + anchor.h);
    const gapAbove = anchor.y - (r.y + r.h);
    return gapBelow > -anchor.h && gapBelow < reach && gapAbove < anchor.h * 1.5;
  });
}

/**
 * Which patch to treat as the main sign.
 *
 * Colour and size prove nothing on their own: the blue strip of a number plate and a
 * yellow wall pass such a check as well as a sign does - and on the measurement they
 * did. So corroboration from elsewhere is required: white inside the patch (the
 * letter `P`, lettering) or plates standing with it in one column. Without
 * corroboration there is no suggestion at all - pointing confidently at somebody
 * else's car is worse than staying silent.
 */
export function pickAnchor(regions: Region[], image: Size): Region | null {
  let best: Region | null = null;
  let bestScore = 0;
  for (const r of regions) {
    // A main sign in Sweden is blue: E19 "P", and the prohibitions are a blue circle
    // with red. Yellow is always a plate BELOW the sign and can never be the anchor:
    // on the measurement the frame landed on the yellow facade of a building whose
    // balconies gave it exactly that column. Yellow still joins a column, or the
    // stack would not be gathered whole.
    if (r.kind !== "blue") continue;
    if (!plausible(r, image)) continue;
    const hasWhite = r.white >= WHITE_MIN && r.white <= WHITE_MAX;
    const column = columnAround(r, regions);
    if (!hasWhite && column.length === 0) continue;   // no corroboration

    // The higher in the frame, the likelier this is the top of the stack.
    const height = 1 + (1 - (r.y + r.h / 2) / image.h) * 0.5;
    const evidence = (hasWhite ? 1.5 : 1) * (1 + Math.min(column.length, 3) * 0.4);
    const score = r.area * height * evidence;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

/**
 * The frame around a sign: the sign itself on top, the plates below it.
 *
 * How far the stack runs is taken from the patches found in the column rather than
 * from a number: on the measurement a constant multiplier carried the frame far too
 * low, and on a sign inside a large yellow plate it did the opposite and cut it
 * short. Where no patches are found the reach downwards is still generous: a plate
 * shaved off costs a wrong answer, extra background costs one movement.
 */
export function frameFromAnchor(anchor: Region, image: Size, column: Region[] = []): Box {
  let left = anchor.x;
  let right = anchor.x + anchor.w;
  let top = anchor.y;
  let bottom = anchor.y + anchor.h;
  for (const r of column) {
    left = Math.min(left, r.x);
    right = Math.max(right, r.x + r.w);
    top = Math.min(top, r.y);
    bottom = Math.max(bottom, r.y + r.h);
  }

  if (column.length === 0) {
    bottom = anchor.y + anchor.h * (1 + DOWN_FACTOR);
    const w = anchor.w * WIDTH_FACTOR;
    left = anchor.x + anchor.w / 2 - w / 2;
    right = left + w;
  } else {
    // A little room at the edges: plates often have a pale border, and colour does
    // not catch it.
    const pad = anchor.h * 0.2;
    left -= pad; right += pad; bottom += pad;
  }
  top -= anchor.h * UP_FACTOR;

  return clamp({ x: left, y: top, w: right - left, h: bottom - top }, image);
}

/** Is this pixel light: a white letter, lettering, a border. */
function isWhite(r: number, g: number, b: number): boolean {
  return r > 165 && g > 165 && b > 165;
}

/** Is this pixel's colour a sign's blue or a sign's yellow? */
function classify(r: number, g: number, b: number): 0 | 1 | 2 {
  if (b > 55 && b - r > 30 && b - g > 14 && !(b > 195 && r > 165)) return 1;
  if (r > 95 && g > 70 && r - b > 55 && g - b > 30) return 2;
  return 0;
}

/**
 * Find the patches of colour on a reduced copy of the photograph.
 *
 * This is the only place that needs real pixels, which is why it is thin: the
 * decisions are made by the pure functions above, and the tests hold those. Here
 * there is only the labelling of connected areas.
 */
export function scanRegions(source: CanvasImageSource, image: Size): Region[] {
  const scale = Math.min(1, SCAN_WIDTH / image.w);
  const W = Math.max(1, Math.round(image.w * scale));
  const H = Math.max(1, Math.round(image.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(source, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    mask[p] = classify(data[i], data[i + 1], data[i + 2]);
  }

  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const regions: Region[] = [];
  const k = 1 / scale;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    const kind = mask[p];
    stack.length = 0;
    stack.push(p);
    seen[p] = 1;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % W;
      const qy = (q - qx) / W;
      n++;
      if (qx < x0) x0 = qx;
      if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy;
      if (qy > y1) y1 = qy;
      if (qx > 0 && mask[q - 1] === kind && !seen[q - 1]) { seen[q - 1] = 1; stack.push(q - 1); }
      if (qx < W - 1 && mask[q + 1] === kind && !seen[q + 1]) { seen[q + 1] = 1; stack.push(q + 1); }
      if (qy > 0 && mask[q - W] === kind && !seen[q - W]) { seen[q - W] = 1; stack.push(q - W); }
      if (qy < H - 1 && mask[q + W] === kind && !seen[q + W]) { seen[q + W] = 1; stack.push(q + W); }
    }
    // The share of light pixels inside the patch's box: the letter `P`, lettering,
    // a border.
    let white = 0, cells = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        cells++;
        if (isWhite(data[i], data[i + 1], data[i + 2])) white++;
      }
    }
    regions.push({
      x: x0 * k, y: y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k,
      area: n * k * k,
      kind: kind === 1 ? "blue" : "yellow",
      white: cells ? white / cells : 0,
    });
  }
  return regions;
}

/**
 * A suggested frame for this photograph, or `null` if no sign is visible.
 *
 * A failure of the search is no reason to break the screen: the caller then centres
 * the frame, as it did before.
 */
export function suggestFrame(source: CanvasImageSource, image: Size): Box | null {
  try {
    const regions = scanRegions(source, image);
    const anchor = pickAnchor(regions, image);
    return anchor ? frameFromAnchor(anchor, image, columnAround(anchor, regions)) : null;
  } catch {
    return null;
  }
}

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
  /** The patch's mean saturation. A sign's blue is paint, and saturated; a shadow on
   *  the pavement, asphalt at dusk and a car only lean towards blue (step 17, fix 2). */
  saturation: number;
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

/** A blue patch taller than that is a STACK: on a Swedish pole the blue `P` and the
 *  blue plates under it touch, and the scan sees one tall column. Rejected as "not
 *  square", the real sign lost to a shadow on the pavement on fifteen photographs of
 *  the set (step 17, fix 1). Down to this it is still a column of plates, not a pole
 *  or a drainpipe. */
export const MIN_STACK_ASPECT = 0.12;

/** How far a stack's frame reaches past its own bottom, in its widths: the yellow
 *  plate under a blue stack is usually already a separate patch in the column. */
export const STACK_DOWN = 0.3;

/** Whether this patch is a stack of blue plates rather than one sign. */
export const isStack = (r: Region) => r.w / r.h < MIN_ASPECT;

/** The patch must fill its own box: on a sign the fill is close to one, on a random
 *  smear it is not. */
export const MIN_FILL = 0.5;

/** How many times wider than the sign the frame is: the plates below it are usually
 *  wider than the sign itself. */
export const WIDTH_FACTOR = 1.9;

/** How many sign heights the frame reaches downwards **when no plates are visible**.
 *  If they are found, the extent is taken from them rather than from this number. */
export const DOWN_FACTOR = 4.5;

/** The frame is never wider than this many widths of the sign. A speck of colour in
 *  line with the sign stretched it across the whole photograph (step 17, fix 4).
 *  Only the width is held: the specks below a sign are often pieces of its white
 *  plates - coloured lettering - and they are what carries the frame down over them.
 *  Dropping them as "not plate-sized" cut plates off on sixteen photographs. */
export const FRAME_MAX_WIDTH = 3;

/** The largest a shield around a sign can be, in the sign's areas. On the set: the
 *  shield of `068` is 13-16 times its circle, the facades around `091` and `128` 51-80
 *  times. Anything from 20 to 40 measured the same. */
export const SHIELD_MAX_AREA = 25;

/** How far below the anchor plates of the same column are still looked for. */
export const COLUMN_REACH = 6;

/** How much white belongs inside a sign: the letter on a `P`, the words on a
 *  wayfinding sign. Too little happens on the blue strip of a number plate and on a
 *  painted wall; too much happens on a window. */
export const WHITE_MIN = 0.04;
export const WHITE_MAX = 0.65;

/** The least mean saturation of a main sign's patch (step 17, fix 2). Measured on the
 *  set: signs 0.53-0.83, the shadows and asphalt that beat them 0.23-0.40. It is the
 *  patch's MEAN that is judged: the same bar on every pixel broke real signs apart -
 *  their shaded edges and the gaps between letters are greyish too - and the
 *  measurement fell at every value tried. */
export const SIGN_SATURATION = 0.45;

/** How much size counts in the choice: the square root, the patch's linear size
 *  (step 17, fix 3). By area itself a large wrong patch beat a small real sign - the
 *  cars on `112`, a third of the width, against the sign beside them. */
export const AREA_WEIGHT = 0.5;

/** A little room above the sign, so it does not press against the edge of the frame. */
export const UP_FACTOR = 0.25;

function plausible(r: Region, image: Size): boolean {
  const share = (r.w * r.h) / (image.w * image.h);
  const aspect = r.w / r.h;
  const fill = r.area / (r.w * r.h);
  return (
    share >= MIN_AREA_SHARE && share <= MAX_AREA_SHARE &&
    aspect >= MIN_STACK_ASPECT && aspect <= MAX_ASPECT &&
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
    if (r.saturation < SIGN_SATURATION) continue;
    const hasWhite = r.white >= WHITE_MIN && r.white <= WHITE_MAX;
    const column = columnAround(r, regions);
    if (!hasWhite && column.length === 0) continue;   // no corroboration

    // The higher in the frame, the likelier this is the top of the stack.
    const height = 1 + (1 - (r.y + r.h / 2) / image.h) * 0.5;
    const evidence = (hasWhite ? 1.5 : 1) * (1 + Math.min(column.length, 3) * 0.4);
    const score = Math.pow(r.area, AREA_WEIGHT) * r.saturation * height * evidence;
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

  if (column.length === 0 && isStack(anchor)) {
    // The stack is its own extent: nothing is guessed below it.
    const pad = anchor.w * STACK_DOWN;
    bottom += pad;
    left -= pad; right += pad;
  } else if (column.length === 0) {
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
  // A sign inside a shield - the prohibition circle in its yellow square, E20 - is as
  // wide as the shield: measured by the circle, the cap cut the wide plates off `068`.
  // A facade the sign hangs on encloses it too, and would lift the cap altogether
  // (`091`, `128`); a shield is told from it by size.
  const shields = column.filter((r) => encloses(r, anchor)
                                      && r.w * r.h <= anchor.w * anchor.h * SHIELD_MAX_AREA);
  const signWidth = Math.max(anchor.w, ...shields.map((r) => r.w));
  const centre = anchor.x + anchor.w / 2;
  const half = (signWidth * FRAME_MAX_WIDTH) / 2;
  left = Math.max(left, centre - half);
  right = Math.min(right, centre + half);

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

/** The size of the reduced copy the search runs on. */
export function scanSize(image: Size): Size {
  const scale = Math.min(1, SCAN_WIDTH / image.w);
  return { w: Math.max(1, Math.round(image.w * scale)), h: Math.max(1, Math.round(image.h * scale)) };
}

/**
 * The patches of colour in a reduced copy, given as RGBA bytes (`W` by `H`), in the
 * pixels of the original photograph (`image`).
 *
 * Pure: no canvas, no page. The browser feeds it from a canvas, the measurement of
 * the frame (`npm run detect`, step 17) from a decoded file - and both run this one
 * code rather than two copies of it.
 */
export function regionsFromPixels(data: ArrayLike<number>, W: number, H: number,
                                  image: Size): Region[] {
  const mask = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; i += 4, p++) {
    mask[p] = classify(data[i], data[i + 1], data[i + 2]);
  }

  const seen = new Uint8Array(W * H);
  const stack: number[] = [];
  const regions: Region[] = [];
  const k = image.w / W;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || seen[p]) continue;
    const kind = mask[p];
    stack.length = 0;
    stack.push(p);
    seen[p] = 1;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, saturation = 0;
    while (stack.length) {
      const q = stack.pop()!;
      const qx = q % W;
      const qy = (q - qx) / W;
      n++;
      const at = q * 4;
      const top = Math.max(data[at], data[at + 1], data[at + 2]);
      saturation += top ? (top - Math.min(data[at], data[at + 1], data[at + 2])) / top : 0;
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
      saturation: saturation / n,
    });
  }
  return regions;
}

/**
 * Find the patches of colour on a reduced copy of the photograph. The only place that
 * needs a page: it draws, and hands the pixels on.
 */
export function scanRegions(source: CanvasImageSource, image: Size): Region[] {
  const { w: W, h: H } = scanSize(image);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  // Averaging rather than picking every tenth pixel: the white letter of a `P` is
  // thin, and a plain reduction steps over it. It is also what the measurement does,
  // so the two see the same picture (step 17).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, W, H);
  return regionsFromPixels(ctx.getImageData(0, 0, W, H).data, W, H, image);
}

/** The frame the patches point to, or `null` if none of them is a sign. */
export function suggestFromRegions(regions: Region[], image: Size): Box | null {
  const anchor = pickAnchor(regions, image);
  return anchor ? frameFromAnchor(anchor, image, columnAround(anchor, regions)) : null;
}

/**
 * A suggested frame for this photograph, or `null` if no sign is visible.
 *
 * A failure of the search is no reason to break the screen: the caller then centres
 * the frame, as it did before.
 */
export function suggestFrame(source: CanvasImageSource, image: Size): Box | null {
  try {
    return suggestFromRegions(scanRegions(source, image), image);
  } catch {
    return null;
  }
}

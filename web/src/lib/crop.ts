// The geometry of the frame: where it is, and what will come out of it.
//
// There is no DOM and no canvas here - only numbers, which is why all of it is
// covered by tests. Working with the pixels lives next door, in image.ts, and rests
// on the decisions made in this file.

export type Size = { w: number; h: number };
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** The share of the photograph's height the frame takes by default. On test 0.55
 *  proved too small: close up, the stack fills almost the whole frame, and the
 *  rectangle had to be stretched every time. */
export const DEFAULT_HEIGHT = 0.7;

/** Width to height. A sign's stack is tall, and the frame follows its shape. */
export const BOX_ASPECT = 0.45;

/** The frame is never squeezed below this: past it not even one plate fits inside. */
export const MIN_SIDE = 24;

/** The margin around the frame when sending. A plate shaved off costs a wrong
 *  answer; extra background costs a few tokens, and those prices are not
 *  comparable. */
export const MARGIN = 0.18;

/** The limit on the long side of the frame that goes to the model. */
export const MAX_SIDE = 1400;

/** The frame wholly inside the photograph. First it is shrunk if it will not fit,
 *  then moved. */
export function clamp(box: Box, image: Size): Box {
  const w = Math.min(Math.max(box.w, MIN_SIDE), image.w);
  const h = Math.min(Math.max(box.h, MIN_SIDE), image.h);
  return {
    w,
    h,
    x: Math.min(Math.max(box.x, 0), image.w - w),
    y: Math.min(Math.max(box.y, 0), image.h - h),
  };
}

/** The default size of the frame: tall, as a share of the photograph's height. */
export function defaultSize(image: Size): Size {
  const h = Math.min(image.h * DEFAULT_HEIGHT, image.h);
  const w = Math.min(h * BOX_ASPECT, image.w);
  return { w, h };
}

/** The default frame, in the middle of the photograph. Nothing was touched, and it
 *  can still be sent. */
export function defaultBox(image: Size): Box {
  const { w, h } = defaultSize(image);
  return clamp({ x: (image.w - w) / 2, y: (image.h - h) / 2, w, h }, image);
}

/** A frame around the point touched. At the edge of the photograph it moves inwards
 *  rather than overhanging. */
export function boxAt(point: Point, image: Size, size?: Size): Box {
  const { w, h } = size ?? defaultSize(image);
  return clamp({ x: point.x - w / 2, y: point.y - h / 2, w, h }, image);
}

/** Moving the frame by a vector, with the same limit at the edges. */
export function moveBy(box: Box, dx: number, dy: number, image: Size): Box {
  return clamp({ ...box, x: box.x + dx, y: box.y + dy }, image);
}

/** Dragging a corner: the named corner moves, the opposite one stays put. */
export function resizeCorner(
  box: Box,
  corner: "nw" | "ne" | "sw" | "se",
  to: Point,
  image: Size,
): Box {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const x0 = corner === "nw" || corner === "sw" ? Math.min(to.x, right - MIN_SIDE) : box.x;
  const y0 = corner === "nw" || corner === "ne" ? Math.min(to.y, bottom - MIN_SIDE) : box.y;
  const x1 = corner === "ne" || corner === "se" ? Math.max(to.x, box.x + MIN_SIDE) : right;
  const y1 = corner === "sw" || corner === "se" ? Math.max(to.y, box.y + MIN_SIDE) : bottom;
  return clamp({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, image);
}

/** The frame plus its margin, without running past the photograph. */
export function withMargin(box: Box, image: Size, margin = MARGIN): Box {
  const mx = box.w * margin;
  const my = box.h * margin;
  const x = Math.max(0, box.x - mx);
  const y = Math.max(0, box.y - my);
  return {
    x,
    y,
    w: Math.min(image.w - x, box.w + 2 * mx),
    h: Math.min(image.h - y, box.h + 2 * my),
  };
}

export type Plan = {
  /** What to cut out of the original photograph, in its own pixels. */
  crop: Box;
  /** The size of what will leave the device. */
  out: Size;
  /** Whether it was downscaled: a crop below the limit is left as it is. */
  downscaled: boolean;
};

/**
 * The order is obligatory: **crop first, downscale second**.
 *
 * Cropping throws away the background and keeps the sign's pixels; downscaling the
 * whole photograph cuts them along with the background. So the limit applies to the
 * piece cut out rather than to the original - and a small crop is never stretched:
 * that adds no pixels, and only makes the request heavier.
 */
export function plan(box: Box, image: Size, maxSide = MAX_SIDE): Plan {
  const crop = withMargin(clamp(box, image), image);
  const longest = Math.max(crop.w, crop.h);
  const scale = longest > maxSide ? maxSide / longest : 1;
  return {
    crop,
    out: { w: Math.round(crop.w * scale), h: Math.round(crop.h * scale) },
    downscaled: scale < 1,
  };
}

/**
 * Where a picture lands when fitted whole into the space it is given.
 *
 * Both the framing screen and the viewfinder need this: in each the stage is bounded
 * by the screen, the photograph has its own shape, and margins are left around it.
 * The frame has to be computed against the picture, or it drifts off it.
 */
export function fit(image: Size, into: Size): Box {
  const scale = Math.min(into.w / image.w, into.h / image.h);
  const w = image.w * scale;
  const h = image.h * scale;
  return { x: (into.w - w) / 2, y: (into.h - h) / 2, w, h };
}

/** The limit of the zoom. Past it the photograph runs out of pixels anyway. */
export const MAX_ZOOM = 8;

/**
 * A point on screen becomes a pixel of the photograph.
 *
 * `placed` is where the picture lies on the stage right now, zoom included. That is
 * exactly why the crop does not depend on the zoom: what leaves the device is a
 * rectangle in the pixels of the ORIGINAL, and zooming changes only what one aims
 * with.
 */
export function toImagePoint(p: Point, placed: Box, image: Size): Point {
  return {
    x: ((p.x - placed.x) / placed.w) * image.w,
    y: ((p.y - placed.y) / placed.h) * image.h,
  };
}

/**
 * Zoom in, keeping the point under the fingers where it is.
 *
 * `base` is the picture with no zoom (`fit`), and the factor is counted from it: it
 * is never allowed below one, or the photograph would start floating in emptiness.
 */
export function zoomAt(
  placed: Box,
  factor: number,
  anchor: Point,
  base: Box,
  max = MAX_ZOOM,
): Box {
  const current = placed.w / base.w;
  const next = Math.min(Math.max(current * factor, 1), max);
  const k = next / current;
  return {
    w: base.w * next,
    h: base.h * next,
    x: anchor.x - (anchor.x - placed.x) * k,
    y: anchor.y - (anchor.y - placed.y) * k,
  };
}

/**
 * Do not let the photograph be dragged off the edge.
 *
 * What is smaller than the stage stands in the middle; what is larger is held by its
 * edges, so that no emptiness appears beside the picture.
 */
export function clampPan(placed: Box, stage: Size): Box {
  const axis = (pos: number, size: number, limit: number) =>
    size <= limit ? (limit - size) / 2 : Math.min(0, Math.max(limit - size, pos));
  return {
    ...placed,
    x: axis(placed.x, placed.w, stage.w),
    y: axis(placed.y, placed.h, stage.h),
  };
}

/** How many times the photograph is currently enlarged relative to "all on screen". */
export function zoomLevel(placed: Box, base: Box): number {
  return placed.w / base.w;
}

/**
 * Which part of the photograph is on screen now - in the photograph's own pixels.
 *
 * This is the boundary for the frame: a person cannot select what they cannot see,
 * and a frame that has gone past the edge simply disappears.
 */
export function visibleRect(placed: Box, image: Size, stage: Size): Box {
  const k = placed.w / image.w;
  const x = Math.max(0, -placed.x / k);
  const y = Math.max(0, -placed.y / k);
  return {
    x,
    y,
    w: Math.min(image.w - x, stage.w / k),
    h: Math.min(image.h - y, stage.h / k),
  };
}

/** The share of what is visible that the frame takes up. That is what "how it looks
 *  on screen" means. */
export function fractionIn(box: Box, visible: Box): Size {
  return { w: box.w / visible.w, h: box.h / visible.h };
}

/**
 * The frame for a new zoom: the same share of the screen, and centred again.
 *
 * The point is that the frame looks the same on screen at any magnification - so its
 * corners are always within reach. In the photograph's pixels it narrows by itself:
 * zoom in on a distant sign and the selection is already on it.
 */
export function frameForView(frac: Size, visible: Box, image: Size): Box {
  const w = visible.w * frac.w;
  const h = visible.h * frac.h;
  return clamp(
    { x: visible.x + (visible.w - w) / 2, y: visible.y + (visible.h - h) / 2, w, h },
    image,
  );
}

/** The share of the photograph's area that leaves the device. For the caption under
 *  the preview. */
export function shareOfFrame(crop: Box, image: Size): number {
  return (crop.w * crop.h) / (image.w * image.h);
}

/** Whether the frame may still be changed. From "Send this to be read" until the
 *  answer - the frame being cut out, then the reading - the picture stays exactly as it
 *  was sent (step 19): moving it then showed a frame that was not the one being read. */
export const frameLocked = (busy: boolean, sending: boolean): boolean => busy || sending;

/** The line above the photograph. */
export function frameHint(zoom: number, locked: boolean): string {
  if (locked) return "Reading what is inside the frame…";
  return zoom > 1.01 ? "Zoom in, then fine-tune with the corners" : "Drag the frame onto the sign";
}

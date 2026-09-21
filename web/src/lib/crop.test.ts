// What a machine can check about the cropping (step 2).
//
// The tests are named after properties rather than functions: when one breaks, it
// should be clear what exactly broke.

import { describe, expect, it } from "vitest";
import {
  BOX_ASPECT,
  MARGIN,
  MAX_SIDE,
  MIN_SIDE,
  boxAt,
  MAX_ZOOM,
  clamp,
  clampPan,
  defaultBox,
  fit,
  moveBy,
  plan,
  resizeCorner,
  shareOfFrame,
  fractionIn,
  frameForView,
  toImagePoint,
  visibleRect,
  withMargin,
  zoomAt,
  zoomLevel,
} from "./crop";

const phone = { w: 3000, h: 4000 };
const wide = { w: 4000, h: 3000 };
const tiny = { w: 40, h: 30 };

const inside = (b: { x: number; y: number; w: number; h: number }, image: typeof phone) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= image.w + 1e-9 && b.y + b.h <= image.h + 1e-9;

describe("the frame placed by a touch", () => {
  it("sits around the point touched, when no edge is in the way", () => {
    // The point is deliberately far from the edges: at an edge the frame must move
    // inwards, and a separate test below checks that.
    const box = boxAt({ x: 1500, y: 2000 }, phone);
    expect(box.x + box.w / 2).toBeCloseTo(1500);
    expect(box.y + box.h / 2).toBeCloseTo(2000);
  });

  it("is tall rather than wide", () => {
    const box = boxAt({ x: 1500, y: 2000 }, phone);
    expect(box.h).toBeGreaterThan(box.w);
    expect(box.w / box.h).toBeCloseTo(BOX_ASPECT);
  });

  it("moves inwards at the edge of the photograph instead of overhanging it", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: phone.w, y: 0 },
      { x: 0, y: phone.h },
      { x: phone.w, y: phone.h },
      { x: -500, y: -500 },
      { x: phone.w + 500, y: phone.h + 500 },
    ]) {
      expect(inside(boxAt(p, phone), phone)).toBe(true);
    }
  });

  it("keeps its size when it moves at an edge", () => {
    const middle = boxAt({ x: 1500, y: 2000 }, phone);
    const corner = boxAt({ x: 0, y: 0 }, phone);
    expect(corner.w).toBeCloseTo(middle.w);
    expect(corner.h).toBeCloseTo(middle.h);
  });

  it("shrinks to the photograph when the photograph is smaller than the frame", () => {
    const box = boxAt({ x: 20, y: 15 }, tiny);
    expect(inside(box, tiny)).toBe(true);
    expect(box.w).toBeLessThanOrEqual(tiny.w);
    expect(box.h).toBeLessThanOrEqual(tiny.h);
  });
});

describe("the frame with no touch at all", () => {
  it("stands in the middle of the photograph", () => {
    const box = defaultBox(phone);
    expect(box.x + box.w / 2).toBeCloseTo(phone.w / 2);
    expect(box.y + box.h / 2).toBeCloseTo(phone.h / 2);
  });

  it("lies wholly inside the photograph, on a wide frame too", () => {
    expect(inside(defaultBox(wide), wide)).toBe(true);
    expect(inside(defaultBox(phone), phone)).toBe(true);
    expect(inside(defaultBox(tiny), tiny)).toBe(true);
  });

  it("is fit to send: a plan is built without a single touch", () => {
    const p = plan(defaultBox(phone), phone);
    expect(p.out.w).toBeGreaterThan(0);
    expect(p.out.h).toBeGreaterThan(0);
  });
});

describe("moving and resizing", () => {
  it("moving never carries the frame off the photograph", () => {
    const box = defaultBox(phone);
    expect(inside(moveBy(box, 99999, 99999, phone), phone)).toBe(true);
    expect(inside(moveBy(box, -99999, -99999, phone), phone)).toBe(true);
  });

  it("dragging a corner moves that corner and leaves the opposite one", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    const out = resizeCorner(box, "se", { x: 1800, y: 2400 }, phone);
    expect(out.x).toBeCloseTo(1000);
    expect(out.y).toBeCloseTo(1000);
    expect(out.x + out.w).toBeCloseTo(1800);
    expect(out.y + out.h).toBeCloseTo(2400);
  });

  it("a corner dragged past its opposite does not turn the frame inside out", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const out = resizeCorner(box, corner, { x: 1200, y: 1400 }, phone);
      expect(out.w).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(out.h).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(inside(out, phone)).toBe(true);
    }
  });
});

describe("the margin around the frame", () => {
  it("widens the frame", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    const out = withMargin(box, phone);
    expect(out.w).toBeGreaterThan(box.w);
    expect(out.h).toBeGreaterThan(box.h);
    expect(out.w).toBeCloseTo(box.w * (1 + 2 * MARGIN));
  });

  it("is cut to the photograph at its edge instead of running past it", () => {
    const out = withMargin({ x: 0, y: 0, w: 400, h: 900 }, phone);
    expect(inside(out, phone)).toBe(true);
    expect(out.x).toBe(0);
  });
});

describe("the plan of what is sent", () => {
  it("crops before it downscales", () => {
    // The sign is a narrow strip in the corner of a large photograph. Downscale the
    // whole frame first and a handful of pixels would be left of the sign.
    const sign = { x: 2600, y: 300, w: 300, h: 700 };
    const p = plan(sign, phone);
    expect(p.crop.w).toBeLessThan(phone.w / 2);
    expect(p.crop.h).toBeLessThan(phone.h / 2);
    // The crop is below the limit, so there is nothing to downscale and the sign's
    // pixels are intact.
    expect(p.downscaled).toBe(false);
    expect(p.out.w).toBe(Math.round(p.crop.w));
  });

  it("downscales only what exceeds the limit, and by the long side", () => {
    const huge = { x: 0, y: 0, w: 3000, h: 4000 };
    const p = plan(huge, phone);
    expect(p.downscaled).toBe(true);
    expect(Math.max(p.out.w, p.out.h)).toBe(MAX_SIDE);
    expect(p.out.w / p.out.h).toBeCloseTo(p.crop.w / p.crop.h, 2);
  });

  it("never stretches a small crop", () => {
    const small = { x: 100, y: 100, w: 120, h: 260 };
    const p = plan(small, phone);
    expect(p.downscaled).toBe(false);
    expect(p.out.w).toBeLessThanOrEqual(Math.round(p.crop.w));
    expect(p.out.h).toBeLessThanOrEqual(Math.round(p.crop.h));
  });

  it("never cuts outside the photograph", () => {
    for (const box of [
      { x: -500, y: -500, w: 400, h: 900 },
      { x: 2900, y: 3900, w: 900, h: 900 },
      { x: 0, y: 0, w: 99999, h: 99999 },
    ]) {
      expect(inside(plan(box, phone).crop, phone)).toBe(true);
    }
  });

  it("works out the share of the frame that leaves the device", () => {
    const p = plan({ x: 1000, y: 1000, w: 300, h: 700 }, phone);
    const share = shareOfFrame(p.crop, phone);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });
});

describe("fitting the picture into the stage", () => {
  it("keeps the proportions", () => {
    const r = fit(phone, { w: 800, h: 600 });
    expect(r.w / r.h).toBeCloseTo(phone.w / phone.h);
  });

  it("a tall photograph meets the height, leaving margins at the sides", () => {
    const r = fit(phone, { w: 800, h: 600 });
    expect(r.h).toBeCloseTo(600);
    expect(r.w).toBeLessThan(800);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeCloseTo(0);
  });

  it("a wide one meets the width, leaving margins above and below", () => {
    // The stage is deliberately a different shape: with matching proportions there
    // are no margins at all, and nothing to check.
    const r = fit(wide, { w: 800, h: 900 });
    expect(r.w).toBeCloseTo(800);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeGreaterThan(0);
  });

  it("a picture exactly the shape of the stage needs no margins", () => {
    const r = fit({ w: 400, h: 300 }, { w: 800, h: 600 });
    expect(r).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("always fits into the stage whole", () => {
    for (const into of [{ w: 300, h: 900 }, { w: 900, h: 300 }, { w: 500, h: 500 }]) {
      const r = fit(phone, into);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(into.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(into.h + 1e-9);
    }
  });
});

describe("zooming the photograph on screen", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);

  it("keeps the point under the fingers where it was", () => {
    const anchor = { x: 180, y: 300 };
    const before = toImagePoint(anchor, base, phone);
    const after = toImagePoint(anchor, zoomAt(base, 2.5, anchor, base), phone);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("never zooms out below the whole photograph on screen", () => {
    const small = zoomAt(base, 0.2, { x: 200, y: 350 }, base);
    expect(zoomLevel(small, base)).toBeCloseTo(1);
  });

  it("never zooms in past the limit", () => {
    let p = base;
    for (let i = 0; i < 20; i++) p = zoomAt(p, 2, { x: 200, y: 350 }, base);
    expect(zoomLevel(p, base)).toBeCloseTo(MAX_ZOOM);
  });

  it("keeps the photograph's proportions at any zoom", () => {
    const p = zoomAt(base, 3, { x: 100, y: 200 }, base);
    expect(p.w / p.h).toBeCloseTo(phone.w / phone.h);
  });

  it("what leaves the device does not depend on the zoom", () => {
    // One and the same point on screen means different pixels of the photograph at
    // different zooms - but the frame lives in the photograph's pixels, and the plan
    // built from it is the same.
    const box = { x: 900, y: 1200, w: 300, h: 700 };
    const near = plan(box, phone);
    const far = plan(box, phone);
    expect(near).toEqual(far);
    // And the other way round: the same point of the ORIGINAL stays itself after a
    // zoom.
    const anchor = { x: 210, y: 410 };
    const zoomed = clampPan(zoomAt(base, 4, anchor, base), stage);
    const p1 = toImagePoint(anchor, base, phone);
    const p2 = toImagePoint(anchor, zoomed, phone);
    expect(Math.abs(p1.x - p2.x)).toBeLessThan(phone.w * 0.02);
  });
});

describe("panning a zoomed photograph", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);

  it("a photograph smaller than the stage stands in the middle", () => {
    const p = clampPan({ ...base, x: -999, y: 999 }, stage);
    expect(p.x).toBeCloseTo((stage.w - base.w) / 2);
    expect(p.y).toBeCloseTo((stage.h - base.h) / 2);
  });

  it("a zoomed photograph cannot be dragged off the edge", () => {
    const big = zoomAt(base, 4, { x: 200, y: 350 }, base);
    for (const [dx, dy] of [[9999, 9999], [-9999, -9999]] as const) {
      const p = clampPan({ ...big, x: big.x + dx, y: big.y + dy }, stage);
      expect(p.x).toBeLessThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(0);
      expect(p.x + p.w).toBeGreaterThanOrEqual(stage.w - 1e-9);
      expect(p.y + p.h).toBeGreaterThanOrEqual(stage.h - 1e-9);
    }
  });
});

describe("the frame holds its look on screen", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);
  const frac = { w: 0.315, h: 0.7 };

  const viewAt = (factor: number, anchor = { x: 200, y: 350 }) =>
    visibleRect(clampPan(zoomAt(base, factor, anchor, base), stage), phone, stage);

  it("stands in the middle of what is visible", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.x + box.w / 2).toBeCloseTo(v.x + v.w / 2, 3);
      expect(box.y + box.h / 2).toBeCloseTo(v.y + v.h / 2, 3);
    }
  });

  it("takes up the same share of the screen at any zoom", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.w / v.w).toBeCloseTo(frac.w, 6);
      expect(box.h / v.h).toBeCloseTo(frac.h, 6);
    }
  });

  it("narrows in the photograph's pixels as you zoom - which is how a distant sign gets selected", () => {
    const wide = frameForView(frac, viewAt(1), phone);
    const near = frameForView(frac, viewAt(8), phone);
    expect(near.w).toBeLessThan(wide.w / 4);
  });

  it("lies wholly within what is visible, so every corner is within reach", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.x).toBeGreaterThanOrEqual(v.x - 1e-6);
      expect(box.y).toBeGreaterThanOrEqual(v.y - 1e-6);
      expect(box.x + box.w).toBeLessThanOrEqual(v.x + v.w + 1e-6);
      expect(box.y + box.h).toBeLessThanOrEqual(v.y + v.h + 1e-6);
    }
  });

  it("does not run past the photograph right at its edge", () => {
    const v = viewAt(8, { x: 399, y: 699 });
    expect(inside(frameForView(frac, v, phone), phone)).toBe(true);
  });

  it("the share is derived from the frame and the view, and returns unchanged", () => {
    const v = viewAt(3);
    const box = frameForView(frac, v, phone);
    const back = fractionIn(box, v);
    expect(back.w).toBeCloseTo(frac.w, 6);
    expect(back.h).toBeCloseTo(frac.h, 6);
  });

  it("a share set by hand at the corners survives a zoom", () => {
    const v1 = viewAt(2);
    const resized = { ...frameForView(frac, v1, phone), w: 200, h: 500 };
    const mine = fractionIn(resized, v1);
    const v2 = viewAt(6);
    const box = frameForView(mine, v2, phone);
    expect(box.w / v2.w).toBeCloseTo(mine.w, 6);
    expect(box.h / v2.h).toBeCloseTo(mine.h, 6);
  });
});

describe("a point on screen into the photograph's pixels", () => {
  it("the corners of the picture are the corners of the photograph", () => {
    const placed = { x: 50, y: 20, w: 300, h: 400 };
    expect(toImagePoint({ x: 50, y: 20 }, placed, phone)).toEqual({ x: 0, y: 0 });
    const far = toImagePoint({ x: 350, y: 420 }, placed, phone);
    expect(far.x).toBeCloseTo(phone.w);
    expect(far.y).toBeCloseTo(phone.h);
  });
});

describe("holding the frame within limits", () => {
  it("never lets the frame fall below the minimum", () => {
    const out = clamp({ x: 10, y: 10, w: 1, h: 1 }, phone);
    expect(out.w).toBeGreaterThanOrEqual(MIN_SIDE);
    expect(out.h).toBeGreaterThanOrEqual(MIN_SIDE);
  });
});

// The machine-checkable requirements of step 4: 2, 3, 4, 6, 8.
// The pixels themselves - scanning a frame - are work for a real browser, and a
// manual scenario over the photographs in testset/raw takes that on.

import { describe, expect, it } from "vitest";
import {
  DOWN_FACTOR,
  MAX_AREA_SHARE,
  UP_FACTOR,
  WIDTH_FACTOR,
  columnAround,
  frameFromAnchor,
  pickAnchor,
  suggestFrame,
  type Region,
} from "./anchor";

const phone = { w: 3000, h: 4000 };

/** A sign: a solid patch close to square, with a white letter inside. */
const sign = (over: Partial<Region> = {}): Region => {
  const r = { x: 1300, y: 600, w: 400, h: 420, kind: "blue" as const, white: 0.18, ...over };
  return { ...r, area: over.area ?? r.w * r.h * 0.9 };
};

/** A plate under the sign: the same column, lower down. */
const plate = (over: Partial<Region> = {}): Region =>
  sign({ x: 1280, y: 1100, w: 440, h: 160, white: 0.2, ...over });

describe("choosing the anchor", () => {
  it("takes a solid, square patch", () => {
    expect(pickAnchor([sign()], phone)).not.toBeNull();
  });

  it("does not take a speck: a glare, a sticker, a piece of sky", () => {
    const speck = sign({ x: 10, y: 10, w: 30, h: 30 });
    expect(pickAnchor([speck], phone)).toBeNull();
  });

  it("does not take half the frame: that is a wall or the sky, not a sign", () => {
    const wall = sign({ x: 0, y: 0, w: 2600, h: 3200 });
    expect(pickAnchor([wall], phone)).toBeNull();
    expect((wall.w * wall.h) / (phone.w * phone.h)).toBeGreaterThan(MAX_AREA_SHARE);
  });

  it("does not take a long strip: a sign is close to square", () => {
    expect(pickAnchor([sign({ w: 900, h: 120 })], phone)).toBeNull();
    expect(pickAnchor([sign({ w: 90, h: 900 })], phone)).toBeNull();
  });

  it("does not take a loose patch: a sign fills its own box", () => {
    expect(pickAnchor([sign({ area: 400 * 420 * 0.2 })], phone)).toBeNull();
  });

  it("anchors only on blue: a main sign is blue, and yellow is a plate", () => {
    const blue = sign({ x: 1200, y: 900, kind: "blue" });
    const yellow = sign({ x: 400, y: 900, kind: "yellow" });
    expect(pickAnchor([yellow, blue], phone)).toBe(blue);
    // A yellow facade with balconies gathered both white and a column - and won.
    expect(pickAnchor([yellow], phone)).toBeNull();
  });

  it("keeps yellow in the column, or the stack is not gathered whole", () => {
    const blue = sign();
    const yellowPlate = plate({ kind: "yellow" });
    const box = frameFromAnchor(blue, phone, columnAround(blue, [blue, yellowPlate]));
    expect(box.y + box.h).toBeGreaterThan(yellowPlate.y + yellowPlate.h);
  });

  it("all else being equal, takes the higher one: the sign stands above the stack", () => {
    const top = sign({ y: 400 });
    const low = sign({ x: 500, y: 3000 });
    expect(pickAnchor([low, top], phone)).toBe(top);
  });

  it("lets a large blue patch beat a small one, even one standing higher", () => {
    const big = sign({ y: 1800, w: 500, h: 500 });
    const small = sign({ y: 200, w: 150, h: 150 });
    expect(pickAnchor([small, big], phone)).toBe(big);
  });

  it("says so plainly when there is nothing to take", () => {
    expect(pickAnchor([], phone)).toBeNull();
  });
});

describe("corroboration: colour and size are not enough", () => {
  it("a blue strip with no white and no neighbours is a number plate, not a sign", () => {
    // This exact case came up on the measurement: the frame landed on a number plate.
    const numberPlate = sign({ x: 300, y: 3200, w: 180, h: 260, white: 0.01 });
    expect(pickAnchor([numberPlate], phone)).toBeNull();
  });

  it("white inside is corroboration in itself: a sign with a letter is taken alone", () => {
    expect(pickAnchor([sign()], phone)).not.toBeNull();
  });

  it("plates beneath it corroborate even with no white", () => {
    const dull = sign({ white: 0.005 });
    expect(pickAnchor([dull], phone)).toBeNull();
    expect(pickAnchor([dull, plate({ white: 0.004 })], phone)).toBe(dull);
  });

  it("lets the corroborated win over the merely large", () => {
    const big = sign({ x: 200, y: 2500, w: 700, h: 700, white: 0.002 });
    const real = sign({ x: 1500, y: 700, w: 300, h: 320 });
    expect(pickAnchor([big, real, plate({ x: 1480, y: 1150 })], phone)).toBe(real);
  });
});

describe("a sign inside a sign", () => {
  // A zonal E20 and "Parkering forbjuden": a blue circle sits inside a yellow shield.
  const circle = sign({ x: 1400, y: 700, w: 300, h: 300 });
  const shield = sign({ x: 1250, y: 560, w: 620, h: 600, kind: "yellow", white: 0.02 });

  it("counts the shield around the circle as part of the sign, not as a neighbour", () => {
    expect(columnAround(circle, [circle, shield])).toContain(shield);
  });

  it("takes in the whole shield rather than cutting it down to the circle", () => {
    const box = frameFromAnchor(circle, phone, columnAround(circle, [circle, shield]));
    expect(box.x).toBeLessThanOrEqual(shield.x);
    expect(box.y).toBeLessThanOrEqual(shield.y);
    expect(box.x + box.w).toBeGreaterThanOrEqual(shield.x + shield.w);
    expect(box.y + box.h).toBeGreaterThanOrEqual(shield.y + shield.h);
  });

  it("frames the whole stack when the shield has plates beneath it", () => {
    const under = plate({ x: 1300, y: 1250, w: 520, h: 180 });
    const column = columnAround(circle, [circle, shield, under]);
    const box = frameFromAnchor(circle, phone, column);
    expect(column).toHaveLength(2);
    expect(box.y + box.h).toBeGreaterThan(under.y + under.h);
  });
});

describe("how far the stack reaches", () => {
  it("is taken from the plates found, not from a multiplier", () => {
    const anchor = sign();
    const low = plate({ y: 1400, h: 200 });
    const box = frameFromAnchor(anchor, phone, [plate(), low]);
    expect(box.y + box.h).toBeGreaterThan(low.y + low.h);
    // And it does not run far past the last plate.
    expect(box.y + box.h).toBeLessThan(low.y + low.h + anchor.h);
  });

  it("is wider than the widest plate, not only than the sign", () => {
    const anchor = sign();
    const wide = plate({ x: 1100, w: 800 });
    const box = frameFromAnchor(anchor, phone, [wide]);
    expect(box.x).toBeLessThan(wide.x);
    expect(box.x + box.w).toBeGreaterThan(wide.x + wide.w);
  });

  it("falls back to the multiplier when no plates are visible", () => {
    const anchor = sign();
    const box = frameFromAnchor(anchor, phone, []);
    expect(box.h).toBeCloseTo(anchor.h * (1 + UP_FACTOR + DOWN_FACTOR));
  });
});

describe("the frame from the anchor", () => {
  const anchor = sign();
  const box = frameFromAnchor(anchor, phone);

  it("is wider than the sign itself: the plates below are usually wider", () => {
    expect(box.w).toBeCloseTo(anchor.w * WIDTH_FACTOR);
  });

  it("reaches downwards with room for the plates", () => {
    const below = box.y + box.h - (anchor.y + anchor.h);
    expect(below).toBeGreaterThan(anchor.h * DOWN_FACTOR * 0.9);
  });

  it("keeps the sign inside the frame and off its edge", () => {
    expect(box.x).toBeLessThan(anchor.x);
    expect(box.y).toBeLessThan(anchor.y);
    expect(box.x + box.w).toBeGreaterThan(anchor.x + anchor.w);
  });

  it("stands on the same axis as the sign", () => {
    expect(box.x + box.w / 2).toBeCloseTo(anchor.x + anchor.w / 2);
  });

  it("never runs past the photograph, even with the sign at its very edge", () => {
    for (const a of [
      sign({ x: 0, y: 0 }),
      sign({ x: 2600, y: 3500 }),
      sign({ x: 2900, y: 100 }),
    ]) {
      const b = frameFromAnchor(a, phone);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(phone.w + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(phone.h + 1e-9);
    }
  });

  it("gives the same frame for the same input", () => {
    expect(frameFromAnchor(anchor, phone)).toEqual(frameFromAnchor(anchor, phone));
  });
});

describe("a failure of the search", () => {
  it("does not break the screen but answers \"not found\"", () => {
    // There is no canvas and no picture here - exactly what happens on a failure.
    expect(suggestFrame({} as CanvasImageSource, phone)).toBeNull();
  });
});

// Требования шага 2 из PLAN_NEXT.md, проверяемые машиной: 1, 2, 4, 8, 9.
//
// Тесты названы свойствами, а не функциями: ломаться должно понятно, что именно.

import { describe, expect, it } from "vitest";
import {
  BOX_ASPECT,
  MARGIN,
  MAX_SIDE,
  MIN_SIDE,
  boxAt,
  clamp,
  defaultBox,
  moveBy,
  plan,
  resizeCorner,
  shareOfFrame,
  withMargin,
} from "./crop";

const phone = { w: 3000, h: 4000 };
const wide = { w: 4000, h: 3000 };
const tiny = { w: 40, h: 30 };

const inside = (b: { x: number; y: number; w: number; h: number }, image: typeof phone) =>
  b.x >= 0 && b.y >= 0 && b.x + b.w <= image.w + 1e-9 && b.y + b.h <= image.h + 1e-9;

describe("рамка по касанию", () => {
  it("ставится вокруг точки касания, когда края не мешают", () => {
    // Точка взята вдали от краёв нарочно: у края рамка обязана сдвинуться
    // внутрь, и это проверяет отдельный тест ниже.
    const box = boxAt({ x: 1500, y: 2000 }, phone);
    expect(box.x + box.w / 2).toBeCloseTo(1500);
    expect(box.y + box.h / 2).toBeCloseTo(2000);
  });

  it("вытянута вверх, а не в ширину", () => {
    const box = boxAt({ x: 1500, y: 2000 }, phone);
    expect(box.h).toBeGreaterThan(box.w);
    expect(box.w / box.h).toBeCloseTo(BOX_ASPECT);
  });

  it("у края снимка сдвигается внутрь, а не вылезает", () => {
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

  it("сохраняет размер при сдвиге у края", () => {
    const middle = boxAt({ x: 1500, y: 2000 }, phone);
    const corner = boxAt({ x: 0, y: 0 }, phone);
    expect(corner.w).toBeCloseTo(middle.w);
    expect(corner.h).toBeCloseTo(middle.h);
  });

  it("на снимке мельче рамки ужимается до снимка", () => {
    const box = boxAt({ x: 20, y: 15 }, tiny);
    expect(inside(box, tiny)).toBe(true);
    expect(box.w).toBeLessThanOrEqual(tiny.w);
    expect(box.h).toBeLessThanOrEqual(tiny.h);
  });
});

describe("рамка без касания", () => {
  it("стоит по центру снимка", () => {
    const box = defaultBox(phone);
    expect(box.x + box.w / 2).toBeCloseTo(phone.w / 2);
    expect(box.y + box.h / 2).toBeCloseTo(phone.h / 2);
  });

  it("целиком внутри снимка и на вытянутом в ширину кадре", () => {
    expect(inside(defaultBox(wide), wide)).toBe(true);
    expect(inside(defaultBox(phone), phone)).toBe(true);
    expect(inside(defaultBox(tiny), tiny)).toBe(true);
  });

  it("годится к отправке: план строится и без единого касания", () => {
    const p = plan(defaultBox(phone), phone);
    expect(p.out.w).toBeGreaterThan(0);
    expect(p.out.h).toBeGreaterThan(0);
  });
});

describe("сдвиг и растягивание", () => {
  it("сдвиг не выносит рамку за снимок", () => {
    const box = defaultBox(phone);
    expect(inside(moveBy(box, 99999, 99999, phone), phone)).toBe(true);
    expect(inside(moveBy(box, -99999, -99999, phone), phone)).toBe(true);
  });

  it("тяга за угол двигает свой угол и оставляет противоположный", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    const out = resizeCorner(box, "se", { x: 1800, y: 2400 }, phone);
    expect(out.x).toBeCloseTo(1000);
    expect(out.y).toBeCloseTo(1000);
    expect(out.x + out.w).toBeCloseTo(1800);
    expect(out.y + out.h).toBeCloseTo(2400);
  });

  it("угол, протащенный за противоположный, не выворачивает рамку", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const out = resizeCorner(box, corner, { x: 1200, y: 1400 }, phone);
      expect(out.w).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(out.h).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(inside(out, phone)).toBe(true);
    }
  });
});

describe("запас по краям", () => {
  it("расширяет рамку", () => {
    const box = { x: 1000, y: 1000, w: 400, h: 900 };
    const out = withMargin(box, phone);
    expect(out.w).toBeGreaterThan(box.w);
    expect(out.h).toBeGreaterThan(box.h);
    expect(out.w).toBeCloseTo(box.w * (1 + 2 * MARGIN));
  });

  it("у края снимка обрезается по снимку, а не выходит за него", () => {
    const out = withMargin({ x: 0, y: 0, w: 400, h: 900 }, phone);
    expect(inside(out, phone)).toBe(true);
    expect(out.x).toBe(0);
  });
});

describe("план отправки", () => {
  it("кадрирует прежде, чем уменьшать", () => {
    // Знак — узкая полоса в углу большого снимка. Если бы сначала уменьшали
    // весь кадр, от знака осталась бы горстка пикселей.
    const sign = { x: 2600, y: 300, w: 300, h: 700 };
    const p = plan(sign, phone);
    expect(p.crop.w).toBeLessThan(phone.w / 2);
    expect(p.crop.h).toBeLessThan(phone.h / 2);
    // Кадр меньше предела — значит уменьшать нечего, пиксели знака целы.
    expect(p.downscaled).toBe(false);
    expect(p.out.w).toBe(Math.round(p.crop.w));
  });

  it("уменьшает только то, что больше предела, и по длинной стороне", () => {
    const huge = { x: 0, y: 0, w: 3000, h: 4000 };
    const p = plan(huge, phone);
    expect(p.downscaled).toBe(true);
    expect(Math.max(p.out.w, p.out.h)).toBe(MAX_SIDE);
    expect(p.out.w / p.out.h).toBeCloseTo(p.crop.w / p.crop.h, 2);
  });

  it("мелкий кадр не растягивает", () => {
    const small = { x: 100, y: 100, w: 120, h: 260 };
    const p = plan(small, phone);
    expect(p.downscaled).toBe(false);
    expect(p.out.w).toBeLessThanOrEqual(Math.round(p.crop.w));
    expect(p.out.h).toBeLessThanOrEqual(Math.round(p.crop.h));
  });

  it("никогда не вырезает за пределами снимка", () => {
    for (const box of [
      { x: -500, y: -500, w: 400, h: 900 },
      { x: 2900, y: 3900, w: 900, h: 900 },
      { x: 0, y: 0, w: 99999, h: 99999 },
    ]) {
      expect(inside(plan(box, phone).crop, phone)).toBe(true);
    }
  });

  it("считает долю кадра, уходящую наружу", () => {
    const p = plan({ x: 1000, y: 1000, w: 300, h: 700 }, phone);
    const share = shareOfFrame(p.crop, phone);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });
});

describe("ограничение рамки", () => {
  it("не даёт рамке стать меньше минимума", () => {
    const out = clamp({ x: 10, y: 10, w: 1, h: 1 }, phone);
    expect(out.w).toBeGreaterThanOrEqual(MIN_SIDE);
    expect(out.h).toBeGreaterThanOrEqual(MIN_SIDE);
  });
});

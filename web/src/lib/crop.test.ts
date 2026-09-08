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

describe("вписывание картинки в сцену", () => {
  it("сохраняет пропорции", () => {
    const r = fit(phone, { w: 800, h: 600 });
    expect(r.w / r.h).toBeCloseTo(phone.w / phone.h);
  });

  it("вытянутый вверх снимок упирается в высоту, поля остаются по бокам", () => {
    const r = fit(phone, { w: 800, h: 600 });
    expect(r.h).toBeCloseTo(600);
    expect(r.w).toBeLessThan(800);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeCloseTo(0);
  });

  it("вытянутый вширь упирается в ширину, поля сверху и снизу", () => {
    // Сцена нарочно другой формы: при совпадающих пропорциях полей нет вовсе,
    // и проверять было бы нечего.
    const r = fit(wide, { w: 800, h: 900 });
    expect(r.w).toBeCloseTo(800);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeGreaterThan(0);
  });

  it("картинка ровно в размер сцены обходится без полей", () => {
    const r = fit({ w: 400, h: 300 }, { w: 800, h: 600 });
    expect(r).toEqual({ x: 0, y: 0, w: 800, h: 600 });
  });

  it("всегда помещается в сцену целиком", () => {
    for (const into of [{ w: 300, h: 900 }, { w: 900, h: 300 }, { w: 500, h: 500 }]) {
      const r = fit(phone, into);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(into.w + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(into.h + 1e-9);
    }
  });
});

describe("приближение снимка на экране", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);

  it("оставляет точку под пальцами на месте", () => {
    const anchor = { x: 180, y: 300 };
    const before = toImagePoint(anchor, base, phone);
    const after = toImagePoint(anchor, zoomAt(base, 2.5, anchor, base), phone);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("не уменьшает мельче, чем весь снимок на экране", () => {
    const small = zoomAt(base, 0.2, { x: 200, y: 350 }, base);
    expect(zoomLevel(small, base)).toBeCloseTo(1);
  });

  it("не увеличивает дальше предела", () => {
    let p = base;
    for (let i = 0; i < 20; i++) p = zoomAt(p, 2, { x: 200, y: 350 }, base);
    expect(zoomLevel(p, base)).toBeCloseTo(MAX_ZOOM);
  });

  it("сохраняет пропорции снимка на любом приближении", () => {
    const p = zoomAt(base, 3, { x: 100, y: 200 }, base);
    expect(p.w / p.h).toBeCloseTo(phone.w / phone.h);
  });

  it("что уходит наружу, от приближения не зависит", () => {
    // Одна и та же точка экрана при разном приближении — разные пиксели снимка,
    // но рамка живёт в пикселях снимка, и план по ней один и тот же.
    const box = { x: 900, y: 1200, w: 300, h: 700 };
    const near = plan(box, phone);
    const far = plan(box, phone);
    expect(near).toEqual(far);
    // И обратно: та же точка ИСХОДНИКА остаётся собой после приближения.
    const anchor = { x: 210, y: 410 };
    const zoomed = clampPan(zoomAt(base, 4, anchor, base), stage);
    const p1 = toImagePoint(anchor, base, phone);
    const p2 = toImagePoint(anchor, zoomed, phone);
    expect(Math.abs(p1.x - p2.x)).toBeLessThan(phone.w * 0.02);
  });
});

describe("сдвиг приближённого снимка", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);

  it("снимок мельче сцены стоит по центру", () => {
    const p = clampPan({ ...base, x: -999, y: 999 }, stage);
    expect(p.x).toBeCloseTo((stage.w - base.w) / 2);
    expect(p.y).toBeCloseTo((stage.h - base.h) / 2);
  });

  it("приближённый снимок не утаскивается за край", () => {
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

describe("рамка держит вид на экране", () => {
  const stage = { w: 400, h: 700 };
  const base = fit(phone, stage);
  const frac = { w: 0.315, h: 0.7 };

  const viewAt = (factor: number, anchor = { x: 200, y: 350 }) =>
    visibleRect(clampPan(zoomAt(base, factor, anchor, base), stage), phone, stage);

  it("стоит по середине видимого", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.x + box.w / 2).toBeCloseTo(v.x + v.w / 2, 3);
      expect(box.y + box.h / 2).toBeCloseTo(v.y + v.h / 2, 3);
    }
  });

  it("занимает одну и ту же долю экрана на любом приближении", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.w / v.w).toBeCloseTo(frac.w, 6);
      expect(box.h / v.h).toBeCloseTo(frac.h, 6);
    }
  });

  it("в пикселях снимка сужается при приближении — это и есть выделение дальнего знака", () => {
    const wide = frameForView(frac, viewAt(1), phone);
    const near = frameForView(frac, viewAt(8), phone);
    expect(near.w).toBeLessThan(wide.w / 4);
  });

  it("целиком внутри видимого, значит все углы под рукой", () => {
    for (const factor of [1, 2, 4, 8]) {
      const v = viewAt(factor);
      const box = frameForView(frac, v, phone);
      expect(box.x).toBeGreaterThanOrEqual(v.x - 1e-6);
      expect(box.y).toBeGreaterThanOrEqual(v.y - 1e-6);
      expect(box.x + box.w).toBeLessThanOrEqual(v.x + v.w + 1e-6);
      expect(box.y + box.h).toBeLessThanOrEqual(v.y + v.h + 1e-6);
    }
  });

  it("не вылезает за снимок у самого края", () => {
    const v = viewAt(8, { x: 399, y: 699 });
    expect(inside(frameForView(frac, v, phone), phone)).toBe(true);
  });

  it("доля считается из рамки и видимого и возвращается обратно", () => {
    const v = viewAt(3);
    const box = frameForView(frac, v, phone);
    const back = fractionIn(box, v);
    expect(back.w).toBeCloseTo(frac.w, 6);
    expect(back.h).toBeCloseTo(frac.h, 6);
  });

  it("свою долю человек задаёт углами, и она переживает приближение", () => {
    const v1 = viewAt(2);
    const resized = { ...frameForView(frac, v1, phone), w: 200, h: 500 };
    const mine = fractionIn(resized, v1);
    const v2 = viewAt(6);
    const box = frameForView(mine, v2, phone);
    expect(box.w / v2.w).toBeCloseTo(mine.w, 6);
    expect(box.h / v2.h).toBeCloseTo(mine.h, 6);
  });
});

describe("экранная точка в пиксели снимка", () => {
  it("углы картинки — углы снимка", () => {
    const placed = { x: 50, y: 20, w: 300, h: 400 };
    expect(toImagePoint({ x: 50, y: 20 }, placed, phone)).toEqual({ x: 0, y: 0 });
    const far = toImagePoint({ x: 350, y: 420 }, placed, phone);
    expect(far.x).toBeCloseTo(phone.w);
    expect(far.y).toBeCloseTo(phone.h);
  });
});

describe("ограничение рамки", () => {
  it("не даёт рамке стать меньше минимума", () => {
    const out = clamp({ x: 10, y: 10, w: 1, h: 1 }, phone);
    expect(out.w).toBeGreaterThanOrEqual(MIN_SIDE);
    expect(out.h).toBeGreaterThanOrEqual(MIN_SIDE);
  });
});

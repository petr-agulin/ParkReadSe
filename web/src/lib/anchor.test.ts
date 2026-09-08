// Требования шага 4, проверяемые машиной: 2, 3, 4, 6, 8.
// Пиксели (сканирование кадра) — работа для настоящего браузера, её берёт
// ручной сценарий на снимках из testset/raw.

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

/** Знак: плотное пятно, близкое к квадрату, с белой буквой внутри. */
const sign = (over: Partial<Region> = {}): Region => {
  const r = { x: 1300, y: 600, w: 400, h: 420, kind: "blue" as const, white: 0.18, ...over };
  return { ...r, area: over.area ?? r.w * r.h * 0.9 };
};

/** Табличка под знаком: та же колонка, ниже. */
const plate = (over: Partial<Region> = {}): Region =>
  sign({ x: 1280, y: 1100, w: 440, h: 160, white: 0.2, ...over });

describe("выбор якоря", () => {
  it("берёт плотное квадратное пятно", () => {
    expect(pickAnchor([sign()], phone)).not.toBeNull();
  });

  it("не берёт мелочь: блик, наклейку, кусок неба", () => {
    const speck = sign({ x: 10, y: 10, w: 30, h: 30 });
    expect(pickAnchor([speck], phone)).toBeNull();
  });

  it("не берёт полкадра: это стена или небо, а не знак", () => {
    const wall = sign({ x: 0, y: 0, w: 2600, h: 3200 });
    expect(pickAnchor([wall], phone)).toBeNull();
    expect((wall.w * wall.h) / (phone.w * phone.h)).toBeGreaterThan(MAX_AREA_SHARE);
  });

  it("не берёт вытянутую полосу: знак близок к квадрату", () => {
    expect(pickAnchor([sign({ w: 900, h: 120 })], phone)).toBeNull();
    expect(pickAnchor([sign({ w: 90, h: 900 })], phone)).toBeNull();
  });

  it("не берёт рыхлое пятно: знак заполняет свою рамку", () => {
    expect(pickAnchor([sign({ area: 400 * 420 * 0.2 })], phone)).toBeNull();
  });

  it("якорем бывает только синее: основной знак синий, жёлтое — табличка", () => {
    const blue = sign({ x: 1200, y: 900, kind: "blue" });
    const yellow = sign({ x: 400, y: 900, kind: "yellow" });
    expect(pickAnchor([yellow, blue], phone)).toBe(blue);
    // Жёлтый фасад дома с балконами набирал и белое, и колонку — и побеждал.
    expect(pickAnchor([yellow], phone)).toBeNull();
  });

  it("жёлтое остаётся в колонке: иначе стопка соберётся не целиком", () => {
    const blue = sign();
    const yellowPlate = plate({ kind: "yellow" });
    const box = frameFromAnchor(blue, phone, columnAround(blue, [blue, yellowPlate]));
    expect(box.y + box.h).toBeGreaterThan(yellowPlate.y + yellowPlate.h);
  });

  it("при прочих равных выбирает то, что выше: знак стоит над стопкой", () => {
    const top = sign({ y: 400 });
    const low = sign({ x: 500, y: 3000 });
    expect(pickAnchor([low, top], phone)).toBe(top);
  });

  it("крупное синее берёт верх над мелким, даже если то выше", () => {
    const big = sign({ y: 1800, w: 500, h: 500 });
    const small = sign({ y: 200, w: 150, h: 150 });
    expect(pickAnchor([small, big], phone)).toBe(big);
  });

  it("нечего брать — говорит об этом прямо", () => {
    expect(pickAnchor([], phone)).toBeNull();
  });
});

describe("подтверждение: цвета и размера мало", () => {
  it("синяя полоса без белого и без соседей — не знак, а номер машины", () => {
    // Ровно этот случай был на замере: рамка встала на автомобильный номер.
    const numberPlate = sign({ x: 300, y: 3200, w: 180, h: 260, white: 0.01 });
    expect(pickAnchor([numberPlate], phone)).toBeNull();
  });

  it("белое внутри — уже подтверждение: знак с буквой берётся один", () => {
    expect(pickAnchor([sign()], phone)).not.toBeNull();
  });

  it("таблички под ним — подтверждение даже без белого", () => {
    const dull = sign({ white: 0.005 });
    expect(pickAnchor([dull], phone)).toBeNull();
    expect(pickAnchor([dull, plate({ white: 0.004 })], phone)).toBe(dull);
  });

  it("при выборе побеждает подтверждённое, а не просто большое", () => {
    const big = sign({ x: 200, y: 2500, w: 700, h: 700, white: 0.002 });
    const real = sign({ x: 1500, y: 700, w: 300, h: 320 });
    expect(pickAnchor([big, real, plate({ x: 1480, y: 1150 })], phone)).toBe(real);
  });
});

describe("знак внутри знака", () => {
  // Зональный E20 и «Parkering förbjuden»: синий круг сидит в жёлтом щите.
  const circle = sign({ x: 1400, y: 700, w: 300, h: 300 });
  const shield = sign({ x: 1250, y: 560, w: 620, h: 600, kind: "yellow", white: 0.02 });

  it("щит вокруг круга считается частью знака, а не соседом", () => {
    expect(columnAround(circle, [circle, shield])).toContain(shield);
  });

  it("рамка охватывает щит целиком, а не обрезает по кругу", () => {
    const box = frameFromAnchor(circle, phone, columnAround(circle, [circle, shield]));
    expect(box.x).toBeLessThanOrEqual(shield.x);
    expect(box.y).toBeLessThanOrEqual(shield.y);
    expect(box.x + box.w).toBeGreaterThanOrEqual(shield.x + shield.w);
    expect(box.y + box.h).toBeGreaterThanOrEqual(shield.y + shield.h);
  });

  it("щит с табличками под ним даёт рамку на всю стопку", () => {
    const under = plate({ x: 1300, y: 1250, w: 520, h: 180 });
    const column = columnAround(circle, [circle, shield, under]);
    const box = frameFromAnchor(circle, phone, column);
    expect(column).toHaveLength(2);
    expect(box.y + box.h).toBeGreaterThan(under.y + under.h);
  });
});

describe("протяжённость стопки", () => {
  it("берётся по найденным табличкам, а не по множителю", () => {
    const anchor = sign();
    const low = plate({ y: 1400, h: 200 });
    const box = frameFromAnchor(anchor, phone, [plate(), low]);
    expect(box.y + box.h).toBeGreaterThan(low.y + low.h);
    // И не уезжает далеко за последнюю табличку.
    expect(box.y + box.h).toBeLessThan(low.y + low.h + anchor.h);
  });

  it("шире самой широкой таблички, а не только знака", () => {
    const anchor = sign();
    const wide = plate({ x: 1100, w: 800 });
    const box = frameFromAnchor(anchor, phone, [wide]);
    expect(box.x).toBeLessThan(wide.x);
    expect(box.x + box.w).toBeGreaterThan(wide.x + wide.w);
  });

  it("табличек не видно — запас вниз по множителю, как раньше", () => {
    const anchor = sign();
    const box = frameFromAnchor(anchor, phone, []);
    expect(box.h).toBeCloseTo(anchor.h * (1 + UP_FACTOR + DOWN_FACTOR));
  });
});

describe("рамка от якоря", () => {
  const anchor = sign();
  const box = frameFromAnchor(anchor, phone);

  it("шире самого знака: таблички под ним обычно шире", () => {
    expect(box.w).toBeCloseTo(anchor.w * WIDTH_FACTOR);
  });

  it("уходит вниз с запасом под таблички", () => {
    const below = box.y + box.h - (anchor.y + anchor.h);
    expect(below).toBeGreaterThan(anchor.h * DOWN_FACTOR * 0.9);
  });

  it("знак остаётся внутри рамки и не упирается в её край", () => {
    expect(box.x).toBeLessThan(anchor.x);
    expect(box.y).toBeLessThan(anchor.y);
    expect(box.x + box.w).toBeGreaterThan(anchor.x + anchor.w);
  });

  it("стоит по одной оси со знаком", () => {
    expect(box.x + box.w / 2).toBeCloseTo(anchor.x + anchor.w / 2);
  });

  it("не вылезает за снимок, даже если знак у самого края", () => {
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

  it("одинаковый вход даёт одинаковую рамку", () => {
    expect(frameFromAnchor(anchor, phone)).toEqual(frameFromAnchor(anchor, phone));
  });
});

describe("сбой поиска", () => {
  it("не ломает экран, а отвечает «не нашёл»", () => {
    // Ни canvas, ни картинки здесь нет — ровно то, что случится при сбое.
    expect(suggestFrame({} as CanvasImageSource, phone)).toBeNull();
  });
});

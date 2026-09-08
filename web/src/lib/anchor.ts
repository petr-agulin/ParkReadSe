// Подсказка рамки: где на снимке основной знак.
//
// Это НЕ детектор. Детектором такой поиск уже проверялся и провалился: он терял
// белые таблички и не собирал стопку целиком. Здесь у него работа полегче —
// поставить рамку туда, где, скорее всего, знак, чтобы человеку чаще всего
// оставалось только нажать «отправить». Ошибку видно на экране и она правится
// одним движением, поэтому неверная подсказка стоит секунды, а не ответа.
//
// Ищется только **основной знак**: он всегда цветной — синий `P` или запрещающий.
// Докуда идут таблички, не угадывается, а берётся с запасом вниз.

import type { Box, Size } from "./crop";
import { clamp } from "./crop";

/** Найденное цветное пятно в пикселях исходного снимка. */
export type Region = {
  x: number; y: number; w: number; h: number;
  /** Сколько пикселей действительно закрашено: пятно должно быть плотным. */
  area: number;
  kind: "blue" | "yellow";
  /** Доля светлого внутри пятна. У знака `P` внутри белая буква, у синей полосы
   *  автомобильного номера — почти ничего. Это и отличает знак от машины. */
  white: number;
};

/** Ширина уменьшенной копии, по которой идёт поиск. Больше — медленнее, и без пользы:
 *  знак на снимке с телефона занимает десятки точек даже здесь. */
export const SCAN_WIDTH = 320;

/** Меньше этой доли кадра — шум: блик, наклейка, кусок неба. */
export const MIN_AREA_SHARE = 0.0006;

/** Больше этой доли — не знак, а стена, машина или само небо. */
export const MAX_AREA_SHARE = 0.25;

/** Основной знак близок к квадрату: `P` в квадрате, запрещающий — круг в квадрате. */
export const MIN_ASPECT = 0.45;
export const MAX_ASPECT = 2.2;

/** Пятно должно заполнять свою рамку: у знака заполнение близко к единице,
 *  у случайного мазка — нет. */
export const MIN_FILL = 0.5;

/** Во сколько раз рамка шире найденного знака: таблички под ним обычно шире его. */
export const WIDTH_FACTOR = 1.9;

/** На сколько высот знака рамка уходит вниз, **когда табличек не видно**.
 *  Если они найдены, протяжённость берётся по ним, а не по этому числу. */
export const DOWN_FACTOR = 4.5;

/** Насколько ниже якоря ещё ищутся таблички той же колонки. */
export const COLUMN_REACH = 6;

/** Белого внутри знака: у `P` — буква, у указателей — надписи. Слишком мало
 *  бывает у синей полосы номера и у крашеной стены, слишком много — у окна. */
export const WHITE_MIN = 0.04;
export const WHITE_MAX = 0.65;

/** Небольшой запас над знаком, чтобы он не упирался в край рамки. */
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

/** Держит ли это пятно якорь внутри себя. Так устроен зональный знак E20:
 *  синий круг сидит в жёлтом квадрате, и квадрат — часть того же знака,
 *  а не сосед снизу. */
function encloses(r: Region, anchor: Region): boolean {
  const pad = anchor.h * 0.25;
  return (
    r.x <= anchor.x + pad && r.y <= anchor.y + pad &&
    r.x + r.w >= anchor.x + anchor.w - pad &&
    r.y + r.h >= anchor.y + anchor.h - pad
  );
}

/**
 * Пятна того же знака: висящие под якорем таблички и фон, в котором он сидит.
 *
 * Одного «снизу» мало. У зонального знака (E20) и у «Parkering förbjuden» синий
 * круг находится ВНУТРИ жёлтого щита: по вертикали тот начинается выше и кончается
 * ниже, и правило про соседей снизу его теряло — рамка обрезала знак по кругу.
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
 * Какое из пятен считать основным знаком.
 *
 * Цвет и размер сами по себе ничего не доказывают: синяя полоса автомобильного
 * номера и жёлтая стена проходят такую проверку не хуже знака — так и случилось
 * на замере. Поэтому нужен **признак со стороны**: белое внутри пятна (буква `P`,
 * надписи) или таблички, стоящие с ним одной колонкой. Без подтверждения
 * подсказки нет вовсе — уверенно показать на чужую машину хуже, чем промолчать.
 */
export function pickAnchor(regions: Region[], image: Size): Region | null {
  let best: Region | null = null;
  let bestScore = 0;
  for (const r of regions) {
    // Основной знак в Швеции синий: E19 «P», запрещающие — синий круг с красным.
    // Жёлтое — всегда табличка ПОД знаком, и якорем быть не может: на замере
    // рамка встала на жёлтый фасад дома, которому балконы дали ту самую колонку.
    // В колонку жёлтое по-прежнему входит, иначе не собралась бы стопка целиком.
    if (r.kind !== "blue") continue;
    if (!plausible(r, image)) continue;
    const hasWhite = r.white >= WHITE_MIN && r.white <= WHITE_MAX;
    const column = columnAround(r, regions);
    if (!hasWhite && column.length === 0) continue;   // подтверждения нет

    // Чем выше в кадре, тем вероятнее, что это верх стопки.
    const height = 1 + (1 - (r.y + r.h / 2) / image.h) * 0.5;
    const evidence = (hasWhite ? 1.5 : 1) * (1 + Math.min(column.length, 3) * 0.4);
    const score = r.area * height * evidence;
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

/**
 * Рамка вокруг знака: сам знак сверху, таблички под ним.
 *
 * Докуда идёт стопка, берётся из найденных пятен колонки, а не из числа: на замере
 * постоянный множитель уводил рамку далеко вниз, а на знаке внутри большой жёлтой
 * таблички — наоборот, обрезал её. Пятен не нашлось — тогда запас вниз по-прежнему
 * щедрый: срезанная табличка стоит неверного ответа, лишний фон — одного движения.
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
    // Небольшой запас по краям: у табличек бывает светлая кайма, а цвет её не ловит.
    const pad = anchor.h * 0.2;
    left -= pad; right += pad; bottom += pad;
  }
  top -= anchor.h * UP_FACTOR;

  return clamp({ x: left, y: top, w: right - left, h: bottom - top }, image);
}

/** Светлый ли пиксель: белая буква, надпись, кайма. */
function isWhite(r: number, g: number, b: number): boolean {
  return r > 165 && g > 165 && b > 165;
}

/** Цвет пикселя — знаковый синий или знаковая желтизна? */
function classify(r: number, g: number, b: number): 0 | 1 | 2 {
  if (b > 55 && b - r > 30 && b - g > 14 && !(b > 195 && r > 165)) return 1;
  if (r > 95 && g > 70 && r - b > 55 && g - b > 30) return 2;
  return 0;
}

/**
 * Найти цветные пятна на уменьшенной копии снимка.
 *
 * Единственное место, которому нужны настоящие пиксели, поэтому оно тонкое:
 * решения принимают чистые функции выше, а тесты держат их. Здесь только разметка
 * связных областей.
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
    // Доля светлого внутри рамки пятна: буква `P`, надписи, кайма.
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
 * Предложение рамки для этого снимка, или `null`, если знака не видно.
 *
 * Ошибка поиска — не повод ломать экран: вызывающий тогда ставит рамку по центру,
 * как раньше.
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

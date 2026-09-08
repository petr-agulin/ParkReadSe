// Геометрия кадра: где рамка и что из неё получится.
//
// Здесь нет ни DOM, ни canvas — только числа, поэтому всё проверяется тестами.
// Работа с пикселями живёт рядом, в image.ts, и опирается на решения этого файла.

export type Size = { w: number; h: number };
export type Point = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Доля высоты снимка под рамку по умолчанию. На проверке 0.55 оказалась мала:
 *  вблизи стопка занимает почти весь кадр, и рамку приходилось растягивать каждый раз. */
export const DEFAULT_HEIGHT = 0.7;

/** Ширина к высоте. Стопка знака вытянута вверх, и рамка повторяет её форму. */
export const BOX_ASPECT = 0.45;

/** Меньше этого рамку не ужать: дальше в неё не попадает даже одна табличка. */
export const MIN_SIDE = 24;

/** Запас вокруг рамки при отправке. Срезанная табличка стоит неверного ответа,
 *  лишний фон — нескольких токенов, и цена этих ошибок несопоставима. */
export const MARGIN = 0.18;

/** Предел длинной стороны кадра, уходящего модели. */
export const MAX_SIDE = 1400;

/** Рамка целиком внутри снимка. Сначала ужимаем, если не влезает, потом сдвигаем. */
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

/** Размер рамки по умолчанию: вытянутая вверх, по доле высоты снимка. */
export function defaultSize(image: Size): Size {
  const h = Math.min(image.h * DEFAULT_HEIGHT, image.h);
  const w = Math.min(h * BOX_ASPECT, image.w);
  return { w, h };
}

/** Рамка по умолчанию — по центру снимка. Касания не было, а отправить можно. */
export function defaultBox(image: Size): Box {
  const { w, h } = defaultSize(image);
  return clamp({ x: (image.w - w) / 2, y: (image.h - h) / 2, w, h }, image);
}

/** Рамка вокруг точки касания. У края снимка сдвигается внутрь, а не вылезает. */
export function boxAt(point: Point, image: Size, size?: Size): Box {
  const { w, h } = size ?? defaultSize(image);
  return clamp({ x: point.x - w / 2, y: point.y - h / 2, w, h }, image);
}

/** Сдвиг рамки на вектор, с тем же ограничением по краям. */
export function moveBy(box: Box, dx: number, dy: number, image: Size): Box {
  return clamp({ ...box, x: box.x + dx, y: box.y + dy }, image);
}

/** Тяга за угол: двигается указанный угол, противоположный стоит на месте. */
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

/** Рамка плюс запас по краям, не вылезая за снимок. */
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
  /** Что вырезать из исходного снимка, в его же пикселях. */
  crop: Box;
  /** Размер того, что уйдёт наружу. */
  out: Size;
  /** Уменьшали ли: кадр меньше предела остаётся как есть. */
  downscaled: boolean;
};

/**
 * Порядок обязателен: **сначала кадр, потом уменьшение**.
 *
 * Кадрирование выбрасывает фон и сохраняет пиксели знака; уменьшение целого
 * снимка режет их вместе с фоном. Поэтому предел применяется к вырезанному
 * куску, а не к исходнику, и растягивать мелкий кадр мы не станем никогда:
 * пикселей от этого не прибавится, а вес запроса вырастет.
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
 * Куда ляжет картинка, вписанная целиком в отведённое место (`object-contain`).
 *
 * Нужна и экрану выбора, и видоискателю: у обоих сцена ограничена экраном, форма
 * снимка своя, и вокруг остаются поля. Рамку надо считать по картинке, иначе она
 * съезжает с неё.
 */
export function fit(image: Size, into: Size): Box {
  const scale = Math.min(into.w / image.w, into.h / image.h);
  const w = image.w * scale;
  const h = image.h * scale;
  return { x: (into.w - w) / 2, y: (into.h - h) / 2, w, h };
}

/** Предел приближения. Дальше пиксели снимка всё равно кончаются. */
export const MAX_ZOOM = 8;

/**
 * Экранная точка → пиксель снимка.
 *
 * `placed` — куда сейчас положена картинка на сцене, уже с приближением. Именно
 * поэтому кадр не зависит от приближения: наружу уходит прямоугольник в пикселях
 * ИСХОДНИКА, а увеличение меняет лишь то, чем по нему целятся.
 */
export function toImagePoint(p: Point, placed: Box, image: Size): Point {
  return {
    x: ((p.x - placed.x) / placed.w) * image.w,
    y: ((p.y - placed.y) / placed.h) * image.h,
  };
}

/**
 * Приблизить, оставив точку под пальцами на месте.
 *
 * `base` — картинка без приближения (`fit`), от неё считается кратность: меньше
 * единицы не даём, иначе снимок начал бы болтаться в пустоте.
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
 * Не дать утащить снимок за край.
 *
 * Что меньше сцены — стоит по центру; что больше — прижимается краями, чтобы
 * рядом с картинкой не появлялось пустоты.
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

/** Во сколько раз снимок сейчас увеличен относительно «целиком на экране». */
export function zoomLevel(placed: Box, base: Box): number {
  return placed.w / base.w;
}

/**
 * Какая часть снимка сейчас на экране — в пикселях снимка.
 *
 * Это и есть граница для рамки: выделять то, чего не видно, человек не может,
 * а рамка, ушедшая за край, просто пропадает.
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

/** Доля видимого, которую занимает рамка. Это и есть «как она выглядит на экране». */
export function fractionIn(box: Box, visible: Box): Size {
  return { w: box.w / visible.w, h: box.h / visible.h };
}

/**
 * Рамка для нового приближения: та же доля экрана, и снова по середине.
 *
 * Смысл в том, что на экране рамка выглядит одинаково при любом увеличении —
 * значит, её углы всегда под рукой. А в пикселях снимка она при этом сама
 * сужается: приблизился к дальнему знаку — и выделение уже по нему.
 */
export function frameForView(frac: Size, visible: Box, image: Size): Box {
  const w = visible.w * frac.w;
  const h = visible.h * frac.h;
  return clamp(
    { x: visible.x + (visible.w - w) / 2, y: visible.y + (visible.h - h) / 2, w, h },
    image,
  );
}

/** Доля площади снимка, уходящая наружу. Для подписи под предпросмотром. */
export function shareOfFrame(crop: Box, image: Size): number {
  return (crop.w * crop.h) / (image.w * image.h);
}

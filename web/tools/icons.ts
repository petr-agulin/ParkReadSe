// Иконки приложения. Порт `parkread/icons.py` (шаг 8, этап 3), без библиотеки
// изображений — как и в питоне.
//
// **Что на иконке.** Синий `P` шведского знака внутри белых уголков рамки, той самой,
// которую человек наводит на знак. Голый `P` носят и платёжные парковочные приложения;
// уголки говорят, что это приложение со знаком ДЕЛАЕТ.
//
// Сглаживание — передискретизацией: считаем вчетверо чаще и усредняем. Обычные иконки
// скруглены сами и прозрачны по углам; маскируемая — со сплошным полем и содержимым
// внутри круга радиусом 40% ширины, того самого, внутри которого не режет ни одна маска.

import { deflateSync, inflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

// Синий шведского знака — он же акцент интерфейса (`design.md`).
export const BLUE: [number, number, number] = [0x00, 0x57, 0xa8];
const WHITE: [number, number, number] = [0xff, 0xff, 0xff];

const SUPERSAMPLE = 4;
// Доля ширины, занятая содержимым. У маскируемой она меньше не для красоты: уголки
// рамки — самые дальние от центра точки рисунка, и при 0.62 они ложатся ровно внутрь
// круга безопасности (0.45 * 0.62 * √2 ≈ 0.395 < 0.40).
const SCALE = { plain: 0.94, maskable: 0.62 };
const CORNER_RADIUS = 0.22;

/** Внутри ли точка прямоугольника со скруглением `r`. */
function roundedRect(x: number, y: number, x0: number, y0: number,
                     x1: number, y1: number, r: number): boolean {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x0 <= x && x <= x1 && y0 <= y && y <= y1) {
    if ((x0 + r <= x && x <= x1 - r) || (y0 + r <= y && y <= y1 - r)) return true;
  }
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const disc = (x: number, y: number, cx: number, cy: number, r: number) =>
  (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** Буква `P` в единичном квадрате: прямая стойка и круглая дуга.
 *
 *  Дуга складывается из прямоугольника и круга, а не из скруглённого прямоугольника:
 *  у последнего скругляются ВСЕ углы, и слева, на стыке со стойкой, получалась ступенька. */
function letterP(x: number, y: number): boolean {
  const s = 0.20;                                  // толщина штриха
  const stem = 0.0 <= x && x <= s && 0.0 <= y && y <= 1.0;
  const bowl = (0.0 <= x && x <= 0.52 && 0.0 <= y && y <= 0.56)
            || disc(x, y, 0.52, 0.28, 0.28);
  const hole = (s <= x && x <= 0.52 && s <= y && y <= 0.36)
            || disc(x, y, 0.52, 0.28, 0.08);
  return (stem || bowl) && !hole;
}

/** Четыре уголка рамки. Каждый строится от ВНЕШНЕГО угла внутрь: так обе полосы
 *  кончаются ровно на одной линии. */
function cornerMarks(x: number, y: number, margin: number, length: number,
                     thick: number): boolean {
  for (const [ox, dx] of [[margin, 1.0], [1.0 - margin, -1.0]] as const) {
    for (const [oy, dy] of [[margin, 1.0], [1.0 - margin, -1.0]] as const) {
      const hx = [ox, ox + dx * length].sort((a, b) => a - b);
      const hy = [oy, oy + dy * thick].sort((a, b) => a - b);
      const vx = [ox, ox + dx * thick].sort((a, b) => a - b);
      const vy = [oy, oy + dy * length].sort((a, b) => a - b);
      const horizontal = hx[0] <= x && x <= hx[1] && hy[0] <= y && y <= hy[1];
      const vertical = vx[0] <= x && x <= vx[1] && vy[0] <= y && y <= vy[1];
      if (horizontal || vertical) return true;
    }
  }
  return false;
}

/** Белое ли в точке поля: буква или уголок рамки. */
function ink(u: number, v: number): boolean {
  const lu = (u - 0.34) / 0.32;
  const lv = (v - 0.27) / 0.46;
  if (0.0 <= lu && lu <= 1.0 && 0.0 <= lv && lv <= 1.0 && letterP(lu, lv)) return true;
  return 0.0 <= u && u <= 1.0 && 0.0 <= v && v <= 1.0
      && cornerMarks(u, v, 0.05, 0.22, 0.06);
}

export type Pixel = [number, number, number, number];

/** Одна строка иконки, RGBA. Отдельной функцией — чтобы тест мог сверить выборочные
 *  строки готового файла с кодом, не перерисовывая всю картинку. */
export function row(size: number, py: number, maskable: boolean): Pixel[] {
  const big = size * SUPERSAMPLE;
  const scale = maskable ? SCALE.maskable : SCALE.plain;
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;
  const out: Pixel[] = [];
  for (let px = 0; px < size; px += 1) {
    let ground = 0;
    let white = 0;
    for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
      const y = (py * SUPERSAMPLE + sy + 0.5) / big;
      for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
        const x = (px * SUPERSAMPLE + sx + 0.5) / big;
        if (!maskable && !roundedRect(x, y, 0, 0, 1, 1, CORNER_RADIUS)) continue;
        ground += 1;
        if (ink((x - 0.5) / scale + 0.5, (y - 0.5) / scale + 0.5)) white += 1;
      }
    }
    const share = ground ? white / ground : 0;          // доля белого в поле
    const colour = [0, 1, 2].map((i) => pyRound(BLUE[i] + (WHITE[i] - BLUE[i]) * share));
    out.push([colour[0], colour[1], colour[2], pyRound(255 * ground / perPixel)]);
  }
  return out;
}

/** Округление, как у питона: половина уходит к ЧЁТНОМУ. `Math.round` округляет
 *  половину вверх, и на краях буквы это дало бы другой пиксель. */
function pyRound(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest > 0.5) return floor + 1;
  if (rest < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function paint(size: number, maskable: boolean): Pixel[][] {
  const rows: Pixel[][] = [];
  for (let py = 0; py < size; py += 1) rows.push(row(size, py, maskable));
  return rows;
}

function chunk(tag: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(tag, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG из пикселей: заголовок, данные, конец. 8 бит, RGBA, фильтр строк нулевой. */
export function png(rows: Pixel[][]): Buffer {
  const height = rows.length;
  const width = rows[0].length;
  const raw = Buffer.alloc(height * (1 + width * 4));
  let at = 0;
  for (const line of rows) {
    raw[at] = 0;
    at += 1;
    for (const px of line) {
      raw[at] = px[0]; raw[at + 1] = px[1]; raw[at + 2] = px[2]; raw[at + 3] = px[3];
      at += 4;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Обратно в пиксели — для проверки. Разбор узкий: только то, что пишем сами. */
export function decode(data: Buffer): { width: number; height: number; rows: Pixel[][] } {
  if (data.subarray(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") {
    throw new Error("не PNG");
  }
  let at = 8;
  let header: Buffer | null = null;
  const parts: Buffer[] = [];
  while (at < data.length) {
    const length = data.readUInt32BE(at);
    const tag = data.subarray(at + 4, at + 8).toString("latin1");
    const payload = data.subarray(at + 8, at + 8 + length);
    if (tag === "IHDR") header = payload;
    if (tag === "IDAT") parts.push(payload);
    at += 12 + length;
  }
  if (!header) throw new Error("нет заголовка");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (header[8] !== 8 || header[9] !== 6) {
    throw new Error(`ожидалось 8 бит RGBA, а не ${header[8]}/${header[9]}`);
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = 1 + width * 4;
  const rows: Pixel[][] = [];
  for (let y = 0; y < height; y += 1) {
    const line = raw.subarray(y * stride, (y + 1) * stride);
    if (line[0] !== 0) throw new Error("строка с фильтром: такие мы не пишем");
    const out: Pixel[] = [];
    for (let x = 0; x < width; x += 1) {
      out.push([line[1 + x * 4], line[2 + x * 4], line[3 + x * 4], line[4 + x * 4]]);
    }
    rows.push(out);
  }
  return { width, height, rows };
}

export const ICONS: { file: string; size: number; maskable: boolean }[] = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

export function render(name: string): Buffer {
  const icon = ICONS.find((i) => i.file === name);
  if (!icon) throw new Error(name);
  return png(paint(icon.size, icon.maskable));
}

const samePixels = (a: Pixel[][], b: Pixel[][]) =>
  a.length === b.length && a.every((line, y) =>
    line.length === b[y].length && line.every((px, x) => px.every((v, i) => v === b[y][x][i])));

/** Нарисовать все иконки. Возвращает имена изменившихся файлов.
 *
 *  Сравниваются ПИКСЕЛИ, а не байты: сжатие у разных реализаций zlib может
 *  отличаться при том же изображении, и переписывать файл ради этого незачем. */
export function write(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const changed: string[] = [];
  for (const icon of ICONS) {
    const data = render(icon.file);
    const path = join(outDir, icon.file);
    if (existsSync(path)
        && samePixels(decode(readFileSync(path)).rows, decode(data).rows)) continue;
    writeFileSync(path, data);
    changed.push(icon.file);
  }
  return changed;
}

if (process.argv[1] && process.argv[1].endsWith("icons.ts")) {
  const changed = write(join(ROOT, "web", "public"));
  console.log(changed.length ? "перерисовано: " + changed.join(", ")
                             : "нечего перерисовывать: иконки совпадают");
}

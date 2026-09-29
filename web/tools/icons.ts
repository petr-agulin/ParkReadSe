// **What is on the icon** (step 20c, design B, chosen by the developer). A white `P`
// with the proportions of the road sign inside the four white corners of a frame - the
// very frame a person aims at a sign - on the interface's blue, lighter at the top. A
// bare `P` is what every parking app wears; the corners say what this one DOES.
//
// Full-bleed, as a phone expects: the maskable icon is the drawing itself, and the
// phone cuts its own shape; the ordinary ones are the same drawing rounded by
// themselves, transparent at the corners. The frame's outer corners stay inside the
// circle of radius 40% that no mask cuts into, so one drawing serves both.
//
// Smoothing is by supersampling: count four times as often and average.

import { deflateSync, inflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

type Rgb = [number, number, number];

/** The interface's blue, lighter at the top of the icon and deeper at the foot. The
 *  middle of the two is the accent itself, `#316ca5`, and the theme colour with it. */
export const TOP: Rgb = [0x43, 0x81, 0xbb];
export const FOOT: Rgb = [0x1f, 0x57, 0x8f];
const WHITE: Rgb = [0xff, 0xff, 0xff];

const SUPERSAMPLE = 4;
const CORNER_RADIUS = 0.22;

// The drawing, in 512ths of the icon's side.
const U = 1 / 512;

/** The road sign's `P`: a stem a fifth of the letter's height, a round bowl over the
 *  top 58% of it, the stroke even all round. */
const LETTER = (() => {
  const H = 176 * U;
  const x = 0.5 - (0.64 * H) / 2 + 0.02 * H;   // optically centred: the bowl weighs right
  const y = 0.5 - H / 2;
  const sw = 0.2 * H, W = 0.64 * H, bowl = 0.58 * H;
  const r = bowl / 2, ri = (bowl - 2 * sw) / 2;
  return { x, y, H, sw, bowl, r, ri, ax: x + W - r };
})();

/** The frame's four corners: each a bent stroke with round ends, 20/512 thick. */
const CORNERS: [number, number][][] = [
  [[132, 186], [132, 132], [186, 132]],
  [[326, 132], [380, 132], [380, 186]],
  [[380, 326], [380, 380], [326, 380]],
  [[186, 380], [132, 380], [132, 326]],
].map((corner) => corner.map(([a, b]) => [a * U, b * U] as [number, number]));
const HALF_STROKE = 10 * U;

/** Whether the point lies inside a rectangle rounded by `r`. */
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

function letterP(x: number, y: number): boolean {
  const { x: lx, y: ly, H, sw, bowl, r, ri, ax } = LETTER;
  const stem = lx <= x && x <= lx + sw && ly <= y && y <= ly + H;
  const cy = ly + bowl / 2;
  const outer = (lx <= x && x <= ax && ly <= y && y <= ly + bowl) || (x >= ax && disc(x, y, ax, cy, r));
  const hole = (lx + sw <= x && x <= ax && ly + sw <= y && y <= ly + bowl - sw)
            || (x >= ax && disc(x, y, ax, cy, ri));
  return stem || (outer && !hole);
}

/** The distance from a point to a segment. */
function toSegment(x: number, y: number, [ax, ay]: [number, number], [bx, by]: [number, number]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function cornerMarks(x: number, y: number): boolean {
  return CORNERS.some((c) => toSegment(x, y, c[0], c[1]) <= HALF_STROKE
                          || toSegment(x, y, c[1], c[2]) <= HALF_STROKE);
}

/** Whether a point of the field is white: the letter or a corner of the frame. */
export function ink(u: number, v: number): boolean {
  return letterP(u, v) || cornerMarks(u, v);
}

/** The field's blue at a height `v` from the top. */
export function ground(v: number): Rgb {
  return [0, 1, 2].map((i) => TOP[i] + (FOOT[i] - TOP[i]) * v) as Rgb;
}

export type Pixel = [number, number, number, number];

/** One row of the icon, RGBA: the mean colour of the samples that fall on the field,
 *  and how much of the pixel the field covers. A function of its own, so that a test can compare sample
 *  rows of the finished file with the code without redrawing the whole picture. */
export function row(size: number, py: number, maskable: boolean): Pixel[] {
  const big = size * SUPERSAMPLE;
  const perPixel = SUPERSAMPLE * SUPERSAMPLE;
  const out: Pixel[] = [];
  for (let px = 0; px < size; px += 1) {
    let field = 0;
    const colour: Rgb = [0, 0, 0];
    for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
      const y = (py * SUPERSAMPLE + sy + 0.5) / big;
      for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
        const x = (px * SUPERSAMPLE + sx + 0.5) / big;
        if (!maskable && !roundedRect(x, y, 0, 0, 1, 1, CORNER_RADIUS)) continue;
        field += 1;
        const c = ink(x, y) ? WHITE : ground(y);
        colour[0] += c[0]; colour[1] += c[1]; colour[2] += c[2];
      }
    }
    const mean = colour.map((v) => pyRound(field ? v / field : 0));
    out.push([mean[0], mean[1], mean[2], pyRound(255 * field / perPixel)]);
  }
  return out;
}

/** Rounding as in Python: a half goes to the EVEN side. `Math.round` rounds a half up,
 *  and at the edges of the letter that would give a different pixel. */
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

/** A PNG from pixels: header, data, end. 8 bits, RGBA, row filter zero. */
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

/** Back into pixels — for checking. The parsing is narrow: only what we write ourselves. */
export function decode(data: Buffer): { width: number; height: number; rows: Pixel[][] } {
  if (data.subarray(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") {
    throw new Error("not a PNG");
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
  if (!header) throw new Error("no header");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (header[8] !== 8 || header[9] !== 6) {
    throw new Error(`expected 8-bit RGBA, not ${header[8]}/${header[9]}`);
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = 1 + width * 4;
  const rows: Pixel[][] = [];
  for (let y = 0; y < height; y += 1) {
    const line = raw.subarray(y * stride, (y + 1) * stride);
    if (line[0] !== 0) throw new Error("a filtered row: we write none of those");
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

/** Draw every icon. Returns the names of the files that changed.
 *
 *  PIXELS are compared, not bytes: different zlib implementations may compress the
 *  same image differently, and that is no reason to rewrite a file. */
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
  console.log(changed.length ? "redrawn: " + changed.join(", ")
                             : "nothing to redraw: the icons match");
}

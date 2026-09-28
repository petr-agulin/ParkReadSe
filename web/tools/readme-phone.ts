// The README's main picture: a phone, and the reading screen scrolling slowly down it
// and back up (step 18). For the developer only, and on Node only.
//
//     npm run readme:phone -- <screenshot>... [--time 14:16] [--trim-top N] [--trim-bottom N]
//     npm run readme:phone -- --time 21:52     (again, from images/readme-screen.jpg)
//
// One long capture of the reading screen, or several ordinary screenshots taken while
// scrolling, each overlapping the one before: they are joined where they repeat each
// other. `--trim-top` and `--trim-bottom` cut the phone's own status bar, the
// browser's address bar and the system buttons off every screenshot, in its pixels:
// the picture draws its own.
//
// SVG rather than GIF: GitHub shows it animated in a README, the case and the bars are
// drawn and stay sharp at any size, and the scrolling is smooth rather than stepped
// through 256 colours. The screenshot travels inside the file.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import jpeg from "jpeg-js";

import { decode, type Rgba } from "./pixels";
import { ROOT } from "./testset";

export const OUT = join(ROOT, "images", "readme-main.svg");
/** The long screen, when it was joined from several screenshots. */
export const SCREEN_OUT = join(ROOT, "images", "readme-screen.jpg");

/** The phone's geometry, in the picture's own units. */
const CANVAS = { w: 480, h: 964 };   // room below for the shadow
const BODY = { x: 20, y: 16, w: 440, h: 900, r: 64 };
const SCREEN = { x: 34, y: 30, w: 412, h: 872, r: 50 };
const STATUS = 38;   // the status bar's height
const NAV = 46;      // the system buttons' height

/** Scrolling speed, in picture units a second, and the rests at the top and bottom. */
const SPEED = 85;
const REST = 1.8;

export type Options = { time?: string; trimTop?: number; trimBottom?: number };

/** A pixel's colour as `#rrggbb`. */
const hex = (d: Uint8Array, i: number) =>
  "#" + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");

export function phoneSvg(bytes: Uint8Array, mime: string, opts: Options = {}): string {
  const img = decode(bytes);
  const trimTop = opts.trimTop ?? 0;
  const trimBottom = opts.trimBottom ?? 0;
  const shownH = img.h - trimTop - trimBottom;
  // The bars take the screenshot's own background, so the screen reads as one surface.
  const ground = hex(img.data, (trimTop * img.w + 1) * 4);

  const k = SCREEN.w / img.w;               // screenshot pixels to picture units
  const viewTop = SCREEN.y + STATUS;
  const viewH = SCREEN.h - STATUS - NAV;
  const scroll = Math.max(0, Math.round(shownH * k - viewH));
  const travel = scroll / SPEED;
  const dur = +(2 * REST + 2 * travel).toFixed(2);
  const t = (s: number) => +(s / dur).toFixed(4);
  // Rest at the top, glide down, rest at the bottom, glide back up.
  const keyTimes = [0, t(REST), t(REST + travel), t(2 * REST + travel), 1].join(";");
  const values = ["0 0", "0 0", `0 ${-scroll}`, `0 ${-scroll}`, "0 0"].join(";");
  const ease = "0.45 0 0.55 1";
  const splines = ["0 0 1 1", ease, "0 0 1 1", ease].join(";");

  const imgY = viewTop - trimTop * k;
  const ink = "#1d2230";
  const soft = "#5c6370";
  const time = opts.time ?? "14:16";
  const sb = SCREEN.y + STATUS / 2 + 5;      // the status bar's text line
  const right = SCREEN.x + SCREEN.w - 24;
  const navY = SCREEN.y + SCREEN.h - NAV / 2;
  const cx = SCREEN.x + SCREEN.w / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" width="${CANVAS.w / 1.25}" height="${CANVAS.h / 1.25}" role="img" aria-labelledby="t d">
  <title id="t">ParkRead Sweden on a phone</title>
  <desc id="d">The sign reading screen scrolls slowly from top to bottom and back: the parking window on a timeline, who can park here, and what was read, plate by plate, beside the photo of the sign.</desc>
  <defs>
    <linearGradient id="case" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3a3f48"/>
      <stop offset="0.5" stop-color="#23262c"/>
      <stop offset="1" stop-color="#16181c"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b717c"/>
      <stop offset="1" stop-color="#2a2d33"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-10%" width="140%" height="125%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/>
    </filter>
    <clipPath id="screen"><rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="${SCREEN.r}"/></clipPath>
    <clipPath id="view"><rect x="${SCREEN.x}" y="${viewTop}" width="${SCREEN.w}" height="${viewH}"/></clipPath>
  </defs>

  <!-- The case: an abstract phone, with its side buttons. -->
  <rect x="${BODY.x + BODY.w - 2}" y="190" width="6" height="64" rx="3" fill="url(#rim)"/>
  <rect x="${BODY.x + BODY.w - 2}" y="280" width="6" height="110" rx="3" fill="url(#rim)"/>
  <rect x="${BODY.x}" y="${BODY.y}" width="${BODY.w}" height="${BODY.h}" rx="${BODY.r}" fill="url(#case)" filter="url(#shadow)"/>
  <rect x="${BODY.x + 1.5}" y="${BODY.y + 1.5}" width="${BODY.w - 3}" height="${BODY.h - 3}" rx="${BODY.r - 1.5}" fill="none" stroke="#5a606b" stroke-opacity="0.6" stroke-width="1.5"/>

  <g clip-path="url(#screen)">
    <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" fill="${ground}"/>

    <!-- The screen itself, scrolling. -->
    <g clip-path="url(#view)">
      <g>
        <animateTransform attributeName="transform" type="translate" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keyTimes="${keyTimes}" values="${values}" keySplines="${splines}"/>
        <image x="${SCREEN.x}" y="${imgY.toFixed(2)}" width="${SCREEN.w}" height="${(img.h * k).toFixed(2)}" preserveAspectRatio="none" href="data:${mime};base64,${Buffer.from(bytes).toString("base64")}"/>
      </g>
    </g>

    <!-- The status bar: the time, the network, Wi-Fi, the battery; the camera between. -->
    <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${STATUS}" fill="${ground}"/>
    <text x="${SCREEN.x + 30}" y="${sb}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="${ink}">${time}</text>
    <circle cx="${cx}" cy="${SCREEN.y + STATUS / 2}" r="7" fill="#0b0c0e"/>
    <circle cx="${cx - 2}" cy="${SCREEN.y + STATUS / 2 - 2}" r="2" fill="#2c3440"/>
    <g fill="${ink}">
      <rect x="${right - 20}" y="${sb - 11}" width="15" height="10" rx="2.5" fill="none" stroke="${ink}" stroke-width="1.4"/>
      <rect x="${right - 18.2}" y="${sb - 9.2}" width="8" height="6.4" rx="1.2"/>
      <rect x="${right - 4.2}" y="${sb - 8}" width="1.8" height="4" rx="0.8"/>
      <path d="M ${right - 44} ${sb - 4.5} a 9 9 0 0 1 13 0 l -1.6 1.7 a 6.6 6.6 0 0 0 -9.8 0 z"/>
      <path d="M ${right - 41.2} ${sb - 1.6} a 5 5 0 0 1 7.4 0 l -3.7 3.8 z"/>
      <path d="M ${right - 47.2} ${sb - 7.6} a 13.5 13.5 0 0 1 19.4 0 l -1.6 1.7 a 11.2 11.2 0 0 0 -16.2 0 z"/>
      <rect x="${right - 70}" y="${sb - 3}" width="2.6" height="3" rx="0.6"/>
      <rect x="${right - 66}" y="${sb - 5.5}" width="2.6" height="5.5" rx="0.6"/>
      <rect x="${right - 62}" y="${sb - 8}" width="2.6" height="8" rx="0.6"/>
      <rect x="${right - 58}" y="${sb - 10.5}" width="2.6" height="10.5" rx="0.6"/>
    </g>

    <!-- The system buttons: recent apps, home, back. -->
    <rect x="${SCREEN.x}" y="${SCREEN.y + SCREEN.h - NAV}" width="${SCREEN.w}" height="${NAV}" fill="${ground}"/>
    <rect x="${cx - 96}" y="${navY - 7}" width="14" height="14" rx="2.5" fill="${soft}"/>
    <circle cx="${cx}" cy="${navY}" r="8.5" fill="none" stroke="${soft}" stroke-width="2.6"/>
    <path d="M ${cx + 96} ${navY - 8.5} L ${cx + 96} ${navY + 8.5} L ${cx + 83} ${navY} Z" fill="${soft}" stroke="${soft}" stroke-width="1.5" stroke-linejoin="round"/>
  </g>

  <!-- The edge of the glass. -->
  <rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="${SCREEN.r}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="1"/>
</svg>
`;
}

/** Rows `from` to `to` of a picture. */
function rows(img: Rgba, from: number, to: number): Rgba {
  return { w: img.w, h: to - from, data: img.data.slice(from * img.w * 4, to * img.w * 4) };
}

/** How unlike the bottom `n` rows of `a` are the top `n` rows of `b`: the mean
 *  difference of their pixels, on every fourth column. */
function unlike(a: Rgba, b: Rgba, n: number): number {
  let sum = 0, count = 0;
  for (let y = 0; y < n; y++) {
    const ra = (a.h - n + y) * a.w * 4, rb = y * b.w * 4;
    for (let x = 0; x < a.w; x += 4) {
      const i = x * 4;
      sum += Math.abs(a.data[ra + i] - b.data[rb + i]) + Math.abs(a.data[ra + i + 1] - b.data[rb + i + 1])
           + Math.abs(a.data[ra + i + 2] - b.data[rb + i + 2]);
      count += 3;
    }
  }
  return sum / count;
}

/** How many rows the top of `b` repeats of the bottom of `a`. Of the candidate overlaps
 *  the most alike wins; a plain background matches anywhere, so among equally good
 *  ones the longest - the one carrying the most of the picture - is taken. */
export function overlap(a: Rgba, b: Rgba, least = 8): number {
  let best = least, bestScore = Infinity;
  for (let n = least; n < Math.min(a.h, b.h); n++) {
    const s = unlike(a, b, n);
    if (s < bestScore - 0.25 || (s <= bestScore + 0.25 && n > best && s < 3)) {
      if (s < bestScore) bestScore = s;
      best = n;
    }
  }
  return best;
}

/** Screenshots taken while scrolling, joined into one long screen. Each loses the
 *  phone's own bars first: `trimTop` and `trimBottom` rows. */
export function stitch(shots: Rgba[], trimTop = 0, trimBottom = 0): Rgba {
  const parts = shots.map((s) => rows(s, trimTop, s.h - trimBottom));
  let whole = parts[0];
  for (const next of parts.slice(1)) {
    const n = overlap(whole, next);
    const joined = new Uint8Array(whole.data.length + (next.h - n) * next.w * 4);
    joined.set(whole.data);
    joined.set(next.data.subarray(n * next.w * 4), whole.data.length);
    whole = { w: whole.w, h: whole.h + next.h - n, data: joined };
  }
  return whole;
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const time = flag("--time");
  const trimTop = Number(flag("--trim-top") ?? 0);
  const trimBottom = Number(flag("--trim-bottom") ?? 0);
  const sources = args.length ? args : [SCREEN_OUT];
  let bytes = new Uint8Array(readFileSync(sources[0]));
  let mime = bytes[0] === 0x89 ? "image/png" : "image/jpeg";
  let trims = { trimTop, trimBottom };
  if (sources.length > 1) {
    // Several screenshots: joined into one, kept beside the picture so it can be made
    // again from it alone.
    const long = stitch(sources.map((s) => decode(new Uint8Array(readFileSync(s)))),
                        trimTop, trimBottom);
    bytes = new Uint8Array(jpeg.encode({ data: Buffer.from(long.data), width: long.w,
                                         height: long.h }, 92).data);
    mime = "image/jpeg";
    trims = { trimTop: 0, trimBottom: 0 };
    writeFileSync(SCREEN_OUT, bytes);
    console.log(`written: images/readme-screen.jpg (${long.w}x${long.h})`);
  }
  const svg = phoneSvg(bytes, mime, { time, ...trims });
  writeFileSync(OUT, svg);
  console.log(`written: images/readme-main.svg (${Math.round(svg.length / 1024)} KB)`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/readme-phone.ts")) main();

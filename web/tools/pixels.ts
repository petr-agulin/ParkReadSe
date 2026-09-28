// A photograph from disk as the browser would see it, reduced to the size of the
// detector's scan (step 17). For the developer's tools only, and on Node only.
//
// Two things a browser does that a decoder does not: it turns the photograph upright
// by its EXIF orientation, and it smooths when it reduces. Both are repeated here, or
// the measurement would judge a picture the screen never shows.

import jpeg from "jpeg-js";
import { PNG } from "pngjs";

import type { Size } from "../src/lib/crop";

export type Rgba = { data: Uint8Array; w: number; h: number };

/** EXIF orientation of a JPEG, 1 when there is none. */
export function orientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let at = 2;
  while (at + 4 < bytes.length) {
    if (bytes[at] !== 0xff) return 1;
    const marker = bytes[at + 1];
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    // APP1 "Exif\0\0"
    if (marker === 0xe1 && bytes[at + 4] === 0x45 && bytes[at + 5] === 0x78
        && bytes[at + 6] === 0x69 && bytes[at + 7] === 0x66) {
      const tiff = at + 10;
      const little = bytes[tiff] === 0x49;
      const u16 = (i: number) => little ? bytes[i] | (bytes[i + 1] << 8)
                                        : (bytes[i] << 8) | bytes[i + 1];
      const u32 = (i: number) => little
        ? (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0
        : ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      const ifd = tiff + u32(tiff + 4);
      const count = u16(ifd);
      for (let e = 0; e < count; e++) {
        const entry = ifd + 2 + e * 12;
        if (u16(entry) === 0x0112) return u16(entry + 8) || 1;
      }
      return 1;
    }
    if (marker === 0xda) return 1;   // image data begins: no EXIF before it
    at += 2 + length;
  }
  return 1;
}

/** Decode a JPEG or PNG into RGBA, in the file's own orientation. */
export function decode(bytes: Uint8Array): Rgba {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { data: new Uint8Array(png.data), w: png.width, h: png.height };
  }
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true,
                                   maxMemoryUsageInMB: 2048 });
  return { data: img.data, w: img.width, h: img.height };
}

/** Turn the picture upright by an EXIF orientation (1-8), as a browser does. */
export function upright(img: Rgba, o: number): Rgba {
  if (o <= 1 || o > 8) return img;
  const turned = o >= 5;
  const w = turned ? img.h : img.w;
  const h = turned ? img.w : img.h;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Where the output pixel (x, y) comes from in the stored picture.
      let sx: number, sy: number;
      switch (o) {
        case 2: sx = img.w - 1 - x; sy = y; break;
        case 3: sx = img.w - 1 - x; sy = img.h - 1 - y; break;
        case 4: sx = x; sy = img.h - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = img.h - 1 - x; break;
        case 7: sx = img.w - 1 - y; sy = img.h - 1 - x; break;
        default: sx = img.w - 1 - y; sy = x; break;   // 8
      }
      const from = (sy * img.w + sx) * 4;
      const to = (y * w + x) * 4;
      out[to] = img.data[from];
      out[to + 1] = img.data[from + 1];
      out[to + 2] = img.data[from + 2];
      out[to + 3] = img.data[from + 3];
    }
  }
  return { data: out, w, h };
}

/** Reduce by averaging each block of pixels - what a smoothing canvas does. */
export function reduce(img: Rgba, to: Size): Rgba {
  const out = new Uint8Array(to.w * to.h * 4);
  const sx = img.w / to.w;
  const sy = img.h / to.h;
  for (let y = 0; y < to.h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < to.w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < img.h; yy++) {
        for (let xx = x0; xx < x1 && xx < img.w; xx++) {
          const i = (yy * img.w + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      const o = (y * to.w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { data: out, w: to.w, h: to.h };
}

/** A photograph from disk, upright, at full size. */
export function photo(bytes: Uint8Array): Rgba {
  return upright(decode(bytes), orientation(bytes));
}

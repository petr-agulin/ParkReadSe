// The application's icons. Carried over from `tests/test_icons.py` (step 8, stage 3).
//
// A picture can be checked by eye once; after that, code checks it. Three questions:
// does the file on disk match what the generator draws; does the maskable icon's
// content stay inside the circle no mask cuts into; are the ordinary icon's corners
// transparent — or a white corner lies like a patch on a dark screen.
//
// The files are not redrawn: a full pass over 512×512 takes seconds. The finished file
// is decoded back into pixels, and sample rows are compared with the code.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BLUE, ICONS, ROOT, decode, row } from "./icons";

const PUBLIC = join(ROOT, "web", "public");
const decoded = (file: string) => decode(readFileSync(join(PUBLIC, file)));

describe("the icons", () => {
  it("keeps the files on disk exactly what the code draws", () => {
    for (const { file, size, maskable } of ICONS) {
      const { width, height, rows } = decoded(file);
      expect([width, height], file).toEqual([size, size]);
      // Nine rows over the whole height: an edit to the drawing changes at least one.
      for (let k = 0; k <= 8; k += 1) {
        const py = Math.min(Math.round((size * k) / 8), size - 1);
        expect(rows[py], `${file}, row ${py}`).toEqual(row(size, py, maskable));
      }
    }
  });

  it("keeps everything of the maskable icon inside the safe circle", () => {
    // A circle of radius 40% of the width is what survives any mask. The frame's
    // corners are the drawing's points furthest from the centre, and they must not be
    // cut: without them the icon becomes one more parking `P`.
    const size = 512;
    const limit = 0.4 * size;
    const { rows } = decoded("icon-maskable-512.png");
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const [r, g, b, a] = rows[y][x];
        expect(a, "the maskable icon's field is solid").toBe(255);
        if (r > 200 && g > 200 && b > 200) {
          const far = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
          expect(far <= limit, `white at (${x}, ${y}) goes past the circle`).toBe(true);
        }
      }
    }
  });

  it("keeps the ordinary icons transparent at the corners", () => {
    // An ordinary icon is rounded by itself. An opaque corner is a white patch, visible
    // on every screen but a white one.
    for (const { file, size, maskable } of ICONS) {
      if (maskable) continue;
      const { rows } = decoded(file);
      expect(rows[0][0][3], `${file}: the corner is opaque`).toBe(0);
      expect(rows[size >> 1][size >> 1][3], `${file}: the middle is not solid`).toBe(255);
    }
  });

  it("wears the blue of the Swedish sign", () => {
    // The icon keeps the blue of the sign itself, whatever the interface's accent.
    expect(decoded("icon-512.png").rows[256][8].slice(0, 3)).toEqual(BLUE);
  });
});

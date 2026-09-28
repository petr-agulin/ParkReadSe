// The README's phone picture (step 18): the screen scrolls exactly as far as the
// screenshot runs past it, and no further.

import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import type { Rgba } from "./pixels";
import { overlap, phoneSvg, stitch } from "./readme-phone";

/** A plain screenshot `w` by `h`, in the app's screen colour. */
function shot(w: number, h: number): Uint8Array {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([244, 245, 247, 255], i);
  return new Uint8Array(PNG.sync.write(png));
}

const travel = (svg: string) => Number(/values="0 0;0 0;0 (-?\d+);/.exec(svg)![1]);

describe("the phone picture", () => {
  it("scrolls a long screen to its very end and back", () => {
    // 412 units of screen width for 1080 pixels; 788 units of screen between the bars.
    const svg = phoneSvg(shot(1080, 5000), "image/png");
    expect(-travel(svg)).toBe(Math.round(5000 * (412 / 1080) - 788));
    expect(svg).toContain('repeatCount="indefinite"');
  });

  it("does not scroll a screen that fits", () => {
    expect(travel(phoneSvg(shot(1080, 1500), "image/png"))).toBe(0);
  });

  it("trimming the phone's own bars shortens the scroll by exactly their height", () => {
    const whole = travel(phoneSvg(shot(1080, 5000), "image/png"));
    const trimmed = travel(phoneSvg(shot(1080, 5000), "image/png", { trimTop: 100, trimBottom: 150 }));
    expect(trimmed - whole).toBe(Math.round(250 * (412 / 1080)));
  });

  it("carries the screenshot inside, and says what it shows", () => {
    const svg = phoneSvg(shot(40, 80), "image/png", { time: "09:41" });
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain(">09:41</text>");
    expect(svg).toMatch(/<title id="t">[^<]+<\/title>/);
    // The bars take the screenshot's own background.
    expect(svg).toContain('fill="#f4f5f7"');
  });
});

describe("joining screenshots taken while scrolling", () => {
  /** A tall screen whose every row is its own: stripes of lettering on a background. */
  function screen(w: number, h: number): Rgba {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ink = (x * 7 + y * 13) % 97 < 20 && y % 40 < 24;
      const v = ink ? (y * 3) % 200 : 244;
      data.set([v, ink ? 60 : 245, ink ? 100 : 247, 255], i);
    }
    return { data, w, h };
  }
  /** Rows `from` to `to`, with a dark bar of `top` rows above and `bottom` below. */
  function shot(s: Rgba, from: number, to: number, top: number, bottom: number): Rgba {
    const h = top + (to - from) + bottom;
    const data = new Uint8Array(s.w * h * 4).fill(20);
    data.set(s.data.subarray(from * s.w * 4, to * s.w * 4), top * s.w * 4);
    return { data, w: s.w, h };
  }

  it("gives back the whole screen, the phone's bars cut off and every row once", () => {
    const whole = screen(60, 900);
    const shots = [shot(whole, 0, 400, 30, 12), shot(whole, 250, 650, 30, 12),
                   shot(whole, 620, 900, 30, 12)];
    const joined = stitch(shots, 30, 12);
    expect(joined.h).toBe(900);
    expect(Buffer.from(joined.data).equals(Buffer.from(whole.data))).toBe(true);
  });

  it("finds a small overlap as well as a large one", () => {
    const whole = screen(60, 600);
    const a = shot(whole, 0, 400, 0, 0);
    expect(overlap(a, shot(whole, 390, 600, 0, 0))).toBe(10);
    expect(overlap(a, shot(whole, 100, 600, 0, 0))).toBe(300);
  });
});

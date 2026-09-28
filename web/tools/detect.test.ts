// The detector's measurement (step 17): the judging of a frame, the photograph as a
// browser shows it, and the dev server that serves the marking page.

import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import { frameFor } from "./detect";
import { GOOD, TOLERABLE, judge } from "./frames";
import { marks } from "./marks-server";
import { decode, orientation, reduce, upright, type Rgba } from "./pixels";

const sign = { x: 100, y: 100, w: 100, h: 200 };

describe("judging a frame against the marked sign", () => {
  it("good: holds all of the sign, and the sign is a fair part of the frame", () => {
    expect(judge(sign, { x: 90, y: 90, w: 120, h: 220 }).grade).toBe("good");
  });

  it("tolerable: most of the sign, in a frame much larger than it", () => {
    // Holds 85% of the sign; the sign fills about 12% of the frame.
    const v = judge(sign, { x: 100, y: 130, w: 400, h: 350 });
    expect(v.covers).toBeGreaterThanOrEqual(TOLERABLE.covers);
    expect(v.covers).toBeLessThan(GOOD.covers);
    expect(v.grade).toBe("tolerable");
  });

  it("wrong: beside the sign, or the whole photograph around a small sign", () => {
    expect(judge(sign, { x: 300, y: 100, w: 100, h: 200 }).grade).toBe("wrong");
    expect(judge(sign, { x: 0, y: 0, w: 3000, h: 4000 }).grade).toBe("wrong");
  });
});

/** A picture whose every pixel says where it came from: red = x, green = y. */
function numbered(w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    data[i] = x; data[i + 1] = y; data[i + 3] = 255;
  }
  return { data, w, h };
}
const at = (img: Rgba, x: number, y: number) => {
  const i = (y * img.w + x) * 4;
  return [img.data[i], img.data[i + 1]];
};

/** A JPEG carrying an EXIF orientation, in either byte order. */
function jpegWith(o: number, little: boolean): Uint8Array {
  const body = jpeg.encode({ data: Buffer.alloc(8 * 8 * 4, 200), width: 8, height: 8 }, 90).data;
  const u16 = (v: number) => little ? [v & 255, v >> 8] : [v >> 8, v & 255];
  const u32 = (v: number) => little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]
                                    : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
                ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(o), 0, 0, ...u32(0)];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1 = [0xff, 0xe1, ...[(payload.length + 2) >> 8, (payload.length + 2) & 255], ...payload];
  return new Uint8Array([0xff, 0xd8, ...app1, ...body.subarray(2)]);
}

describe("the photograph as a browser shows it", () => {
  it("reads the EXIF orientation in both byte orders, and 1 where there is none", () => {
    expect(orientation(jpegWith(6, true))).toBe(6);
    expect(orientation(jpegWith(8, false))).toBe(8);
    const plain = jpeg.encode({ data: Buffer.alloc(8 * 8 * 4, 200), width: 8, height: 8 }, 90).data;
    expect(orientation(new Uint8Array(plain))).toBe(1);
  });

  it("turns upright as the orientation says: the stored top-left corner goes where it should", () => {
    const img = numbered(3, 2);
    const cw = upright(img, 6);           // turned a quarter clockwise
    expect([cw.w, cw.h]).toEqual([2, 3]);
    expect(at(cw, 1, 0)).toEqual([0, 0]); // top-left lands top-right
    const ccw = upright(img, 8);          // a quarter anticlockwise
    expect(at(ccw, 0, 2)).toEqual([0, 0]); // top-left lands bottom-left
    const half = upright(img, 3);
    expect(at(half, 2, 1)).toEqual([0, 0]); // top-left lands bottom-right
    expect(upright(img, 1)).toBe(img);
  });

  it("reduces by averaging, as a smoothing canvas does", () => {
    const img: Rgba = { w: 2, h: 1, data: new Uint8Array([0, 0, 0, 255, 200, 100, 50, 255]) };
    expect([...reduce(img, { w: 1, h: 1 }).data]).toEqual([100, 50, 25, 255]);
  });

  it("decodes PNG as well as JPEG", () => {
    const png = new PNG({ width: 2, height: 1 });
    png.data.set([10, 20, 30, 255, 40, 50, 60, 255]);
    const back = decode(new Uint8Array(PNG.sync.write(png)));
    expect([back.w, back.h]).toEqual([2, 1]);
    expect([...back.data.subarray(4, 7)]).toEqual([40, 50, 60]);
  });
});

describe("the frame the screen would show", () => {
  it("a blue sign with a white letter on grey is found, and the frame holds it", () => {
    const w = 600, h = 800;
    const png = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inSign = x >= 250 && x < 350 && y >= 200 && y < 300;
      const inLetter = x >= 285 && x < 315 && y >= 220 && y < 280;
      const [r, g, b] = inLetter ? [240, 240, 240] : inSign ? [20, 70, 170] : [128, 128, 128];
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
    const { frame, suggested } = frameFor(new Uint8Array(PNG.sync.write(png)));
    expect(suggested).toBe(true);
    expect(judge({ x: 250, y: 200, w: 100, h: 100 }, frame).covers).toBe(1);
  });

  it("with no sign at all, the centred frame is what is judged", () => {
    const png = new PNG({ width: 60, height: 80 });
    png.data.fill(128);
    const { suggested, frame } = frameFor(new Uint8Array(PNG.sync.write(png)));
    expect(suggested).toBe(false);
    expect(frame.x + frame.w / 2).toBeCloseTo(30, 0);
  });
});

describe("the marking page's server", () => {
  // The middleware, called as the dev server would call it.
  function handler() {
    let use: (req: any, res: any) => void = () => {};
    const plugin = marks() as any;
    plugin.configureServer({ middlewares: { use: (_path: string, fn: any) => { use = fn; } } });
    return (address: string, method: string, url: string) => {
      const res = { statusCode: 200, body: "", headers: {} as Record<string, string>,
                    setHeader(k: string, v: string) { this.headers[k] = v; },
                    end(b?: unknown) { this.body = String(b ?? ""); } };
      use({ socket: { remoteAddress: address }, method, url, on() {} }, res);
      return res;
    };
  }

  it("is for development only: the build does not load it", () => {
    expect((marks() as any).apply).toBe("serve");
  });

  it("answers this computer only: the set's photographs do not go out to the network", () => {
    const call = handler();
    expect(call("192.168.0.91", "GET", "/list").statusCode).toBe(403);
    expect(call("192.168.0.91", "GET", "/photo?name=001-p-30min").statusCode).toBe(403);
    expect(call("127.0.0.1", "GET", "/list").statusCode).toBe(200);
  });

  it("serves only photographs named in the index: no path from the request reaches the disk", () => {
    const call = handler();
    expect(call("127.0.0.1", "GET", "/photo?name=../../.env").statusCode).toBe(404);
    expect(call("::1", "GET", "/photo?name=nonexistent").statusCode).toBe(404);
  });
});

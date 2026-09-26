// Images for the tests: the header of a PNG or a JPEG with a chosen size, and nothing
// else. Not photographs - the set's photographs stay on the developer's disk
// (decision 185), and a test that needed them would fail on every other clone. The
// size is all `photo.ts` reads, so the header is all a test needs.
//
// For the tests only: nothing in the application imports this file.

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** The PNG signature and an IHDR chunk carrying the width and the height. */
export function pngOf(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(width), ...be32(height),
    8, 2, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

/** A JPEG start, an APP0 segment to step over, and a baseline frame header (SOF0)
 *  carrying the height and the width - in that order, as JPEG has it. */
export function jpegOf(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ]);
}

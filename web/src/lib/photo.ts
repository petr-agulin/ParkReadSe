// The size of a photograph in pixels, read out of the header. A port of
// `parkread/photo.py`.
//
// The parsing is done by hand, and deliberately: pulling in an image library for the
// sake of two numbers means adding a dependency wanted nowhere else. There are two
// formats, and both are fixed in the first bytes.
//
// `null` means "the format was not recognised" — and that is NOT cause for alarm: an
// unknown size must not punish the reading, or the product would turn fussy about
// formats instead of judging the photograph.
//
// Why this exists at all: the area of the frame is the one way to catch a reading
// that had too few pixels to go on. On a photograph of 82×179 the model once returned
// four plates of connected Swedish text and not one mark about interference — and
// interference is what it names where the frame is good. How many pixels a photograph
// has is a fact, not an opinion.

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8];

const be16 = (d: Uint8Array, at: number) => (d[at] << 8) | d[at + 1];
const be32 = (d: Uint8Array, at: number) =>
  ((d[at] << 24) >>> 0) + (d[at + 1] << 16) + (d[at + 2] << 8) + d[at + 3];

export function pixelSize(data: Uint8Array): [number, number] | null {
  if (data.length >= 24 && PNG_MAGIC.every((b, i) => data[i] === b)) {
    const w = be32(data, 16);
    const h = be32(data, 20);
    return w && h ? [w, h] : null;
  }
  if (!(data[0] === JPEG_MAGIC[0] && data[1] === JPEG_MAGIC[1])) return null;

  let i = 2;
  while (i < data.length - 9) {
    if (data[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = data[i + 1];
    // The SOF markers carry the size; C4/C8/CC are tables, not the start of a frame.
    if (marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = be16(data, i + 5);
      const w = be16(data, i + 7);
      return w && h ? [w, h] : null;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + be16(data, i + 2);
  }
  return null;
}

/** The area of a photograph. `null` — the format was not recognised, and that is not
 *  a thing to be punished for. */
export function pixels(data: Uint8Array): number | null {
  const size = pixelSize(data);
  return size === null ? null : size[0] * size[1];
}

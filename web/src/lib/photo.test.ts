// The size of a photograph out of its header. Carried over from
// `tests/test_completeness.py` (step 8).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pixels } from "./photo";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (name: string) => new Uint8Array(readFileSync(`${ROOT}testset/photos/${name}`));

describe("the size of a photograph", () => {
  it("is read from the header of both formats, with no image library", () => {
    // The set holds both png and jpg, and a mistake here would quietly zero the whole
    // signal of "are there pixels enough for the text".
    expect(pixels(read("061-lastplats-langt-avstand.png"))).toBe(82 * 179);
    expect(pixels(read("003-p-2tim.jpg"))).toBe(576 * 1280);
    expect(pixels(new TextEncoder().encode("not an image"))).toBeNull();
  });
});

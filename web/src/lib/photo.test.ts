// Размер снимка из заголовка. Перенесено из `tests/test_completeness.py` (шаг 8).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pixels } from "./photo";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (name: string) => new Uint8Array(readFileSync(`${ROOT}testset/photos/${name}`));

describe("размер снимка", () => {
  // py: test_completeness::test_the_photo_reads_its_own_size_from_both_formats
  it("читается из заголовка обоих форматов, без библиотеки изображений", () => {
    // В наборе есть и png, и jpg, и ошибка тут молча обнулила бы весь сигнал
    // «хватает ли пикселей на текст».
    expect(pixels(read("061-lastplats-langt-avstand.png"))).toBe(82 * 179);
    expect(pixels(read("003-p-2tim.jpg"))).toBe(576 * 1280);
    expect(pixels(new TextEncoder().encode("not an image"))).toBeNull();
  });
});

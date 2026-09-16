// Иконки приложения. Перенесено из `tests/test_icons.py` (шаг 8, этап 3).
//
// Проверять картинку глазами можно один раз; дальше её проверяет код. Три вопроса:
// совпадает ли лежащий файл с тем, что рисует генератор; не вылезает ли содержимое
// маскируемой иконки за круг, внутри которого не режет ни одна маска; прозрачны ли
// углы обычной — иначе белый угол ляжет заплаткой на тёмный экран.
//
// Файлы не перерисовываются: полный проход по 512×512 занимает секунды. Готовый
// файл разбирается обратно в пиксели, и с кодом сверяются выборочные строки.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BLUE, ICONS, ROOT, decode, row } from "./icons";

const PUBLIC = join(ROOT, "web", "public");
const decoded = (file: string) => decode(readFileSync(join(PUBLIC, file)));

describe("иконки", () => {
  // py: test_icons::test_the_files_on_disk_are_what_the_code_draws
  it("файлы на диске — это то, что рисует код", () => {
    for (const { file, size, maskable } of ICONS) {
      const { width, height, rows } = decoded(file);
      expect([width, height], file).toEqual([size, size]);
      // Девять строк по всей высоте: правка рисунка меняет хоть одну из них.
      for (let k = 0; k <= 8; k += 1) {
        const py = Math.min(Math.round((size * k) / 8), size - 1);
        expect(rows[py], `${file}, строка ${py}`).toEqual(row(size, py, maskable));
      }
    }
  });

  // py: test_icons::test_the_maskable_icon_keeps_everything_inside_the_safe_circle
  it("маскируемая держит всё внутри круга безопасности", () => {
    // Круг радиусом 40% ширины — то, что переживёт любую маску. Уголки рамки и есть
    // самые дальние от центра точки рисунка, и обрезать их нельзя: без них иконка
    // станет очередным парковочным `P`.
    const size = 512;
    const limit = 0.4 * size;
    const { rows } = decoded("icon-maskable-512.png");
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const [r, g, b, a] = rows[y][x];
        expect(a, "у маскируемой иконки поле сплошное").toBe(255);
        if (r > 200 && g > 200 && b > 200) {
          const far = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
          expect(far <= limit, `белое в (${x}, ${y}) выходит за круг`).toBe(true);
        }
      }
    }
  });

  // py: test_icons::test_the_ordinary_icons_are_transparent_at_the_corners
  it("обычные иконки прозрачны по углам", () => {
    // Обычная иконка скруглена сама. Непрозрачный угол — белая заплатка,
    // которая видна на всяком экране, кроме белого.
    for (const { file, size, maskable } of ICONS) {
      if (maskable) continue;
      const { rows } = decoded(file);
      expect(rows[0][0][3], `${file}: угол непрозрачен`).toBe(0);
      expect(rows[size >> 1][size >> 1][3], `${file}: середина не сплошная`).toBe(255);
    }
  });

  // py: test_icons::test_the_icon_wears_the_blue_of_the_sign
  it("иконка носит синий шведского знака", () => {
    // Цвет один и тот же во всём продукте.
    expect(decoded("icon-512.png").rows[256][8].slice(0, 3)).toEqual(BLUE);
  });
});

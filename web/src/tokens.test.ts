// Свойства файла токенов, которые видны только из него самого.
//
// Оба сторожа здесь появились после того, как ошибка уже случилась и нашлась
// случайно — при взгляде в собранный CSS. Ни один из этих промахов не роняет
// сборку и не виден в разметке: страница просто выглядит чуть иначе, чем задумано.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf-8");

type Oklch = [number, number, number];

function token(name: string): Oklch {
  const m = CSS.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!m) throw new Error(`токен --color-${name} не найден`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Относительная яркость по WCAG. oklch → OKLab → линейный sRGB → яркость. */
function luminance([L, C, H]: Oklch): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map((v) => Math.min(Math.max(v, 0), 1));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function ratio(ink: string, ground: string): number {
  const a = luminance(token(ink));
  const b = luminance(token(ground));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Роль каждого цвета названа здесь, и ни один не может остаться неназванным:
// новый токен обязан попасть в один из списков, иначе последний тест упадёт.
const LIGHT_INK = ["ink", "ink-strong", "ink-2", "ink-3", "ink-off", "link",
                   "tint-ink", "note-ink", "free", "fee", "unsure", "deny"];
const LIGHT_GROUND = ["ground", "ground-2", "inset", "chip", "tint", "note", "danger-bg"];
const DARK_INK = ["on-dark", "on-dark-2"];
const DARK_GROUND = ["hero", "stage", "plate", "accent", "accent-press"];
/** Волосяные линии и штрих на значке: текста на себе не несут. */
const DECOR = ["line", "field", "danger-line", "slash"];

const MIN = 4.5;

describe("контраст токенов", () => {
  it("любая краска текста берёт 4.5:1 на любой светлой поверхности", () => {
    // Порог проверяется по всем парам, а не по тем, что сегодня встречаются
    // в разметке: список пар пришлось бы вести руками, и он устарел бы первым.
    for (const ink of LIGHT_INK) {
      for (const ground of LIGHT_GROUND) {
        expect(ratio(ink, ground), `${ink} на ${ground}`).toBeGreaterThanOrEqual(MIN);
      }
    }
  });

  it("белый текст читается на каждой тёмной поверхности", () => {
    for (const ground of DARK_GROUND) {
      expect(ratio("on-dark", ground), `on-dark на ${ground}`).toBeGreaterThanOrEqual(MIN);
    }
  });

  it("приглушённый текст на тёмном — только карточка и сцена", () => {
    // `on-dark-2` намеренно тише белого, и на синей кнопке он НЕ проходит
    // (3.15:1). Это не дыра в пороге, а граница применения: приглушать текст
    // на кнопке нечем и незачем — там белый. Осветлить его до кнопки значило бы
    // отменить причину, по которой он существует.
    for (const ground of ["hero", "stage"]) {
      expect(ratio("on-dark-2", ground), `on-dark-2 на ${ground}`).toBeGreaterThanOrEqual(MIN);
    }
    expect(ratio("on-dark-2", "accent")).toBeLessThan(MIN);
  });

  it("у каждого цвета названа роль", () => {
    const declared = [...CSS.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
    const known = new Set([...LIGHT_INK, ...LIGHT_GROUND, ...DARK_INK, ...DARK_GROUND,
                           ...DECOR]);
    const orphans = declared.filter((n) => !known.has(n));
    expect(orphans, "новый токен не отнесён ни к тексту, ни к поверхности").toEqual([]);
    expect(declared.length).toBe(known.size);
  });
});

describe("пространство имён", () => {
  it("имя кегля не занято цветом, и наоборот", () => {
    // Утилиты `text-*` общие для размера и для цвета текста. Токен размера,
    // названный как токен цвета, МОЛЧА становится краской: заголовок уезжает
    // и в кегле, и в цвете, а сборка не жалуется ни словом.
    //
    // Поймано на `--text-hero`: цвет `--color-hero` уже был занят тёмной плашкой,
    // и `text-hero` начал красить. Нашлось случайно, при взгляде в собранный CSS,
    // — потому и сторож.
    const names = (prefix: string) =>
      [...CSS.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):`, "g"))]
        .map((m) => m[1])
        // `--text-display--line-height` — не отдельное имя, а свойство размера.
        .filter((n) => !n.includes("--"));

    const sizes = new Set(names("text"));
    const clash = names("color").filter((n) => sizes.has(n));
    expect(clash, "имя занято и кеглем, и цветом").toEqual([]);
    // Проверка проверки: если имена перестали находиться, молчание не считается.
    expect(sizes.size).toBeGreaterThan(5);
  });
});

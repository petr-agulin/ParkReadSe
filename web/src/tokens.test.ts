// Properties of the token file that can only be seen from the file itself.
//
// Both guards here appeared after the mistake had already happened and was found by
// chance — on a look into the built CSS. Neither slip breaks the build or shows in the
// markup: the page simply looks a little different from what was intended.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf-8");

type Oklch = [number, number, number];

function token(name: string): Oklch {
  const m = CSS.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!m) throw new Error(`token --color-${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Relative luminance by WCAG. oklch → OKLab → linear sRGB → luminance. */
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

// The role of every colour is named here, and none may stay unnamed: a new token has
// to go into one of the lists, or the last test fails.
const LIGHT_INK = ["ink", "ink-strong", "ink-2", "ink-3", "ink-off", "link",
                   "tint-ink", "note-ink", "ok", "free", "fee", "unsure", "deny"];
const LIGHT_GROUND = ["ground", "ground-2", "inset", "chip", "tint", "note", "danger-bg",
                      "ok-bg"];
const DARK_INK = ["on-dark", "on-dark-2"];
const DARK_GROUND = ["hero", "stage", "plate", "accent", "accent-press"];
/** Hairlines and the stroke on an icon: they carry no text. */
const DECOR = ["line", "field", "danger-line", "slash"];

const MIN = 4.5;

describe("the contrast of the tokens", () => {
  it("gives every text colour 4.5:1 on every light surface", () => {
    // The threshold is checked over all pairs, not the ones the markup uses today: a
    // list of pairs would have to be kept by hand, and it would be first to go stale.
    for (const ink of LIGHT_INK) {
      for (const ground of LIGHT_GROUND) {
        expect(ratio(ink, ground), `${ink} on ${ground}`).toBeGreaterThanOrEqual(MIN);
      }
    }
  });

  it("keeps white text legible on every dark surface", () => {
    for (const ground of DARK_GROUND) {
      expect(ratio("on-dark", ground), `on-dark on ${ground}`).toBeGreaterThanOrEqual(MIN);
    }
  });

  it("allows muted text on dark only on the card and the stage", () => {
    // `on-dark-2` is deliberately quieter than white, and on the blue button it does
    // NOT pass (3.15:1). That is not a hole in the threshold but a limit of use: text
    // on the button has no reason to be muted — it is white there. Lightening it enough
    // for the button would cancel the reason it exists.
    for (const ground of ["hero", "stage"]) {
      expect(ratio("on-dark-2", ground), `on-dark-2 on ${ground}`).toBeGreaterThanOrEqual(MIN);
    }
    expect(ratio("on-dark-2", "accent")).toBeLessThan(MIN);
  });

  it("names a role for every colour", () => {
    const declared = [...CSS.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]);
    const known = new Set([...LIGHT_INK, ...LIGHT_GROUND, ...DARK_INK, ...DARK_GROUND,
                           ...DECOR]);
    const orphans = declared.filter((n) => !known.has(n));
    expect(orphans, "a new token is assigned to neither text nor surface").toEqual([]);
    expect(declared.length).toBe(known.size);
  });
});

describe("the namespace", () => {
  it("keeps a size name free of colour, and the other way round", () => {
    // The `text-*` utilities serve both the size and the colour of text. A size token
    // named like a colour token SILENTLY becomes paint: the heading shifts in both size
    // and colour, and the build says not a word.
    //
    // Caught on `--text-hero`: the colour `--color-hero` was already taken by the dark
    // band, and `text-hero` began to paint. Found by chance, on a look into the built
    // CSS — hence the guard.
    const names = (prefix: string) =>
      [...CSS.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+):`, "g"))]
        .map((m) => m[1])
        // `--text-display--line-height` is not a name of its own but a property of a size.
        .filter((n) => !n.includes("--"));

    const sizes = new Set(names("text"));
    const clash = names("color").filter((n) => sizes.has(n));
    expect(clash, "the name is taken by both a size and a colour").toEqual([]);
    // A check of the check: if the names stop being found, silence does not count.
    expect(sizes.size).toBeGreaterThan(5);
  });
});

// Comparing the product's answer with a saved reference answer.
//
// The reference answers live in `parity/`, `npm run goldens:write` writes them, and
// `parity.test.ts` checks against them. A disagreement means the product's answer
// changed - and the reference answers are rewritten deliberately, not "to make it
// green".
//
// The difference has to READ: "did not match" is useless when there are close to two
// hundred cases and each holds regimes, segments and captions. So the path down to
// the field is assembled in full.

/** How deep to show disagreements before saying "and N more". */
const MAX_LINES = 20;

function kind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function short(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return `{${Object.keys(value as object).join(", ")}}`;
  return String(value);
}

/** How `actual` differs from `expected`, a line per disagreement.
 *
 *  The path runs from the root of the case, so the line says at once where to look:
 *  `regimes[1].periods[0].state: "allowed" != "prohibited"`. */
export function differences(expected: unknown, actual: unknown, path = ""): string[] {
  const here = path || "(root)";

  if (kind(expected) !== kind(actual)) {
    return [`${here}: ${kind(actual)} instead of ${kind(expected)} — ${short(actual)}`];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const out: string[] = [];
    if (expected.length !== actual.length) {
      out.push(`${here}: ${actual.length} items, not ${expected.length}`);
    }
    for (let i = 0; i < Math.min(expected.length, actual.length); i += 1) {
      out.push(...differences(expected[i], actual[i], `${path}[${i}]`));
    }
    return out;
  }

  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const out: string[] = [];
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    for (const key of Object.keys(left)) {
      if (!(key in right)) {
        out.push(`${path ? `${path}.` : ""}${key}: the field is missing`);
        continue;
      }
      out.push(...differences(left[key], right[key], path ? `${path}.${key}` : key));
    }
    for (const key of Object.keys(right)) {
      if (!(key in left)) {
        out.push(`${path ? `${path}.` : ""}${key}: an extra field — ${short(right[key])}`);
      }
    }
    return out;
  }

  if (expected === actual) return [];

  // Comparing long strings whole is useless: the calendar yields a letter per day,
  // and three hundred and sixty-five letters beside another three hundred and
  // sixty-five show nothing. What is needed is the first character that differs.
  if (typeof expected === "string" && typeof actual === "string"
      && (expected.length > 40 || actual.length > 40)) {
    let i = 0;
    while (i < expected.length && i < actual.length && expected[i] === actual[i]) i += 1;
    const window = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 5), i + 6));
    return [`${here}: differs from character ${i}: ${window(actual)} ≠ ${window(expected)}`];
  }

  return [`${here}: ${short(actual)} ≠ ${short(expected)}`];
}

/** The report for a layer: the layer's name, the case and the field - each on one
 *  line. Empty when everything agreed. */
export function report(layer: string, cases: Record<string, unknown>,
                       computed: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [id, expected] of Object.entries(cases)) {
    if (!(id in computed)) {
      out.push(`${layer} · ${id}: the case was not computed`);
      continue;
    }
    for (const line of differences(expected, computed[id])) {
      out.push(`${layer} · ${id} · ${line}`);
      if (out.length >= MAX_LINES) return [...out, `…and possibly more — the first ${MAX_LINES} are shown`];
    }
  }
  return out;
}

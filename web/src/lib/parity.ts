// Двойной прогон: сравнение ответа с эталоном, посчитанным питоном.
//
// Порт идёт слоями, и главная его опасность — молчаливое расхождение: правило
// поправили на одной стороне, забыли на другой, и обе живут дальше, каждая
// по-своему. Эталоны лежат в `parity/`, пишет их `cli.py parity --write`,
// а здесь они сверяются (решение 123).
//
// Разница должна ЧИТАТЬСЯ: «не сошлось» бесполезно, когда случаев под две сотни,
// а в каждом — режимы, отрезки и подписи. Поэтому путь до поля собирается целиком.

/** Насколько глубоко показывать расхождения, прежде чем сказать «и ещё N». */
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

/** Чем `actual` отличается от `expected`, строкой на расхождение.
 *
 *  Путь ведётся от корня случая, поэтому строка сразу говорит, где смотреть:
 *  `regimes[1].periods[0].state: "allowed" ≠ "prohibited"`. */
export function differences(expected: unknown, actual: unknown, path = ""): string[] {
  const here = path || "(корень)";

  if (kind(expected) !== kind(actual)) {
    return [`${here}: ${kind(actual)} вместо ${kind(expected)} — ${short(actual)}`];
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const out: string[] = [];
    if (expected.length !== actual.length) {
      out.push(`${here}: элементов ${actual.length}, а не ${expected.length}`);
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
        out.push(`${path ? `${path}.` : ""}${key}: поля нет`);
        continue;
      }
      out.push(...differences(left[key], right[key], path ? `${path}.${key}` : key));
    }
    for (const key of Object.keys(right)) {
      if (!(key in left)) {
        out.push(`${path ? `${path}.` : ""}${key}: лишнее поле — ${short(right[key])}`);
      }
    }
    return out;
  }

  if (expected === actual) return [];

  // Длинные строки сравнивать целиком бесполезно: календарь отдаёт по букве
  // на день, и триста шестьдесят пять букв рядом с такими же тремястами
  // шестьюдесятью пятью не показывают ничего. Нужен первый разошедшийся знак.
  if (typeof expected === "string" && typeof actual === "string"
      && (expected.length > 40 || actual.length > 40)) {
    let i = 0;
    while (i < expected.length && i < actual.length && expected[i] === actual[i]) i += 1;
    const window = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 5), i + 6));
    return [`${here}: расходится со знака ${i}: ${window(actual)} ≠ ${window(expected)}`];
  }

  return [`${here}: ${short(actual)} ≠ ${short(expected)}`];
}

/** Отчёт по слою: имя слоя, случай и поле — в одной строке каждое.
 *  Пусто, когда всё сошлось. */
export function report(layer: string, cases: Record<string, unknown>,
                       computed: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [id, expected] of Object.entries(cases)) {
    if (!(id in computed)) {
      out.push(`${layer} · ${id}: случай не посчитан`);
      continue;
    }
    for (const line of differences(expected, computed[id])) {
      out.push(`${layer} · ${id} · ${line}`);
      if (out.length >= MAX_LINES) return [...out, `…и, возможно, ещё — показаны первые ${MAX_LINES}`];
    }
  }
  return out;
}

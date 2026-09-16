// Живой прогон набора: переспросить модель по снимкам. Порт `cli.py run`
// (шаг 8, этап 4).
//
// **Команду запускает разработчик, а не ИИ:** она тратит ключ и квоту
// (`AGENTS.md`, §12). Ключ и адрес Node читает сам из `.env`.
//
//     npm run ask -- testset/photos/005-2tim-8-18-parentes-8-15-dubbelpil.jpg
//     npm run ask -- --refresh testset/photos/*.jpg
//
// Это единственный способ переспросить модель после правки промпта: без него
// «не просело» проверить нечем — замер считает по сохранённым ответам, а они
// отвечают на ПРЕЖНИЙ вопрос.
//
// Модель одна на обе стадии (решение 134): `VISION_MODEL`.

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../src/lib/pipeline";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { ok } from "../src/lib/validation";
import type { Photo, Provider } from "../src/lib/vision";
import { refused, save, stale } from "./fixtures";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DEMO = join(ROOT, "demo");

/** Ключ, адрес и модель из окружения. Пустое поле — не «по умолчанию», а отказ:
 *  молча спросить не ту модель дороже, чем не спросить вовсе. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): Provider {
  const provider: Provider = {
    baseUrl: env.VISION_API_BASE_URL ?? "",
    apiKey: env.VISION_API_KEY ?? "",
    visionModel: env.VISION_MODEL ?? "",
  };
  const missing = [
    ["VISION_API_BASE_URL", provider.baseUrl],
    ["VISION_API_KEY", provider.apiKey],
    ["VISION_MODEL", provider.visionModel],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error("не задано в .env: " + missing.join(", "));
  return provider;
}

/** PowerShell не раскрывает `*.jpg` за внешнюю программу — раскрываем сами.
 *  Иначе команда из README молча не находит ни одного файла. */
export function expand(args: string[]): string[] {
  const out: string[] = [];
  for (const raw of args) {
    const full = isAbsolute(raw) ? raw : resolve(ROOT, raw);
    if (!/[*?[]/.test(raw)) {
      out.push(full);
      continue;
    }
    const dir = dirname(full);
    const rule = new RegExp("^" + basename(full)
      .replace(/[.+^${}()|\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".") + "$");
    out.push(...readdirSync(dir).filter((f) => rule.test(f)).sort()
      .map((f) => join(dir, f)));
  }
  return out;
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg",
                                       ".jpeg": "image/jpeg" };

/** Снимок с диска. В память — и только: временного файла не возникает. */
export function photoOf(path: string): Photo {
  const bytes = readFileSync(path);
  return { name: basename(path),
           data: new Blob([bytes], { type: MIME[extname(path).toLowerCase()] ?? "image/jpeg" }) };
}

export type AskDeps = {
  fetchImpl?: typeof fetch;
  pause?: (ms: number) => Promise<unknown>;
  fixturesDir?: string;
  out?: (line: string) => void;
  provider?: Provider;
};

/** Сколько снимков не удалось разобрать. Один провал не роняет прогон: провайдер
 *  может ответить `429` на середине, а уже полученные ответы сохранены. */
export async function ask(paths: string[], { refresh = false } = {},
                          deps: AskDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const dir = deps.fixturesDir ?? DEMO;
  const provider = deps.provider ?? providerFromEnv();
  const triage = triagePrompt();
  const extract = extractPrompt();
  let bad = 0;

  for (const path of paths) {
    out(`\n=== ${basename(path)} ===`);

    // На отказном кадре стадии извлечения не было и не будет: конвейер до неё
    // не доходит, и её отсутствие — не повод переспрашивать снимок вечно.
    const wasRefused = refused(dir, path);
    const stages: [string, string][] = wasRefused
      ? [["triage", triage]]
      : [["triage", triage], ["extract", extract]];

    if (!refresh) {
      const flags = await Promise.all(stages.map(([stage, prompt]) =>
        stale(dir, path, stage, prompt)));
      if (!flags.some(Boolean)) {
        out(wasRefused ? "  отсев уже отказал этому снимку — пропущен"
                       : "  уже есть ответы на те же промпты — пропущен");
        continue;
      }
    }

    let outcome;
    try {
      outcome = await run(photoOf(path), provider,
                          { fetchImpl: deps.fetchImpl, pause: deps.pause });
    } catch (e) {
      // Одна неудача не должна ронять весь прогон.
      out(`  ОШИБКА вызова: ${(e as Error).name}: ${String((e as Error).message).slice(0, 200)}`);
      bad += 1;
      continue;
    }

    // Сохраняется только то, что прошло проверку: отбракованный ответ, записанный
    // в фикстуру, читался бы замером как настоящий.
    const tri = outcome.triage;
    if (tri && tri.validation && ok(tri.validation) && tri.validation.data) {
      await save(dir, path, "triage", tri.validation.data, provider.visionModel,
                 tri.usage, triage);
    }
    const ext = outcome.extraction;
    if (ext && ok(ext.validation) && ext.data) {
      await save(dir, path, "extract", ext.data, provider.visionModel, ext.usage, extract);
    }

    if (tri) {
      out(`  отсев:      ${tri.category} | панелей насчитал: ${tri.panelsBelowMainSign}`);
      const repairs = tri.validation?.repairs ?? [];
      if (repairs.length) out("  правки отсева: " + repairs.join("; "));
      if (tri.validation && !ok(tri.validation)) {
        out("  ОТСЕВ ОТБРАКОВАН, ответ не сохранён: "
            + tri.validation.schemaErrors.slice(0, 3).join("; "));
      }
    }
    if (outcome.stoppedAt === "triage") {
      out(`  ОСТАНОВЛЕН: ${outcome.reason}`);
      continue;
    }
    if (outcome.stoppedAt === "extraction") {
      out(`  ОТБРАКОВАН валидацией: ${outcome.reason}`);
      bad += 1;
      continue;
    }

    const doc = ext!.data!;
    const main = doc.main_sign;
    out(`  знак:       ${main.type} / ${main.form} / ${main.background_color}`);
    out(`  панелей:    ${doc.panel_count}`);
    for (const panel of doc.panels ?? []) {
      const keys = outcome.recognised?.panelKeys[panel.index as number] ?? [];
      const text = (panel.lines ?? []).join(" | ") || "(без текста)";
      out(`    ${panel.index}. [${String(panel.kind).padEnd(10)}] ${text}`);
      out(`       справочник: ${keys.length ? keys.join(", ") : "нет совпадений"}`);
    }
    for (const [index, lines] of Object.entries(outcome.recognised?.uninterpreted ?? {})) {
      out(`  не интерпретируется, панель ${index}: ${(lines as string[]).join("; ")}`);
    }
    const repairs = ext!.validation.repairs;
    if (repairs.length) out("  правки валидации: " + repairs.join("; "));
    out(`  сигналы:    ${outcome.flags.length ? outcome.flags.join(", ") : "чисто"}`);
  }
  return bad;
}

if (process.argv[1] && process.argv[1].endsWith("ask.ts")) {
  const args = process.argv.slice(2);
  const refresh = args.includes("--refresh");
  const paths = expand(args.filter((a) => a !== "--refresh"));
  if (!paths.length) {
    console.error("укажите хотя бы один снимок: npm run ask -- testset/photos/<снимок>");
    process.exitCode = 2;
  } else {
    ask(paths, { refresh })
      .then((bad) => { process.exitCode = bad ? 1 : 0; })
      .catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
  }
}

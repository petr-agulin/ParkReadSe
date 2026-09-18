// Данные для браузера порождаются из источников. Порт эмиттеров `parkread/reference.py`
// (шаг 8, этап 3).
//
// Источник — markdown справочника, markdown общих правил, `schema/*.json` и тексты
// промптов. Порождённое — четыре модуля в `web/src/lib/*.data.ts`: правится источник,
// сгенерированное следует за ним, а свежесть стережёт тест.
//
// **Порождённое сверяется с деревом.** `emit.test.ts` строит всё заново и сравнивает
// с тем, что лежит в репозитории: разойдутся — упадёт тест, а не пользователь. Раньше
// это же доказывало, что перенос с питона ничего не переписал по дороге; питона
// в репозитории больше нет, и побайтового совпадения с ним больше не требуется.
//
// Только для разработчика и только на Node: читает диск, в сборку не попадает.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const NL = "\n";
const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");

/** Запись справочника: преамбула markdown плюс тело статьи. */
export type Entry = {
  key: string; tokens: string; category: string; schema: string; en: string;
  source: string; body: string; short: string; label: string; code: string;
};

const HEAD = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/** Все записи каталога, в порядке ключа. */
export function readEntries(dir: string): Entry[] {
  const entries: Entry[] = [];
  for (const file of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".md")).sort()) {
    // Перевод строки приводится к `\n`, как делает питон при чтении текста: часть
    // статей лежит с `\r\n`, и без этого не совпали бы ни разбор, ни сам текст,
    // уезжающий в порождённый файл.
    const text = readFileSync(join(ROOT, dir, file), "utf-8").split("\r\n").join("\n");
    const m = HEAD.exec(text);
    if (!m) throw new Error(`${file}: нет заголовка между --- ---`);
    const head: Record<string, string> = {};
    for (const line of m[1].split("\n")) {
      const at = line.indexOf(": ");
      if (at > 0) head[line.slice(0, at)] = line.slice(at + 2);
    }
    const key = head.key ?? "";
    if (key !== basename(file, ".md")) {
      throw new Error(`${file}: key=${key} не совпадает с именем файла`);
    }
    entries.push({
      key, tokens: head.tokens ?? "", category: head.category ?? "",
      schema: head.schema ?? "", en: head.en ?? "", source: head.source ?? "",
      body: m[2].trim(), short: head.short ?? "", label: head.label ?? "",
      code: head.code ?? "",
    });
  }
  return entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** JSON в записи питона: разделители `", "` и `": "`, юникод как есть.
 *
 *  `JSON.stringify` пишет без пробелов, и одно это дало бы иной файл — при том же
 *  содержании. Пока сгенерированное сверяется с питоньим, запись должна совпадать. */
export function pyJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(pyJson).join(", ") + "]";
  const body = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => JSON.stringify(k) + ": " + pyJson(v))
    .join(", ");
  return "{" + body + "}";
}

// Поля, которые показ берёт у записи. `body` и `tokens` не переезжают: первое —
// многоабзацный markdown справки, второе — подсказка модели; на экране разбора
// не участвует ни то, ни другое. То же правило и у общих правил ниже: их статьи
// написаны для разработчика, на экране не отрисовывается ни одна, и везти их
// в браузер — это тысячи символов прозы в бандле без единого читателя.
export const EMITTED_FIELDS = ["key", "category", "en", "short", "label", "code",
                               "source"] as const;

export function emitReference(): string {
  const rows = readEntries("reference/signs").map((e) => {
    const shown: Record<string, string> = {};
    for (const field of EMITTED_FIELDS) shown[field] = e[field];
    return "  " + JSON.stringify(e.key) + ": " + pyJson(shown) + ",";
  });
  const head = [
    "// Справочник продукта: белый список того, что он берётся толковать.",
    "//",
    "// СГЕНЕРИРОВАНО `npm run emit`. Руками не правится:",
    "// источник — markdown в `reference/signs/`, здесь его следствие.",
    "// Разойдутся — упадёт питон-тест, а не пользователь.",
    "",
    "export type RefEntry = {",
    "  key: string; category: string; en: string;",
    "  short: string; label: string; code: string; source: string;",
    "};",
    "",
    "export const ENTRIES: Record<string, RefEntry> = {",
  ];
  return [...head, ...rows, "};", ""].join(NL);
}

export function emitRules(): string {
  const rows = readEntries("reference/general_rules").map((e) =>
    "  " + pyJson({ key: e.key, text: e.en, source: e.source }) + ",");
  const head = [
    "// Общие правила: то, чего на знаке нет, и что продукт НЕ считает.",
    "//",
    "// СГЕНЕРИРОВАНО `npm run emit`. Руками не правится:",
    "// источник — markdown в `reference/general_rules/`.",
    "//",
    "// Едут вместе со страницей намеренно: раньше справка приходила с сервера,",
    "// и без него блок исчезал молча — ни строки о том, что он был.",
    "",
    "export type GeneralRule = { key: string; text: string; source: string };",
    "",
    "export const GENERAL_RULES: GeneralRule[] = [",
  ];
  return [...head, ...rows, "];", ""].join(NL);
}

export function emitSchema(): string {
  const sign = JSON.parse(read("schema/sign.schema.json"));
  const triage = JSON.parse(read("schema/triage.schema.json"));
  const head = [
    "// Схемы ответа модели. СГЕНЕРИРОВАНО `npm run emit`.",
    "// Руками не правится: источник — `schema/*.json`, здесь его копия.",
    "//",
    "// Проверяет их своя проверка (`schema.ts`), а не библиотека: схема",
    "// использует десять ключевых слов и ни одного комбинатора (решение 124).",
    "",
    'import type { Schema } from "./schema";',
    "",
  ];
  const body = [
    "export const SIGN_SCHEMA: Schema = " + JSON.stringify(sign, null, 1) + ";",
    "",
    "export const TRIAGE_SCHEMA: Schema = " + JSON.stringify(triage, null, 1) + ";",
    "",
  ];
  return [...head, ...body].join(NL);
}

export function emitPrompts(): string {
  // Тексты лежат файлами: промпт — это САМ ВОПРОС к модели, и править его удобнее
  // как текст, а не как строку в коде. Отпечаток держит все сохранённые ответы,
  // поэтому копируются они дословно, без единой правки по дороге.
  const head = [
    "// Тексты промптов. СГЕНЕРИРОВАНО `npm run emit`.",
    "// Руками не правится: источник — `prompts/*.md`.",
    "//",
    "// Это САМ ВОПРОС к модели: правка меняет отпечаток промпта, и все",
    "// сохранённые ответы разом перестают на него отвечать.",
    "",
  ];
  const body = [
    "export const TRIAGE_INSTRUCTIONS = " + JSON.stringify(read("prompts/triage.md")) + ";",
    "",
    "export const EXTRACT_INSTRUCTIONS = " + JSON.stringify(read("prompts/extract.md")) + ";",
    "",
    "export const SHAPE_HEADER = " + JSON.stringify(read("prompts/shape-header.md")) + ";",
    "",
  ];
  return [...head, ...body].join(NL);
}

export const TARGETS: { path: string; build: () => string }[] = [
  { path: "web/src/lib/reference.data.ts", build: emitReference },
  { path: "web/src/lib/rules.data.ts", build: emitRules },
  { path: "web/src/lib/schema.data.ts", build: emitSchema },
  { path: "web/src/lib/prompts.data.ts", build: emitPrompts },
];

/** Что разошлось с источником. Пусто — значит порождённое свежее. */
export function stale(): string[] {
  return TARGETS.filter((t) => read(t.path) !== t.build()).map((t) => t.path);
}

function main(write: boolean): void {
  const outdated = stale();
  if (!write) {
    if (outdated.length) {
      console.error("устарело:\n  " + outdated.join("\n  "));
      console.error("пересобрать: npm run emit");
      process.exitCode = 1;
    } else {
      console.log("порождённые данные свежие");
    }
    return;
  }
  for (const target of TARGETS.filter((t) => outdated.includes(t.path))) {
    writeFileSync(join(ROOT, target.path), target.build(), "utf-8");
    console.log("пересобрано: " + target.path);
  }
  if (!outdated.length) console.log("нечего пересобирать");
}

if (process.argv[1] && process.argv[1].endsWith("emit.ts")) {
  main(process.argv.includes("--write"));
}

// Промпты для двух вызовов модели.
//
// Здесь остаётся только то, что кодом не проверяется: тон, границы темы,
// формулировки задачи. Всё, у чего есть последствие — порог, арифметика,
// отбраковка лишних полей — живёт в коде и в схеме.
//
// **Тексты не переписываются руками.** Промпт — это САМ ВОПРОС к модели: его
// отпечаток держит все сохранённые ответы, и опечатка стоила бы полного прогона
// набора. Источник — `prompts/*.md`, откуда их переносит `npm run emit`; здесь
// собирается только оболочка.
//
// **Форма ответа тоже не переписывается.** На OpenAI-совместимом диалекте провайдер
// схему не принимает, поэтому список полей объясняется словами — и порождается
// из самой схемы, чтобы не разойтись с ней.

import { EXTRACT_INSTRUCTIONS, SHAPE_HEADER, TRIAGE_INSTRUCTIONS } from "./prompts.data";
import type { Schema } from "./schema";
import { SIGN_SCHEMA, TRIAGE_SCHEMA } from "./schema.data";

/** Компактный скелет JSON по схеме: имена полей, типы, перечисления.
 *
 *  Описания полей не переносятся: они длинные и на русском, а модель ведёт
 *  англоязычная инструкция выше. Здесь нужна только форма. */
export function shapeHint(schema: Schema, indent = 0): string {
  const defs: Record<string, Schema> = schema.$defs ?? {};

  const resolve = (node: Schema): Schema => {
    let out = node;
    let seen = 0;
    while (out && out.$ref && seen < 10) {
      out = defs[String(out.$ref).split("/").pop() as string] ?? {};
      seen += 1;
    }
    return out;
  };

  const render = (raw: Schema, pad: number): string => {
    const node = resolve(raw);
    if (node.enum) {
      return node.enum.map((v: unknown) => JSON.stringify(v)).join(" | ");
    }
    if ("const" in node) return JSON.stringify(node.const);

    let t = node.type;
    if (Array.isArray(t)) t = t.find((x: string) => x !== "null") ?? "string";

    if (t === "object") {
      const props: Record<string, Schema> = node.properties ?? {};
      const items = Object.entries(props);
      if (!items.length) return "{}";
      const req = new Set<string>(node.required ?? []);
      const sp = " ".repeat(pad);
      const spIn = " ".repeat(pad + 2);
      const lines = items.map(([k, v], n) => {
        const comma = n < items.length - 1 ? "," : "";
        const tail = req.has(k) ? "" : "   // optional";
        return `${spIn}"${k}": ${render(v, pad + 2)}${comma}${tail}`;
      });
      return "{\n" + lines.join("\n") + "\n" + sp + "}";
    }
    if (t === "array") return "[ " + render(node.items ?? {}, pad + 2) + " ]";
    if (t === "integer") return "<integer>";
    if (t === "number") return "<number>";
    if (t === "boolean") return "true | false";
    return "<string>";
  };

  return render(schema, indent);
}

export function build(instructions: string, schema: Schema): string {
  return instructions + SHAPE_HEADER + shapeHint(schema) + "\n";
}

export const triagePrompt = (): string => build(TRIAGE_INSTRUCTIONS, TRIAGE_SCHEMA);
export const extractPrompt = (): string => build(EXTRACT_INSTRUCTIONS, SIGN_SCHEMA);

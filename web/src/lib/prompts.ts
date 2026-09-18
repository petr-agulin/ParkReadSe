// The prompts for the two calls to the model.
//
// What stays here is only what code does not check: the tone, the bounds of the
// subject, the wording of the task. Everything with a consequence — a threshold, the
// arithmetic, the rejection of extra fields — lives in the code and in the schema.
//
// **The texts are not rewritten by hand.** A prompt is THE QUESTION ITSELF put to the
// model: its fingerprint holds every saved answer, and a typo would cost a full run
// of the set. The source is `prompts/*.md`, from where `npm run emit` carries them;
// what is assembled here is only the shell around them.
//
// **The shape of the answer is not rewritten either.** In the OpenAI-compatible
// dialect a provider does not accept a schema, so the list of fields is explained in
// words — and it is generated from the schema itself, so as not to drift from it.

import { EXTRACT_INSTRUCTIONS, SHAPE_HEADER, TRIAGE_INSTRUCTIONS } from "./prompts.data";
import type { Schema } from "./schema";
import { SIGN_SCHEMA, TRIAGE_SCHEMA } from "./schema.data";

/** A compact skeleton of the JSON by the schema: the names of the fields, the types,
 *  the enumerations.
 *
 *  The descriptions of the fields are not carried over: the shape is all that is
 *  wanted here. Leaving them out also keeps the prompt's fingerprint clear of them —
 *  a description can be reworded without costing a run of the whole set. */
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

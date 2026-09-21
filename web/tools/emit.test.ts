// The freshness of the generated data. Carried over from `tests/test_parity.py`
// (step 8, stage 3).
//
// The reference, the general rules, the schemas and the prompts live as sources -
// markdown, JSON and text files - and travel to the browser as generated modules.
// Edit a source and forget to rebuild, and it falls here rather than in front of a
// person who was shown yesterday's wording.
//
//     npm run emit

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EMITTED_FIELDS, ROOT, TARGETS, emitPrompts, emitReference, emitRules,
         emitSchema } from "./emit";

const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");

describe("the generated data is fresh", () => {
  it("the browser's reference is built from the markdown and is not stale", () => {
    expect(read("web/src/lib/reference.data.ts"), "rebuild with: npm run emit")
      .toBe(emitReference());
  });

  it("the schemas in the browser are a copy of `schema/*.json`", () => {
    expect(read("web/src/lib/schema.data.ts"), "rebuild with: npm run emit")
      .toBe(emitSchema());
  });

  it("the prompt texts in the browser are a copy of the files in `prompts/`", () => {
    // A prompt is the QUESTION ITSELF put to the model: its fingerprint holds every
    // saved answer, and an edit here costs a full live run of the set.
    expect(read("web/src/lib/prompts.data.ts"), "rebuild with: npm run emit")
      .toBe(emitPrompts());
  });

  it("all four targets are rebuilt by one command", () => {
    expect(TARGETS.map((t) => t.path)).toEqual([
      "web/src/lib/reference.data.ts", "web/src/lib/rules.data.ts",
      "web/src/lib/schema.data.ts", "web/src/lib/prompts.data.ts"]);
  });

  it("the fields the screen takes from an entry are the ones that travel", () => {
    // `body` and `tokens` do not travel: the first is a multi-paragraph markdown
    // article, the second a hint for the model, and neither takes any part in the
    // reading on screen.
    for (const field of ["en", "short", "label", "code", "category"]) {
      expect(EMITTED_FIELDS as readonly string[]).toContain(field);
    }
    expect(EMITTED_FIELDS as readonly string[]).not.toContain("body");
    expect(EMITTED_FIELDS as readonly string[]).not.toContain("tokens");
    expect(read("web/src/lib/reference.data.ts")).toContain("Never edited by hand");
  });

  it("the general rules travel with the page", () => {
    // The reference used to arrive from a server, and the failure was SILENT: no
    // server, and the block vanished without a word (step 6d).
    const emitted = read("web/src/lib/rules.data.ts");
    expect(emitted, "rebuild with: npm run emit").toBe(emitRules());
    for (const field of ["key", "text", "source"]) {
      expect(emitted, field).toContain(`"${field}"`);
    }
    // But the articles themselves do not. Nothing renders them: the screen takes
    // only `text`. They are written for the developer and stay in the developer's
    // language, so in the browser they would be thousands of characters of prose that
    // nobody will read.
    expect(emitted, "the articles travelled into the page").not.toContain('"body"');
    // The page takes them locally and never goes to the network for the reference.
    const app = read("web/src/App.tsx");
    expect(app).toContain("GENERAL_RULES");
    expect(app, "a network call for the reference is back").not.toContain("generalRules()");
    // And the warning stays: the product may not present a general rule as something
    // read off the pole.
    expect(read("web/src/components/WhatWeSaw.tsx"))
      .toContain("These are general parking rules applied by law in Sweden.");
  });
});

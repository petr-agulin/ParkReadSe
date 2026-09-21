// Our own schema check — against an independent judge.
//
// In the browser the schema is checked by our own code (decision 124): pulling a
// library into the page for one check costs more than writing it. But a check that
// compares itself with itself guards nothing — so `ajv`, a real JSON Schema validator,
// stands beside it, and both judge the same deliberately broken readings. When they
// disagree, our own check is at fault, and that shows here rather than to a person at
// a sign.
//
// `ajv` lives ONLY in the tests (decision 138). `npm run test:build` guards that it
// did not reach the page.

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import { valid } from "./schema";
import { SIGN_SCHEMA } from "./schema.data";
import { MUTATIONS, applyMutation, documents } from "../../tools/goldens";

// `ajv`'s export arrives differently under ESM and CJS — take whichever came.
const Ctor: any = (Ajv2020 as any).default ?? Ajv2020;
// `strict: false`: the schema is written for people and carries descriptions `ajv`
// was not asked about. It is to judge the rules, not the presentation.
const judge = new Ctor({ allErrors: true, strict: false }).compile(SIGN_SCHEMA);

describe("the schema check against an independent judge", () => {
  it("gives the same verdict as `ajv` on every breaking recipe", () => {
    const docs = documents();
    const names = Object.keys(docs).sort().slice(0, 20);
    expect(names.length, "nothing to compare against").toBeGreaterThanOrEqual(10);

    let broken = 0;
    for (const name of names) {
      for (const mutation of MUTATIONS) {
        const doc = applyMutation(docs[name], mutation);
        const mine = valid(doc, SIGN_SCHEMA);
        expect(mine, `${name}::${mutation.label}`).toBe(judge(doc) as boolean);
        if (!mine) broken += 1;
      }
    }

    // A check of the check: the recipes are obliged to BREAK the document. If they did
    // not, the comparison would set two passes side by side and always be green.
    expect(broken, "not one recipe broke anything").toBeGreaterThanOrEqual(8 * names.length);
  });

  it("passes an intact reading with both", () => {
    const docs = documents();
    const one = docs[Object.keys(docs).sort()[0]];
    expect(valid(one, SIGN_SCHEMA)).toBe(true);
    expect(judge(one)).toBe(true);
  });
});

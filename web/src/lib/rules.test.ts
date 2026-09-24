// General rules: the reference about what is NOT written on the sign.
//
// It used to arrive from a server, and the failure was silent: no server, and the
// block vanished without a word. Now it travels with the page, so an empty list
// means a broken build rather than silence.
//
// The articles themselves are written for the developer, nothing renders them, and
// they no longer travel to the browser. So what is checked here is the source, not
// a copy of it.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { GENERAL_RULES } from "./rules.data";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DIR = `${ROOT}reference/general_rules`;

const articles = readdirSync(DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => ({ key: file.slice(0, -".md".length),
                    text: readFileSync(`${DIR}/${file}`, "utf-8") }));

/** The warning each article opens with, as a quoted block.
 *
 *  Its wording is not spelled out here: the articles are in the developer's
 *  language, and naming the phrase would put that language back into the sources
 *  of the page. The shape is enough — an article that loses the block fails. */
const caveat = (text: string): string =>
  (text.split("\n").find((line) => line.startsWith("> ")) ?? "").trim();

describe("general rules", () => {
  it("all ten arrived, each with a caption and a source", () => {
    expect(GENERAL_RULES.length).toBeGreaterThanOrEqual(10);
    for (const rule of GENERAL_RULES) {
      expect(rule.key, "key").toBeTruthy();
      expect(rule.text.length, `${rule.key}: caption`).toBeGreaterThan(5);
      expect(rule.source, `${rule.key}: source`).toBeTruthy();
    }
  });

  it("the README counts them right", () => {
    // A number in a document nobody rechecks quietly stops being true: in step 15a an
    // entry was added to the sign reference and the README went on stating the old
    // count. A missing sentence fails too - `Number(undefined)` is not a count.
    const readme = readFileSync(`${ROOT}README.md`, "utf-8");
    expect(Number(/(\d+) short notes about rules/.exec(readme)?.[1])).toBe(articles.length);
  });

  it("keys do not repeat", () => {
    const keys = GENERAL_RULES.map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("this is reference, not something read off the sign", () => {
    // Every article states of itself that the sign does not carry it: the product
    // may never present a general rule as read from the pole.
    expect(articles.length, "an article went missing").toBe(GENERAL_RULES.length);
    for (const article of articles) {
      expect(caveat(article.text).length, `${article.key}: no warning`)
        .toBeGreaterThan(40);
    }
  });

  it("the articles do not travel with the page", () => {
    // Nothing renders them, and they are not in the reader's language. Shipping
    // them put thousands of characters of prose into the bundle for no reader.
    for (const rule of GENERAL_RULES as unknown as Record<string, unknown>[]) {
      expect(Object.keys(rule), String(rule.key)).not.toContain("body");
    }
  });
});

// The double run: the same task given to two implementations, and the answers
// compared.
//
// The answers are computed by `web/tools/goldens.ts`, which also writes them; here
// they are checked against what lies in `parity/`. The probes live there rather than
// here for exactly one reason: the command that writes a reference answer and the run
// that checks it must compute with ONE piece of code. Two copies of one probe drift
// apart in silence - which is the very trouble the whole double run exists against.
//
// A disagreement has to READ: "did not match" is useless when there are close to two
// hundred cases and each holds regimes, segments and captions. So the path down to
// the field is assembled in full (`differences`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { differences, report } from "./parity";
import { LAYERS, PROBES } from "../../tools/goldens";

// The reference answers live outside `web/`: they are about the product's answer, not
// about the building of the page.
const DIR = fileURLToPath(new URL("../../../parity/", import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(`${DIR}${name}.json`, "utf-8"));

describe("the double run", () => {
  it("has its reference answers in place and its cases declared", () => {
    const cases = read("cases");
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.length).toBeGreaterThan(100);
    for (const layer of LAYERS) expect(read(layer)).toBeTruthy();
  });

  it("declares the ported layers, and every one of them is known", () => {
    const ported: string[] = read("PORTED").layers;
    expect(Array.isArray(ported)).toBe(true);
    for (const layer of ported) expect(LAYERS).toContain(layer);
  });

  it("agrees with the reference on a ported layer, and names an unported one aloud", async () => {
    const ported: string[] = read("PORTED").layers;
    const pending = LAYERS.filter((l) => !ported.includes(l));
    // Not decoration: a line in the output is the only thing keeping anyone from
    // forgetting that half the answer is checked nowhere yet.
    if (pending.length) console.log(`double run: awaiting a port — ${pending.join(", ")}`);

    for (const layer of ported) {
      const probe = PROBES[layer];
      // A layer declared ported with nothing to compute it is an error in the list.
      expect(probe, `layer ${layer} is declared ported, but there is no probe`).toBeTruthy();
      const lines = report(layer, read(layer), await probe!());
      expect(lines, lines.join("\n")).toEqual([]);
    }
  }, 120_000);
});

describe("a disagreement reads", () => {
  it("leads down to the field, not merely to the case", () => {
    const before = { regimes: [{ periods: [{ state: "allowed" }] }] };
    const after = { regimes: [{ periods: [{ state: "prohibited" }] }] };
    expect(differences(before, after)).toEqual([
      'regimes[0].periods[0].state: "prohibited" ≠ "allowed"',
    ]);
  });

  it("tells a missing field from an extra one", () => {
    expect(differences({ a: 1, b: 2 }, { a: 1 })).toEqual(["b: the field is missing"]);
    expect(differences({ a: 1 }, { a: 1, b: 2 })).toEqual(["b: an extra field — 2"]);
  });

  it("names a differing list length as a number", () => {
    const lines = differences({ p: [1, 2] }, { p: [1] });
    expect(lines[0]).toBe("p: 1 items, not 2");
  });

  it("names the first differing character of a long string", () => {
    // The calendar yields a letter per day: two such sheets side by side show
    // nothing.
    const before = "w".repeat(60) + "e" + "w".repeat(60);
    const after = "w".repeat(60) + "r" + "w".repeat(60);
    expect(differences({ classes: before }, { classes: after }))
      .toEqual(['classes: differs from character 60: "wwwwwrwwwww" ≠ "wwwwwewwwww"']);
  });

  it("shows a short string whole", () => {
    expect(differences({ state: "allowed" }, { state: "prohibited" }))
      .toEqual(['state: "prohibited" ≠ "allowed"']);
  });

  it("stays silent when the two agree", () => {
    const answer = { a: [1, { b: "x" }], c: null };
    expect(differences(answer, structuredClone(answer))).toEqual([]);
  });

  it("names the layer and the case in its report", () => {
    const lines = report("engine", { "answers/005@base": { permits: true } },
                         { "answers/005@base": { permits: false } });
    expect(lines).toEqual(["engine · answers/005@base · permits: false ≠ true"]);
  });

  it("counts a case that was never computed as a disagreement too", () => {
    expect(report("engine", { "answers/005@base": {} }, {}))
      .toEqual(["engine · answers/005@base: the case was not computed"]);
  });
});

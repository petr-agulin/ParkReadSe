// The reference answers and the machinery of comparison. Carried over from
// `tests/test_parity.py` (step 8).
//
// These checks guard not the rules but the MACHINERY: that nothing extra reached the
// reference answers, that the types are derived from the schema, that time is never
// taken from the machine, and that the measurement stays a tool rather than part of
// the product. The rules are guarded by the tests beside them.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "../src/lib/calendar";
import { parseNaive } from "../src/lib/civil";
import { grade } from "../src/lib/completeness";
import { evaluateParkingRules } from "../src/lib/engine";
import { CONTRACT } from "../src/lib/present";
import { recognise, recognitionFlags } from "../src/lib/reference";
import { LAYERS, PROBES, SPECIAL, buildCases, documents, probeCompleteness, probePresent, pyDump,
         stale } from "./goldens";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");
const readJson = (p: string) => JSON.parse(read(p));
const stem = (f: string) => f.replace(/\.[^.]+$/, "");

/** Every file of `web/src` that travels into the application. */
function appSources(dir = join(ROOT, "web", "src")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return appSources(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Every file of `web/tools` that is not a test. */
function toolSources(dir = join(ROOT, "web", "tools")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return toolSources(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** Every test file of the front end: in the application and in the tools alike. */
function testFiles(dir = join(ROOT, "web")): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(full).isDirectory()) return testFiles(full);
    return name.endsWith(".test.ts") ? [full] : [];
  });
}

describe("what the reference answers are made of", () => {
  it("every reading of the set is a case of the comparison", () => {
    // The comparison runs over the whole set rather than a couple of convenient
    // photographs: the model produces merged panels and odd fields that a tidy
    // reference reading never has.
    const docs = [
      ...readdirSync(join(ROOT, "testset", "answers")).filter((f) => f.endsWith(".extract.json"))
        .map((f) => `answers/${f.slice(0, -".extract.json".length)}`),
      ...readdirSync(join(ROOT, "testset", "expected")).filter((f) => f.endsWith(".json"))
        .map((f) => `expected/${stem(f)}`),
    ];
    expect(docs.length).toBeGreaterThan(100);
    expect(docs.some((d) => d.startsWith("answers/"))).toBe(true);
    expect(docs.some((d) => d.startsWith("expected/"))).toBe(true);
    const ids = new Set(readJson("parity/cases.json").map((c: any) => c.id));
    expect(docs.filter((d) => !ids.has(`${d}@base`))).toEqual([]);
  });

  it("the engine's reference answer holds the answer, not the innards", () => {
    // Otherwise the comparison would break on every rearrangement of the code while
    // saying nothing about meaning.
    const golden = readJson("parity/engine.json");
    const one = golden["answers/005-2tim-8-18-parentes-8-15-dubbelpil@base"];
    expect(Object.keys(one).sort())
      .toEqual(["note", "permits_parking", "regimes", "uncertainties"]);
    const regime = one.regimes[0];
    expect(Object.keys(regime).sort()).toEqual([
      "audience", "audience_excluded", "duration_expires_at", "duration_source",
      "eligibility", "extent", "periods", "place_notes"]);
    expect(Object.keys(regime.periods[0]).sort()).toEqual([
      "conditions", "end", "max_duration_minutes", "note", "start", "state"]);
  });

  it("the presentation's reference answer is the finished answer", () => {
    // The words are the work of presentation, and they can drift silently.
    const golden = readJson("parity/present.json");
    const one = golden["expected/049-moped-sasong-avgift-tva-taxor@season-edge"];
    expect(one.contract).toBe(CONTRACT);
    expect(one.regimes.some((w: any) => w.audience_short)).toBe(true);
    expect(one.regimes.some((w: any) => w.periods.some((p: any) => p.headline))).toBe(true);
  });

  it("not one photograph ever reaches the reference answers", () => {
    // Photographs with number plates never enter the repository, and this path is
    // closed to them as well.
    const dir = join(ROOT, "parity");
    for (const name of readdirSync(dir).sort()) {
      expect([".json", ".txt"], name).toContain(extname(name));
      const text = readFileSync(join(dir, name), "utf-8");
      for (const bad of ["data:image", "base64", ".jpg", ".png"]) {
        expect(text.includes(bad), `${name}: ${bad}`).toBe(false);
      }
    }
  });

  it("outdated answers are named aloud and not counted", () => {
    // Passing over them silently would look like "there is no such photograph",
    // when there is one.
    const golden = readJson("parity/measure.json");
    // Whether any are outdated depends on the last run - after the full run of step 15f
    // there are none. The mechanism is proved on built answers in `testset.test.ts`.
    expect(Array.isArray(golden.excluded)).toBe(true);
    expect(golden.photos + golden.excluded.length).toBeGreaterThanOrEqual(57);
    expect(golden.fingerprint).toHaveLength(12);
  });

  it("the threshold table is the one the threshold stands on", () => {
    // Fields disagree on many photographs, the answer on few; the threshold stands on
    // the second.
    const golden = readJson("parity/measure.json");
    expect(golden.threshold_table).toContain("| 0.900 |");
    // Disagreeing answers are a map of "photograph -> how it disagreed". A share, not a
    // count: the bound was ten when the set had 57 photographs, and the set grows.
    const diverged = Object.keys(golden.diverged).length;
    expect(diverged / golden.photos, "few answers disagree - as it should be").toBeLessThan(0.15);
    const fieldsOff = Object.values(golden.fields as Record<string, [number, number]>)
      .filter(([hits, total]) => hits < total).length;
    expect(fieldsOff, "fields must disagree more often than the answer").toBeGreaterThan(diverged);
  });
});

describe("what stayed true on this side", () => {
  it("the reading's types are derived from the schema, not guessed", () => {
    // A second copy of the schema, written from memory, will one day drift from the
    // first, and the first casualty will be a field the model returned and the
    // browser failed to read.
    const schema = readJson("schema/sign.schema.json");
    const types = read("web/src/lib/sign.ts");
    for (const field of Object.keys(schema.$defs.parsed.properties)) {
      expect(types, `the field ${field} is missing from the types`).toContain(field);
    }
    for (const field of Object.keys(schema.$defs.panel.properties)) {
      expect(types, `the panel field ${field} is missing from the types`).toContain(field);
    }
    for (const field of ["vehicle_class", "eligibility", "arrow", "scope_shift",
                         "payment_method", "placement"]) {
      for (const value of schema.$defs.parsed.properties[field].enum ?? []) {
        expect(types, `${field}: ${value} is not named in the types`).toContain(`"${value}"`);
      }
    }
    for (const value of schema.properties.main_sign.properties.type.enum) {
      expect(types, `the sign type ${value} is not named`).toContain(`"${value}"`);
    }
  });

  it("the engine keeps no clock of its own", () => {
    // `Date` is about an instant, and a sign is about a calendar: along with `Date`
    // the machine's time zone, summer time and months counted from zero would enter
    // the computation (risk 5 of the port).
    for (const name of ["engine.ts", "calendar.ts", "clock.ts", "civil.ts"]) {
      const source = read(`web/src/lib/${name}`);
      for (const bad of ["new Date", "Date.now", "toLocale", "getTimezoneOffset",
                         "Intl.", "zoneinfo", "tzdata"]) {
        expect(source, `${name}: ${bad}`).not.toContain(bad);
      }
    }
  });

  it("the developer's readings moved along with the engine", () => {
    // The engine's tests say WHY an answer is what it is: behind each stands a
    // decision of the developer or a finding on a real photograph.
    const ported = read("web/src/lib/engine.test.ts");
    for (const mark of ["decision 82", "decision 113", "decision 118", "decision 120",
                        "decision 121", "`005`", "`033`", "`038`", "`049`",
                        "sign B", "Frihamnen"]) {
      expect(ported, mark).toContain(mark);
    }
  });

  it("the vocabulary guard lives on the same side as the words", () => {
    // Leaving it only in Python would have meant losing the safeguard the day Python
    // left - and the wording is kept in one place for the sake of that safeguard.
    const guard = read("web/src/lib/present.test.ts");
    for (const bad of ["parking allowed", "you may park", "you can park here"]) {
      expect(guard, bad).toContain(bad);
    }
    expect(guard, "the whole set is checked, not one photograph").toContain("parity/cases.json");
  });
});

describe("the measurement stays a tool", () => {
  it("the measurement never reaches the page", () => {
    for (const path of appSources()) {
      const text = readFileSync(path, "utf-8");
      if (path.endsWith("measure.ts")) continue;
      expect(text, path).not.toContain('from "./measure"');
      expect(text, path).not.toContain('from "../lib/measure"');
    }
    const scripts = readJson("web/package.json").scripts;
    expect(scripts, "there is no npm run measure").toHaveProperty("measure");
    expect(scripts.measure).toContain("--dir measure");
    expect(scripts.test, "the measurement would join the ordinary run").toContain("--exclude");
  });

  it("the measurement reads the same set from disk", () => {
    // The developer's reference readings, the model's answers and the photographs:
    // the area of the frame enters the confidence.
    const set = read("web/tools/testset.ts");
    for (const path of ["testset", "expected", "answers", "photos"]) {
      expect(set, path).toContain(path);
    }
    const report = read("web/measure/report.test.ts");
    expect(report).toContain("../src/lib/measure");
    expect(report).toContain("../tools/testset");
  });
});

describe("TypeScript writes the reference answers", () => {
  it("rewritten by this command, they match what is lying there - to the byte", async () => {
    // A failure means the product's answer changed. That is not a broken test, it is
    // the test working: look at the difference (`npm test -- parity`) and rewrite
    // deliberately (`npm run goldens:write`).
    expect(await stale()).toEqual([]);
  }, 120_000);

  it("the cases are declared in a file, not assembled on the fly by each side", () => {
    expect(readJson("parity/cases.json")).toEqual(buildCases());
    // The comparison reads the same file - otherwise the two sides would be checked
    // on different exercises.
    expect(read("web/src/lib/parity.test.ts")).toContain('read("cases")');
  });

  it("the awkward moments are all covered and each is given a reason", () => {
    // Something real once broke on each of them: an eve, a red day, both nights of
    // the clock change, the edge of a season, midnight.
    expect(SPECIAL.map((s) => s.label).sort()).toEqual(
      ["dst-back", "dst-forward", "eve", "midnight", "red", "season-edge"]);
    const ids = buildCases().map((c) => c.id);
    for (const { label } of SPECIAL) {
      expect(ids.some((i) => i.endsWith(`@${label}`)), label).toBe(true);
    }
    // Without a reason the list turns into a set of numbers.
    expect(SPECIAL.filter((s) => !s.why)).toEqual([]);
  });

  it("the layers are declared, and each has a probe", () => {
    const ported: string[] = readJson("parity/PORTED.json").layers;
    expect(ported.filter((l) => !LAYERS.includes(l)), "an unknown layer").toEqual([]);
    expect(LAYERS.filter((l) => !PROBES[l]), "a layer with no probe").toEqual([]);
  });

  it("rewriting is a separate command, not a side effect of a run", () => {
    // Otherwise the reference answers get rewritten one day to "make it green", and
    // the disagreement disappears along with the red.
    const scripts = readJson("web/package.json").scripts;
    expect(scripts.goldens, "there is no checking command").toBeTruthy();
    expect(scripts.goldens).not.toContain("--write");
    expect(scripts["goldens:write"]).toContain("--write");

    // No test rewrites the reference answers by itself. This file is excluded from
    // the check: it is the one naming that string, and the test would otherwise
    // catch itself.
    for (const file of testFiles()) {
      if (file.endsWith("goldens.test.ts")) continue;
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("goldens:write");
      const imported = text.match(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*goldens["']/);
      if (imported) expect(imported[1], file).not.toMatch(/\bwrite\b/);
    }
  });

  it("numbers are written the Python way: a float stays a float", () => {
    // Python distinguishes `1.0` from `1`, and `JSON.stringify` does not. There are
    // three and a half thousand such numbers in the reference answers, and without
    // this rule the first rewrite would have rearranged every one of them.
    const text = pyDump({ confidence: 1, signals: { a: 0, b: 0.5 },
                          rows: [[1, "x", false, "y"]], panels: 2 });
    expect(text).toContain('"confidence": 1.0');
    expect(text).toContain('"a": 0.0');
    expect(text).toContain('"b": 0.5');
    expect(text, "an integer must stay an integer").toContain('"panels": 2');
    expect(text.split("\n").some((l) => l.trim() === "1.0,"),
           "the first column of a measurement row is a float").toBe(true);
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("the screen snapshots grade a reading as the live app does", () => {
  // Step 27. The two screen snapshots graded without the flag the live pipeline raises
  // for a plate read but not understood: they called "full" what the phone showed as
  // partial, and a replay of `088` was believed on the strength of it. What the live
  // app also knows and the snapshots are never given - the photograph's size, the
  // repairs to the model's answer - is the measurement's business, not theirs.
  it("both raise the live recognition flags, on every reading of the set", () => {
    const docs = documents();
    const cases = buildCases(docs);
    const cal = new Calendar();
    const completeness = probeCompleteness(cases, docs) as Record<string, any>;
    const present = probePresent(cases, docs) as Record<string, any>;
    let unread = 0;
    for (const c of cases) {
      const doc = docs[c.doc];
      const live = grade(doc, { flags: recognitionFlags(recognise(doc)),
                                evaluation: evaluateParkingRules(doc, parseNaive(c.moment), cal) });
      expect(completeness[c.id].category, c.id).toBe(live.category);
      expect(present[c.id].completeness.category, c.id).toBe(live.category);
      if (live.uninterpretedPlates.length) {
        unread += 1;
        expect(completeness[c.id].category, `${c.id}: a plate not understood`).not.toBe("full");
      }
    }
    // The set does hold such readings; without them this test would prove nothing.
    expect(unread).toBeGreaterThan(0);
  }, 120_000);

  it("builds the recognition flags in one place", () => {
    // Three copies once stood side by side, and the snapshots had none. The marker is
    // split so that this file does not count as a place that builds the flag.
    const marker = `"${["uninterpreted", "panels"].join("_")}:" +`;
    const builders = [...appSources(), ...toolSources()]
      .filter((f) => readFileSync(f, "utf-8").includes(marker))
      .map((f) => f.slice(ROOT.length).replace(/\\/g, "/"));
    expect(builders).toEqual(["web/src/lib/reference.ts"]);
  });
});

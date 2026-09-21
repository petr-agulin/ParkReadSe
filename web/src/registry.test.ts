// The registry of the Python tests — the safeguard of step 8.
//
// Python went, and 301 tests with it. Which of them were carried over cannot be left
// to memory: each is named in `parity/python-tests.json`, and against each name stands
// one of three — not yet decided, ported, dropped with a reason.
//
// A ported test is found by its marker in a TypeScript test: the string `py:`, then the
// name of the Python test file, two colons and the name of the function. The marker is
// not decoration: without it a "ported" entry fails this file.
//
// **The main rule is the last test:** once the `tests/` folder is gone, no entry may
// stay undecided. Python could not be deleted before the fate of every one of its
// tests was settled — and code checks that, not memory.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB = `${ROOT}web/`;
const PYTHON_TESTS = `${ROOT}tests/`;
const FROZEN_COUNT = 301;

type Entry = { status: string; reason?: string };
type Registry = { frozen: string; count: number; tests: Record<string, Entry> };

const registry: Registry = JSON.parse(
  readFileSync(`${ROOT}parity/python-tests.json`, "utf-8"));
const entries = Object.entries(registry.tests);
const pythonAlive = existsSync(PYTHON_TESTS);

const TAG = /py:\s*(test_[a-z_]+::test_[a-z0-9_]+)/g;

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
    const full = `${dir}${name}`;
    if (statSync(full).isDirectory()) return testFiles(`${full}/`);
    // This file itself is not scanned: its description of markers must not count as one.
    return name.endsWith(".test.ts") && name !== "registry.test.ts" ? [full] : [];
  });
}

/** The name of a Python test → the files that carry its marker. */
function tags(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of testFiles(WEB)) {
    for (const m of readFileSync(file, "utf-8").matchAll(TAG)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), file.slice(WEB.length)]);
    }
  }
  return out;
}

/** The tests Python holds right now. */
function livePythonTests(): string[] {
  return readdirSync(PYTHON_TESTS)
    .filter((f) => /^test_.*\.py$/.test(f))
    .sort()
    .flatMap((f) => [...readFileSync(PYTHON_TESTS + f, "utf-8").matchAll(/^def (test_\w+)\(/gm)]
      .map((m) => `${f.slice(0, -".py".length)}::${m[1]}`));
}

describe("the registry of Python tests", () => {
  it("is frozen whole: 301 entries, and the same number in the file", () => {
    expect(entries).toHaveLength(FROZEN_COUNT);
    expect(registry.count).toBe(FROZEN_COUNT);
  });

  // The skip here shows in the report rather than keeping quiet: with Python deleted
  // there is nothing left to hold the registry against, and that is an honest state,
  // not a hole.
  it.runIf(pythonAlive)("names exactly Python's tests while Python is intact", () => {
    const live = livePythonTests();
    const listed = entries.map(([name]) => name);
    expect(live.filter((n) => !registry.tests[n]), "a test appeared after the freeze")
      .toEqual([]);
    expect(listed.filter((n) => !live.includes(n)), "a test disappeared from Python")
      .toEqual([]);
  });

  it("gives every entry a clear status", () => {
    const odd = entries.filter(([, e]) => !["pending", "ported", "dropped"].includes(e.status));
    expect(odd.map(([n, e]) => `${n}: ${e.status}`)).toEqual([]);
  });

  it("names a dropped test with its reason", () => {
    const silent = entries.filter(([, e]) => e.status === "dropped" && !(e.reason ?? "").trim());
    expect(silent.map(([n]) => n)).toEqual([]);
  });

  it("finds a ported test by its marker", () => {
    const found = tags();
    const lost = entries.filter(([n, e]) => e.status === "ported" && !found.has(n));
    expect(lost.map(([n]) => n), 'the entry says "ported", but no test carries its marker')
      .toEqual([]);
  });

  it("leads every marker to a registry entry marked ported", () => {
    const wrong = [...tags()]
      .filter(([n]) => registry.tests[n]?.status !== "ported")
      .map(([n, files]) => `${n} (${files.join(", ")}): ${registry.tests[n]?.status ?? "not in the registry"}`);
    expect(wrong).toEqual([]);
  });

  it.runIf(!pythonAlive)("leaves no undecided entry once Python is deleted", () => {
    const pending = entries.filter(([, e]) => e.status === "pending").map(([n]) => n);
    expect(pending, "Python was deleted before the fate of its tests was decided").toEqual([]);
  });
});

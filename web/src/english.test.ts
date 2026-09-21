// The code speaks English. Swedish stays where a sign, a law or a holiday needs it;
// Russian appears in no source, comment or message the repository publishes.
//
// Not scanned by design: the articles in `reference/` (written for the developer, in
// the developer's language) and the working logs of the test set.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TEXT = /\.(ts|tsx|mjs|js|css|html|json|md)$/;
const SKIP = new Set(["node_modules", "dist"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = `${dir}${name}`;
    if (statSync(full).isDirectory()) return files(`${full}/`);
    return TEXT.test(name) ? [full] : [];
  });
}

const SCANNED = [
  ...["web/", "schema/", "prompts/"].filter((d) => existsSync(ROOT + d))
    .flatMap((d) => files(ROOT + d)),
  ...[".env.example", ".gitignore", "README.md", "AGENT_SPEC.md", "design.md",
      "testset/TRANSCRIPTS.md"]
    .map((f) => ROOT + f).filter((f) => existsSync(f)),
];

describe("the language of the code", () => {
  it("has no Russian in any source, comment, message or published document", () => {
    const found = SCANNED.flatMap((file) =>
      readFileSync(file, "utf-8").split("\n")
        .map((line, i) => (/\p{Script=Cyrillic}/u.test(line)
          ? `${file.slice(ROOT.length)}:${i + 1}` : ""))
        .filter(Boolean));
    expect(found).toEqual([]);
  });

  it("scans the real sources: an empty list would pass in silence", () => {
    expect(SCANNED.length).toBeGreaterThan(50);
    expect(SCANNED.some((f) => f.endsWith("web/src/App.tsx"))).toBe(true);
    expect(SCANNED.some((f) => f.endsWith("web/src/lib/engine.ts"))).toBe(true);
  });
});

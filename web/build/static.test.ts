// Checking the BUILT page: `npm run test:build`.
//
// Kept apart from the ordinary run because a build takes seconds, and there is no
// reason to pay them on every test run. The build happens here: checking whatever
// `dist` was left holding from last time would be checking last time.
//
// The whole check asks one question: **does the page work with no Python behind it,
// and from any folder**. That cannot be answered by reading the sources - what
// survives the bundler is not what was written.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const DIST = `${WEB}dist/`;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = `${dir}${name}`;
    return statSync(full).isDirectory() ? files(`${full}/`) : [full];
  });
}

let built: string[] = [];

beforeAll(() => {
  // `NODE_ENV` is set explicitly: the test run sets its own value, the child build
  // inherits it, and Vite then builds the page as a development one, with the
  // development branches still inside. The check would be checking something other
  // than what goes to the host.
  execFileSync("npm", ["run", "build"], {
    cwd: WEB, stdio: "pipe", shell: true,
    env: { ...process.env, NODE_ENV: "production" },
  });
  built = files(DIST);
}, 300_000);

describe("the built page", () => {
  it("consists of the page, the worker, the manifest and the icons", () => {
    for (const file of ["index.html", "sw.js", "manifest.webmanifest",
                        "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
      expect(existsSync(DIST + file), file).toBe(true);
    }
  });

  it("carries no server address in the sources either", () => {
    // Requirement 14 of step 8: the server path must survive neither in the build
    // nor in the sources. The build is checked below, but there the string might
    // simply not have reached the bundler - whereas in the sources it would mean
    // the half that talked to a server is still intact.
    // Application sources are scanned, not tests: tests never travel into the page,
    // and the string inside them is exactly how its absence is checked.
    for (const file of files(`${WEB}src/`)
                         .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))) {
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("/api/");
      expect(text, file).not.toContain("import.meta.env.DEV");
    }
  });

  it("never calls a server: the path is not in it", () => {
    // The half that spoke to Python hid behind a development-only flag, and the
    // bundler drops it. Were it to survive, the page would knock silently at a
    // server that does not exist.
    for (const file of built.filter((f) => /\.(js|html|css)$/.test(f))) {
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("/api/analyze");
      expect(text, file).not.toContain("/api/general-rules");
    }
  });

  it("uses the system typeface: nothing is fetched from outside", () => {
    // Requirement 2 of step 11. An external font is both another server in the list
    // of what the page pulls, and an empty first screen where there is no network.
    // The look rests on the scale of sizes, not on a typeface.
    for (const file of built.filter((f) => /\.(js|html|css)$/.test(f))) {
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("fonts.googleapis.com");
      expect(text, file).not.toContain("fonts.gstatic.com");
      expect(text, file).not.toContain("@import url(");
    }
  });

  it("leaves the detector's marking page and its image readers out (step 17)", () => {
    // `mark.html` and the dev server's `/__marks` exist for the developer's
    // measurement. In the build they would be a page and a path that serve the set's
    // photographs - which are not the developer's to publish (decision 185).
    expect(existsSync(DIST + "mark.html")).toBe(false);
    for (const file of built.filter((f) => /\.(js|html|css)$/.test(f))) {
      const text = readFileSync(file, "utf-8");
      expect(text, file).not.toContain("__marks");
      expect(text, file).not.toContain("Mark the signs");
    }
    const pkg = JSON.parse(readFileSync(`${WEB}package.json`, "utf-8"));
    for (const reader of ["jpeg-js", "pngjs"]) {
      expect(pkg.devDependencies, `${reader} belongs to the tools`).toHaveProperty(reader);
      expect(pkg.dependencies ?? {}, `${reader} would travel into the page`)
        .not.toHaveProperty(reader);
    }
  });

  it("keeps the independent judge of the schema in the tests", () => {
    // `ajv` exists to judge our own schema check (decision 138), and nowhere else.
    // Had it travelled into the page, the person standing at a sign would pay in
    // bandwidth and memory for something one test needs.
    for (const file of built.filter((f) => f.endsWith(".js"))) {
      const text = readFileSync(file, "utf-8");
      // A string of `ajv` itself: our own check says the same thing in other words.
      expect(text, file).not.toContain("must be equal to one of the allowed values");
      expect(text, file).not.toContain("ajv/dist");
    }
    const pkg = JSON.parse(readFileSync(`${WEB}package.json`, "utf-8"));
    expect(pkg.devDependencies, "`ajv` belongs to development only").toHaveProperty("ajv");
    expect(pkg.dependencies ?? {}, "`ajv` would travel into the page").not.toHaveProperty("ajv");
  });

  it("carries no browser-or-Python switch", () => {
    for (const file of built.filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(file, "utf-8"), file).not.toContain("Read on this device");
    }
  });

  it("uses relative paths: the page lives at a root or in a folder", () => {
    const html = readFileSync(DIST + "index.html", "utf-8");
    expect(html).toContain("./assets/");
    // An absolute path would tie the page to the root of a domain.
    expect(html).not.toMatch(/(src|href)="\/[^/]/);
  });

  it("puts the worker beside the page, carrying everything it needs", () => {
    const sw = readFileSync(DIST + "sw.js", "utf-8");
    expect(sw).toContain("parkread-shell-");
    expect(sw).toContain("./manifest.webmanifest");
    // Not one import: module service workers are not available everywhere, and the
    // miss would be silent - the application works, there is simply no offline.
    expect(sw).not.toMatch(/^\s*import[\s({]/m);
  });
});

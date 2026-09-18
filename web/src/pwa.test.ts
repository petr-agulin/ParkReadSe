// The page as an application: the manifest, the icons, relative paths, and what must
// never reach the built page.
//
// What is checked are the FILES, not behaviour: the manifest is read by the system
// rather than by our code, and a mistake in it brings nothing down - the application
// simply refuses to install on a phone, and the only way to learn why is by hand.
// That is caught by a test or not at all.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SHELL } from "./lib/offline";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(WEB + path, "utf-8");

/** Every component of the page: the `.tsx` files under `src`, nested folders included. */
const sources = (dir = ""): string[] =>
  readdirSync(`${WEB}src/${dir}`, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(`${dir}${e.name}/`)
    : e.name.endsWith(".tsx") ? [`src/${dir}${e.name}`] : []);

const manifest = JSON.parse(read("public/manifest.webmanifest"));
// The chrome of the application: the colour of the system bar. This is the
// hexadecimal twin of the `accent` token from `design.md` - the manifest and the
// `<meta>` are read by the system rather than by our CSS, and not every phone parses
// the colour notation used there. The two change together.
const BLUE = "#2a6099";

describe("the manifest", () => {
  it("is named as a person will find it on their phone", () => {
    expect(manifest.name).toContain("ParkRead");
    expect(manifest.short_name).toBe("ParkRead");
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("opens as an application, not as a tab", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("carries the same colours as the screen and the icon", () => {
    expect(manifest.theme_color.toLowerCase()).toBe(BLUE);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("uses relative addresses: the host is not known in advance", () => {
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    for (const icon of manifest.icons) expect(icon.src.startsWith("./")).toBe(true);
  });

  it("names real icons: the file is there, at the size it claims", () => {
    for (const icon of manifest.icons) {
      const file = icon.src.replace("./", "");
      expect(existsSync(`${WEB}public/${file}`), file).toBe(true);
      expect(icon.type).toBe("image/png");
      // The size in the manifest is a promise to the system; the file name repeats it.
      expect(file, icon.sizes).toContain(icon.sizes.split("x")[0]);
    }
  });

  it("has an icon for the mask - or the system crops the drawing its own way", () => {
    const maskable = manifest.icons.filter((i: { purpose: string }) =>
      i.purpose === "maskable");
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe("512x512");
  });
});

describe("the page", () => {
  const html = read("index.html");

  it("points at the manifest and the icon by a relative path", () => {
    expect(html).toContain('href="./manifest.webmanifest"');
    expect(html).toContain('href="./icon-192.png"');
    expect(html).not.toContain('href="/manifest.webmanifest"');
  });

  it("gives the system bar the same colour as the manifest", () => {
    expect(html).toContain(`content="${BLUE}"`);
  });

  it("is built with a relative base: the page lives in any folder", () => {
    expect(read("vite.config.ts")).toMatch(/base:\s*"\.\/"/);
  });
});

describe("the shell and the public folder", () => {
  it("caches exactly what lies beside the page", () => {
    const onDisk = readdirSync(`${WEB}public`).sort();
    const listed = SHELL.filter((p) => p !== "./" && p !== "./index.html")
                        .map((p) => p.replace("./", "")).sort();
    // Add an icon and forget the shell, and you are without it offline - which can
    // only be noticed on an aeroplane.
    expect(listed).toEqual(onDisk);
  });
});

describe("what is absent from the built page", () => {
  const app = read("src/App.tsx");

  it("carries no server: no import, no address, no development branch", () => {
    // Python was deleted (step 8, stage 6). While the development branch lives, so
    // does a half with nowhere to go - and it looks like a working choice.
    expect(app).not.toContain('from "./api"');
    expect(app).not.toContain("/api/");
    expect(app).not.toContain("import.meta.env.DEV");
  });

  it("carries no browser-or-Python switch at all", () => {
    // The choice no longer exists: the browser answers, and there is nobody else to.
    expect(app).not.toContain("Read on this device");
    expect(app).not.toContain("server.py");
  });

  it("keeps the styling in tokens rather than in the markup", () => {
    // Requirement 1 of step 11. A colour written into a component drifts from the
    // other screens in silence: one file gets edited and three are forgotten. The
    // values live in `index.css`, and only names remain in the markup.
    const PALETTE = /\b(?:bg|text|border|fill|stroke|ring|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

    for (const file of sources("")) {
      const text = read(file);
      // The negative lookbehind is there for a character entity: that is a symbol,
      // not a colour, and it must not be caught here.
      expect(text, `${file}: a colour is written into the markup`)
        .not.toMatch(/(?<!&)#[0-9a-fA-F]{3,8}\b/);
      // Colour functions are literals just as much as a hexadecimal value is. Only
      // two of them used to be checked, and the hole showed up at stage 5: the
      // gradient of the bottom layer was written into a style through the very
      // notation every colour in this project is defined in - and the guard let it
      // through.
      expect(text, `${file}: a colour function bypassing the tokens`)
        .not.toMatch(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/);
      expect(text, `${file}: the bundler's palette instead of a token`).not.toMatch(PALETTE);
    }
  });

  // The guard over the names of sizes and colours moved to `tokens.test.ts`, beside
  // the contrast guard: both read one file of tokens and check its properties rather
  // than the page.

  it("registers the service worker only in the built page", () => {
    const main = read("src/main.tsx");
    expect(main).toContain("import.meta.env.PROD");
    // A relative path: the worker governs its own folder, not the root of a domain.
    expect(main).toContain('register("./sw.js")');
  });
});

describe("the settings screen", () => {
  const screen = read("src/components/SettingsScreen.tsx");

  it("makes \"remember\" a checkbox, not a switch", () => {
    // The developer chose a checkbox and overrode the rule in `design.md` that says
    // a switch rather than a checkbox. Going back to the old look in silence is not
    // allowed: the decision was taken separately and with reservations.
    expect(screen).toContain('type="checkbox"');
    expect(screen).not.toContain('role="switch"');
  });

  it("keeps a long value from pushing the button off the screen", () => {
    // A long key ran off to the right and carried the button with it - the row had
    // no minimum-width class. It is looked for in the ATTRIBUTE rather than anywhere
    // in the file: the same word stands in a comment next to it, and a search over
    // the text would have stayed green against empty markup.
    expect(screen).toMatch(/className="[^"]*\bmin-w-0\b/);
  });
});

describe("the drawn sign", () => {
  it("both screens take their plates from one place", () => {
    // The same list used to stand verbatim in both files - and the screens drifted
    // apart. That was the FIRST remark from the phone: two states of one screen
    // spoke about it in different words.
    //
    // TypeScript will not stop the array being written back inline: an inline array
    // is a lawful prop, and the compiler stays quiet. This check will stop it.
    for (const file of ["src/components/FirstLaunch.tsx", "src/components/Home.tsx"]) {
      const text = read(file);
      expect(text, `${file}: the sign is not drawn from the shared list`)
        .toContain("SIGN_PLATES");
      expect(text, `${file}: a plate's text is written into the markup`)
        .not.toMatch(/Vardagar|Övrig tid/);
    }
  });
});

describe("the height of the window", () => {
  it("is measured by the shell alone, and measured in the smallest unit", () => {
    // The large unit is computed on a phone as though the address bar were not
    // there: the page comes out exactly its height longer than the window -
    // everything fits, and there is a scrollbar all the same. That is precisely what
    // the developer found, on two phones at once.
    //
    // The dynamic unit does not save it: it changes as you go, and a screen measured
    // with the bar hidden stops fitting the second the bar slides out. The small
    // unit is the smallest height of the window: it always fits, and fits the same.
    const app = read("src/App.tsx");
    expect(app).toContain("min-h-[100svh]");
    // The name of the banned class is assembled from pieces DELIBERATELY, and must
    // not be written whole even in a comment beside it. The bundler looks for class
    // names across every file of the project, tests included: a whole literal - in
    // code or in prose - adds a dead rule with the old measurement to the built CSS
    // by itself. The markup never applies it, but the check "has the old measurement
    // left the build" then answers "no" on correct code. Observed: twice.
    expect(app).not.toContain("min-h-" + "screen");
    expect(app).not.toMatch(/\d+dvh/);
  });

  it("lets no screen measure the window itself", () => {
    // A screen that subtracted the shell's padding kept the shell's number in
    // somebody else's file: change the padding and the scrollbar would come back in
    // silence. Exactly one file may measure the window, and that is the shell.
    for (const file of sources().filter((f) => f !== "src/App.tsx")) {
      expect(read(file), `${file}: the screen measures the window itself`)
        .not.toMatch(/\d+[sdl]?vh/);
    }
  });

  it("makes the full-width band reach exactly the shell's padding", () => {
    // The band's negative margin and the shell's padding are one and the same
    // number, written in two files. Let them drift and the band stops reaching the
    // edges - noticeable only by eye, on a phone.
    // The numbers are taken from the `className` attribute rather than from the
    // whole file: named in a neighbouring comment, they would satisfy the check
    // while drawing nothing.
    const shell = read("src/App.tsx").match(/<main className="([^"]*)"/)?.[1] ?? "";
    const pad = shell.match(/\bpx-(\d+)\b/)?.[1];
    const band = read("src/components/Home.tsx")
      .match(/className="([^"]*\B-mx-\d+[^"]*)"/)?.[1]
      ?.match(/-mx-(\d+)/)?.[1];
    expect(pad, "the shell has no horizontal padding").toBeTruthy();
    expect(band, "the band does not reach past the padding").toBeTruthy();
    expect(band, "the band and the shell's padding have drifted apart").toBe(pad);
  });

  it("tightens the band on a short screen, by a rule that really exists", () => {
    // It was first written as an arbitrary media variant, and the bundler silently
    // emitted neither it nor the size it switched on: there was not one such rule in
    // the built CSS. The care for a short screen existed only in the markup. Now it
    // is an ordinary media query, and it is checked here.
    const css = read("src/index.css");
    expect(css).toMatch(/@media\s*\(max-height:\s*\d+px\)/);
    expect(css).toContain(".tight-on-short");
    // The class is looked for IN THE ATTRIBUTE, not anywhere in the file. It was
    // written with a plain text search at first, and sabotage did not break it: the
    // class is also named in the comment above the band itself, so the check stayed
    // green against empty markup.
    expect(read("src/components/Home.tsx"))
      .toMatch(/className="[^"]*\btight-on-short\b/);
  });

  it("keeps the caption of the moment from wrapping", () => {
    // With a date chosen the row grew, and the caption ran onto two lines - which
    // reads not as a row of a list but as a fragment. Caught on the phone; pinned
    // here, because the wrap can come back with one class removed by accident.
    expect(read("src/components/Home.tsx"))
      .toMatch(/className="[^"]*\bwhitespace-nowrap\b[^"]*"\s*>\s*Reading for/);
  });

  it("puts the ground on the page, not only on the shell", () => {
    // With the smallest unit the shell sits BELOW the window when the address bar is
    // hidden, and white would show through underneath - where nobody painted it.
    expect(read("src/index.css")).toMatch(/body\s*\{[^}]*--color-ground-2/);
  });
});

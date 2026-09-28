// The dev server's side of the marking page (step 17): the set's photographs and
// testset/frames.json, for `mark.html` in `npm run dev` only. Never in the build.
//
// Only this computer is answered. `npm run dev:lan` opens the dev server to the
// network so a phone can reach the app, and the set's photographs - Street View
// captures, number plates (decision 185) - must not go out with it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

import { FRAMES_NOTE, type Frames } from "./frames";

const ROOT = join(import.meta.dirname, "..", "..");
const PHOTOS = join(ROOT, "testset", "photos");
const INDEX = join(ROOT, "testset", "photos.json");
const FRAMES = join(ROOT, "testset", "frames.json");

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const isBox = (b: unknown) => b === null || (typeof b === "object" && b !== null
  && ["x", "y", "w", "h"].every((k) => Number.isFinite((b as Record<string, number>)[k])));

export function marks(): Plugin {
  return {
    name: "parkread-marks",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__marks", (req, res) => {
        if (!LOCAL.has(req.socket.remoteAddress ?? "")) {
          res.statusCode = 403;
          res.end("the marking page answers this computer only");
          return;
        }
        const url = new URL(req.url ?? "/", "http://local");
        const photos: Record<string, { file: string }> =
          existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf-8")).photos : {};

        if (req.method === "GET" && url.pathname === "/list") {
          const frames = existsSync(FRAMES) ? JSON.parse(readFileSync(FRAMES, "utf-8")).frames : {};
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ photos: Object.keys(photos), frames }));
          return;
        }
        if (req.method === "GET" && url.pathname === "/photo") {
          // Only a name from the index: no path from the request reaches the disk.
          const entry = photos[url.searchParams.get("name") ?? ""];
          if (!entry || !existsSync(join(PHOTOS, entry.file))) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader("Content-Type", entry.file.endsWith(".png") ? "image/png" : "image/jpeg");
          res.end(readFileSync(join(PHOTOS, entry.file)));
          return;
        }
        if (req.method === "PUT" && url.pathname === "/frames") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const frames = JSON.parse(body) as Frames;
              const ok = Object.entries(frames).every(([name, box]) => name in photos && isBox(box));
              if (!ok) throw new Error("not a set of frames for this set's photographs");
              // Sorted by name, one photograph a line: a change shows as a small diff.
              const lines = Object.keys(frames).sort()
                .map((name) => `    ${JSON.stringify(name)}: ${JSON.stringify(frames[name])}`);
              writeFileSync(FRAMES, `{\n  "_": ${JSON.stringify(FRAMES_NOTE)},\n  "frames": {\n`
                                    + lines.join(",\n") + "\n  }\n}\n");
              res.end("saved");
            } catch (e) {
              res.statusCode = 400;
              res.end(String((e as Error).message));
            }
          });
          return;
        }
        res.statusCode = 404;
        res.end();
      });
    },
  };
}

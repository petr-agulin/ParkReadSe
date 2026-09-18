import { defineConfig } from "vite";

// The service worker is built SEPARATELY and placed beside `index.html`.
//
// Separately — because it shares its rules with the application (`lib/offline.ts`),
// and a common build would carry what they share off into a chunk of its own and make
// `sw.js` a module with an import. Module service workers are not available
// everywhere, and the miss would be a silent one: the application works, there is
// simply no offline. Here everything needed is packed inside, in one file (`iife`).
//
// Beside `index.html` rather than in `assets/` — because a worker's scope is limited
// to its own folder: from `assets/` it would govern only that. The name carries no
// hash: by it the browser recognises the worker and checks whether it has changed.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,            // the main build has already run, nothing to clear
    target: "es2020",
    lib: {
      entry: "src/sw.ts",
      formats: ["iife"],
      name: "parkreadServiceWorker",
      fileName: () => "sw.js",
    },
  },
});

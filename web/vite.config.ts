import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Сборка кладётся в web/dist, откуда её отдаёт тот же Flask-процесс, что и API
// (AGENTS.md, §8: один процесс на страницу и API).
// В режиме разработки Vite проксирует /api на бэкенд, поэтому адрес в коде
// фронтенда один и тот же и в дев-режиме, и в собранном виде.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": "http://127.0.0.1:5000" },
  },
});

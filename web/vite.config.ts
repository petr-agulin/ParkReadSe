import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Сборка кладётся в web/dist, откуда её отдаёт тот же Flask-процесс, что и API
// (AGENTS.md, §8: один процесс на страницу и API).
// В режиме разработки Vite проксирует /api на бэкенд, поэтому адрес в коде
// фронтенда один и тот же и в дев-режиме, и в собранном виде.
//
// HTTPS в разработке нужен ради камеры: `getUserMedia` живёт только в защищённом
// контексте, и по адресу вида `http://192.168.x.x` его нет вовсе. Сертификат
// самоподписанный — браузер один раз предупредит, и это нормально: он только
// для разработки и в сборку не входит.
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": "http://127.0.0.1:5000" },
  },
});

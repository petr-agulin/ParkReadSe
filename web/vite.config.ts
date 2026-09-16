import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Сборка кладётся в web/dist и работает БЕЗ сервера: своего бэкенда у приложения
// больше нет, разбор считается в браузере (шаг 6). Адрес хостинга заранее неизвестен,
// поэтому пути относительные (`base: "./"`) — страница живёт хоть в корне домена,
// хоть в папке `/ParkReadSe/`, и никакой сборки под конкретный адрес не требует.
//
// HTTPS в разработке нужен ради камеры: `getUserMedia` живёт только в защищённом
// контексте, и по адресу вида `http://192.168.x.x` его нет вовсе. Сертификат
// самоподписанный — браузер один раз предупредит, и это нормально: он только
// для разработки и в сборку не входит.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), basicSsl()],
  build: { outDir: "dist" },
});

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Служебный работник — только в собранной странице: в разработке его файл
// не собирается вовсе, а закэшированная оболочка мешала бы видеть правки.
//
// Регистрация относительная и считается от адреса СТРАНИЦЫ, а не от адреса этого
// файла: работник управляет своей папкой, и из `assets/` он управлял бы только ею.
//
// Неудача ничего не ломает: приложение работает и без офлайна, а обещать его
// там, где браузер работника не дал, было бы неправдой.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

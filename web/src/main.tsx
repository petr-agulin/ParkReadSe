import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker — only in the built page: in development its file is not built
// at all, and a cached shell would get in the way of seeing edits.
//
// The registration is relative and is counted from the address of the PAGE, not of
// this file: the worker governs its own folder, and from `assets/` it would govern
// only that.
//
// A failure breaks nothing: the application works without offline too, and promising
// offline where the browser refused the worker would be untrue.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

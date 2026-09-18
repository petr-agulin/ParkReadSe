import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// The build is placed in web/dist and works WITHOUT a server: the application has no
// backend of its own any more, and the reading is computed in the browser (step 6).
// The address of the host is not known in advance, so the paths are relative — the
// page lives at the root of a domain or in a folder `/ParkReadSe/` alike, and needs
// no build made for one particular address. The setting that does it is below; it is
// deliberately not repeated here, because a guard looks for it and a copy in a
// comment would answer for the real thing.
//
// HTTPS in development is there for the camera's sake: `getUserMedia` lives only in a
// secure context, and at an address of the form `http://192.168.x.x` it is not there
// at all. The certificate is self-signed — the browser will warn once, and that is
// normal: it is for development only and does not go into the build.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), basicSsl()],
  build: { outDir: "dist" },
});

// Node runs TypeScript itself, but looks modules up by the ESM rules: a relative
// import must carry an extension. The application writes its imports without one —
// that is the bundler's custom, and rewriting a hundred imports for one command is
// not on.
//
// Hence a hook here: the specifier `./engine` is tried as `./engine.ts`. Only the
// developer's tools need it (`npm run ask`); it is not part of the build and changes
// nothing in the application or the tests.

import { register } from "node:module";

register("./ts-resolve-hooks.mjs", import.meta.url);

// The index of the set's photographs: name and pixel count (decision 185).
//
// The photographs stay on the developer's disk; the index goes into the repository, so
// the tests and the measurement run on a clone that has none. After a photograph is
// added, renamed or removed:
//
//     npm run photos          # rewrite testset/photos.json from testset/photos/
//     npm run photos:check    # compare, write nothing
//
// For the developer only, and on Node only.

import { existsSync, writeFileSync } from "node:fs";

import { PHOTOS, PHOTO_INDEX, buildPhotoIndex, photoIndex } from "./testset";

const NOTE = "The set's photographs, by name, with their pixel count. The photographs "
  + "themselves stay on the developer's disk and are not published (decision 185): part "
  + "of them are Street View captures, and some show number plates. Rebuilt with "
  + "`npm run photos`.";

if (!existsSync(PHOTOS)) {
  console.log("no testset/photos/ here - nothing to compare the index with");
} else {
  const built = buildPhotoIndex();
  const text = JSON.stringify({ _: NOTE, photos: built }, null, 2) + "\n";
  if (process.argv.includes("--write")) {
    writeFileSync(PHOTO_INDEX, text);
    console.log(`written: ${Object.keys(built).length} photographs`);
  } else if (!existsSync(PHOTO_INDEX)
             || JSON.stringify(photoIndex()) !== JSON.stringify(built)) {
    console.log("the index is stale: run npm run photos");
    process.exit(1);
  } else {
    console.log("the index is fresh");
  }
}

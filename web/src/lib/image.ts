// Working with pixels: load a photograph, cut out the frame, hand over a file to
// send.
//
// The decisions about WHAT to cut are taken by crop.ts — here there is only the
// carrying out. It is checked by eye and by one manual scenario (the geotag), because
// a canvas does not live without a real browser.

import type { Box, Plan, Size } from "./crop";
import { plan as planCrop } from "./crop";

export type Loaded = { image: HTMLImageElement; size: Size; url: string };

/** A photograph into the page's memory. The `url` is freed by the caller: release(). */
export function load(file: File): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({ image, url, size: { w: image.naturalWidth, h: image.naturalHeight } });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This file could not be read as an image."));
    };
    image.src = url;
  });
}

export function release(loaded: Loaded | null) {
  if (loaded) URL.revokeObjectURL(loaded.url);
}

/**
 * Cuts out the frame and re-encodes it through a canvas.
 *
 * The re-encoding IS the stripping of EXIF: a canvas gives back pixels alone, and the
 * geotag, the time of the shot and the model of the phone are not among them. There
 * is no separate "remove the metadata" step, and none is needed.
 */
export async function cut(loaded: Loaded, box: Box, quality = 0.85): Promise<{
  file: File;
  url: string;
  plan: Plan;
  bytes: number;
}> {
  const p = planCrop(box, loaded.size);
  const canvas = document.createElement("canvas");
  canvas.width = p.out.w;
  canvas.height = p.out.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The browser could not prepare the image.");
  ctx.drawImage(
    loaded.image,
    p.crop.x, p.crop.y, p.crop.w, p.crop.h,
    0, 0, p.out.w, p.out.h,
  );

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", quality),
  );
  if (!blob) throw new Error("The browser could not prepare the image.");

  // The name is a neutral one: the name the phone gave the photograph sometimes
  // carries a date and a place in it, and is of no use. The backend does not keep it
  // in any case.
  const file = new File([blob], "sign.jpg", { type: "image/jpeg" });
  return { file, url: URL.createObjectURL(file), plan: p, bytes: blob.size };
}

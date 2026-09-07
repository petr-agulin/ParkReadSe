// Работа с пикселями: загрузить снимок, вырезать рамку, отдать файл для отправки.
//
// Решения о том, ЧТО вырезать, принимает crop.ts — здесь только исполнение.
// Проверяется это глазами и одним ручным сценарием (геометка), потому что canvas
// без настоящего браузера не живёт.

import type { Box, Plan, Size } from "./crop";
import { plan as planCrop } from "./crop";

export type Loaded = { image: HTMLImageElement; size: Size; url: string };

/** Снимок в память страницы. `url` освобождает вызывающий: release(). */
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
 * Вырезает рамку и перекодирует её через canvas.
 *
 * Перекодирование — это и есть снятие EXIF: canvas отдаёт только пиксели,
 * а геометка, время съёмки и модель телефона в них не входят. Отдельного шага
 * «удалить метаданные» нет и не нужно.
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

  // Имя нейтральное: в имени, которое дал снимку телефон, случается дата и адрес,
  // а пользы от него нет. Бэкенд его и так не хранит.
  const file = new File([blob], "sign.jpg", { type: "image/jpeg" });
  return { file, url: URL.createObjectURL(file), plan: p, bytes: blob.size };
}

// Размер снимка в пикселях, прочитанный из заголовка. Порт `parkread/photo.py`.
//
// Разбор ручной и намеренно: тянуть ради двух чисел библиотеку изображений значит
// добавить зависимость, которой больше нигде не нужно. Форматов два, оба фиксированы
// в первых байтах.
//
// `null` означает «формат не опознан» — и это НЕ повод для тревоги: неизвестный
// размер не должен наказывать разбор, иначе продукт станет придирчив к формату
// вместо того, чтобы судить о снимке.
//
// Зачем это вообще: площадь кадра — единственный способ поймать разбор, которому
// не хватило пикселей. Модель на снимке 82×179 однажды вернула четыре таблички
// связного шведского текста и ни одной пометки о помехах: помехи она называет там,
// где кадр хороший. Сколько пикселей у снимка — факт, а не мнение.

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8];

const be16 = (d: Uint8Array, at: number) => (d[at] << 8) | d[at + 1];
const be32 = (d: Uint8Array, at: number) =>
  ((d[at] << 24) >>> 0) + (d[at + 1] << 16) + (d[at + 2] << 8) + d[at + 3];

export function pixelSize(data: Uint8Array): [number, number] | null {
  if (data.length >= 24 && PNG_MAGIC.every((b, i) => data[i] === b)) {
    const w = be32(data, 16);
    const h = be32(data, 20);
    return w && h ? [w, h] : null;
  }
  if (!(data[0] === JPEG_MAGIC[0] && data[1] === JPEG_MAGIC[1])) return null;

  let i = 2;
  while (i < data.length - 9) {
    if (data[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = data[i + 1];
    // SOF-маркеры несут размер; C4/C8/CC — таблицы, не начало кадра.
    if (marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = be16(data, i + 5);
      const w = be16(data, i + 7);
      return w && h ? [w, h] : null;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + be16(data, i + 2);
  }
  return null;
}

/** Площадь снимка. `null` — формат не опознан, и наказывать за это нельзя. */
export function pixels(data: Uint8Array): number | null {
  const size = pixelSize(data);
  return size === null ? null : size[0] * size[1];
}

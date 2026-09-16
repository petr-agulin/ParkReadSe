// Сохранённые ответы модели и правила их устаревания. Порт `parkread/fixtures.py`
// (шаг 8).
//
// Каждый настоящий ответ модели на снимок набора сохраняется: из них собирается
// замер, и одинаковый вход даёт одинаковый выход. Главный вопрос этого модуля —
// **нужно ли переспрашивать снимок**: пропускать можно только ответ на ТОТ ЖЕ
// вопрос, иначе замер молча смешает две версии промпта в одном числе.
//
// Только для разработчика и только на Node. Фотографии пользователей сюда не
// попадают никогда: сохраняется ответ модели на снимок из набора автора.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

import { fingerprint } from "../src/lib/measure";

const fileOf = (root: string, image: string, stage: string) =>
  join(root, `${basename(image, extname(image))}.${stage}.json`);

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf-8"));

/** Нужно ли переспрашивать снимок: да — если ответа нет, если он размечен руками
 *  или если получен другим промптом. Без отпечатка — тоже: доказать, каким
 *  промптом получен ответ, нечем. */
export async function stale(root: string, image: string, stage: string,
                            prompt: string): Promise<boolean> {
  const p = fileOf(root, image, stage);
  if (!existsSync(p)) return true;
  const doc = readJson(p);
  if ((doc.origin ?? "model") !== "model") return true;
  return doc.prompt_fingerprint !== await fingerprint(prompt);
}

/** Отсев уже ответил, что снимок не знак стоянки. Тогда извлечения не было и не
 *  будет, и отсутствие его ответа — не повод переспрашивать снимок вечно.
 *
 *  Смотрится сохранённый ОТВЕТ, а не свежесть промпта: изменится промпт отсева —
 *  снимок и так окажется устаревшим по своей стадии. */
export function refused(root: string, image: string): boolean {
  const p = fileOf(root, image, "triage");
  if (!existsSync(p)) return false;
  const doc = readJson(p);
  if ((doc.origin ?? "model") !== "model") return false;
  return (doc.response ?? {}).category !== "parking_sign";
}

export function load(root: string, image: string, stage: string): unknown {
  const p = fileOf(root, image, stage);
  return existsSync(p) ? readJson(p).response : null;
}

/** Сохранить ответ модели. Формат тот же, что писал питон: замер и проверка
 *  свежести читают старые и новые ответы одинаково. */
export async function save(root: string, image: string, stage: string, response: unknown,
                           model: string, usage: unknown,
                           prompt: string | null = null): Promise<string> {
  mkdirSync(root, { recursive: true });
  const p = fileOf(root, image, stage);
  const doc = {
    image: basename(image),
    stage,
    model,
    prompt_fingerprint: prompt !== null ? await fingerprint(prompt) : null,
    saved_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    usage,
    response,
  };
  writeFileSync(p, JSON.stringify(doc, null, 2) + "\n", "utf-8");
  return p;
}

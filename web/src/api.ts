// Единственное место, знающее адреса бэкенда.
//
// Адрес относительный: в дев-режиме Vite проксирует /api на Flask, в собранном виде
// страницу и API отдаёт один и тот же процесс. Поэтому переменных окружения
// с адресом бэкенда здесь нет и не нужно.

import type { Analysis, GeneralRule } from "./types";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.message || body.error || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function analyze(photo: File, moment?: string): Promise<Analysis> {
  const form = new FormData();
  form.append("photo", photo);
  if (moment) form.append("moment", moment);

  const res = await fetch("/api/analyze", { method: "POST", body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function generalRules(): Promise<GeneralRule[]> {
  const res = await fetch("/api/general-rules");
  if (!res.ok) return [];
  const body = await res.json();
  return body.rules ?? [];
}

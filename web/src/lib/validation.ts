// Валидация ответа модели. Порт `parkread/validation.py`.
//
// Схема отбраковывает форму (`schema.ts`); здесь добавляется то, чего в JSON Schema
// выразить нельзя, и все правки происходят из реальных ошибок прогонов.
//
// Главное правило модуля: **самооценка модели ни на что не влияет**.
// `boundaries.certain` и `model_confidence` сохраняются как данные для замера
// и не используются как основание.
//
// Второе правило: **починка записывается**. Молчаливая правка, о которой никто
// не знает, — это второй источник ошибок; поэтому каждая попадает в список,
// а он идёт в сигнал уверенности `no_repairs_needed`.

import { validate } from "./schema";
import { SIGN_SCHEMA, TRIAGE_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";

export class InvalidModelResponse extends Error {}

export type Result = {
  data: SignDoc | null;
  schemaErrors: string[];
  repairs: string[];
  flags: string[];
};

export const ok = (r: Result): boolean =>
  r.data !== null && r.schemaErrors.length === 0;

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

/** Модель иногда оборачивает JSON в markdown-забор, иногда добавляет пролог.
 *  Снимаем то, что снимается; остальное — честная ошибка. */
export function parseJson(raw: string): Record<string, any> {
  const text = raw.trim();
  const fenced = FENCE.exec(text);
  const body = fenced ? fenced[1] : text;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* ниже — честная ошибка */
      }
    }
  }
  throw new InvalidModelResponse(
    `ответ не разбирается как JSON (длина ${raw.length} символов)`);
}

/** Правки, которые делаются молча, потому что однозначны. Каждая записывается. */
function repairDoc(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const panels = doc.panels;
  if (!Array.isArray(panels)) return done;

  // Правило 1 из PROBE_LOG: основной знак — не табличка. На снимке `010` модель
  // записала `P` и в `main_sign`, и первой панелью без текста.
  const kept = panels.filter((p: any) => {
    if (!p || typeof p !== "object") return true;
    const empty = !(p.lines ?? []).length;
    const pict = (p.parsed ?? {}).pictogram;
    if (empty && ["parking", "p", "main_sign"].includes(pict)) {
      done.push(`убрана панель ${p.index}: дубль основного знака`);
      return false;
    }
    return true;
  });
  if (kept.length !== panels.length) doc.panels = kept;
  const list: any[] = doc.panels;

  // Пустые строки — не текст. Модель отдаёт стрелочную панель то как [], то как [""],
  // и разница попадала в замер как ошибка чтения, хотя прочитано одно и то же: ничего.
  for (const p of list) {
    if (!p || typeof p !== "object" || !Array.isArray(p.lines)) continue;
    const lines = p.lines.filter((s: unknown) => typeof s === "string" && s.trim());
    if (lines.length !== p.lines.length) {
      done.push(`панель ${p.index}: убраны пустые строки`);
      p.lines = lines;
    }
  }

  // Индексы обязаны идти подряд сверху вниз: на них ссылается всё остальное.
  list.forEach((p: any, i: number) => {
    const want = i + 1;
    if (p && typeof p === "object" && p.index !== want) {
      done.push(`индекс панели ${p.index} -> ${want}`);
      p.index = want;
    }
  });

  if (doc.panel_count !== list.length) {
    done.push(`panel_count ${doc.panel_count} -> ${list.length}`);
    doc.panel_count = list.length;
  }
  return done;
}

/** Необязательное поле `parsed` со значением вне перечисления ВЫБРАСЫВАЕТСЯ,
 *  а не роняет весь разбор.
 *
 *  Найдено замером: на снимке `009` модель вписала `payment_method: mobile`, когда
 *  такого значения в схеме уже не было. Строгая проверка отбраковала бы верно
 *  прочитанный знак целиком — из-за необязательного поля. */
function dropUnknownEnums(doc: Record<string, any>): string[] {
  const done: string[] = [];
  const allowed = SIGN_SCHEMA.$defs.parsed.properties as Record<string, any>;
  for (const panel of doc.panels ?? []) {
    const parsed = panel?.parsed;
    if (!parsed || typeof parsed !== "object") continue;
    for (const key of Object.keys(parsed)) {
      const spec = allowed[key];
      if (!spec || !spec.enum) continue;
      if (!spec.enum.includes(parsed[key])) {
        // Запись повторяет питоновскую дословно, включая кавычки `repr`:
        // списки этих строк сверяются между реализациями.
        done.push(`панель ${panel.index}: убрано ${key}=`
                + `${pyRepr(parsed[key])} — нет в перечислении схемы`);
        delete parsed[key];
      }
    }
  }
  return done;
}

/** Значение так, как его записал бы питон: строка в одинарных кавычках. */
function pyRepr(value: unknown): string {
  if (typeof value === "string") return `'${value.replace(/'/g, "\\'")}'`;
  return String(value);
}

/** Сигналы для формулы уверенности. Здесь только наблюдения — решение по ним
 *  принимается в `completeness`. */
function flagsOf(doc: Record<string, any>, panelsSeen: number | null): string[] {
  const out: string[] = [];
  const panels: Panel[] = doc.panels ?? [];
  const plates = panels.filter((p) => p.kind === "sign_plate");

  if (doc.main_sign.type === "unknown") out.push("main_sign_unknown");
  if (String(doc.main_sign.type).startsWith("wayfinding")) {
    out.push("wayfinding_sign_permits_nothing");
  }
  if (!plates.length) out.push("no_sign_plates");

  // Правило 3 из PROBE_LOG: границу нельзя проверять мнением модели — сравниваем
  // с независимым счётом стадии отсева, по табличкам С ПРАВИЛАМИ.
  if (panelsSeen !== null && panelsSeen !== plates.length) {
    out.push(`panel_count_disagreement:${panelsSeen}!=${plates.length}`);
  }
  if (!(doc.boundaries?.certain ?? true)) out.push("model_reports_uncertain_boundary");

  for (const p of panels) {
    const legibility: any = p.legibility ?? {};
    if (!(legibility.readable ?? true)) out.push(`panel_${p.index}_unreadable`);
    const obs = legibility.obstructions ?? [];
    if (obs.length) out.push(`panel_${p.index}_obstructed:${obs.join(",")}`);
    if (p.kind === "sign_plate" && !(p.lines ?? []).length
        && !Object.keys(p.parsed ?? {}).length) {
      out.push(`panel_${p.index}_empty`);
    }
  }
  if (!(doc.main_sign.legibility?.readable ?? true)) out.push("main_sign_unreadable");
  return out;
}

const errorsOf = (doc: unknown, schema: typeof SIGN_SCHEMA): string[] =>
  validate(doc, schema).slice().sort();

/** Отсев чинится так же, как извлечение: мелочь оформления не должна уносить
 *  с собой годный ответ. Строгим остаётся то, у чего есть последствие:
 *  `category` вне перечисления по-прежнему отбраковывает ответ. */
export function triage(doc: Record<string, any>): Result {
  const repairs: string[] = [];
  const allowed = TRIAGE_SCHEMA.properties as Record<string, any>;
  for (const key of Object.keys(doc)) {
    if (!(key in allowed)) {
      repairs.push(`убрано лишнее поле '${key}'`);
      delete doc[key];
    }
  }

  const seen = doc.what_i_see;
  const limit = allowed.what_i_see?.maxLength ?? 200;
  if (typeof seen === "string" && seen.length > limit) {
    repairs.push(`what_i_see укорочено до ${limit} символов`);
    doc.what_i_see = seen.slice(0, limit);
  }

  // Число панелей строкой — форма записи, а не другой ответ.
  const n = doc.panels_below_main_sign;
  if (typeof n === "string" && /^\d+$/.test(n.trim())) {
    repairs.push(`panels_below_main_sign '${n}' -> ${Number(n)}`);
    doc.panels_below_main_sign = Number(n);
  }

  const errs = errorsOf(doc, TRIAGE_SCHEMA);
  return { data: errs.length ? null : (doc as SignDoc), schemaErrors: errs,
           repairs, flags: [] };
}

/** `panelsSeen` — число панелей, названное стадией отсева: независимый взгляд
 *  на ту же фотографию, и расхождение означает потерю границы. */
export function sign(doc: Record<string, any>,
                     panelsSeen: number | null = null): Result {
  const repairs = [...repairDoc(doc), ...dropUnknownEnums(doc)];
  const errs = errorsOf(doc, SIGN_SCHEMA);
  const result: Result = {
    data: errs.length ? null : (doc as SignDoc),
    schemaErrors: errs,
    repairs,
    flags: [],
  };
  if (ok(result)) result.flags = flagsOf(doc, panelsSeen);
  return result;
}

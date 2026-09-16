// `evaluateParkingRules` — чистая функция без обращений к модели.
// Порт `parkread/engine.py`, дословный: улучшения не применяются по дороге,
// а выносятся разработчику (решение 123).
//
// Здесь вся арифметика уходит из модели в код. Реализуется тот самый порядок
// сборки из семи шагов, что записан в `PROJECT_BRIEF.md`:
//
// 1. базовый режим по основному знаку;
// 2. разбиение стопки на таблички (уже сделано извлечением);
// 3. разделение на участки по стрелкам;
// 4. условия допуска — в подпись к режиму, а не в проверку;
// 5. условия места — в постоянные пометки;
// 6. раскладка по времени: окна поверх базы, дополнение — база либо то, что назвал
//    токен сдвига;
// 7. наложение запретов: запрет в своём окне перекрывает разрешение.
//
// Три вещи, которые легко сделать неправильно и которые здесь сделаны намеренно:
//
// - вне окна возвращается БАЗОВЫЙ режим, а не «ничего» и не условия из окна;
// - условие допуска НИКОГДА не проверяется: продукт не знает, кто стоит у знака;
// - названный день недели — ЛИТЕРАЛ: календарь праздников к нему не применяется.

import { Calendar, RED, UNKNOWN, WEEKDAY } from "./calendar";
import { add as clockAdd } from "./clock";
import { addDays, addMinutes, compare, minutes, weekday,
         type Civil, type Naive } from "./civil";
import { ELIGIBILITY_KEYS, VEHICLE_KEYS } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

export const HORIZON_DAYS = 8;        // насколько вперёд строится шкала периодов
const DAY_MINUTES = 24 * 60;

// состояния периода
export const ALLOWED = "allowed";
export const PROHIBITED = "prohibited";
export const UNCERTAIN = "uncertain";
// Знак ничего не говорит об этом времени. Не «можно» и не «нельзя»: запрещающий
// знак с табличкой времени запрещает ТОЛЬКО в своё окно, а вне его не разрешает
// ничего. Смешивать с UNCERTAIN нельзя: там не смогли прочесть, здесь прочли
// и знаем, что сказать нечего.
export const NOT_STATED = "not_stated";

// Заметка отрезка: плата названа только «в остальное время», а какое время
// «остальное» — написано на табличке, обращённой к другому виду транспорта.
export const FEE_PERIOD_ELSEWHERE = "fee_period_belongs_to_another_audience";

// участки
export const HERE = "here";
export const ARROW_EXTENT: Record<string, string> = {
  left: "left", right: "right",
  up: "ahead", down: "behind",
  both_horizontal: "both_sides", both_vertical: "both_directions",
};

const BASE_PROHIBITED = new Set(["prohibition_parking", "prohibition_stopping"]);
const WAYFINDING = new Set(["wayfinding_parking_house", "wayfinding_park_and_ride"]);

export type Period = {
  start: Naive;
  end: Naive;
  state: string;
  conditions: string[];               // ключи справочника
  maxDurationMinutes: number | null;  // null -> действует умолчание в 24 часа
  note: string | null;
};

export type Regime = {
  extent: string;
  eligibility: string[];              // кому отведены места
  placeNotes: string[];               // где и сколько
  periods: Period[];
  durationExpiresAt: Naive | null;
  durationSource: string | null;      // "plate" | "24h_default"
  // Кому адресовано ЭТО окно. Не то же, что `eligibility`: там сказано, кому
  // отведены места, а здесь — для кого посчитан вот этот отсчёт времени.
  audience: string | null;
  audienceExcluded: string[];
};

export type Evaluation = {
  regimes: Regime[];
  uncertainties: string[];
  permitsParking: boolean;            // false у указателей направления
  note: string | null;
};

function sameAs(a: Period, b: Period): boolean {
  return a.state === b.state
    && a.conditions.length === b.conditions.length
    && a.conditions.every((c, i) => c === b.conditions[i])
    && a.maxDurationMinutes === b.maxDurationMinutes
    && a.note === b.note;
}

const parsedOf = (p: Panel): Parsed => p.parsed ?? {};
const windowsOf = (parsed: Parsed): TimeWindow[] => parsed.time_windows ?? [];
const dateOf = (t: Naive): Civil => ({ y: t.y, m: t.m, d: t.d });
const midnight = (d: Civil): Naive => ({ ...d, hh: 0, mm: 0 });
const minuteOfDay = (t: Naive): number => t.hh * 60 + t.mm;
const sortedUnique = (xs: string[]): string[] => [...new Set(xs)].sort();

// --- шаг 3: разделение на участки по стрелкам ------------------------------

/** Стрелка ЗАКРЫВАЕТ указания над собой и привязывает их к участку.
 *
 *  Несколько стрелок — несколько режимов на одном знаке (снимок `010`).
 *  Отсутствие стрелки означает, что место здесь же, у знака (снимок `015`). */
export function splitByArrows(panels: Panel[]): [string, Panel[]][] {
  // Делят участок только таблички С ПРАВИЛАМИ: табло оператора участком не является.
  const plates = panels.filter((p) => p.kind === "sign_plate");

  const groups: [string, Panel[]][] = [];
  let current: Panel[] = [];
  for (const p of plates) {
    const arrow = parsedOf(p).arrow;
    if (arrow) {
      groups.push([ARROW_EXTENT[arrow] ?? HERE, current]);
      current = [];
    } else {
      current.push(p);
    }
  }
  // Таблички НИЖЕ последней стрелки участка не заводят (снимок `033`): стрелка
  // закрывает указания над собой, а то, что под ней, относится к знаку целиком
  // и достаётся каждому участку.
  let result: [string, Panel[]][];
  if (groups.length === 0) {
    result = [[HERE, current]];
  } else if (current.length) {
    result = groups.map(([ext, items]) => [ext, [...items, ...current]]);
  } else {
    result = groups;
  }
  const kept = result.filter(([, items]) => items.length > 0);
  return kept.length ? kept : [[HERE, []]];
}

// --- шаг 6: применимость указания в конкретный момент ----------------------

const WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday",
                       "friday", "saturday", "sunday"];

/** `null` означает «неизвестно»: дата вне календаря, а окно зависит от класса дня. */
export function windowApplies(win: TimeWindow, moment: Naive, cal: Calendar): boolean | null {
  const dc = win.day_class ?? "unspecified";
  const d = dateOf(moment);

  if (dc === "named_weekday") {
    // Литерал. Календарь праздников к нему НЕ применяется: запрет `Tisdag 18-24`
    // действует и в праздничный вторник.
    if (WEEKDAY_NAMES[weekday(d)] !== win.named_weekday) return false;
  } else {
    const day = cal.dayClass(d);
    if (day === UNKNOWN && dc !== "all_days") return null;
    // «Дни не указаны» означает будни по умолчанию, а не «каждый день».
    if (dc === "unspecified" && day !== WEEKDAY) return false;
    if ((dc === WEEKDAY || dc === "eve" || dc === RED) && day !== dc) return false;
  }

  // Чётность недели и диапазон дат сужают окно ещё раз.
  if (!weekParityMatches(win, d)) return false;
  if (!datesMatch(win, d)) return false;

  return inClockWindow(win, moment);
}

/** `jämna veckor` — чётные недели ISO, `udda veckor` — нечётные. Поля нет —
 *  окно действует каждую неделю. */
function weekParityMatches(win: TimeWindow, d: Civil): boolean {
  const parity = win.week_parity;
  if (!parity) return true;
  const week = isoWeek(d);
  return parity === "even" ? week % 2 === 0 : week % 2 === 1;
}

/** Номер недели по ISO — тот же, что у питоновского `date.isocalendar()[1]`. */
export function isoWeek(d: Civil): number {
  // Четверг той же недели решает, какому году неделя принадлежит.
  const thursday = addDays(d, 3 - ((weekday(d) + 7) % 7));
  const jan1 = { y: thursday.y, m: 1, d: 1 };
  const days = (a: Civil, b: Civil) => Math.round(compare(a, b));
  return Math.floor(days(thursday, jan1) / 7) + 1;
}

function inClockWindow(win: TimeWindow, moment: Naive): boolean {
  const start = clockMinute(win.from);
  const end = clockMinute(win.to);
  const t = minuteOfDay(moment);
  // `24:00` — конец суток, а не время 00:00 того же дня.
  if (end === 0) return t >= start;
  if (start <= end) return start <= t && t < end;
  return t >= start || t < end;         // окно через полночь
}

/** Время с таблички в минутах от полуночи. Конец суток — ноль.
 *
 *  `23:59` считается тем же концом суток: на знаках так не пишут, а модель
 *  сплошь и рядом записывает `00-24` как `00:00-23:59`, и последняя минута дня
 *  выпадала из окна (снимок `049`). */
export function clockMinute(s: string): number {
  const [h, m] = s.split(":");
  if (h === "24" || (h === "23" && m === "59")) return 0;
  return Number(h) * 60 + Number(m);
}

/** `MM-DD` в пару чисел. Года здесь нет намеренно: табличка вешается один раз
 *  и действует каждый год. */
function md(value: string): [number, number] {
  const [month, day] = value.split("-");
  return [Number(month), Number(day)];
}

function inRange(d: Civil, rng: { from: string; to: string }): boolean {
  const [sm, sd] = md(rng.from);
  const [em, ed] = md(rng.to);
  const start = sm * 100 + sd;
  const end = em * 100 + ed;
  const here = d.m * 100 + d.d;
  if (start <= end) return start <= here && here <= end;
  return here >= start || here <= end;
}

/** Даты, ограничивающие окно: «только в эти промежутки» или «всегда, кроме них». */
function datesMatch(win: TimeWindow, d: Civil): boolean {
  const dates = win.dates;
  if (!dates) return true;
  const hit = (dates.ranges ?? []).some((r) => inRange(d, r));
  return dates.mode === "only" ? hit : !hit;
}

/** Докуда построена шкала. Это НЕ граница правила: знак в этот момент ничего
 *  не меняет, просто дальше мы не смотрим. */
export function horizonEnd(now: Naive): Naive {
  return midnight(addDays(dateOf(now), HORIZON_DAYS));
}

/** Моменты, в которые что-то может измениться: полуночи и края всех окон. */
function boundaries(now: Naive, instructions: Parsed[]): Naive[] {
  const marks = new Set<number>([minutes(now)]);
  const day0 = dateOf(now);
  for (let i = 0; i <= HORIZON_DAYS; i += 1) {
    const d = addDays(day0, i);
    marks.add(minutes(midnight(d)));
    for (const parsed of instructions) {
      for (const w of windowsOf(parsed)) {
        for (const key of [w.from, w.to]) {
          marks.add(minutes(midnight(d)) + clockMinute(key));
        }
      }
    }
  }
  const from = minutes(now);
  const to = minutes(horizonEnd(now));
  return [...marks].filter((t) => t >= from && t <= to)
                   .sort((a, b) => a - b)
                   .map((t) => addMinutes({ y: 1970, m: 1, d: 1, hh: 0, mm: 0 }, t));
}

// --- сборка режима --------------------------------------------------------

function durationMinutes(parsed: Parsed): number | null {
  const d = parsed.duration_limit;
  if (!d) return null;
  return Math.trunc(d.amount * (d.unit === "hours" ? 60 : 1));
}

/** Несёт ли табличка собственное правило — плату, предел, разрешение, запрет
 *  или свои часы. Пиктограмма рядом с таким правилом адресует ЕГО, а не знак. */
function addressesACondition(parsed: Parsed): boolean {
  return Boolean(conditionsOf(parsed).length || parsed.duration_limit
                 || parsed.prohibition || parsed.time_windows);
}

/** Ключ справочника, если табличка адресует своё условие виду транспорта.
 *
 *  Правило разработчика (2026-09-10): «только для автобусов» знак говорит лишь
 *  тогда, когда пиктограмма на табличке ОДНА. Стоит рядом что-нибудь ещё — часы,
 *  плата, тариф, — и табличка мест не отводит, а ставит условие своему виду
 *  транспорта. Пиктограмма БЕЗ условия (снимок `038`) сюда не попадает. */
function addressedClass(parsed: Parsed): string | null {
  const key = parsed.vehicle_class ? VEHICLE_KEYS[parsed.vehicle_class] : undefined;
  return key && addressesACondition(parsed) ? key : null;
}

/** Один знак — несколько окон, если условие адресовано виду транспорта
 *  (снимок из Frihamnen, решение 120). */
function splitByVehicle(panels: Panel[]): [string | null, string[], Panel[]][] {
  const addressed = panels.map((p) => [addressedClass(parsedOf(p)), p] as const);
  const keys: string[] = [];
  for (const [key] of addressed) if (key && !keys.includes(key)) keys.push(key);
  if (!keys.length) return [[null, [], panels]];

  const common = addressed.filter(([key]) => !key).map(([, p]) => p);
  const out: [string | null, string[], Panel[]][] = [[null, keys, common]];
  for (const key of keys) {
    out.push([key, [], addressed.filter(([k]) => !k || k === key).map(([, p]) => p)]);
  }
  return out;
}

/** Ключи справочника, которые указание добавляет к периоду. */
function conditionsOf(parsed: Parsed): string[] {
  const out: string[] = [];
  if (parsed.fee) out.push("avgift");
  if (parsed.permit_required) out.push("sarskilt-p-tillstand");
  if (parsed.payment_method === "parking_disc") out.push("p-skiva");
  else if (parsed.payment_method === "ticket") out.push("p-biljett");
  return out;
}

function buildRegime(extent: string, panels: Panel[], baseState: string,
                     now: Naive, cal: Calendar, uncertainties: string[],
                     audience: string | null, audienceExcluded: string[],
                     others: Panel[]): Regime {
  const plates = panels.filter((p) => p.kind === "sign_plate");

  // шаг 4: условие допуска — подпись к режиму
  const eligibility: string[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    // Пиктограмма, адресующая условие, круг стоящих не сужает (решение 120).
    const vehicle = addressedClass(parsed)
      ? undefined
      : (parsed.vehicle_class ? VEHICLE_KEYS[parsed.vehicle_class] : undefined);
    const who = parsed.eligibility ? ELIGIBILITY_KEYS[parsed.eligibility] : undefined;
    for (const key of [vehicle, who]) {
      if (key && !eligibility.includes(key)) eligibility.push(key);
    }
    // «Арендованное место, где вдобавок нужно разрешение» — два условия сразу.
    if (parsed.permit_required && !eligibility.includes("sarskilt-p-tillstand")) {
      eligibility.push("sarskilt-p-tillstand");
    }
  }

  // шаг 5: условия места — постоянные пометки
  const placeNotes: string[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    if (parsed.placement === "marked_bay_only") placeNotes.push("utanfor-markerad-plats");
    if (parsed.placement === "as_shown") placeNotes.push("placement-as-shown");
    if (parsed.place_count) placeNotes.push("place-count");
    if (parsed.stretch_metres) placeNotes.push("stretch-metres");
  }

  // разделение указаний по роли во времени
  const windowed: Parsed[] = [];
  const always: Parsed[] = [];
  const shifted: Parsed[] = [];
  const prohibitions: Parsed[] = [];
  for (const p of plates) {
    const parsed = parsedOf(p);
    if (parsed.prohibition && parsed.time_windows) {
      prohibitions.push(parsed);
      continue;
    }
    if (parsed.scope_shift === "remaining_time") shifted.push(parsed);
    else if (parsed.time_windows) windowed.push(parsed);
    else if (conditionsOf(parsed).length || parsed.duration_limit) always.push(parsed);
  }

  // Табличка со временем под ЗАПРЕЩАЮЩИМ знаком не добавляет условий к вечному
  // запрету, а ОЧЕРЧИВАЕТ его (решение 113). Под разрешающим знаком наоборот.
  const scoping = [...windowed, ...prohibitions].filter((p) => !p.permits_parking);
  const scoped = baseState === PROHIBITED && scoping.some((p) => p.time_windows);

  // Часы, занятые табличками ЧУЖОГО адресата: условий они этому окну не дают,
  // но «Övrig tid» через них не переступает (снимок `049`, решение 121).
  const occupied = others.map(parsedOf).filter((q) => q.time_windows);

  const periods = timeline(now, cal, baseState, windowed, always, shifted,
                           prohibitions, uncertainties, scoped, occupied);

  // Длительность: табличка перекрывает умолчание в 24 часа — но только там,
  // где она действует.
  let expires: Naive | null = null;
  let source: string | null = null;
  const nowM = minutes(now);
  const current = periods.find((p) => minutes(p.start) <= nowM && nowM < minutes(p.end));
  // Знак, который сейчас молчит, стоянки не даёт — значит, и ограничивать нечего.
  const silent = current !== undefined && current.state === NOT_STATED;
  const limit = silent ? null : (current ? current.maxDurationMinutes : null);
  // Настоящее время, а не деления циферблата (решение 116).
  const edge = limit ? clockAdd(now, limit) : null;

  // Предел кусается не всегда — и в ТЕКУЩЕМ окне тоже: граница берётся, только
  // когда она попадает ВНУТРЬ окна (решение 118, снимок `005`). Конец окна
  // берётся не по одному отрезку: полночь режет окно на несколько, а предел
  // у них один и тот же.
  let windowEnd: Naive | null = null;
  if (limit && current) {
    windowEnd = current.end;
    for (const p of periods) {
      if (minutes(p.start) === minutes(windowEnd) && p.state === current.state
          && p.maxDurationMinutes === limit) {
        windowEnd = p.end;
      }
    }
  }

  if (limit && edge && windowEnd && minutes(edge) < minutes(windowEnd)) {
    expires = edge;
    source = "plate";
  } else if (baseState === ALLOWED) {
    expires = twentyFourHourExpiry(now, cal);
    source = expires ? "24h_default" : null;
    if (expires === null) uncertainties.push("24h_expiry_outside_calendar");
  }

  // Ограничение, которое ВСТУПИТ позже, тоже обрывает стоянку (снимок `005`).
  // Счёт идёт от НАЧАЛА окна, а не от постановки машины.
  for (const later of periods) {
    if (minutes(later.start) <= nowM || later.state !== ALLOWED) continue;
    if (expires !== null && minutes(later.start) >= minutes(expires)) break;
    const lim = later.maxDurationMinutes;
    if (!lim) continue;
    const at = clockAdd(later.start, lim);
    if (minutes(at) < minutes(later.end)
        && (expires === null || minutes(at) < minutes(expires))) {
      expires = at;
      source = "plate";
      break;
    }
  }

  // Запрет обрывает стоянку раньше предела.
  const stop = periods.find((p) => minutes(p.start) > nowM && p.state === PROHIBITED);
  if (stop && !silent && (expires === null || minutes(stop.start) < minutes(expires))) {
    expires = stop.start;
    source = "prohibition";
  }

  return {
    extent,
    eligibility,
    placeNotes: sortedUnique(placeNotes),
    periods,
    durationExpiresAt: expires,
    durationSource: source,
    audience,
    audienceExcluded: [...audienceExcluded],
  };
}

function timeline(now: Naive, cal: Calendar, baseState: string,
                  windowed: Parsed[], always: Parsed[], shifted: Parsed[],
                  prohibitions: Parsed[], uncertainties: string[],
                  scoped: boolean, occupied: Parsed[]): Period[] {
  const baseConditions = sortedUnique(always.flatMap(conditionsOf));
  const marks = boundaries(now, [...windowed, ...shifted, ...prohibitions,
                                 ...always, ...occupied]);
  const raw: Period[] = [];

  const baseDuration = always.map(durationMinutes).find((m) => m) ?? null;

  for (let i = 0; i + 1 < marks.length; i += 1) {
    const t0 = marks[i];
    const t1 = marks[i + 1];
    let state = baseState;
    let conds = [...baseConditions];
    let unknown = false;
    let duration = baseDuration;
    // Запрет очерчен окном: вне окна знак молчит, пока что-нибудь не скажет
    // обратного — попадание в окно ниже или табличка «в остальное время».
    if (scoped) state = NOT_STATED;

    // шаг 6: окна поверх базы
    let inside = false;
    for (const parsed of windowed) {
      const results = windowsOf(parsed).map((w) => windowApplies(w, t0, cal));
      if (results.some((r) => r === null)) unknown = true;
      if (results.some((r) => r === true)) {
        inside = true;
        conds = conds.concat(conditionsOf(parsed));
        // Ограничение длительности с окном действует ТОЛЬКО в окне.
        duration = durationMinutes(parsed) ?? duration;
        // Под запрещающим знаком попадание в окно и есть запрет.
        if (scoped && !parsed.permits_parking) state = PROHIBITED;
      }
    }

    // Время, занятое табличкой чужого адресата, «остальным» не является.
    let note: string | null = null;
    if (!inside) {
      for (const parsed of occupied) {
        if (windowsOf(parsed).some((w) => windowApplies(w, t0, cal) === true)) {
          inside = true;
          // Плата названа только «в остальное время» — значит, про этот час знак
          // прочим ничего не сказал. Это не «бесплатно».
          if (shifted.length) note = FEE_PERIOD_ELSEWHERE;
          break;
        }
      }
    }

    // дополнение: база либо то, что назвал токен сдвига
    if (!inside) {
      for (const parsed of shifted) {
        conds = conds.concat(conditionsOf(parsed));
        // Табличка может сама восстанавливать разрешение (снимок `019`).
        if (parsed.permits_parking) state = ALLOWED;
        duration = durationMinutes(parsed) ?? duration;
      }
    } else {
      for (const parsed of windowed) {
        if (parsed.permits_parking
            && windowsOf(parsed).some((w) => windowApplies(w, t0, cal) === true)) {
          state = ALLOWED;
        }
      }
    }

    // шаг 7: запрет перекрывает разрешение
    for (const parsed of prohibitions) {
      const results = windowsOf(parsed).map((w) => windowApplies(w, t0, cal));
      if (results.some((r) => r === null)) unknown = true;
      if (results.some((r) => r === true)) {
        state = PROHIBITED;
        conds = [];
      }
    }

    if (unknown && state !== PROHIBITED) {
      state = UNCERTAIN;
      if (!uncertainties.includes("day_class_unknown")) {
        uncertainties.push("day_class_unknown");
      }
    }

    raw.push({ start: t0, end: t1, state, conditions: sortedUnique(conds),
               maxDurationMinutes: duration, note });
  }

  // склеить соседние одинаковые
  const merged: Period[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && sameAs(last, p) && minutes(last.end) === minutes(p.start)) {
      last.end = p.end;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

// --- правило 24 часов ------------------------------------------------------

/** ГАРАНТИРОВАННАЯ НЕПРЕРЫВНОСТЬ: водителю положены полные 24 часа подряд,
 *  и если выходные их обрывают, счётчик обнуляется и начинается заново
 *  с ближайшего рабочего дня (решение 82).
 *
 *  - Понедельник 13:00 → вторник 13:00.
 *  - Пятница 13:00 → вторник 00:00: до субботы остаётся 11 часов, а не 24.
 *  - Суббота и воскресенье в любой час → вторник 00:00. */
export function twentyFourHourExpiry(start: Naive, cal: Calendar): Naive | null {
  const startDate = dateOf(start);
  if (!cal.covers(startDate)) return null;

  if (!cal.isWorkingDay(startDate)) {
    const next = cal.nextWorkingDay(startDate);
    return next === null ? null : clockAdd(midnight(next), DAY_MINUTES);
  }

  // Сутки — настоящие: в ночь перевода их конец на часах сдвигается на час.
  const end = clockAdd(start, DAY_MINUTES);
  const endDate = dateOf(end);
  let day = startDate;
  while (compare(day, endDate) <= 0) {
    if (!cal.covers(day)) return null;
    // Нерабочий день ВНУТРИ суток обрывает их.
    if (!cal.isWorkingDay(day) && minutes(midnight(day)) < minutes(end)) {
      const next = cal.nextWorkingDay(day);
      return next === null ? null : clockAdd(midnight(next), DAY_MINUTES);
    }
    day = addDays(day, 1);
  }
  return end;
}

// --- вход ------------------------------------------------------------------

export function evaluateParkingRules(sign: SignDoc, moment: Naive,
                                     cal: Calendar): Evaluation {
  const main = sign.main_sign;
  const uncertainties: string[] = [];

  if (WAYFINDING.has(main.type)) {
    return { regimes: [], uncertainties: [], permitsParking: false,
             note: "wayfinding_sign_permits_nothing" };
  }

  const baseState = BASE_PROHIBITED.has(main.type) ? PROHIBITED : ALLOWED;
  if (main.type === "unknown") uncertainties.push("main_sign_unknown");
  if (!cal.covers(dateOf(moment))) uncertainties.push("date_outside_calendar");

  // Делят знак две вещи и делят независимо: стрелка — участок, пиктограмма
  // с условием — адресата.
  const regimes: Regime[] = [];
  for (const [extent, panels] of splitByArrows(sign.panels ?? [])) {
    for (const [audience, excluded, group] of splitByVehicle(panels)) {
      const others = panels.filter((p) => !group.includes(p));
      regimes.push(buildRegime(extent, group, baseState, moment, cal, uncertainties,
                               audience, excluded, others));
    }
  }
  // Режимы строятся по одним и тем же табличкам, поэтому оговорки повторяются.
  return { regimes, uncertainties: [...new Set(uncertainties)],
           permitsParking: true, note: null };
}

// Перевод часов. Порт `parkread/clock_se.py`, без часовых баз.
//
// Правило ЕС одно на весь союз: вперёд — в последнее воскресенье марта, назад —
// в последнее воскресенье октября, оба перехода в 01:00 UTC. Швеция зимой `+1`,
// летом `+2`, поэтому на шведских часах числа всегда одни и те же: весной 02:00
// становится 03:00, осенью 03:00 становится 02:00. Меняется только дата.
//
// Всё остальное в продукте считается по циферблату, и правильно: `9-12` — это
// девять на часах и в марте, и в октябре. Но ДЛИТЕЛЬНОСТЬ циферблатом не меряется:
// в ночь перевода сутки длятся 23 или 25 часов (решение 116).
//
// Два случая названы явно: весной час 02:00-03:00 не существует, осенью идёт
// дважды. Несуществующее время сдвигается вперёд, у повторяющегося берётся
// ПЕРВОЕ вхождение — то, которое человек и видит на часах.

import { addDays, addMinutes, minutes, weekday, type Civil, type Naive } from "./civil";

export const WINTER = 1;   // CET,  UTC+1
export const SUMMER = 2;   // CEST, UTC+2

const HOUR = 60;

/** Последнее воскресенье месяца — так правило ЕС и записано. */
function lastSunday(year: number, month: number): Civil {
  const first: Civil = month === 12
    ? { y: year + 1, m: 1, d: 1 }
    : { y: year, m: month + 1, d: 1 };
  const last = addDays(first, -1);
  return addDays(last, -((weekday(last) + 1) % 7));
}

/** Момент на шведских часах, в который стрелки прыгают вперёд: 02:00 в 03:00. */
export function springForward(year: number): Naive {
  return { ...lastSunday(year, 3), hh: 2, mm: 0 };
}

/** Момент, в который стрелки идут назад: 03:00 в 02:00. Записан ДО перевода. */
export function autumnBack(year: number): Naive {
  return { ...lastSunday(year, 10), hh: 3, mm: 0 };
}

/** Час, которого не было: весной 02:00-03:00 на часах не существует. */
export function normalise(local: Naive): Naive {
  const jump = minutes(springForward(local.y));
  const t = minutes(local);
  return t >= jump && t < jump + HOUR ? addMinutes(local, HOUR) : local;
}

/** Сколько часов местное время впереди UTC: `+1` зимой, `+2` летом. */
export function offset(local: Naive): number {
  const t = minutes(normalise(local));
  const spring = minutes(springForward(local.y));
  const autumn = minutes(autumnBack(local.y));
  return t >= spring && t < autumn ? SUMMER : WINTER;
}

export function toUtc(local: Naive): Naive {
  return addMinutes(normalise(local), -offset(local) * HOUR);
}

export function fromUtc(moment: Naive): Naive {
  // В UTC переходы стоят на 01:00 обоих воскресений — там разрывов нет,
  // и смещение определяется однозначно.
  const t = minutes(moment);
  const spring = minutes({ ...lastSunday(moment.y, 3), hh: 1, mm: 0 });
  const autumn = minutes({ ...lastSunday(moment.y, 10), hh: 1, mm: 0 });
  return addMinutes(moment, (t >= spring && t < autumn ? SUMMER : WINTER) * HOUR);
}

/** Прибавить НАСТОЯЩЕЕ время: `2 tim` — это два прожитых часа, а не два деления
 *  циферблата. В ночь перевода это разные вещи. */
export function add(local: Naive, mins: number): Naive {
  return fromUtc(addMinutes(toUtc(local), mins));
}

/** Сколько минут пройдёт на самом деле. */
export function realMinutes(start: Naive, end: Naive): number {
  return minutes(toUtc(end)) - minutes(toUtc(start));
}

/** Пересекает ли отрезок перевод часов, и в какую сторону. */
export function switchBetween(start: Naive, end: Naive): "forward" | "back" | null {
  const from = minutes(start);
  const to = minutes(end);
  for (let year = start.y; year <= end.y; year += 1) {
    const spring = minutes(springForward(year));
    if (from <= spring && spring < to) return "forward";
    const autumn = minutes(autumnBack(year));
    if (from <= autumn && autumn < to) return "back";
  }
  return null;
}

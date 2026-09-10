// Календарная арифметика без `Date`.
//
// `Date` — про мгновение на оси времени, а знак говорит о календаре: «среда»,
// «31 октября», «08:00». Стоит завести `Date`, и в расчёт входит часовой пояс
// машины, летнее время и месяцы, считающиеся с нуля. Ошибки от этого тихие
// и всплывают в отдельные даты — ровно то, чего порт боится больше всего
// (`PLAN_NEXT.md`, риск 5).
//
// Поэтому здесь целые числа: день — номер суток от 1970-01-01, момент — минута
// от той же полуночи. Ни поясов, ни перевода часов: перевод живёт в `clock.ts`
// и применяется явно, там, где считается ДЛИТЕЛЬНОСТЬ.
//
// Алгоритмы `days`/`civil` — общеизвестная пара Говарда Хиннанта: целочисленные,
// без таблиц, верные для любого года григорианского календаря.

export type Civil = { y: number; m: number; d: number };
export type Naive = { y: number; m: number; d: number; hh: number; mm: number };

/** Номер суток от 1970-01-01. */
export function days({ y, m, d }: Civil): number {
  const year = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;                                   // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Обратно: из номера суток в дату. */
export function civil(z: number): Civil {
  const shifted = z + 719468;
  const era = Math.floor(shifted / 146097);
  const doe = shifted - era * 146097;                             // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524)
                          - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** День недели по-питоновски: понедельник 0, воскресенье 6.
 *  Считается так же и здесь — иначе правила про субботу и воскресенье
 *  пришлось бы переписывать, а переписанное правило расходится. */
export function weekday(date: Civil): number {
  const z = days(date);
  return ((z + 3) % 7 + 7) % 7;
}

export function addDays(date: Civil, n: number): Civil {
  return civil(days(date) + n);
}

export function compare(a: Civil, b: Civil): number {
  return days(a) - days(b);
}

/** `YYYY-MM-DD`. */
export function isoDate({ y, m, d }: Civil): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Минута от 1970-01-01T00:00, без всякого пояса. */
export function minutes(t: Naive): number {
  return days(t) * 1440 + t.hh * 60 + t.mm;
}

export function fromMinutes(total: number): Naive {
  const day = Math.floor(total / 1440);
  const rest = total - day * 1440;
  return { ...civil(day), hh: Math.floor(rest / 60), mm: rest % 60 };
}

export function addMinutes(t: Naive, n: number): Naive {
  return fromMinutes(minutes(t) + n);
}

/** `YYYY-MM-DDTHH:MM` — та же запись, что у питона с `timespec="minutes"`. */
export function isoNaive(t: Naive): string {
  return `${isoDate(t)}T${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")}`;
}

export function parseNaive(iso: string): Naive {
  const [date, time = "00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return { y, m, d, hh, mm };
}

export function parseDate(iso: string): Civil {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

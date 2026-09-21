// Calendar arithmetic with no `Date`.
//
// A `Date` is about an instant on the axis of time, whereas a sign speaks of the
// calendar: "Wednesday", "31 October", "08:00". Bring one in and the machine's time
// zone enters the reckoning with it, along with summer time and months counted from
// zero. Errors of that kind are quiet, and they surface on particular dates — exactly
// what the port fears most.
//
// So here there are whole numbers: a day is the number of the day from 1970-01-01, a
// moment is the minute from that same midnight. No zones and no change of the clocks:
// the change lives in `clock.ts` and is applied openly, where a LENGTH is counted.
//
// The `days`/`civil` algorithms are the well-known pair of Howard Hinnant's:
// integer-only, table-free, and correct for any year of the Gregorian calendar.

export type Civil = { y: number; m: number; d: number };
export type Naive = { y: number; m: number; d: number; hh: number; mm: number };

/** The number of the day from 1970-01-01. */
export function days({ y, m, d }: Civil): number {
  const year = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;                                   // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Back again: from the number of the day to the date. */
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

/** The day of the week the Python way: Monday 0, Sunday 6.
 *  Counted the same way here — otherwise the rules about Saturday and Sunday would
 *  have to be rewritten, and a rewritten rule drifts. */
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

/** The minute from 1970-01-01T00:00, with no zone whatever. */
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

/** `YYYY-MM-DDTHH:MM` — the same notation Python gives with `timespec="minutes"`. */
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

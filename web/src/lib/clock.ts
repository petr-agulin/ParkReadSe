// The change of the clocks. A port of `parkread/clock_se.py`, carrying no zone
// databases.
//
// The European rule is one for the whole union: forward on the last Sunday of March,
// back on the last Sunday of October, both changes at 01:00 UTC. Sweden is `+1` in
// winter and `+2` in summer, so on Swedish clocks the numbers are always the same: in
// spring 02:00 becomes 03:00, in autumn 03:00 becomes 02:00. Only the date moves.
//
// Everything else in the product is counted off the dial, and rightly so: `9-12` is
// nine o'clock in March and in October alike. But a LENGTH is not measured by a dial:
// on the night of a change a day lasts 23 or 25 hours (decision 116).
//
// Two cases are named outright: in spring the hour 02:00-03:00 does not exist, and in
// autumn it comes round twice. A time that never was is moved forward; of a repeated
// one the FIRST occurrence is taken — the one a person sees on the clock.

import { addDays, addMinutes, minutes, weekday, type Civil, type Naive } from "./civil";

export const WINTER = 1;   // CET,  UTC+1
export const SUMMER = 2;   // CEST, UTC+2

const HOUR = 60;

/** The last Sunday of the month — that is how the European rule is written. */
function lastSunday(year: number, month: number): Civil {
  const first: Civil = month === 12
    ? { y: year + 1, m: 1, d: 1 }
    : { y: year, m: month + 1, d: 1 };
  const last = addDays(first, -1);
  return addDays(last, -((weekday(last) + 1) % 7));
}

/** The moment on Swedish clocks at which the hands jump forward: 02:00 to 03:00. */
export function springForward(year: number): Naive {
  return { ...lastSunday(year, 3), hh: 2, mm: 0 };
}

/** The moment at which the hands go back: 03:00 to 02:00. Written down BEFORE the
 *  change. */
export function autumnBack(year: number): Naive {
  return { ...lastSunday(year, 10), hh: 3, mm: 0 };
}

/** The hour that never was: in spring 02:00-03:00 does not exist on the clock. */
export function normalise(local: Naive): Naive {
  const jump = minutes(springForward(local.y));
  const t = minutes(local);
  return t >= jump && t < jump + HOUR ? addMinutes(local, HOUR) : local;
}

/** How many hours local time runs ahead of UTC: `+1` in winter, `+2` in summer. */
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
  // In UTC the changes stand at 01:00 on both Sundays — there are no gaps there, and
  // the offset is settled unambiguously.
  const t = minutes(moment);
  const spring = minutes({ ...lastSunday(moment.y, 3), hh: 1, mm: 0 });
  const autumn = minutes({ ...lastSunday(moment.y, 10), hh: 1, mm: 0 });
  return addMinutes(moment, (t >= spring && t < autumn ? SUMMER : WINTER) * HOUR);
}

/** Add REAL time: `2 tim` is two hours lived, not two divisions of a dial. On the
 *  night of a change those are different things. */
export function add(local: Naive, mins: number): Naive {
  return fromUtc(addMinutes(toUtc(local), mins));
}

/** How many minutes will actually pass. */
export function realMinutes(start: Naive, end: Naive): number {
  return minutes(toUtc(end)) - minutes(toUtc(start));
}

/** Whether the stretch crosses a change of the clocks, and in which direction. */
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

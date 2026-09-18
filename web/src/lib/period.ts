// How the length of a stretch on the scale is read.
//
// The rule is one and the same for two different cases, so it lives here rather than
// in the markup: "max" is a statement about STANDING ("this long you may stand"), and
// it holds only where the sign grants standing at all.

export type Tone = "paid" | "free" | "prohibited" | "uncertain" | "not_stated";

/** A length in words: minutes for a short one, hours and minutes for a long one. */
export function lasting(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Whether to put a "max" beside the length.
 *
 *  A prohibition has an exact length — it lasts precisely that long, and "max" would
 *  be a lie. Silence has an exact one for the same reason: the sign grants no
 *  standing whatever, and "47 h max" beside "Nothing stated on the sign" read as
 *  permission to stand that long — found while checking a zone sign in the browser. */
export function isStayLimit(tone: Tone | string): boolean {
  return tone !== "prohibited" && tone !== "not_stated";
}

/** The scale divides in two: a prohibition BEFORE the window is not yet the window.
 *
 *  The prohibition used to be drawn inside the window, and it came out that the
 *  window began at 06:00 while its first stretch ran from 02:15. Now the chosen
 *  moment has a node of its own, and the prohibition leads from it to the start of
 *  the window.
 *
 *  The window may turn out to be empty: a sign that forbids now and promises nothing
 *  further forms no window at all — there are then no "Window starts / ends" nodes,
 *  only a red dotted line. */
export function splitWindow<T extends { tone: string }>(
  periods: T[],
): { leadIn: T[]; window: T[] } {
  let i = 0;
  while (i < periods.length && periods[i].tone === "prohibited") i += 1;
  return { leadIn: periods.slice(0, i), window: periods.slice(i) };
}

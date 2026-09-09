// Как читается длительность отрезка на шкале.
//
// Правило одно и то же для двух разных случаев, поэтому живёт здесь, а не
// в вёрстке: «max» — это утверждение о СТОЯНКЕ («столько можно простоять»),
// и оно верно лишь там, где знак стоянку даёт.

export type Tone = "paid" | "free" | "prohibited" | "uncertain" | "not_stated";

/** Длительность словами: минуты для короткого, часы и минуты для длинного. */
export function lasting(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Приписывать ли к длительности «max».
 *
 *  У запрета длительность точная — он длится ровно столько, и «max» врал бы.
 *  У молчания она точная по той же причине: знак стоянки не даёт вовсе, а
 *  «47 h max» рядом с «Nothing stated on the sign» читалось как позволение
 *  столько простоять — найдено на проверке зонального знака в браузере. */
export function isStayLimit(tone: Tone | string): boolean {
  return tone !== "prohibited" && tone !== "not_stated";
}

/** Шкала делится надвое: запрет ПЕРЕД окном — это ещё не окно.
 *
 *  Раньше запрет рисовался внутри окна, и выходило, что окно начинается в 06:00,
 *  а первый его отрезок идёт с 02:15. Теперь у выбранного момента свой узел,
 *  а запрет ведёт от него к началу окна.
 *
 *  Окно может оказаться пустым: знак, который сейчас запрещает и ничего не
 *  обещает дальше, никакого окна не образует — узлов «Window starts / ends»
 *  тогда нет, только красная пунктирная линия. */
export function splitWindow<T extends { tone: string }>(
  periods: T[],
): { leadIn: T[]; window: T[] } {
  let i = 0;
  while (i < periods.length && periods[i].tone === "prohibited") i += 1;
  return { leadIn: periods.slice(0, i), window: periods.slice(i) };
}

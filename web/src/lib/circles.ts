// The circle of those who may stand is a property of the SIGN, not of a window.
//
// There are several windows on screen at times: an arrow divides them (different
// stretches of the street), or an addressee does (a condition aimed at one kind of
// vehicle). The circle is often one and the same, and there is no reason to repeat it
// once for every window: found by the developer on photograph `049`, where "The sign
// permits parking for all vehicles" stood twice in a row.
//
// Different circles stay apart: on sign `010` the arrows set rented spaces on the
// left and rented ones with a special permit on the right, and those are two
// different answers to the question "who".

export type Circle = { key: string }[];

/** The circles without repetition, in order of appearance. Compared by the keys of
 *  the reference: the text is bound tightly to the key, so the keys are enough. */
export function distinctCircles<T extends Circle>(circles: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const circle of circles) {
    const id = circle.map((t) => t.key).join("|");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(circle);
  }
  return out;
}

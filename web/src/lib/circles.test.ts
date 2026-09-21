import { describe, expect, it } from "vitest";

import { distinctCircles } from "./circles";

const term = (key: string) => ({ key, text: key, known: true });

describe("the circle of those who may stand, without repetition", () => {
  it("shows one and the same circle once", () => {
    // Photograph `049`: two windows, a different addressee, and one circle between
    // them.
    const everyone = [term("parking")];
    expect(distinctCircles([everyone, [term("parking")]])).toHaveLength(1);
  });

  it("keeps two different circles both", () => {
    // Photograph `010`: rented spaces on the left, rented with a permit on the right.
    const left = [term("forhyrda-platser")];
    const right = [term("forhyrda-platser"), term("sarskilt-p-tillstand")];
    expect(distinctCircles([left, right])).toHaveLength(2);
  });

  it("keeps the order, and adds no empty circles", () => {
    const a = [term("boende")];
    const b = [term("besokande")];
    expect(distinctCircles([a, b, a]).map((c) => c[0].key))
      .toEqual(["boende", "besokande"]);
    expect(distinctCircles([])).toEqual([]);
  });
});

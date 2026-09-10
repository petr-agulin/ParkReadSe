import { describe, expect, it } from "vitest";

import { distinctCircles } from "./circles";

const term = (key: string) => ({ key, text: key, known: true });

describe("круг стоящих без повторов", () => {
  it("одинаковые круги показываются один раз", () => {
    // Снимок `049`: два окна, адресат разный, а круг один и тот же.
    const все = [term("parking")];
    expect(distinctCircles([все, [term("parking")]])).toHaveLength(1);
  });

  it("разные круги остаются оба", () => {
    // Снимок `010`: слева арендованные места, справа арендованные с разрешением.
    const слева = [term("forhyrda-platser")];
    const справа = [term("forhyrda-platser"), term("sarskilt-p-tillstand")];
    expect(distinctCircles([слева, справа])).toHaveLength(2);
  });

  it("порядок сохраняется, а пустых кругов не прибавляется", () => {
    const a = [term("boende")];
    const b = [term("besokande")];
    expect(distinctCircles([a, b, a]).map((c) => c[0].key))
      .toEqual(["boende", "besokande"]);
    expect(distinctCircles([])).toEqual([]);
  });
});

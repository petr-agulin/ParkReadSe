import { describe, expect, it } from "vitest";

import { isStayLimit, lasting, splitWindow } from "./period";

describe("the length of a stretch", () => {
  it("counts a short one in minutes and a long one in hours", () => {
    expect(lasting(45)).toBe("45 min");
    expect(lasting(120)).toBe("2 h");
    expect(lasting(2879)).toBe("47 h 59 min");
  });

  it('puts a "max" where the sign grants standing', () => {
    expect(isStayLimit("paid")).toBe(true);
    expect(isStayLimit("free")).toBe(true);
    expect(isStayLimit("uncertain")).toBe(true);
  });

  it("gives a prohibition and a silence an exact length, not a limit", () => {
    // A prohibition lasts precisely that long; a sign that says nothing grants no
    // standing at all.
    expect(isStayLimit("prohibited")).toBe(false);
    expect(isStayLimit("not_stated")).toBe(false);
  });
});

describe("dividing the scale into the prohibition and the window", () => {
  const p = (tone: string) => ({ tone });

  it("sets a prohibition before the window apart from it", () => {
    const { leadIn, window } = splitWindow([p("prohibited"), p("paid"), p("free")]);
    expect(leadIn).toHaveLength(1);
    expect(window.map((x) => x.tone)).toEqual(["paid", "free"]);
  });

  it("has no window at all when the sign only forbids", () => {
    // A red dotted line with no "Window starts / Window ends" nodes: the end of a
    // prohibition is not the beginning of a permission.
    const { leadIn, window } = splitWindow([p("prohibited")]);
    expect(leadIn).toHaveLength(1);
    expect(window).toEqual([]);
  });

  it("runs the window from the first stretch when nothing forbids", () => {
    const { leadIn, window } = splitWindow([p("paid")]);
    expect(leadIn).toEqual([]);
    expect(window).toHaveLength(1);
  });
});

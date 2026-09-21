import { describe, expect, it } from "vitest";

import { when } from "./when";

describe("the moment on screen", () => {
  it("keeps a twenty-four-hour clock, as the sign does", () => {
    // A sign writes `8-18` and `00-24`; an answer about it in am/pm would make a
    // person convert one into the other while standing at the pole.
    const text = when("2026-10-30T14:00");
    expect(text).toContain("14:00");
    expect(text.toLowerCase()).not.toContain("pm");
    expect(text.toLowerCase()).not.toContain("am");
  });

  it("makes midnight 00:00 and not 24:00", () => {
    expect(when("2026-10-27T00:00")).toContain("00:00");
  });

  it("names the day and the month in English, and shortened", () => {
    // Shortened, because the line is not read but scanned: full words carry it onto a
    // second line even on a wide phone.
    const text = when("2026-10-30T14:00");
    expect(text).toContain("Fri.");
    expect(text).toContain("Oct.");
    expect(text).toContain("30");
    expect(text).not.toContain("Friday");
    expect(text).not.toContain("October");
  });

  it("gives a format that does not depend on the device", () => {
    // The same moment gives the same line, wherever the page is opened.
    expect(when("2026-09-13T09:05")).toBe(when("2026-09-13T09:05"));
    expect(when("2026-09-13T09:05")).toContain("09:05");
  });
});

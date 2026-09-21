import { describe, expect, it } from "vitest";

import { addDays, addMinutes, civil, days, isoDate, isoNaive, minutes,
         parseNaive, weekday } from "./civil";

describe("calendar arithmetic", () => {
  it("day zero is Thursday, 1 January 1970", () => {
    expect(days({ y: 1970, m: 1, d: 1 })).toBe(0);
    expect(weekday({ y: 1970, m: 1, d: 1 })).toBe(3);      // as Python's weekday()
  });

  it("goes there and back at the edges of months, and in a leap year", () => {
    for (const iso of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31",
                       "2030-06-30", "2027-03-01"]) {
      const [y, m, d] = iso.split("-").map(Number);
      expect(isoDate(civil(days({ y, m, d })))).toBe(iso);
    }
  });

  it("has a 29 February only in a leap year", () => {
    expect(isoDate(addDays({ y: 2028, m: 2, d: 28 }, 1))).toBe("2028-02-29");
    expect(isoDate(addDays({ y: 2026, m: 2, d: 28 }, 1))).toBe("2026-03-01");
  });

  it("agrees with known dates on the day of the week", () => {
    expect(weekday({ y: 2026, m: 10, d: 31 })).toBe(5);     // Saturday
    expect(weekday({ y: 2026, m: 4, d: 5 })).toBe(6);       // Sunday, Easter
    expect(weekday({ y: 2026, m: 9, d: 8 })).toBe(1);       // Tuesday
  });

  it("adds minutes across midnight and across a month", () => {
    expect(isoNaive(addMinutes(parseNaive("2026-03-02T23:30"), 60)))
      .toBe("2026-03-03T00:30");
    expect(isoNaive(addMinutes(parseNaive("2026-09-30T23:59"), 1)))
      .toBe("2026-10-01T00:00");
    expect(minutes({ y: 1970, m: 1, d: 1, hh: 0, mm: 0 })).toBe(0);
  });
});

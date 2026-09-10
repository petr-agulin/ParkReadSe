import { describe, expect, it } from "vitest";

import { addDays, addMinutes, civil, days, isoDate, isoNaive, minutes,
         parseNaive, weekday } from "./civil";

describe("календарная арифметика", () => {
  it("день ноль — четверг 1 января 1970", () => {
    expect(days({ y: 1970, m: 1, d: 1 })).toBe(0);
    expect(weekday({ y: 1970, m: 1, d: 1 })).toBe(3);      // как python weekday()
  });

  it("туда и обратно на краях месяцев и в високосный год", () => {
    for (const iso of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31",
                       "2030-06-30", "2027-03-01"]) {
      const [y, m, d] = iso.split("-").map(Number);
      expect(isoDate(civil(days({ y, m, d })))).toBe(iso);
    }
  });

  it("29 февраля бывает только в високосном", () => {
    expect(isoDate(addDays({ y: 2028, m: 2, d: 28 }, 1))).toBe("2028-02-29");
    expect(isoDate(addDays({ y: 2026, m: 2, d: 28 }, 1))).toBe("2026-03-01");
  });

  it("дни недели совпадают с известными датами", () => {
    expect(weekday({ y: 2026, m: 10, d: 31 })).toBe(5);     // суббота
    expect(weekday({ y: 2026, m: 4, d: 5 })).toBe(6);       // воскресенье, Пасха
    expect(weekday({ y: 2026, m: 9, d: 8 })).toBe(1);       // вторник
  });

  it("минуты складываются через полночь и через месяц", () => {
    expect(isoNaive(addMinutes(parseNaive("2026-03-02T23:30"), 60)))
      .toBe("2026-03-03T00:30");
    expect(isoNaive(addMinutes(parseNaive("2026-09-30T23:59"), 1)))
      .toBe("2026-10-01T00:00");
    expect(minutes({ y: 1970, m: 1, d: 1, hh: 0, mm: 0 })).toBe(0);
  });
});

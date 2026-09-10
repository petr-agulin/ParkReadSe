import { describe, expect, it } from "vitest";

import { Calendar, EVE, RED, UNKNOWN, WEEKDAY, easter, holidays, selectable } from "./calendar";
import { addDays, isoDate, parseDate, weekday } from "./civil";

const cal = new Calendar();
const cls = (iso: string) => cal.dayClass(parseDate(iso));

// Опубликованные даты Пасхи: таблица независима от формулы, и сойтись на двадцати
// одном годе случайно они не могли. Тот же список стережёт питон.
const EASTER: Record<number, string> = {
  2020: "2020-04-12", 2021: "2021-04-04", 2022: "2022-04-17", 2023: "2023-04-09",
  2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28",
  2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13",
  2032: "2032-03-28", 2033: "2033-04-17", 2034: "2034-04-09", 2035: "2035-03-25",
  2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-10",
  2040: "2040-04-01",
};

describe("календарь", () => {
  it("Пасха совпадает с опубликованными датами", () => {
    for (const [year, iso] of Object.entries(EASTER)) {
      const day = easter(Number(year));
      expect(isoDate(day), year).toBe(iso);
      expect(weekday(day)).toBe(6);                    // всегда воскресенье
    }
  });

  it("тринадцать красных дней в году, и первое мая среди них", () => {
    for (let year = 2026; year <= 2030; year += 1) {
      expect(holidays(year).size, String(year)).toBe(13);
      expect(holidays(year).has(`${year}-05-01`)).toBe(true);
    }
  });

  it("красный день не бывает скобками, даже перед красным", () => {
    // Шесть дней 2026 года, которые портит наивный порядок проверок.
    for (const iso of ["2026-04-05", "2026-06-06", "2026-06-20",
                       "2026-10-31", "2026-12-25", "2026-12-26"]) {
      expect(cls(iso), iso).toBe(RED);
    }
  });

  it("кануны понедельника-пятницы 2026 года — те же девять", () => {
    const found: string[] = [];
    for (let d = parseDate("2026-01-01"); d.y === 2026; d = addDays(d, 1)) {
      if (weekday(d) < 5 && cal.dayClass(d) === EVE) found.push(isoDate(d).slice(5));
    }
    expect(found).toEqual(["01-05", "04-02", "04-30", "05-13", "06-05", "06-19",
                           "10-30", "12-24", "12-31"]);
  });

  it("суббота — vardag, поэтому канун; воскресенье всегда красное", () => {
    expect(cls("2026-09-12")).toBe(EVE);               // обычная суббота
    expect(cls("2026-09-13")).toBe(RED);               // обычное воскресенье
    expect(cls("2026-09-09")).toBe(WEEKDAY);
  });

  it("окно продукта — 2026-2030, а считается на год шире", () => {
    expect(selectable(parseDate("2026-01-01"))).toBe(true);
    expect(selectable(parseDate("2030-12-31"))).toBe(true);
    expect(selectable(parseDate("2031-01-01"))).toBe(false);
    // Горизонт от конца окна не должен упираться в край.
    expect(cls("2031-01-05")).not.toBe(UNKNOWN);
    expect(cls("2035-03-01")).toBe(UNKNOWN);
  });

  it("имена праздников шведские, английские рядом", () => {
    const saints = parseDate("2026-10-31");
    expect(cal.holidayName(saints)).toBe("Alla helgons dag");
    expect(cal.holidayNameEn(saints)).toBe("All Saints' Day");
    expect(cal.holidayName(parseDate("2026-09-13"))).toBeNull();
  });

  it("рабочий день — только будни, и следующий ищется через выходные", () => {
    expect(cal.isWorkingDay(parseDate("2026-09-12"))).toBe(false);
    const next = cal.nextWorkingDay(parseDate("2026-09-11"));
    expect(next && isoDate(next)).toBe("2026-09-14");
  });
});

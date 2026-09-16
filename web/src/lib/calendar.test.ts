// Календарь, который считается кодом. Перенесено из `tests/test_calendar.py`
// целиком (шаг 8): после вывода питона эти проверки — единственные.
//
// Главная здесь — «каждый день 2026 года сохраняет свой класс»: за 2026 год
// вычисленный календарь обязан совпасть день в день с файлом, который он заменил.
// Файла больше нет, а эталон, с которым сверяются, остаться должен — поэтому
// тринадцать дат 2026 года записаны прямо в тесте.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar, EVE, RED, SELECTABLE_FROM, SELECTABLE_TO, UNKNOWN, WEEKDAY,
         easter, holidays, selectable } from "./calendar";
import { addDays, days, isoDate, parseDate, weekday, type Civil } from "./civil";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();
const cls = (iso: string) => cal.dayClass(parseDate(iso));

// Опубликованные даты Пасхи: таблица независима от формулы, и сойтись на двадцати
// одном годе случайно они не могли.
const EASTER: Record<number, string> = {
  2020: "2020-04-12", 2021: "2021-04-04", 2022: "2022-04-17", 2023: "2023-04-09",
  2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05", 2027: "2027-03-28",
  2028: "2028-04-16", 2029: "2029-04-01", 2030: "2030-04-21", 2031: "2031-04-13",
  2032: "2032-03-28", 2033: "2033-04-17", 2034: "2034-04-09", 2035: "2035-03-25",
  2036: "2036-04-13", 2037: "2037-04-05", 2038: "2038-04-25", 2039: "2039-04-10",
  2040: "2040-04-01",
};

// Тринадцать красных дней 2026 года — дословно из `data/holidays_se.json`,
// который вычисленный календарь заменил.
const HOLIDAYS_2026: Record<string, string> = {
  "2026-01-01": "Nyårsdagen",
  "2026-01-06": "Trettondedag jul",
  "2026-04-03": "Långfredagen",
  "2026-04-05": "Påskdagen",
  "2026-04-06": "Annandag påsk",
  "2026-05-01": "Första maj",
  "2026-05-14": "Kristi himmelsfärdsdag",
  "2026-05-24": "Pingstdagen",
  "2026-06-06": "Sveriges nationaldag",
  "2026-06-20": "Midsommardagen",
  "2026-10-31": "Alla helgons dag",
  "2026-12-25": "Juldagen",
  "2026-12-26": "Annandag jul",
};

function* daysOf(year: number): Generator<Civil> {
  for (let d: Civil = { y: year, m: 1, d: 1 }; d.y === year; d = addDays(d, 1)) yield d;
}

/** Праздники года по имени — закон называет их словами, а не числами. */
const byName = (year: number) =>
  new Map([...holidays(year)].map(([iso, name]) => [name, parseDate(iso)] as const));

const between = (a: Civil, b: Civil) => days(a) - days(b);

describe("Пасха и смещения от неё", () => {
  // py: test_calendar::test_easter_matches_the_published_dates
  it("Пасха совпадает с опубликованными датами", () => {
    for (const [year, iso] of Object.entries(EASTER)) {
      const day = easter(Number(year));
      expect(isoDate(day), year).toBe(iso);
      expect(weekday(day)).toBe(6);                    // всегда воскресенье
    }
  });

  // py: test_calendar::test_the_offsets_are_the_ones_the_law_names
  it("смещения — те, что закон называет словами, а не числа 39 и 49", () => {
    // «fredagen närmast före påskdagen», «sjätte torsdagen efter påskdagen»,
    // «sjunde söndagen»: если день недели не тот, смещение переписано неверно.
    for (let year = 2026; year <= 2030; year += 1) {
      const h = byName(year);
      const e = easter(year);
      expect(between(h.get("Långfredagen")!, e), String(year)).toBe(-2);
      expect(weekday(h.get("Långfredagen")!)).toBe(4);                      // пятница
      expect(between(h.get("Annandag påsk")!, e)).toBe(1);
      expect(weekday(h.get("Kristi himmelsfärdsdag")!)).toBe(3);            // четверг
      expect(Math.floor(between(h.get("Kristi himmelsfärdsdag")!, e) / 7)).toBe(5);
      expect(weekday(h.get("Pingstdagen")!)).toBe(6);                       // воскресенье
      expect(Math.floor(between(h.get("Pingstdagen")!, e) / 7)).toBe(7);
    }
  });

  // py: test_calendar::test_the_saturdays_fall_inside_the_windows_the_law_gives
  it("субботние праздники попадают в окна, которые даёт закон", () => {
    for (let year = 2026; year <= 2030; year += 1) {
      const h = byName(year);
      const midsummer = h.get("Midsommardagen")!;
      const saints = h.get("Alla helgons dag")!;
      expect(weekday(midsummer)).toBe(5);
      expect(midsummer.m).toBe(6);
      expect(midsummer.d >= 20 && midsummer.d <= 26, String(year)).toBe(true);
      expect(weekday(saints)).toBe(5);
      const md = saints.m * 100 + saints.d;
      expect(md >= 1031 && md <= 1106, String(year)).toBe(true);
    }
  });

  // py: test_calendar::test_thirteen_red_days_every_year
  it("тринадцать красных дней в году, и первое мая среди них", () => {
    // Двенадцать перечислены в § 2 с датами, тринадцатый — `första maj`:
    // § 1 его называет, а дата у него в самом названии.
    for (let year = 2026; year <= 2030; year += 1) {
      expect(holidays(year).size, String(year)).toBe(13);
      expect(holidays(year).has(`${year}-05-01`)).toBe(true);
    }
  });
});

describe("совпадение с файлом, который календарь заменил", () => {
  // py: test_calendar::test_2026_matches_the_file_it_replaced
  it("праздники 2026 года — те же тринадцать", () => {
    expect(Object.fromEntries(holidays(2026))).toEqual(HOLIDAYS_2026);
  });

  // py: test_calendar::test_every_day_of_2026_keeps_its_class
  it("каждый день 2026 года сохраняет свой класс", () => {
    // 1 января 2027-го входит в эталон по той же причине, по какой лежало
    // отдельной записью в прежнем файле: без него 31 декабря нечем признать кануном.
    const expected = new Set([...Object.keys(HOLIDAYS_2026), "2027-01-01"]);
    const isRed = (d: Civil) => expected.has(isoDate(d)) || weekday(d) === 6;
    for (const d of daysOf(2026)) {
      const want = isRed(d) ? RED : isRed(addDays(d, 1)) ? EVE : WEEKDAY;
      expect(cal.dayClass(d), isoDate(d)).toBe(want);
    }
  });

  // py: test_calendar::test_the_2026_counts_are_unchanged
  it("числа 2026 года прежние: 63 красных, 57 канунов, 245 будней", () => {
    const counts: Record<string, number> = {};
    for (const d of daysOf(2026)) counts[cal.dayClass(d)] = (counts[cal.dayClass(d)] ?? 0) + 1;
    expect(counts).toEqual({ [RED]: 63, [EVE]: 57, [WEEKDAY]: 245 });
    // Суббота — vardag, но за ней воскресенье, поэтому она всегда канун;
    // воскресенье всегда красное.
    for (const d of daysOf(2026)) {
      if (weekday(d) === 5) expect(cal.dayClass(d), isoDate(d)).not.toBe(WEEKDAY);
      if (weekday(d) === 6) expect(cal.dayClass(d), isoDate(d)).toBe(RED);
    }
  });
});

describe("порядок правил", () => {
  // py: test_calendar::test_a_red_day_is_never_an_eve
  it("красный день не бывает скобками, даже перед красным", () => {
    // Шесть дней 2026 года, которые портит наивный порядок проверок.
    for (const iso of ["2026-04-05", "2026-06-06", "2026-06-20",
                       "2026-10-31", "2026-12-25", "2026-12-26"]) {
      expect(cls(iso), iso).toBe(RED);
    }
  });

  // py: test_calendar::test_the_eves_on_weekdays_are_the_nine_known_dates
  it("кануны понедельника-пятницы 2026 года — те же девять", () => {
    const found: string[] = [];
    for (const d of daysOf(2026)) {
      if (weekday(d) < 5 && cal.dayClass(d) === EVE) found.push(isoDate(d).slice(5));
    }
    expect(found).toEqual(["01-05", "04-02", "04-30", "05-13", "06-05", "06-19",
                           "10-30", "12-24", "12-31"]);
  });

  // py: test_calendar::test_christmas_eve_midsummer_eve_and_new_years_eve_stay_eves
  it("сочельник, канун Мидсоммара и Новый год остаются канунами", () => {
    // Официальными праздниками они не являются, и добавлять их в список нельзя.
    for (let year = 2026; year <= 2030; year += 1) {
      const midsummer = byName(year).get("Midsommardagen")!;
      const eves: Civil[] = [{ y: year, m: 12, d: 24 }, { y: year, m: 12, d: 31 },
                             addDays(midsummer, -1)];
      for (const d of eves) {
        expect(cal.isPublicHoliday(d), isoDate(d)).toBe(false);
        // Красным такой день всё же бывает — воскресеньем, а не праздником:
        // 24 декабря 2028-го приходится на воскресенье.
        expect(cal.dayClass(d), isoDate(d)).toBe(weekday(d) === 6 ? RED : EVE);
      }
    }
  });

  it("суббота — vardag, поэтому канун; воскресенье всегда красное", () => {
    expect(cls("2026-09-12")).toBe(EVE);               // обычная суббота
    expect(cls("2026-09-13")).toBe(RED);               // обычное воскресенье
    expect(cls("2026-09-09")).toBe(WEEKDAY);
  });
});

describe("окно продукта", () => {
  // py: test_calendar::test_the_window_is_2026_to_2030
  it("окно — с 2026 по 2030 год включительно", () => {
    expect(isoDate(SELECTABLE_FROM)).toBe("2026-01-01");
    expect(isoDate(SELECTABLE_TO)).toBe("2030-12-31");
    expect(selectable(parseDate("2026-01-01"))).toBe(true);
    expect(selectable(parseDate("2030-12-31"))).toBe(true);
    expect(selectable(parseDate("2025-12-31"))).toBe(false);
    expect(selectable(parseDate("2031-01-01"))).toBe(false);
  });

  // py: test_calendar::test_the_horizon_from_the_end_of_the_window_still_has_a_calendar
  it("горизонт от конца окна ещё находит календарь", () => {
    // Шкала строится на восемь суток вперёд, и разбор 28 декабря 2030-го спрашивает
    // про январь 2031-го. Считается на год шире именно поэтому.
    for (let n = 0; n <= 8; n += 1) {
      const d = addDays(parseDate("2030-12-28"), n);
      expect(cal.dayClass(d), isoDate(d)).not.toBe(UNKNOWN);
    }
    // Считать шире — не значит отвечать шире: выбрать такой момент нельзя.
    expect(selectable(parseDate("2031-01-05"))).toBe(false);
  });

  // py: test_calendar::test_outside_the_computed_range_the_class_is_unknown
  it("вне вычисленного периода класс дня неизвестен", () => {
    // Набор праздников со временем меняется — до 2005 года вместо `nationaldagen`
    // красным был `annandag pingst`, — и молчание тут честнее вычисления.
    expect(cls("2004-06-06")).toBe(UNKNOWN);
    expect(cls("2040-01-01")).toBe(UNKNOWN);
  });

  // py: test_calendar::test_the_picker_on_screen_carries_the_same_window
  it("поле выбора момента на экране несёт то же окно", () => {
    // Окно записано дважды — в календаре и в поле. Расхождение ловится здесь,
    // а не человеком, которому поле позволит выбрать день вне окна.
    const page = readFileSync(`${ROOT}web/src/components/PhotoInput.tsx`, "utf-8");
    expect(page).toContain(`MOMENT_FROM = "${isoDate(SELECTABLE_FROM)}T00:00"`);
    expect(page).toContain(`MOMENT_TO = "${isoDate(SELECTABLE_TO)}T23:59"`);
  });
});

describe("переносимость", () => {
  // py: test_calendar::test_the_calendar_needs_no_file_at_all
  it("календарю не нужен ни один файл", () => {
    const source = readFileSync(`${ROOT}web/src/lib/calendar.ts`, "utf-8");
    for (const forbidden of ["node:fs", "readFile", "fetch(", ".json\""]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(existsSync(`${ROOT}data/holidays_se.json`)).toBe(false);
    expect(cls("2026-12-31")).toBe(EVE);
  });
});

describe("сверх питона", () => {
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

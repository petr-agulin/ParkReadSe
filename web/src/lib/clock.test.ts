// Перевод часов: длительность считается настоящим временем, а не циферблатом.
// Перенесено из `tests/test_clock.py` целиком (шаг 8).
//
// Всё остальное в продукте считается по циферблату, и это правильно: `9-12`
// на табличке — девять на часах и в марте, и в октябре. Но ночь перевода длится
// 23 или 25 часов, и три места обязаны это знать — предел с таблички, правило
// 24 часов и длина отрезка на шкале.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { addDays, isoNaive, minutes, parseNaive, weekday, type Naive } from "./civil";
import { SUMMER, WINTER, add, autumnBack, normalise, offset, realMinutes,
         springForward, switchBetween } from "./clock";
import { evaluateParkingRules, horizonEnd, twentyFourHourExpiry } from "./engine";
import { CLOCK_CHANGE_TEXT, regimeView } from "./present";
import type { Panel, Parsed, SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CAL = new Calendar();
const at = (iso: string): Naive => parseNaive(iso);

function sign(...panels: Panel[]): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panel_count: panels.length, boundaries: { certain: true }, panels,
  };
}

function plate(parsed: Parsed, lines = ["табличка"]): Panel {
  return { index: 1, kind: "sign_plate", lines, background_color: "white",
           legibility: { readable: true }, parsed };
}

/** Окно знака с платой — так, как его увидит экран. */
function regimeAt(iso: string) {
  const moment = at(iso);
  const r = evaluateParkingRules(sign(plate({ fee: true })), moment, CAL).regimes[0];
  return regimeView(r, horizonEnd(moment), CAL);
}

describe("само правило", () => {
  // py: test_clock::test_the_switches_stand_where_the_eu_rule_puts_them
  it("переходы стоят там, куда их ставит правило ЕС", () => {
    // Последнее воскресенье марта и октября, 01:00 UTC. На шведских часах это
    // всегда 02:00 весной и 03:00 осенью; меняется только дата.
    expect(isoNaive(springForward(2026))).toBe("2026-03-29T02:00");
    expect(isoNaive(autumnBack(2026))).toBe("2026-10-25T03:00");
    expect(isoNaive(springForward(2027))).toBe("2027-03-28T02:00");
    expect(isoNaive(autumnBack(2027))).toBe("2027-10-31T03:00");
    for (let year = 2026; year <= 2030; year += 1) {
      expect(weekday(springForward(year)), String(year)).toBe(6);
      expect(weekday(autumnBack(year))).toBe(6);
      expect(springForward(year).m).toBe(3);
      expect(autumnBack(year).m).toBe(10);
      // Последнее воскресенье: через неделю уже следующий месяц.
      expect(addDays(springForward(year), 7).m).toBe(4);
      expect(addDays(autumnBack(year), 7).m).toBe(11);
    }
  });

  // py: test_clock::test_the_offset_is_plus_one_in_winter_and_plus_two_in_summer
  it("смещение: зимой +1, летом +2, и края точные", () => {
    expect(offset(at("2026-01-15T12:00"))).toBe(WINTER);
    expect(offset(at("2026-07-15T12:00"))).toBe(SUMMER);
    expect(offset(at("2026-03-29T01:59"))).toBe(WINTER);
    expect(offset(at("2026-03-29T03:00"))).toBe(SUMMER);
    expect(offset(at("2026-10-25T02:59"))).toBe(SUMMER);   // первое вхождение
    expect(offset(at("2026-10-25T03:00"))).toBe(WINTER);
  });

  // py: test_clock::test_the_hour_that_does_not_exist_and_the_hour_that_happens_twice
  it("час, которого не было, сдвигается вперёд; повторённый берётся первым", () => {
    expect(isoNaive(normalise(at("2027-03-28T02:30")))).toBe("2027-03-28T03:30");
    expect(isoNaive(normalise(at("2027-03-28T01:30")))).toBe("2027-03-28T01:30");
    // Осенью берётся первое вхождение — то, что человек видит на часах.
    expect(offset(at("2026-10-25T02:30"))).toBe(SUMMER);
  });

  // py: test_clock::test_a_night_of_a_switch_is_23_or_25_hours_long
  it("ночь перевода длится 23 или 25 часов", () => {
    expect(realMinutes(at("2026-10-25T00:00"), at("2026-10-26T00:00"))).toBe(25 * 60);
    expect(realMinutes(at("2027-03-28T00:00"), at("2027-03-29T00:00"))).toBe(23 * 60);
    expect(realMinutes(at("2026-09-09T00:00"), at("2026-09-10T00:00"))).toBe(24 * 60);
  });

  // py: test_clock::test_adding_real_time_lands_on_the_right_clock_face
  it("два часа — это два прожитых часа, а не два деления циферблата", () => {
    expect(isoNaive(add(at("2026-10-25T02:30"), 120))).toBe("2026-10-25T03:30");
    expect(isoNaive(add(at("2027-03-28T01:30"), 120))).toBe("2027-03-28T04:30");
    expect(isoNaive(add(at("2026-09-09T10:00"), 120))).toBe("2026-09-09T12:00");
  });

  it("пересечение перевода находится и не выдумывается", () => {
    expect(switchBetween(at("2026-10-24T20:00"), at("2026-10-26T00:00"))).toBe("back");
    expect(switchBetween(at("2026-10-25T12:00"), at("2026-10-26T00:00"))).toBeNull();
    expect(switchBetween(at("2027-03-27T20:00"), at("2027-03-29T00:00"))).toBe("forward");
    expect(switchBetween(at("2026-09-09T00:00"), at("2026-09-17T00:00"))).toBeNull();
  });

  // py: test_clock::test_the_module_carries_no_time_zone_database
  it("часовых баз нет: ни в часах, ни в арифметике дат под ними", () => {
    // В браузере время устройства — чьё угодно, а считать надо по шведским часам.
    // Любая опора на `Date` или `Intl` принесла бы часовой пояс устройства.
    for (const file of ["clock.ts", "civil.ts"]) {
      const source = readFileSync(`${ROOT}web/src/lib/${file}`, "utf-8");
      for (const forbidden of ["new Date", "Intl.", "timeZone", "toLocale",
                               "getTimezoneOffset"]) {
        expect(source, `${file}: ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("три места, где это кусается", () => {
  // py: test_clock::test_a_plate_limit_across_the_switch
  it("предел `2 tim`, поставленный в ночь перевода", () => {
    const s = sign(plate({ duration_limit: { amount: 2, unit: "hours" } }, ["2 tim"]));
    let r = evaluateParkingRules(s, at("2026-10-25T02:30"), CAL).regimes[0];
    expect(r.durationExpiresAt && isoNaive(r.durationExpiresAt)).toBe("2026-10-25T03:30");
    expect(r.durationSource).toBe("plate");

    r = evaluateParkingRules(s, at("2027-03-28T01:30"), CAL).regimes[0];
    expect(r.durationExpiresAt && isoNaive(r.durationExpiresAt)).toBe("2027-03-28T04:30");
  });

  // py: test_clock::test_the_24_hour_rule_across_the_switch
  it("сутки правила 24 часов — настоящие", () => {
    // Среда 21 октября 2026: сутки идут до четверга, перевода нет.
    const plain = twentyFourHourExpiry(at("2026-10-21T20:00"), CAL);
    expect(plain && isoNaive(plain)).toBe("2026-10-22T20:00");
    // А сутки от субботы 20:00 накрывают ночь перевода и кончаются на час раньше.
    expect(isoNaive(add(at("2026-10-24T20:00"), 24 * 60))).toBe("2026-10-25T19:00");
  });

  // py: test_clock::test_the_length_of_a_segment_counts_real_hours
  it("длина отрезка на шкале — в настоящих часах", () => {
    // Раньше отрезок выдавал разницу циферблата — и «24 h» стояло там,
    // где машина простоит двадцать пять.
    const view = regimeAt("2026-10-24T20:00");
    const first = parseNaive(view.periods[0].start);
    const last = parseNaive(view.periods.at(-1).end);
    expect(switchBetween(first, last)).toBe("back");

    const shown = view.periods.reduce((sum: number, p: { minutes: number }) => sum + p.minutes, 0);
    expect(shown).toBe(realMinutes(first, last));
    expect(shown).toBe(minutes(last) - minutes(first) + 60);
  });
});

describe("заметка на экране", () => {
  // py: test_clock::test_the_note_appears_when_the_shown_stretch_crosses_the_switch
  it("появляется, когда показанный отрезок пересекает перевод", () => {
    let view = regimeAt("2026-10-24T20:00");
    expect(view.clock_change_text).toBe(CLOCK_CHANGE_TEXT.back);
    expect(view.clock_change_text).toContain("an hour longer");

    view = regimeAt("2027-03-27T20:00");
    expect(view.clock_change_text).toBe(CLOCK_CHANGE_TEXT.forward);
    expect(view.clock_change_text).toContain("an hour shorter");
  });

  // py: test_clock::test_there_is_no_note_when_nothing_crosses_the_switch
  it("нет её, когда ничто перевод не пересекает", () => {
    // В том числе днём того же воскресенья, когда перевод уже позади.
    expect(regimeAt("2026-10-25T12:00").clock_change_text).toBeNull();
    expect(regimeAt("2026-09-09T12:00").clock_change_text).toBeNull();
  });

  // py: test_clock::test_the_note_says_no_date_and_names_the_fixed_hours
  it("в ней нет даты, а часы названы", () => {
    // Перевод может прийтись и на ближайшую ночь, и на воскресенье в пределах
    // горизонта. Часы, наоборот, постоянные.
    for (const text of Object.values(CLOCK_CHANGE_TEXT)) {
      expect(text).toContain("02:00");
      expect(text).toContain("03:00");
      expect(text).not.toContain("October");
      expect(text).not.toContain("March");
      expect(text).toContain("already allow for it");
    }
  });
});

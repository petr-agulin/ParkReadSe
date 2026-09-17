// Решения экрана разбора. Требования 14 и 17 шага 11.

import { describe, expect, it } from "vitest";

import { firstWindow, meaningLine, plateRow, readFor, showsWindow } from "./reading";
import type { Meaning, Panel, Period, Regime } from "../types";

const meaning = (over: Partial<Meaning> = {}): Meaning => ({
  key: "avgift", label: "Fee", code: "T16", text: "", short: "A fee applies",
  continues: false, ...over,
});

const panel = (over: Partial<Panel> = {}): Panel => ({
  index: 1, kind: "sign_plate", lines: [], background_color: "blue",
  carries_rule: true, reference_keys: [], uninterpreted: [],
  not_interpreted_text: null, fields: [], title: "", text: "Avgift",
  meanings: [meaning()], ...over,
});

describe("значение таблички строкой", () => {
  it("код идёт в скобках после названия — как на знаке", () => {
    expect(meaningLine(meaning())).toBe("Fee (T16). A fee applies");
  });

  it("кода может не быть: табло оператора — не дорожный знак", () => {
    expect(meaningLine(meaning({ code: "" }))).toBe("Fee. A fee applies");
  });

  it("`continues` продолжает заголовок одним предложением", () => {
    // «No parking (C35) on Thursdays…», а не два обрубка через точку.
    expect(meaningLine(meaning({ label: "No parking", code: "C35",
                                 short: "on Thursdays", continues: true })))
      .toBe("No parking (C35) on Thursdays");
  });

  it("без пояснения остаётся одно название", () => {
    expect(meaningLine(meaning({ short: "" }))).toBe("Fee (T16)");
  });
});

describe("табличка карточкой", () => {
  it("сверху — что написано на табличке, под ним — что это значит", () => {
    const row = plateRow(panel());
    expect(row.quote).toBe("Avgift");
    expect(row.lines).toEqual(["Fee (T16). A fee applies"]);
    expect(row.tag).toBe("Panel");
  });

  it("у таблички без своего текста верхней строки нет вовсе", () => {
    // Пиктограмма: текста на ней нет, и выдумывать его незачем — карточка
    // начинается сразу со смысла.
    const row = plateRow(panel({ text: "", meanings: [meaning({ label: "Motorcycle" })] }));
    expect(row.quote).toBe("");
    expect(row.lines).toEqual(["Motorcycle (T16). A fee applies"]);
  });

  it("главный знак назван главным, всё прочее — табличкой", () => {
    // `kind` — открытая строка: незнакомый вид должен попасть в «Panel».
    expect(plateRow(panel({ kind: "main_sign" })).tag).toBe("Primary sign");
    expect(plateRow(panel({ kind: "что-то новое" })).tag).toBe("Panel");
  });

  it("несколько смыслов — каждый своей строкой", () => {
    const row = plateRow(panel({ meanings: [meaning(), meaning({ key: "b", label: "Hours" })] }));
    expect(row.lines).toHaveLength(2);
  });

  it("непонятый остаток не теряется", () => {
    const row = plateRow(panel({ not_interpreted_text: "This wording is not interpreted" }));
    expect(row.lines).toContain("This wording is not interpreted");
  });

  it("пустая панель не остаётся голой карточкой", () => {
    // Ни текста, ни смыслов — на экране была бы пустая рамка. Так однажды
    // и случилось, потому у безымянной панели есть имя.
    const row = plateRow(panel({ text: "", meanings: [], index: 3 }));
    expect(row.quote).toBe("");
    expect(row.lines).toEqual(["Panel 3"]);
  });
});

const period = (over: Partial<Period> = {}): Period => ({
  start: "2026-09-17T10:00", end: "2026-09-17T12:00", state: "allowed",
  state_text: "Parking allowed", ends_at_horizon: false, certain: true,
  aside: [], stay_end_text: "", stay_end_reason: "", tone: "free",
  start_day: null, end_day: null, headline: "Free parking", minutes: 120,
  notes: [], conditions: [], max_duration_minutes: null, note: null, ...over,
});

const regime = (over: Partial<Regime> = {}): Regime => ({
  extent: "here", extent_text: "", extent_short: "", audience: null,
  audience_short: null, eligibility: [], who_can_park: [], notes: [],
  no_window_text: null, clock_change_text: null, window_for: [], place_notes: [],
  duration_expires_at: null, duration_source: null, periods: [period()], ...over,
});

describe("какая карточка окна рисуется", () => {
  it("нет ни шкалы, ни объяснения — карточки не будет", () => {
    expect(showsWindow(regime({ periods: [], no_window_text: null }))).toBe(false);
  });

  it("есть шкала — есть карточка", () => {
    expect(showsWindow(regime())).toBe(true);
  });

  it("шкалы нет, но сказать есть что — карточка есть", () => {
    // Арендованное место: окна нет, а строка о нём нужна.
    expect(showsWindow(regime({ periods: [], no_window_text: "Leased bay" }))).toBe(true);
  });

  it("первой считается первая НАРИСОВАННАЯ, а не первая в списке", () => {
    // Иначе строка «Read for …» повисла бы на карточке, которой на экране нет,
    // и исчезла бы вместе с ней.
    const empty = regime({ periods: [], no_window_text: null });
    expect(firstWindow([empty, regime()])).toBe(1);
    expect(firstWindow([regime(), regime()])).toBe(0);
    expect(firstWindow([empty, empty])).toBe(-1);
  });
});

describe("на какой момент посчитан ответ", () => {
  it("момент назван словами и сокращённо", () => {
    // Оговорка «решение за вами» ушла отсюда под заголовок окна: она про окно,
    // а не про дату, рядом с которой стояла.
    const line = readFor("2026-09-16T07:00");
    expect(line).toMatch(/^Read for /);
    expect(line).toMatch(/Wed\./);
    expect(line).not.toContain("Judgement");
  });
});

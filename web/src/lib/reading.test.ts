// Решения экрана разбора. Требования 14 и 17 шага 11.

import { describe, expect, it } from "vitest";

import { meaningLine, plateRow, readFor } from "./reading";
import type { Meaning, Panel } from "../types";

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

describe("строка таблички", () => {
  it("один смысл — строка «подпись → значение»", () => {
    const row = plateRow(panel());
    expect(row.stacked).toBe(false);
    expect(row.label).toBe("Avgift");
    expect(row.values).toEqual(["Fee (T16). A fee applies"]);
  });

  it("несколько смыслов — подпись отдельной строкой, значения списком", () => {
    // Три смысла, втиснутые в одну ячейку, читаются как один длинный.
    const row = plateRow(panel({ meanings: [meaning(), meaning({ key: "b", label: "Hours" })] }));
    expect(row.stacked).toBe(true);
    expect(row.values).toHaveLength(2);
  });

  it("табличка без правила тоже идёт списком", () => {
    // Пометку «это не правило» нельзя подавать как значение таблички.
    expect(plateRow(panel({ carries_rule: false })).stacked).toBe(true);
  });

  it("непонятый остаток не теряется", () => {
    // Пустая панель без подписи однажды оставила на экране голую рамку.
    const row = plateRow(panel({ not_interpreted_text: "This wording is not interpreted" }));
    expect(row.values).toContain("This wording is not interpreted");
    expect(row.stacked).toBe(true);
  });

  it("у таблички без текста подписью становится её название", () => {
    // Пиктограмма: текста на ней нет вовсе.
    const row = plateRow(panel({ text: "", meanings: [meaning({ label: "Motorcycle" })] }));
    expect(row.label).toBe("Motorcycle");
  });

  it("нечитаемая панель не остаётся безымянной", () => {
    expect(plateRow(panel({ text: "", meanings: [], index: 3 })).label).toBe("Panel 3");
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

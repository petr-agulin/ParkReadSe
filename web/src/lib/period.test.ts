import { describe, expect, it } from "vitest";

import { isStayLimit, lasting, splitWindow } from "./period";

describe("длительность отрезка", () => {
  it("короткое считается минутами, длинное — часами", () => {
    expect(lasting(45)).toBe("45 min");
    expect(lasting(120)).toBe("2 h");
    expect(lasting(2879)).toBe("47 h 59 min");
  });

  it("«max» стоит там, где знак даёт стоянку", () => {
    expect(isStayLimit("paid")).toBe(true);
    expect(isStayLimit("free")).toBe(true);
    expect(isStayLimit("uncertain")).toBe(true);
  });

  it("у запрета и у молчания длительность точная, а не предельная", () => {
    // Запрет длится ровно столько; знак, который молчит, стоянки не даёт вовсе.
    expect(isStayLimit("prohibited")).toBe(false);
    expect(isStayLimit("not_stated")).toBe(false);
  });
});

describe("деление шкалы на запрет и окно", () => {
  const p = (tone: string) => ({ tone });

  it("запрет перед окном отделяется от него", () => {
    const { leadIn, window } = splitWindow([p("prohibited"), p("paid"), p("free")]);
    expect(leadIn).toHaveLength(1);
    expect(window.map((x) => x.tone)).toEqual(["paid", "free"]);
  });

  it("окна нет вовсе, когда знак только запрещает", () => {
    // Красная пунктирная линия без узлов «Window starts / Window ends»:
    // конец запрета — не начало разрешения.
    const { leadIn, window } = splitWindow([p("prohibited")]);
    expect(leadIn).toHaveLength(1);
    expect(window).toEqual([]);
  });

  it("без запрета всё окно с первого отрезка", () => {
    const { leadIn, window } = splitWindow([p("paid")]);
    expect(leadIn).toEqual([]);
    expect(window).toHaveLength(1);
  });
});

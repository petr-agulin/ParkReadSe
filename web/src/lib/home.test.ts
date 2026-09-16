// Решения главного экрана. Требования 9 и 10 шага 11.

import { describe, expect, it } from "vitest";

import { MOMENT_FROM, MOMENT_TO, entryActions, momentChip } from "./home";
import { when } from "./when";

describe("чип момента", () => {
  it("пока момент не выбран, говорит слово, а не время", () => {
    // Застывший отсчёт врал бы тому, кто простоял у знака пять минут: время
    // берётся в минуту отправки, а не в минуту открытия экрана.
    expect(momentChip("")).toEqual({ label: "Now", canReset: false });
    expect(momentChip("   ")).toEqual({ label: "Now", canReset: false });
  });

  it("выбранный момент назван днём недели и датой", () => {
    const chip = momentChip("2026-09-16T07:00");
    expect(chip.label).toBe(when("2026-09-16T07:00"));
    expect(chip.label).not.toBe("Now");
    // Каждое абсолютное время называет свой день: «в 07:00» без дня — это
    // вопрос «какого числа», заданный человеку у столба.
    expect(chip.label).toMatch(/Wednesday/);
  });

  it("выбранный момент можно сбросить обратно в «сейчас»", () => {
    expect(momentChip("2026-09-16T07:00").canReset).toBe(true);
    expect(momentChip("").canReset).toBe(false);
  });

  it("окно продукта — 2026-2030, как и календарь", () => {
    // За годы, которых календарь не считает, продукт не отвечает.
    expect(MOMENT_FROM.startsWith("2026")).toBe(true);
    expect(MOMENT_TO.startsWith("2030")).toBe(true);
  });
});

describe("чем начинается путь к разбору", () => {
  it("с камерой основное действие — снять", () => {
    const e = entryActions(true);
    expect(e.primary).toBe("scan");
    expect(e.primaryLabel).toBe("Scan a sign");
    expect(e.secondary).toBe("Pick a photo you already took");
    expect(e.unavailable).toBeNull();
  });

  it("без камеры основным становится выбор снимка, и сказано почему", () => {
    // Мёртвая кнопка на её месте была бы обещанием, которого не сдержать:
    // `getUserMedia` живёт только в защищённом контексте.
    const e = entryActions(false);
    expect(e.primary).toBe("pick");
    expect(e.primaryLabel).toBe("Pick a photo");
    expect(e.unavailable).toBeTruthy();
    expect(e.unavailable).toMatch(/secure address/);
  });

  it("без камеры тихой ссылки внизу нет: выбор снимка уже наверху", () => {
    expect(entryActions(false).secondary).toBeNull();
  });

  it("ни в одном случае не обещано того, чего экран не делает", () => {
    // «Scan a sign» предлагается только там, где камера действительно есть.
    expect(entryActions(false).primaryLabel).not.toMatch(/Scan/);
  });
});

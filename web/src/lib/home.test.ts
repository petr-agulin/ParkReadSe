// Решения главного экрана. Требования 9 и 10 шага 11.

import { describe, expect, it } from "vitest";

import {
  BENEFITS, HOME_HEADLINE, HOME_LINES, MOMENT_FROM, MOMENT_TO, entryActions, momentChip,
} from "./home";
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
    expect(chip.label).not.toBe("Now");
    // Каждое абсолютное время называет свой день: «в 07:00» без дня — это
    // вопрос «какого числа», заданный человеку у столба. В строке день и месяц
    // названы сокращённо: они делят место со временем.
    expect(chip.label).toMatch(/^Wed\./);
    expect(chip.label).toContain("Sep.");
    // Сокращает теперь сам `when`: на экране разбора ту же строку сканируют,
    // а не читают, и разработчик попросил сокращать и там.
    expect(when("2026-09-16T07:00")).toMatch(/^Wed\. 16 Sep\./);
  });

  it("ни день, ни месяц не остаются полным словом", () => {
    // Полное слово — это та самая лишняя ширина, из-за которой строка и рвалась.
    // Проверяются все двенадцать месяцев и все семь дней недели: пропущенная
    // строка в словаре иначе всплыла бы раз в году, у одного человека.
    const longWord = /[A-Za-z]{5,}/;
    for (let m = 1; m <= 12; m++) {
      const label = momentChip(`2026-${String(m).padStart(2, "0")}-05T09:00`).label;
      expect(label, label).not.toMatch(longWord);
    }
    for (let d = 5; d <= 18; d++) {
      const label = momentChip(`2026-01-${String(d).padStart(2, "0")}T09:00`).label;
      expect(label, label).not.toMatch(longWord);
    }
  });

  it("время не отрывается от «at» при переносе строки", () => {
    // Строка «Thursday 17 September at 02:01» на узком экране переносится, и без
    // этого ломалась после «at»: предлог висел в конце строки, время падало вниз
    // одно. Неразрывный пробел оставляет браузеру единственное разумное место
    // переноса — перед «at».
    const label = momentChip("2026-09-17T02:01").label;
    expect(label).toContain(" ");
    // Обычного пробела между «at» и цифрами не остаётся: он и был местом разрыва.
    expect(label).not.toMatch(/at (?=\d)/);
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

describe("два состояния одного экрана говорят одно и то же", () => {
  it("строки главного экрана — ровно те же, что и на первом запуске", () => {
    // Первое замечание разработчика с телефона было именно об этом: два
    // состояния говорили об одном разными словами и читались как разные
    // приложения. Ранг у строк разный — одна поднята в заголовок, — но набор
    // обязан остаться тем же, иначе экраны разойдутся снова.
    expect([HOME_HEADLINE, ...HOME_LINES].sort()).toEqual([...BENEFITS].sort());
  });

  it("заголовок не повторяет глагол кнопки под ним", () => {
    // Дословный `Snap a sign.` с первого запуска взять было нельзя: кнопка
    // внизу ЭТОГО экрана говорит `Scan a sign`, и два почти одинаковых слова
    // в пяди друг от друга читаются как заикание. Проверяется и то, и другое:
    // условие держится на обоих концах, а не на одном.
    expect(HOME_HEADLINE).not.toMatch(/\b(?:scan|snap)\b/i);
    expect(entryActions(true).primaryLabel).toMatch(/Scan/);
  });
});

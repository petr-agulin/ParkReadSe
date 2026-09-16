// Порядок блоков на экране разбора. Требования 14 и 15 шага 11.
//
// Проверяется ТЕКСТ компонента: среды DOM в наборе нет (решение 151), а порядок
// блоков — решение продукта, а не оформление, и оставлять его без сторожа нельзя.
// Переставить три карточки местами легко и незаметно; заметит это только тот,
// кто стоит у знака и листает до ответа.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const reading = () => readFileSync(`${ROOT}web/src/components/Reading.tsx`, "utf-8");

describe("ответ идёт перед доказательством (решение 149)", () => {
  it("кому можно → окно → таблички, именно в этом порядке", () => {
    // Человек у знака хочет ответ; реконструкция нужна ему, чтобы этот ответ
    // проверить, а не вместо него.
    const page = reading();
    const who = page.indexOf('id="who"');
    const window_ = page.indexOf('id="window"');
    const plates = page.indexOf('id="plates"');

    expect(who, "блока «кому можно» нет вовсе").toBeGreaterThan(-1);
    expect(window_, "блока окна нет вовсе").toBeGreaterThan(-1);
    expect(plates, "блока табличек нет вовсе").toBeGreaterThan(-1);

    expect(who).toBeLessThan(window_);
    expect(window_).toBeLessThan(plates);
  });

  it("оговорка о непрочитанной панели стоит НАД окном", () => {
    // Она оговаривает шкалу целиком. Уехав под неё, оговорка оказалась бы ниже
    // того, к чему относится, — и человек прочёл бы отрезки как обещание.
    const page = reading();
    const caveat = page.indexOf("may_hide_prohibition");
    const window_ = page.indexOf('id="window"');

    expect(caveat, "оговорки нет вовсе").toBeGreaterThan(-1);
    expect(caveat).toBeLessThan(window_);
  });

  it("полнота осталась внизу, вместе с прочитанным", () => {
    // Обычная уверенность — оговорка к разбору табличек, а не к окну:
    // её место в третьей карточке, у слова «confident».
    const what = readFileSync(`${ROOT}web/src/components/WhatWeSaw.tsx`, "utf-8");
    expect(what).toContain("confidenceLabel");
    // А сама оговорка о запрете — не здесь: иначе она встала бы дважды.
    const completeness = readFileSync(
      `${ROOT}web/src/components/Completeness.tsx`, "utf-8");
    expect(completeness).not.toContain("no period below is presented");
  });

  it("момент, на который посчитан ответ, назван на экране", () => {
    // Момент выбирается на главном экране, и разбор «на 07:00» иначе
    // не отличить от разбора «на сейчас».
    expect(reading()).toContain("readFor(");
  });
});

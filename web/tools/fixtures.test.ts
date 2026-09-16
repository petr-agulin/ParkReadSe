// Когда снимок переспрашивать, а когда нет. Перенесено из `tests/test_accuracy.py`
// (шаг 8).
//
// Ошибка в любую сторону дорога: пропустить устаревший ответ — замер молча смешает
// две версии промпта; переспрашивать лишнее — каждый прогон платит за одно и то же.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { refused, save, stale } from "./fixtures";

const IMG = "testset/photos/001-p-30min.jpg";
let root = "";

beforeEach(() => { root = mkdtempSync(join(tmpdir(), "parkread-fixtures-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("устаревание ответа", () => {
  // py: test_accuracy::test_changed_prompt_makes_a_saved_answer_stale
  it("правка промпта делает сохранённый ответ устаревшим", async () => {
    // Найдено на прогоне: после правки промпта команда пропустила все 26 снимков,
    // потому что проверяла существование файла, а не то, на какой вопрос он отвечает.
    expect(await stale(root, IMG, "extract", "промпт А"), "ответа нет вовсе").toBe(true);
    await save(root, IMG, "extract", { ok: true }, "модель", null, "промпт А");
    expect(await stale(root, IMG, "extract", "промпт А"), "тот же вопрос").toBe(false);
    expect(await stale(root, IMG, "extract", "промпт Б"), "вопрос изменился").toBe(true);
  });

  // py: test_accuracy::test_a_stale_triage_answer_alone_makes_the_photo_stale
  it("устаревший ответ одного отсева уже делает снимок устаревшим", async () => {
    // Правка промпта отсева не трогает промпт извлечения: смотри только на извлечение —
    // и правка отсева молча не доедет до прогона.
    await save(root, IMG, "extract", { ok: true }, "м", null, "извлечение А");
    await save(root, IMG, "triage", { ok: true }, "м", null, "отсев А");
    const fresh = [await stale(root, IMG, "triage", "отсев А"),
                   await stale(root, IMG, "extract", "извлечение А")];
    expect(fresh.some(Boolean), "оба ответа на текущие вопросы").toBe(false);
    const triageChanged = [await stale(root, IMG, "triage", "отсев Б"),
                           await stale(root, IMG, "extract", "извлечение А")];
    expect(triageChanged.some(Boolean), "правка промпта отсева обязана переспросить снимок")
      .toBe(true);
  });

  // py: test_accuracy::test_hand_marked_and_unfingerprinted_answers_are_stale
  it("затравка и ответ без отпечатка переспрашиваются всегда", async () => {
    const path = await save(root, IMG, "extract", { ok: true }, "м", null, "П");
    expect(await stale(root, IMG, "extract", "П")).toBe(false);

    const doc = JSON.parse(readFileSync(path, "utf-8"));
    writeFileSync(path, JSON.stringify({ ...doc, origin: "hand_marked" }));
    expect(await stale(root, IMG, "extract", "П"), "затравка").toBe(true);

    writeFileSync(path, JSON.stringify({ ...doc, origin: "model", prompt_fingerprint: null }));
    expect(await stale(root, IMG, "extract", "П"), "отпечатка нет").toBe(true);
  });
});

describe("отказ отсева", () => {
  // py: test_accuracy::test_a_refused_photo_is_not_asked_again_forever
  it("отказной кадр не переспрашивается вечно", async () => {
    // У него нет и не будет ответа извлечения: конвейер туда не доходит.
    expect(refused(root, IMG), "ответа отсева ещё нет").toBe(false);
    await save(root, IMG, "triage", { category: "other_road_sign" }, "м", null, "отсев А");
    expect(refused(root, IMG)).toBe(true);
    expect(await stale(root, IMG, "triage", "отсев А"), "сам отсев свежий").toBe(false);
  });

  // py: test_accuracy::test_a_parking_photo_still_needs_its_extraction
  it("снимок, пропущенный отсевом, по-прежнему ждёт извлечения", async () => {
    // Послабление не должно распространиться на снимки, которые отсев ПРОПУСТИЛ.
    await save(root, IMG, "triage", { category: "parking_sign" }, "м", null, "отсев А");
    expect(refused(root, IMG)).toBe(false);
    expect(await stale(root, IMG, "extract", "извлечение А"), "разбора нет — переспросить")
      .toBe(true);
  });

  // py: test_accuracy::test_a_changed_triage_prompt_reopens_a_refusal
  it("правка промпта отсева заново открывает отказ", async () => {
    await save(root, IMG, "triage", { category: "not_a_sign" }, "м", null, "отсев А");
    expect(refused(root, IMG)).toBe(true);
    expect(await stale(root, IMG, "triage", "отсев Б"), "вопрос изменился — перепроверить")
      .toBe(true);
  });
});

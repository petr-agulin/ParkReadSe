// Живой прогон набора — на поддельном провайдере. Требование 11 шага 8.
//
// Настоящий вызов делает разработчик: он тратит ключ и квоту. Здесь проверяется
// всё остальное — что сохраняется, что пропускается и на чём прогон не спотыкается.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fingerprint } from "../src/lib/measure";
import { extractPrompt, triagePrompt } from "../src/lib/prompts";
import { ROOT, ask, expand, photoOf, providerFromEnv } from "./ask";

const PHOTO = join(ROOT, "testset", "photos", "001-p-30min.jpg");
const SIGN = JSON.parse(readFileSync(
  join(ROOT, "demo", "001-p-30min.extract.json"), "utf-8")).response;
const TRIAGE_OK = { category: "parking_sign", what_i_see: "синий P",
                    panels_below_main_sign: 1 };

const provider = { baseUrl: "https://example.invalid/v1", apiKey: "ключ",
                   visionModel: "модель" };

/** Провайдер, который отвечает по списку и считает вызовы. */
function fake(...replies: unknown[]) {
  let calls = 0;
  const fetchImpl = (async () => {
    const body = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(body) } }],
      usage: { total_tokens: 11 },
    }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

let dir = "";
const deps = (f: { fetchImpl: typeof fetch }) =>
  ({ fetchImpl: f.fetchImpl, pause: async () => {}, fixturesDir: dir,
     out: () => {}, provider });

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "parkread-ask-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("переспрос модели", () => {
  it("сохраняет обе стадии в том же виде, что и раньше", async () => {
    const f = fake(TRIAGE_OK, SIGN);
    expect(await ask([PHOTO], {}, deps(f))).toBe(0);

    const triage = JSON.parse(readFileSync(join(dir, "001-p-30min.triage.json"), "utf-8"));
    const extract = JSON.parse(readFileSync(join(dir, "001-p-30min.extract.json"), "utf-8"));
    expect(triage.image).toBe("001-p-30min.jpg");
    expect(triage.stage).toBe("triage");
    expect(triage.model).toBe("модель");
    expect(triage.response.category).toBe("parking_sign");
    expect(triage.usage.total_tokens).toBe(11);
    expect(triage.prompt_fingerprint).toBe(await fingerprint(triagePrompt()));
    expect(extract.prompt_fingerprint).toBe(await fingerprint(extractPrompt()));
    expect(extract.response.main_sign.type).toBe("parking");
  });

  it("второй раз не спрашивает: ответы на те же промпты уже есть", async () => {
    const first = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(first));
    const again = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(again));
    expect(again.calls(), "снимок обязан быть пропущен").toBe(0);
  });

  it("`--refresh` переспрашивает даже свежее", async () => {
    const first = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], {}, deps(first));
    const again = fake(TRIAGE_OK, SIGN);
    await ask([PHOTO], { refresh: true }, deps(again));
    expect(again.calls()).toBe(2);
  });

  it("отказной кадр не спрашивает извлечения и не переспрашивается вечно", async () => {
    // У него нет и не будет ответа извлечения: конвейер до неё не доходит.
    const f = fake({ category: "not_a_sign", what_i_see: "стена",
                     panels_below_main_sign: 0 });
    expect(await ask([PHOTO], {}, deps(f))).toBe(0);
    expect(f.calls(), "извлечение не запускалось").toBe(1);
    expect(existsSync(join(dir, "001-p-30min.extract.json"))).toBe(false);
    expect(existsSync(join(dir, "001-p-30min.triage.json"))).toBe(true);

    const again = fake({ category: "not_a_sign", what_i_see: "стена",
                         panels_below_main_sign: 0 });
    await ask([PHOTO], {}, deps(again));
    expect(again.calls(), "отказ уже записан — спрашивать нечего").toBe(0);
  });

  it("отбракованный ответ в фикстуру не попадает", async () => {
    // Записанный, он читался бы замером как настоящий.
    const f = fake(TRIAGE_OK, { совсем: "не то" });
    expect(await ask([PHOTO], {}, deps(f))).toBe(1);
    expect(existsSync(join(dir, "001-p-30min.extract.json"))).toBe(false);
    expect(existsSync(join(dir, "001-p-30min.triage.json")), "отсев прошёл и сохранён")
      .toBe(true);
  });

  it("сбой вызова не роняет прогон целиком", async () => {
    const dead = (async () => { throw new Error("сеть легла"); }) as unknown as typeof fetch;
    expect(await ask([PHOTO], {}, { ...deps({ fetchImpl: dead }), fetchImpl: dead }))
      .toBe(1);
    expect(existsSync(join(dir, "001-p-30min.triage.json"))).toBe(false);
  });
});

describe("аргументы команды", () => {
  it("звёздочку раскрывает сама: PowerShell этого не делает", () => {
    const found = expand(["testset/photos/001-*.jpg"]);
    expect(found).toHaveLength(1);
    expect(found[0].endsWith("001-p-30min.jpg")).toBe(true);
  });

  it("снимок читается в память, без временного файла", () => {
    const photo = photoOf(PHOTO);
    expect(photo.name).toBe("001-p-30min.jpg");
    expect(photo.data.type).toBe("image/jpeg");
    expect(photo.data.size).toBeGreaterThan(0);
  });

  it("пустое поле в `.env` — отказ, а не умолчание", () => {
    // Молча спросить не ту модель дороже, чем не спросить вовсе.
    expect(() => providerFromEnv({ VISION_API_BASE_URL: "https://x/v1" } as NodeJS.ProcessEnv))
      .toThrow(/VISION_API_KEY/);
    const good = providerFromEnv({ VISION_API_BASE_URL: "https://x/v1",
                                   VISION_API_KEY: "к", VISION_MODEL: "м" } as NodeJS.ProcessEnv);
    expect(good.visionModel).toBe("м");
  });
});

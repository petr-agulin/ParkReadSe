// Порядок стадий: отсев → извлечение → движок → полнота, и что происходит,
// когда что-нибудь из этого не срабатывает.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { analyze, answer, run } from "./pipeline";
import type { Photo, Provider } from "./vision";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const cal = new Calendar();
const moment = parseNaive("2026-03-02T12:00");

const provider: Provider = {
  baseUrl: "https://example.invalid/v1",
  apiKey: "ключ",
  triageModel: "отсев",
  visionModel: "чтение",
};

const photo: Photo = { name: "знак.jpg",
                       data: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) };

/** Настоящий разбор знака из набора — тот же, что читает питон. */
function realSign(stem: string) {
  return JSON.parse(readFileSync(`${ROOT}demo/${stem}.extract.json`, "utf-8")).response;
}

const reply = (content: unknown) => () => new Response(JSON.stringify({
  choices: [{ message: { content: typeof content === "string"
                                  ? content : JSON.stringify(content) } }],
}), { status: 200 });

const TRIAGE_OK = { category: "parking_sign", what_i_see: "синий P",
                    panels_below_main_sign: 1 };

function fakeProvider(...replies: (() => Response)[]) {
  let i = 0;
  const fetchImpl = (async () => replies[Math.min(i++, replies.length - 1)]()
                    ) as unknown as typeof fetch;
  return { fetchImpl, calls: () => i };
}

const deps = (f: { fetchImpl: typeof fetch }) =>
  ({ pause: async () => {}, fetchImpl: f.fetchImpl });

describe("конвейер", () => {
  it("отсев останавливает конвейер и второго вызова не делает", async () => {
    const f = fakeProvider(reply({ category: "not_a_sign", what_i_see: "стена",
                                   panels_below_main_sign: 0 }));
    const out = await run(photo, provider, deps(f));
    expect(out.stoppedAt).toBe("triage");
    expect(out.reason).toBe("стена");
    expect(f.calls(), "извлечение не запускалось").toBe(1);
  });

  it("метка отсева не останавливает, когда её не требуют", async () => {
    const f = fakeProvider(reply({ category: "other_road_sign", what_i_see: "знак",
                                   panels_below_main_sign: 1 }),
                           reply(realSign("001-p-30min")));
    const out = await run(photo, provider, { ...deps(f), triageEnforce: false });
    expect(out.stoppedAt).toBeNull();
    expect(out.flags).toContain("triage_said:other_road_sign");
  });

  it("прочитано слишком мало — переспрашивает ровно один раз", async () => {
    // Найдено разработчиком в браузере: `049` и `056` с первой попытки давали
    // «слишком мало», со второй разбирались целиком.
    const мало = { schema_version: 1,
                   main_sign: { type: "unknown", background_color: "blue",
                                form: "regular", legibility: { readable: true } },
                   panels: [], panel_count: 0, boundaries: { certain: true } };
    const f = fakeProvider(reply(TRIAGE_OK), reply(мало), reply(realSign("001-p-30min")));
    const out = await run(photo, provider, deps(f));
    expect(f.calls(), "отсев + две попытки чтения").toBe(3);
    expect(out.flags).toContain("extraction_retried");
    expect(out.stoppedAt).toBeNull();
  });

  it("второй ответ не берётся, если он не лучше", async () => {
    const мало = { schema_version: 1,
                   main_sign: { type: "unknown", background_color: "blue",
                                form: "regular", legibility: { readable: true } },
                   panels: [], panel_count: 0, boundaries: { certain: true } };
    const f = fakeProvider(reply(TRIAGE_OK), reply(мало), reply(мало));
    const out = await run(photo, provider, deps(f));
    expect(f.calls()).toBe(3);
    expect(out.stoppedAt).toBeNull();          // ответ есть, просто скудный
    expect(out.extraction?.data?.main_sign.type).toBe("unknown");
  });

  it("ответ не по схеме останавливает на извлечении и называет причину", async () => {
    const f = fakeProvider(reply(TRIAGE_OK), reply({ совсем: "не то" }));
    const out = await run(photo, provider, deps(f));
    expect(out.stoppedAt).toBe("extraction");
    expect(out.reason).toBeTruthy();
  });

  it("целый снимок доходит до готового ответа", async () => {
    const f = fakeProvider(reply(TRIAGE_OK), reply(realSign("005-2tim-8-18-parentes-8-15-dubbelpil")));
    const analysis = await analyze(photo, provider, moment, cal, deps(f));
    expect(analysis.assessment.category).toBe("full");

    const body = answer(analysis, moment, cal);
    expect(body.has_answer).toBe(true);
    expect(body.contract).toBeGreaterThan(0);
    expect(body.regimes.length).toBeGreaterThan(0);
    expect(body.regimes[0].periods[0].headline).toBeTruthy();
    // Стадии записаны: отсев виден в ответе, как и раньше.
    expect(body.triage?.category).toBe("parking_sign");
  });

  it("остановка на отсеве — тот же ответ, только без вывода", async () => {
    const f = fakeProvider(reply({ category: "not_a_sign", what_i_see: "кот",
                                   panels_below_main_sign: 0 }));
    const body = answer(await analyze(photo, provider, moment, cal, deps(f)), moment, cal);
    expect(body.has_answer).toBe(false);
    expect(body.completeness.category).toBe("not_a_parking_sign");
    expect(body.regimes).toEqual([]);
    // Форма ответа не меняется: отказ — тот же ответ без вывода.
    expect(body).toHaveProperty("what_we_saw");
    expect(body).toHaveProperty("uncertainties");
  });
});

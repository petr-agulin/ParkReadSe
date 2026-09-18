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
  visionModel: "чтение",
};

const photo: Photo = { name: "знак.jpg",
                       data: new Blob([new Uint8Array([1])], { type: "image/jpeg" }) };

/** Настоящий снимок набора: размер читается из его же байтов, как в браузере. */
function realPhoto(file: string): Photo {
  const bytes = new Uint8Array(readFileSync(`${ROOT}testset/photos/${file}`));
  return { name: file,
           data: new Blob([bytes],
                          { type: file.endsWith(".png") ? "image/png" : "image/jpeg" }) };
}

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

  // Найдено сверкой `AGENT_SPEC.md` с кодом: площадь кадра до оценки не доходила,
  // потому что конвейер подставлял `null`. Снимок `061` — тот самый случай из шапки
  // `photo.ts`: 82×179, а модель вернула полсотни символов связного шведского текста
  // и ни одной пометки о помехах.
  it("площадь кадра доходит до оценки полноты", async () => {
    const sign = realSign("061-lastplats-langt-avstand");
    const assess = (p: Photo) => analyze(p, provider, moment, cal,
      deps(fakeProvider(reply(TRIAGE_OK), reply(sign))));

    const onBig = await assess(realPhoto("003-p-2tim.jpg"));
    const onTiny = await assess(realPhoto("061-lastplats-langt-avstand.png"));

    expect(onBig.assessment.signals.text_fits_the_pixels,
           "крупный кадр этот текст вмещает").toBe(1);
    expect(onTiny.assessment.signals.text_fits_the_pixels,
           "тесный кадр его не вмещает — иначе размер снимка до оценки не дошёл")
      .toBeLessThan(1);
    expect(onTiny.assessment.reasons, "и причина обязана дойти до человека")
      .toContain("text_exceeds_the_pixels");
  });

  it("метка отсева не останавливает, когда её не требуют", async () => {
    const f = fakeProvider(reply({ category: "other_road_sign", what_i_see: "знак",
                                   panels_below_main_sign: 1 }),
                           reply(realSign("001-p-30min")));
    const out = await run(photo, provider, { ...deps(f), triageEnforce: false });
    expect(out.stoppedAt).toBeNull();
    expect(out.flags).toContain("triage_said:other_road_sign");
  });

  // py: test_api::test_a_reading_that_says_too_little_is_asked_once_more
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
    expect(out.extraction?.data?.main_sign.type, "взят лучший ответ").toBe("parking");
  });

  // py: test_api::test_a_good_reading_is_never_asked_twice
  it("хороший разбор не переспрашивается", () => {
    // Переспрос стоит вызова, и тратить его на разбор, которым продукт доволен,
    // незачем.
    const f = fakeProvider(reply(TRIAGE_OK), reply(realSign("001-p-30min")),
                           reply({ совсем: "не то" }));
    return run(photo, provider, deps(f)).then((out) => {
      expect(f.calls(), "отсев + одно чтение").toBe(2);
      expect(out.flags).not.toContain("extraction_retried");
    });
  });

  // py: test_api::test_the_retry_happens_once_and_not_in_a_loop
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

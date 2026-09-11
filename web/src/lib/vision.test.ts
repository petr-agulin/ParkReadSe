// Разговор с провайдером: повторы, отказы и ключ.
//
// Сверкой это не закрывается — в эталонах лежат ОТВЕТЫ модели, а не её вызовы,
// — поэтому каждый исход проверяется здесь, на поддельном `fetch`.

import { describe, expect, it } from "vitest";

import { RETRY_PAUSE_MS, VisionCallFailed, call, classifyImage,
         type Photo, type Provider } from "./vision";

const provider: Provider = {
  baseUrl: "https://example.invalid/v1/",
  apiKey: "ключ-пользователя",
  triageModel: "модель-отсева",
  visionModel: "модель-чтения",
};

const photo: Photo = { name: "знак.jpg", data: new Blob([new Uint8Array([1, 2, 3])],
                                                        { type: "image/jpeg" }) };

/** Поддельный провайдер: отвечает по списку, считает вызовы и помнит запросы.
 *
 *  Ответы хранятся ЗАМЫКАНИЯМИ, а не готовыми объектами: тело `Response` читается
 *  один раз, и повторная выдача той же самой вещи ломалась бы на втором повторе —
 *  причём в поддельном провайдере, а не в проверяемом коде. */
function fake(...replies: (() => Response | Error)[]) {
  const seen: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const reply = replies[Math.min(i, replies.length - 1)]();
    i += 1;
    if (reply instanceof Error) throw reply;
    return reply;
  }) as unknown as typeof fetch;
  return { fetchImpl, seen, calls: () => i };
}

const answer = (body: unknown, status = 200) =>
  () => new Response(JSON.stringify(body), { status });

const good = () => answer({
  choices: [{ message: { content: '{"category":"parking_sign",'
                                + '"what_i_see":"синий P","panels_below_main_sign":1}' } }],
  usage: { total_tokens: 10 },
});

describe("вызов провайдера", () => {
  it("ключ уходит в заголовок и больше никуда", async () => {
    const f = fake(good());
    await call(provider, "модель", "вопрос", photo, async () => {}, f.fetchImpl);

    const { init, url } = f.seen[0];
    expect((init.headers as Record<string, string>).Authorization)
      .toBe("Bearer ключ-пользователя");
    // Ни в адресе, ни в теле запроса ключа быть не должно.
    expect(url).not.toContain("ключ-пользователя");
    expect(String(init.body)).not.toContain("ключ-пользователя");
    expect(url).toBe("https://example.invalid/v1/chat/completions");
  });

  it("занятый провайдер повторяется, а неверный запрос — нет", async () => {
    const busy = fake(answer({}, 503), answer({}, 503), good());
    const paused: number[] = [];
    await call(provider, "м", "в", photo, async (ms) => { paused.push(ms); }, busy.fetchImpl);
    expect(busy.calls()).toBe(3);
    expect(paused).toEqual([RETRY_PAUSE_MS[0], RETRY_PAUSE_MS[1]]);

    const wrong = fake(answer({ error: "bad key" }, 401));
    await expect(call(provider, "м", "в", photo, async () => {}, wrong.fetchImpl))
      .rejects.toThrow(VisionCallFailed);
    expect(wrong.calls(), "401 повторять нельзя: это вторая трата квоты").toBe(1);
  });

  it("обрыв связи — тоже повод повторить, а не отказ", async () => {
    const flaky = fake(() => new Error("network down"), good());
    const res = await call(provider, "м", "в", photo, async () => {}, flaky.fetchImpl);
    expect(flaky.calls()).toBe(2);
    expect(res.text).toContain("parking_sign");
  });

  it("сдавшись, говорит почему и сколько раз пробовал", async () => {
    const dead = fake(answer({ error: "busy" }, 503));
    await expect(call(provider, "м", "в", photo, async () => {}, dead.fetchImpl))
      .rejects.toThrow(/HTTP 503.*попыток: 4/s);
    expect(dead.calls()).toBe(RETRY_PAUSE_MS.length + 1);
  });

  it("неожиданная форма ответа — отказ, а не пустой экран", async () => {
    const odd = fake(answer({ choices: [] }));
    await expect(call(provider, "м", "в", photo, async () => {}, odd.fetchImpl))
      .rejects.toThrow(/неожиданная форма/);
  });

  it("без ключа и без адреса до сети дело не доходит", async () => {
    const f = fake(good());
    await expect(call({ ...provider, apiKey: "" }, "м", "в", photo, async () => {}, f.fetchImpl))
      .rejects.toThrow(/Ключ не введён/);
    await expect(call({ ...provider, baseUrl: "" }, "м", "в", photo, async () => {}, f.fetchImpl))
      .rejects.toThrow(/Адрес провайдера/);
    expect(f.calls()).toBe(0);
  });

  it("ответ отсева проходит через валидатор, а не берётся на веру", async () => {
    // Лишнее поле чинится, а метка остаётся: строгость там, где есть последствие.
    const messy = fake(answer({
      choices: [{ message: { content: '{"category":"parking_sign","what_i_see":"P",'
                                    + '"panels_below_main_sign":"2","лишнее":1}' } }],
    }));
    const out = await classifyImage(photo, provider,
                                    { pause: async () => {}, fetchImpl: messy.fetchImpl });
    expect(out.category).toBe("parking_sign");
    expect(out.panelsBelowMainSign).toBe(2);       // строка «2» починена в число
    expect(out.validation?.repairs.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";

import { EMPTY_SETTINGS, canAnswerHere, forget, load, missing, save,
         type Store } from "./settings";

/** Хранилище в памяти — то же, что у браузера, только видимое тесту. */
function store(): Store & { seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return {
    seen,
    getItem: (k) => seen.get(k) ?? null,
    setItem: (k, v) => { seen.set(k, v); },
    removeItem: (k) => { seen.delete(k); },
  };
}

const provider = { baseUrl: "https://provider.invalid/v1", visionModel: "зоркая" };

describe("ключ пользователя", () => {
  it("без галочки не сохраняется нигде", () => {
    const s = store();
    save(s, { apiKey: "секрет", remember: false, provider });
    expect([...s.seen.values()].join("|")).not.toContain("секрет");
    expect(load(s).apiKey).toBe("");
  });

  it("с галочкой запоминается и возвращается при следующем открытии", () => {
    const s = store();
    save(s, { apiKey: "секрет", remember: true, provider });
    const again = load(s);
    expect(again.apiKey).toBe("секрет");
    expect(again.remember).toBe(true);
    expect(again.provider).toEqual(provider);
  });

  it("снятая галочка стирает сохранённое сразу, а не когда-нибудь", () => {
    const s = store();
    save(s, { apiKey: "секрет", remember: true, provider });
    save(s, { apiKey: "секрет", remember: false, provider });
    expect(load(s).apiKey).toBe("");
  });

  it("«забыть» уносит ключ, но не адрес провайдера", () => {
    const s = store();
    save(s, { apiKey: "секрет", remember: true, provider });
    const after = forget(s);
    expect(after.apiKey).toBe("");
    expect(after.provider).toEqual(provider);       // вводить заново незачем
  });

  it("хранилища может не быть вовсе — продукт от этого не ломается", () => {
    // Приватная вкладка, запрет сайту, старый телефон: тогда просто не помним.
    expect(() => save(null, { apiKey: "секрет", remember: true, provider })).not.toThrow();
    expect(load(null)).toEqual(EMPTY_SETTINGS);
    expect(forget(null).apiKey).toBe("");
  });

  it("испорченная запись читается как её отсутствие", () => {
    const s = store();
    s.setItem("parkread.provider", "{это не json");
    expect(load(s).provider.baseUrl).toBe("");
  });
});

describe("готовность отвечать в браузере", () => {
  it("нужны ключ, адрес и одна модель — второй не спрашивается", () => {
    expect(canAnswerHere({ apiKey: "к", remember: false, provider })).toBe(true);
    expect(Object.keys(provider).sort()).toEqual(["baseUrl", "visionModel"]);
    expect(canAnswerHere({ apiKey: "", remember: false, provider })).toBe(false);
    expect(canAnswerHere({ apiKey: "к", remember: false,
                           provider: { ...provider, visionModel: "" } })).toBe(false);
  });

  it("чего не хватает — говорится словами, а не «ошибка»", () => {
    expect(missing(EMPTY_SETTINGS))
      .toEqual(["your API key", "the provider address", "the model name"]);
    expect(missing({ apiKey: "к", remember: false, provider })).toEqual([]);
  });
});

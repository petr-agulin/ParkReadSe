import { describe, expect, it } from "vitest";

import { EMPTY_SETTINGS, MASK, NOT_SET, canAnswerHere, canForget, forget, load,
         missing, readiness, rememberToggle, row, save, type Store } from "./settings";

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

describe("строка настроек", () => {
  it("пустая говорит «ещё не задано» и предлагает добавить", () => {
    expect(row("")).toEqual({ shown: NOT_SET, action: "Add", filled: false });
    expect(row("   ")).toEqual({ shown: NOT_SET, action: "Add", filled: false });
  });

  it("заполненная показывает значение и предлагает правку", () => {
    expect(row(provider.baseUrl))
      .toEqual({ shown: provider.baseUrl, action: "Edit", filled: true });
  });

  it("ключ показывается маской, и маска не выдаёт его длины", () => {
    // Число точек по длине ключа сообщало бы размер платного средства всякому,
    // кто заглянет через плечо или увидит скриншот.
    const short = row("abc", { secret: true });
    const long = row("a".repeat(120), { secret: true });
    expect(short.shown).toBe(MASK);
    expect(long.shown).toBe(MASK);
    expect(short.shown).toBe(long.shown);
    expect(MASK).not.toContain("abc");
  });
});

describe("переключатель «запомнить» (решение 146)", () => {
  it("при пустом поле показан включённым, но нажать нельзя", () => {
    // Он показывает умолчание. Выбирать пока нечего: ключа нет.
    expect(rememberToggle("")).toEqual({ on: true, disabled: true });
    expect(rememberToggle("  ")).toEqual({ on: true, disabled: true });
  });

  it("с первым введённым знаком оживает, оставаясь включённым", () => {
    expect(rememberToggle("к")).toEqual({ on: true, disabled: false });
  });

  it("выключить можно ДО сохранения — в этом и смысл", () => {
    expect(rememberToggle("ключ", false)).toEqual({ on: false, disabled: false });
    expect(rememberToggle("ключ", true)).toEqual({ on: true, disabled: false });
  });
});

describe("видно ли, что приложение настроено", () => {
  it("пустые настройки названы и чипом, и словами", () => {
    // Уйти из настроек, не заметив, что читать всё ещё нечем, человек не должен:
    // цена этой невнимательности платится у знака, а не здесь.
    const r = readiness(EMPTY_SETTINGS);
    expect(r.ready).toBe(false);
    expect(r.chip).toBe("Set up");
    expect(r.missing).toEqual(["your API key", "the provider address", "the model name"]);
  });

  it("полные — «All set», и перечислять нечего", () => {
    const r = readiness({ apiKey: "к", remember: true, provider });
    expect(r).toEqual({ ready: true, chip: "All set", missing: [] });
  });

  it("половина настроек — это всё ещё «не настроено»", () => {
    expect(readiness({ apiKey: "к", remember: true,
                       provider: { ...provider, baseUrl: "" } }).ready).toBe(false);
  });
});

describe("«забыть ключ»", () => {
  it("показывается, только когда есть что забывать", () => {
    expect(canForget(EMPTY_SETTINGS)).toBe(false);
    expect(canForget({ apiKey: "  ", remember: false, provider })).toBe(false);
    expect(canForget({ apiKey: "к", remember: false, provider })).toBe(true);
  });
});

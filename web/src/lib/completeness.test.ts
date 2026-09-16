// Полнота разбора и правило асимметрии. Перенесено из `tests/test_completeness.py`
// целиком (шаг 8): до этого модуль держался только сверкой с питоном.
//
// Ключевой сценарий — **один и тот же снимок с искусственно выбитой панелью даёт
// разные категории**. И главное правило частичного разбора: сузить можно,
// расширить нельзя.

import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { FULL, INSUFFICIENT, MAY_BE_INCOMPLETE, MAY_PROHIBIT, NOT_A_PARKING_SIGN,
         PARTIAL, PLACEMENT_KEYS, RULE_KEYS, applyAsymmetry, grade,
         hasAnswer } from "./completeness";
import { ALLOWED, UNCERTAIN, evaluateParkingRules } from "./engine";
import { toJson } from "./present";
import { recognise } from "./reference";
import { SIGN_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";

const CAL = new Calendar();
const NOW = parseNaive("2026-03-02T12:00");      // обычный понедельник

/** P + `Avgift 8-18` + `2 tim` + жёлтая табличка запрета. Три панели, все прочитаны. */
function sign(): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: [
      { index: 1, kind: "sign_plate", lines: ["Avgift", "8-18"],
        background_color: "blue", legibility: { readable: true },
        parsed: { fee: true, time_windows: [
          { from: "08:00", to: "18:00", day_class: "weekday" }] } },
      { index: 2, kind: "sign_plate", lines: ["2 tim"],
        background_color: "blue", legibility: { readable: true },
        parsed: { duration_limit: { amount: 2, unit: "hours" } } },
      { index: 3, kind: "sign_plate", lines: ["Torsd 0-6"],
        background_color: "yellow", legibility: { readable: true },
        parsed: { prohibition: true, time_windows: [
          { from: "00:00", to: "06:00", day_class: "named_weekday",
            named_weekday: "thursday" }] } },
    ],
    panel_count: 3,
    boundaries: { certain: true },
  };
}

/** Выбить панель: текст и разобранные поля стёрты, цвет остался. Именно так
 *  выглядит табличка, залепленная грязью. */
function blank(s: SignDoc, index: number, color: string): SignDoc {
  const out: SignDoc = structuredClone(s);
  const p = out.panels!.find((x) => x.index === index)!;
  p.lines = [];
  p.parsed = {};
  p.background_color = color;
  p.legibility = { readable: false, obstructions: ["dirt"] } as Panel["legibility"];
  return out;
}

/** `P` со стрелкой и больше ничем — по разбору неотличим от указателя к стоянке. */
function pointer(): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: "parking", background_color: "blue", form: "regular",
                 legibility: { readable: true } },
    panels: [{ index: 1, kind: "sign_plate", lines: [], background_color: "blue",
               legibility: { readable: true }, parsed: { arrow: "right" } }],
    panel_count: 1,
    boundaries: { certain: true },
  };
}

/** Столько же текста, сколько на `061`: шестьдесят с лишним печатных знаков. */
function wordy(): SignDoc {
  const s = sign();
  s.panels![0].lines = ["Avgift", "7-19", "(11-17)", "Taxa 3"];
  s.panels![1].lines = ["Övrig tid", "3 tim", "P-skiva", "24 h max"];
  s.panels![2].lines = ["Får ej ställas", "på i sidled"];
  return s;
}

const states = (ev: ReturnType<typeof evaluateParkingRules>) =>
  ev.regimes[0].periods.map((p) => p.state);

describe("четыре категории", () => {
  // py: test_completeness::test_full_parse
  it("полный разбор", () => {
    const a = grade(sign());
    expect(a.category).toBe(FULL);
    expect(a.unreadPanels).toEqual([]);
    expect(a.confidence).toBeGreaterThan(0.9);
  });

  // py: test_completeness::test_not_a_parking_sign_comes_from_triage
  it("«не знак стоянки» приходит от отсева", () => {
    const a = grade(null, { triageCategory: "not_a_sign" });
    expect(a.category).toBe(NOT_A_PARKING_SIGN);
    expect(hasAnswer(a)).toBe(false);
  });

  // py: test_completeness::test_schema_invalid_is_insufficient
  it("разбор не по схеме — недостаточно", () => {
    const a = grade(null, { schemaValid: false });
    expect(a.category).toBe(INSUFFICIENT);
    expect(a.confidence).toBe(0);
  });

  // py: test_completeness::test_one_of_three_unread_is_partial
  it("одна из трёх табличек не прочитана — частичный", () => {
    const a = grade(blank(sign(), 2, "blue"));
    expect(a.category).toBe(PARTIAL);
    expect(a.unreadPanels).toEqual([2]);
  });

  // py: test_completeness::test_most_panels_unread_is_insufficient
  it("не прочитано большинство табличек — недостаточно", () => {
    expect(grade(blank(blank(sign(), 1, "blue"), 2, "blue")).category).toBe(INSUFFICIENT);
  });

  // py: test_completeness::test_panel_count_disagreement_lowers_confidence_but_keeps_the_answer
  it("расхождение счёта табличек роняет уверенность, но ответ оставляет", () => {
    // Сигнал, а не приговор: отнимать ответ целиком — самая дорогая ошибка
    // продукта, человек стоит перед знаком и не получает ничего.
    const a = grade(sign(), { flags: ["panel_count_disagreement:4!=3"] });
    expect(a.category, "ответ остаётся").not.toBe(INSUFFICIENT);
    expect(a.reasons, "но причина названа").toContain("panel_count_disagreement");
    expect(a.confidence, "и уверенность ниже").toBeLessThan(grade(sign()).confidence);
  });

  // py: test_completeness::test_unknown_main_sign_is_insufficient
  it("неопознанный основной знак — недостаточно", () => {
    const s = sign();
    s.main_sign.type = "unknown";
    expect(grade(s).category).toBe(INSUFFICIENT);
  });

  // py: test_completeness::test_same_photo_different_categories
  it("одна и та же фотография даёт разные категории", () => {
    const base = sign();
    expect(grade(base).category).toBe(FULL);
    expect(grade(blank(base, 2, "blue")).category).toBe(PARTIAL);
    expect(grade(blank(blank(base, 1, "blue"), 2, "blue")).category).toBe(INSUFFICIENT);
  });
});

describe("цвет непрочитанной таблички", () => {
  // py: test_completeness::test_yellow_unread_panel_may_prohibit
  it("жёлтая может оказаться запретом", () => {
    const a = grade(blank(sign(), 3, "yellow"));
    expect(a.category).toBe(PARTIAL);
    expect(a.mayHideProhibition).toBe(true);
  });

  // py: test_completeness::test_blue_unread_panel_does_not_imply_prohibition
  it("синяя запрета не подразумевает", () => {
    const a = grade(blank(sign(), 2, "blue"));
    expect(a.category).toBe(PARTIAL);
    expect(a.mayHideProhibition).toBe(false);
  });

  // py: test_completeness::test_unreadable_colour_is_treated_as_worst_case
  it("нечитаемый цвет — худший случай", () => {
    expect(grade(blank(sign(), 2, "unreadable")).mayHideProhibition).toBe(true);
  });
});

describe("правило асимметрии", () => {
  // py: test_completeness::test_full_parse_is_not_narrowed
  it("полный разбор не сужается", () => {
    const s = sign();
    const ev = evaluateParkingRules(s, NOW, CAL);
    expect(states(applyAsymmetry(ev, grade(s)))).toEqual(states(ev));
  });

  // py: test_completeness::test_yellow_unread_forbids_presenting_any_period_as_allowed
  it("жёлтая непрочитанная не даёт подать ни один период разрешающим", () => {
    const s = blank(sign(), 3, "yellow");
    const ev = evaluateParkingRules(s, NOW, CAL);
    expect(states(ev), "до правила разрешение есть").toContain(ALLOWED);
    const out = applyAsymmetry(ev, grade(s));
    expect(states(out)).not.toContain(ALLOWED);
    for (const p of out.regimes[0].periods.filter((x) => x.state === UNCERTAIN)) {
      expect(p.note).toBe(MAY_PROHIBIT);
    }
    expect(out.uncertainties).toContain(MAY_PROHIBIT);
  });

  // py: test_completeness::test_blue_unread_keeps_answer_but_marks_empty_periods
  it("синяя непрочитанная оставляет ответ, но метит пустые периоды", () => {
    // «В остальное время ограничений нет» при неполном разборе — утверждение,
    // основанное на отсутствии данных. Такой период помечается.
    const s = blank(sign(), 2, "blue");
    const out = applyAsymmetry(evaluateParkingRules(s, NOW, CAL), grade(s));
    const allowed = out.regimes[0].periods.filter((p) => p.state === ALLOWED);
    expect(allowed.length, "ответ сохраняется").toBeGreaterThan(0);
    const empty = allowed.filter((p) => !p.conditions.length);
    expect(empty.length).toBeGreaterThan(0);
    for (const p of empty) expect(p.note).toBe(MAY_BE_INCOMPLETE);
  });

  // py: test_completeness::test_asymmetry_never_widens
  it("асимметрия никогда не расширяет", () => {
    // Правило может только убрать разрешающие периоды, добавить — ни при каких данных.
    for (const color of ["yellow", "blue", "white", "unreadable"]) {
      const s = blank(sign(), 2, color);
      const ev = evaluateParkingRules(s, NOW, CAL);
      const out = applyAsymmetry(ev, grade(s));
      const before = states(ev).filter((x) => x === ALLOWED).length;
      const after = states(out).filter((x) => x === ALLOWED).length;
      expect(after, color).toBeLessThanOrEqual(before);
    }
  });
});

describe("уверенность", () => {
  // py: test_completeness::test_confidence_falls_as_data_is_lost
  it("падает по мере потери данных", () => {
    const full = grade(sign()).confidence;
    const partial = grade(blank(sign(), 2, "blue")).confidence;
    const disagreement = grade(sign(), { flags: ["panel_count_disagreement:4!=3"] }).confidence;
    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(disagreement);
  });

  // py: test_completeness::test_confidence_is_a_number_inside_the_category_not_instead_of_it
  it("число работает внутри категории, а не вместо неё", () => {
    // Высокая уверенность модели не превращает частичный разбор в полный.
    const s = blank(sign(), 2, "blue");
    s.model_confidence = 1.0;
    expect(grade(s).category).toBe(PARTIAL);
  });

  // py: test_completeness::test_an_uninterpreted_plate_is_not_a_full_reading
  it("неистолкованная табличка — не полный разбор", () => {
    // Прочитать текст и понять его — разные вещи: `Beskickningsfordon` разбирался
    // как полный с уверенностью 98%.
    const a = grade(sign(), { flags: ["uninterpreted_panels:1"] });
    expect(a.category).toBe(PARTIAL);
    expect(a.confidence).toBeLessThan(grade(sign()).confidence);
    expect(a.uninterpretedPlates).toEqual([1]);
    expect(a.reasons.some((r) => r.startsWith("uninterpreted_plates:"))).toBe(true);
  });

  // py: test_completeness::test_only_rule_bearing_plates_count_as_uninterpreted
  it("неистолкованными считаются только таблички с правилами", () => {
    // Табло оператора не истолковано по определению и уверенность ронять не должно.
    const s = sign();
    s.panels!.push({ index: 9, kind: "info_board", lines: ["EasyPark"],
                     background_color: "white", legibility: { readable: true }, parsed: {} });
    const a = grade(s, { flags: ["uninterpreted_panels:9"] });
    expect(a.uninterpretedPlates).toEqual([]);
    expect(a.category !== PARTIAL || a.reasons.length > 0).toBe(true);
  });
});

describe("подтверждение основного знака табличками", () => {
  // Снимок `050` — частный указатель со стрелкой к стоянке на другой улице —
  // разобран как `parking` с уверенностью 0.998, и продукт ответил «стоянка
  // разрешена здесь». Ни один сигнал не сработал: противоречия не было.

  // py: test_completeness::test_a_sign_without_a_single_rule_plate_is_not_a_full_parse
  it("знак без единой таблички с правилом — не полный разбор", () => {
    const a = grade(pointer());
    expect(a.category).toBe(PARTIAL);
    expect(a.reasons).toContain("main_sign_uncorroborated");
    expect(a.confidence).toBeLessThan(0.9);
  });

  // py: test_completeness::test_no_plates_at_all_still_gets_an_answer
  it("без табличек вовсе ответ всё равно есть", () => {
    // Молчание стоит пользователю дороже оговорки.
    const s = pointer();
    s.panels = [];
    s.panel_count = 0;
    const a = grade(s);
    expect(a.category).toBe(PARTIAL);
    expect(hasAnswer(a), "ответ должен остаться").toBe(true);
  });

  // py: test_completeness::test_one_rule_plate_is_enough_to_corroborate
  it("одной таблички с правилом достаточно", () => {
    // Указатель к стоянке платы за проезд мимо себя не требует.
    const s = pointer();
    s.panels![0].parsed = { arrow: "right", fee: true };
    const a = grade(s);
    expect(a.category).toBe(FULL);
    expect(a.reasons).not.toContain("main_sign_uncorroborated");
  });

  // py: test_completeness::test_placement_fields_alone_never_corroborate
  it("поля положения сами по себе не подтверждают", () => {
    // Держит границу списка: «любое разобранное поле» подтверждало бы само себя.
    const cases: [string, unknown][] = [
      ["arrow", "right"], ["placement", "as_shown"],
      ["stretch_metres", { from: 0, to: 15 }], ["place_count", 4], ["pictogram", "parking"],
    ];
    for (const [field, value] of cases) {
      const s = pointer();
      s.panels![0].parsed = { [field]: value } as Panel["parsed"];
      expect(grade(s).reasons, field).toContain("main_sign_uncorroborated");
    }
  });

  // py: test_completeness::test_every_rule_key_is_a_field_the_schema_knows
  it("каждое поле в списках — поле, которое знает схема", () => {
    // Опечатка в списке молча сделала бы сигнал слепым к целому виду табличек.
    const known = new Set(Object.keys((SIGN_SCHEMA as Record<string, any>).$defs.parsed.properties));
    expect([...RULE_KEYS].filter((k) => !known.has(k))).toEqual([]);
    expect([...PLACEMENT_KEYS].filter((k) => !known.has(k))).toEqual([]);
    expect([...RULE_KEYS].filter((k) => PLACEMENT_KEYS.has(k))).toEqual([]);
  });

  // py: test_completeness::test_the_caption_does_not_claim_a_plate_went_unread
  it("подпись не утверждает, что табличка не прочитана, когда её нет", () => {
    // Сказать про знак без табличек «часть знака не прочитана» — неправда: человек
    // пойдёт искать на столбе то, чего там нет.
    const caption = (doc: SignDoc) => {
      const a = grade(doc);
      const ev = evaluateParkingRules(doc, NOW, CAL);
      return String(toJson({ doc, recognised: recognise(doc), assessment: a,
                             evaluation: applyAsymmetry(ev, a) }, NOW, CAL)
        .completeness.category_text);
    };
    const uncorroborated = caption(pointer());
    expect(uncorroborated).not.toContain("not read");
    expect(uncorroborated.toLowerCase()).toContain("no plate");
    // А когда табличка и правда не прочитана — подпись обычная.
    expect(caption(blank(sign(), 2, "blue"))).toContain("not read");
  });
});

describe("хватает ли пикселей на прочитанный текст", () => {
  // На снимке 82×179 модель вернула четыре таблички связного шведского текста и
  // ни одной пометки о помехах. Разрешение продукт меряет сам.

  // py: test_completeness::test_more_text_than_the_pixels_can_carry_is_not_a_full_parse
  it("текста больше, чем выдержат пиксели, — не полный разбор", () => {
    const a = grade(wordy(), { imagePixels: 82 * 179 });
    expect(a.category).toBe(PARTIAL);
    expect(a.reasons).toContain("text_exceeds_the_pixels");
    expect(a.signals.text_fits_the_pixels).toBeLessThan(0.5);
  });

  // py: test_completeness::test_a_large_photo_is_not_punished_for_its_text
  it("крупный снимок за свой текст не наказывается", () => {
    const a = grade(wordy(), { imagePixels: 1200 * 1600 });
    expect(a.category).toBe(FULL);
    expect(a.signals.text_fits_the_pixels).toBe(1);
  });

  // py: test_completeness::test_a_small_photo_without_text_is_not_punished
  it("мелкий снимок без текста не наказывается", () => {
    // `032` — 103×188 и две таблички без единой буквы. Мерить надо ЗАЯВЛЕННЫЙ
    // текст, а не размер снимка: иначе «маленький снимок — плохой снимок».
    const s = sign();
    for (const p of s.panels!) p.lines = [];
    const a = grade(s, { imagePixels: 103 * 188 });
    expect(a.signals.text_fits_the_pixels).toBe(1);
    expect(a.reasons).not.toContain("text_exceeds_the_pixels");
  });

  // py: test_completeness::test_an_unknown_image_size_never_punishes_the_parse
  it("неизвестный размер никогда не наказывает", () => {
    const a = grade(sign(), { imagePixels: null });
    expect(a.signals.text_fits_the_pixels).toBe(1);
    expect(a.category).toBe(FULL);
  });

  // py: test_completeness::test_the_signal_is_graded_not_a_cliff
  it("сигнал падает плавно, а не обрывом", () => {
    const fits = (px: number) => grade(wordy(), { imagePixels: px }).signals.text_fits_the_pixels;
    const large = fits(1200 * 1600);
    const medium = fits(125 * 320);
    const small = fits(82 * 179);
    expect(large).toBe(1);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });
});

// Замер умеет находить ошибку. Перенесено из `tests/test_accuracy.py` (шаг 8).
//
// Инструмент, который на любом входе показывает 100%, хуже отсутствия инструмента:
// он создаёт уверенность и не даёт информации. Поэтому здесь каждая проверка
// портит эталон известным образом и требует, чтобы замер это увидел — и чтобы
// НЕ увидел того, что на ответ не влияет.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compare, coveredDays, deadSignals, emptyReport, triageReport, verdictDifferences,
         type Report, type Verdict } from "./measure";
import type { SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const expected = (name: string): SignDoc =>
  JSON.parse(readFileSync(`${ROOT}testset/expected/${name}.json`, "utf-8"));

const share = (rep: Report, field: string) => {
  const f = rep.fields.get(field);
  expect(f, `поле ${field} не мерилось`).toBeDefined();
  return f!.total ? f!.hits / f!.total : 0;
};

function measure(e: SignDoc, a: SignDoc, label: string): Report {
  const rep = emptyReport();
  compare(e, a, label, rep);
  return rep;
}

const BASE = "005-2tim-8-18-parentes-8-15-dubbelpil";

describe("сравнение разбора с эталоном", () => {
  // py: test_accuracy::test_identical_gives_full_marks
  it("совпадающий разбор — полные баллы и ни одной ошибки", () => {
    const e = expected(BASE);
    const rep = measure(e, structuredClone(e), "005");
    for (const f of rep.fields.values()) expect(f.hits, f.name).toBe(f.total);
    expect(rep.mistakes).toEqual([]);
  });

  // py: test_accuracy::test_detects_merged_panels
  it("находит слитые таблички", () => {
    // Ошибка со снимка `013`: две таблички слиты в одну.
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels = [a.panels![0]];
    a.panel_count = 1;
    const rep = measure(e, a, "005");
    expect(share(rep, "panel_count")).toBe(0);
    expect(share(rep, "panels.content")).toBe(0);
    expect(rep.mistakes.length).toBeGreaterThan(0);
  });

  // py: test_accuracy::test_detects_wrong_order_even_when_content_is_right
  it("порядок меряется отдельно: те же таблички в другом порядке — другое правило", () => {
    const e = expected("010-forhyrda-platser-tva-pilar");
    const a = structuredClone(e);
    const p = a.panels!;
    a.panels = [p[2], p[1], p[0], p[3]].map((x, i) => ({ ...x, index: i + 1 }));
    const rep = measure(e, a, "010");
    expect(share(rep, "panels.content"), "содержание то же").toBe(1);
    expect(share(rep, "panels.order"), "а порядок другой").toBe(0);
  });

  // py: test_accuracy::test_detects_misread_text
  it("находит неверно прочитанный текст", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].lines = ["2 tim", "8-18", "8-15"];     // потеряны скобки
    expect(share(measure(e, a, "005"), "panel.lines")).toBeLessThan(1);
  });

  // py: test_accuracy::test_detects_non_rule_panel_taken_for_a_plate
  it("находит табло, принятое за табличку с правилом", () => {
    // Снимки `002`, `004`, `007`: подмена вида панели добавляет указание, которого нет.
    const e = expected("002-avgift-forbud-utanfor-markerad-plats");
    const a = structuredClone(e);
    a.panels![3].kind = "sign_plate";
    const rep = measure(e, a, "002");
    expect(share(rep, "panel.rule_bearing")).toBeLessThan(1);
    expect(rep.mistakes.some((m) => m.includes("rule_bearing") || m.includes("помечена")))
      .toBe(true);
  });

  // py: test_accuracy::test_detects_rule_plate_taken_for_an_operator_plate
  it("находит табличку с правилом, помеченную табличкой оператора", () => {
    // Обратная ошибка и более дорогая: указание молча выпадает из разбора.
    const e = expected("004-endast-besokande-pingstkyrkan");
    const a = structuredClone(e);
    a.panels![0].kind = "operator_plate";
    const rep = measure(e, a, "004");
    expect(share(rep, "panel.rule_bearing")).toBeLessThan(1);
    expect(share(rep, "panels.content"), "указание выпало из состава правил").toBe(0);
  });

  // py: test_accuracy::test_confusion_inside_the_non_rule_pair_is_not_an_error
  it("путаница внутри пары без правил ошибкой не считается", () => {
    // Табличка оператора против табла — различие без последствия: обе вне движка.
    const e = expected("004-endast-besokande-pingstkyrkan");
    const a = structuredClone(e);
    a.panels![1].kind = "info_board";
    expect(share(measure(e, a, "004"), "panel.rule_bearing")).toBe(1);
  });

  // py: test_accuracy::test_line_wrapping_inside_one_plate_is_not_an_error
  it("перенос строк внутри одной таблички ошибкой не считается", () => {
    const e = expected("023-avgift-4tim-laddande-elbilar");
    const a = structuredClone(e);
    a.panels![2].lines = ["Endast", "laddande", "elbilar"];
    const rep = measure(e, a, "023");
    expect(share(rep, "panel.lines")).toBe(1);
    expect(share(rep, "panels.content")).toBe(1);
  });

  // py: test_accuracy::test_but_moving_words_between_plates_is_an_error
  it("а перенос слов между табличками — ошибка", () => {
    // Граница МЕЖДУ табличками строгая: те же слова по разным табличкам — другое правило.
    const e = expected("023-avgift-4tim-laddande-elbilar");
    const a = structuredClone(e);
    a.panels![1].lines = ["4 tim", "Endast laddande elbilar"];
    a.panels![2].lines = [];
    expect(share(measure(e, a, "023"), "panels.content")).toBe(0);
  });

  // py: test_accuracy::test_detects_wrong_parsed_field
  it("находит неверно разобранное поле", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].parsed!.duration_limit = { amount: 3, unit: "hours" };
    expect(share(measure(e, a, "005"), "parsed.duration_limit")).toBe(0);
  });

  // py: test_accuracy::test_case_and_spacing_do_not_count_as_errors
  it("регистр и пробелы ошибкой не считаются: меряется прочитанное", () => {
    const e = expected(BASE);
    const a = structuredClone(e);
    a.panels![0].lines = ["2  TIM", "8-18 ", " (8-15)"];
    expect(share(measure(e, a, "005"), "panel.lines")).toBe(1);
  });

  // py: test_accuracy::test_two_encodings_of_the_same_dates_are_equal
  it("две записи одних и тех же дат равны", () => {
    // `Augusti-Juni` — и «только с 1 августа по 30 июня», и «кроме июля».
    const only = { mode: "only" as const, ranges: [{ from: "08-01", to: "06-30" }] };
    const except = { mode: "except" as const, ranges: [{ from: "07-01", to: "07-31" }] };
    expect(coveredDays(only)).toEqual(coveredDays(except));
    const other = { mode: "except" as const, ranges: [{ from: "06-01", to: "06-30" }] };
    expect(coveredDays(only), "разные правила остаются разными").not.toEqual(coveredDays(other));
  });
});

describe("отсев", () => {
  // py: test_accuracy::test_false_reject_is_counted
  it("считает ложный отказ — самую дорогую ошибку отсева", () => {
    const t = triageReport({ a: true, b: true, c: false },
                           { a: "parking_sign", b: "not_a_sign", c: "not_a_sign" });
    expect(t.realSigns).toBe(2);
    expect(t.falseRejects).toBe(1);
    expect(t.falseRejectShare).toBe(0.5);
    expect(t.junkLetThrough).toBe(0);
  });

  // py: test_accuracy::test_junk_let_through_is_counted_separately
  it("пропущенный мусор считается отдельно", () => {
    const t = triageReport({ a: true, c: false }, { a: "parking_sign", c: "parking_sign" });
    expect(t.falseRejects).toBe(0);
    expect(t.junkLetThrough).toBe(1);
    expect(t.junkLetThroughShare).toBe(1);
  });
});

describe("расхождение ОТВЕТА", () => {
  // Порог сравнивается не с совпадением полей, а с совпадением ответа: цвет таблички
  // и порядок панелей в разборе видны, а до человека не доходят.

  /** Час — пара «состояние и условия»: для человека это одно сообщение. */
  function verdict({ permits = true, eligibility = [] as string[],
                     states = Array<string>(24).fill("allowed"),
                     conditions = null as string[][] | null } = {}): Verdict {
    const cond = conditions ?? states.map(() => []);
    return { permitsParking: permits, eligibility,
             states: states.map((s, i) => [s, cond[i]] as [string, string[]]) };
  }

  // py: test_accuracy::test_identical_verdicts_have_no_differences
  it("одинаковые ответы не расходятся", () => {
    expect(verdictDifferences(verdict(), verdict())).toEqual([]);
  });

  // py: test_accuracy::test_a_pointer_read_as_a_parking_sign_is_the_whole_verdict
  it("указатель, прочитанный как знак стоянки, — расходится весь ответ", () => {
    // `050` и `037`: расходится не поле, а весь ответ — в сторону расширения.
    const diff = verdictDifferences(
      verdict({ permits: false, states: Array(24).fill("prohibited") }), verdict());
    expect(diff.some((d) => d.includes("стоянка здесь"))).toBe(true);
    expect(diff.some((d) => d.includes("по состоянию 24/24, из них шире 24"))).toBe(true);
  });

  // py: test_accuracy::test_widening_is_counted_apart_from_narrowing
  it("расширение считается отдельно от сужения", () => {
    // Ошибка в сторону расширения стоит эвакуации, в обратную — лишней осторожности.
    const wider = verdictDifferences(verdict({ states: Array(24).fill("prohibited") }),
                                     verdict({ states: Array(24).fill("allowed") }));
    const narrower = verdictDifferences(verdict({ states: Array(24).fill("allowed") }),
                                        verdict({ states: Array(24).fill("prohibited") }));
    expect(wider[0]).toContain("из них шире 24");
    expect(narrower[0]).toContain("из них шире 0");
  });

  // py: test_accuracy::test_a_condition_on_the_wrong_days_is_a_difference_too
  it("условие не в те дни — тоже расхождение, и не по состоянию", () => {
    // Знак `030`: плата по субботам, разбор сказал «по воскресеньям». Час за часом
    // оба ответа — `allowed`, и замер этого не видел; ошибка нашлась в браузере.
    const reference = verdict({ conditions: [...Array(12).fill(["avgift"]), ...Array(12).fill([])] });
    const answer = verdict({ conditions: [...Array(12).fill([]), ...Array(12).fill(["avgift"])] });
    const diff = verdictDifferences(reference, answer);
    expect(diff.some((d) => d.includes("по условиям 24/24"))).toBe(true);
    expect(diff.some((d) => d.includes("по состоянию"))).toBe(false);
  });

  // py: test_accuracy::test_a_narrowed_circle_of_users_is_a_difference_too
  it("суженный круг стоящих — тоже расхождение", () => {
    // `042`: круг сужен до мотоциклов там, где знак о велосипедах.
    const diff = verdictDifferences(verdict(), verdict({ eligibility: ["pictogram-motorcycle"] }));
    expect(diff.some((d) => d.includes("круг стоящих"))).toBe(true);
  });

  // py: test_accuracy::test_dead_signals_are_the_ones_that_never_moved
  it("мёртвые сигналы — те, что ни разу не сдвинулись", () => {
    const seen = new Map([["а", new Set([1])], ["б", new Set([0, 1])], ["в", new Set<number>()]]);
    expect(deadSignals(seen)).toEqual(["а", "в"]);
  });
});

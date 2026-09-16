// Слова продукта и шкала периодов. Перенесено из `tests/test_api.py` (шаг 8).
//
// Большая часть тех тестов проверяла не HTTP, а ОТВЕТ: что сказано человеку у знака,
// в каком порядке и какими словами. Сервер уходит — проверки остаются, потому что
// предмет у них другой: не ручка, а продукт.
//
// Ответ собирается тем же путём, что и в приложении, только без сети: сохранённый
// ответ модели → проверка по схеме → справочник → полнота → движок → показ.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { parseNaive } from "./civil";
import { FULL, PARTIAL, applyAsymmetry, grade } from "./completeness";
import { ARROW_EXTENT, evaluateParkingRules, horizonEnd, type Period } from "./engine";
import { pixels } from "./photo";
import { CATEGORY_TEXT, CONTRACT, EXTENT_SHORT, EXTENT_TEXT, GOOD_ENOUGH, NOTE_TEXT,
         REASON_TEXT, STATE_TEXT, STAY_END_REASON, STAY_END_TEXT, TIMED_PROHIBITION_TEXT,
         UNCERTAINTY_TEXT, explain, headline, joinLines, merge, notInterpreted, panelFields,
         panelView, periodTone, rangeName, regimeView, timePhrase, toJson, toneOf,
         whoCanPark, windows } from "./present";
import { all as allEntries, recognise } from "./reference";
import { TRIAGE_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";
import { ok, sign as validateSign } from "./validation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CAL = new Calendar();
const DEFAULT_MOMENT = "2026-03-10T12:00";     // обычный вторник

const read = (path: string) => readFileSync(ROOT + path, "utf-8");
const readJson = (path: string) => JSON.parse(read(path));

/** Ответ продукта по снимку набора: тот же путь, что в приложении, без сети. */
function answerFor(label: string, moment = DEFAULT_MOMENT): Record<string, any> {
  const fixture = readJson(`demo/${label}.extract.json`);
  const triageFile = `${ROOT}demo/${label}.triage.json`;
  const seen = existsSync(triageFile)
    ? readJson(`demo/${label}.triage.json`)?.response?.panels_below_main_sign : null;
  const res = validateSign(structuredClone(fixture.response),
                           typeof seen === "number" ? seen : null);
  const doc: SignDoc = ok(res) && res.data ? res.data : fixture.response;
  const rec = recognise(doc);
  const flags = [...res.flags];
  if (rec.missingKeys.length) flags.push("reference_gap:" + rec.missingKeys.join(","));
  const un = Object.keys(rec.uninterpreted).map(Number).sort((a, b) => a - b);
  if (un.length) flags.push("uninterpreted_panels:" + un.join(","));
  const photo = readdirSync(`${ROOT}testset/photos`)
    .find((f) => f.startsWith(`${label}.`) && /\.(jpg|png)$/i.test(f));
  const imagePixels = photo
    ? pixels(new Uint8Array(readFileSync(`${ROOT}testset/photos/${photo}`))) : null;
  const m = parseNaive(moment);
  const ev = evaluateParkingRules(doc, m, CAL);
  const a = grade(doc, { flags, repairs: res.repairs, imagePixels, evaluation: ev });
  return toJson({ doc, recognised: rec, assessment: a, evaluation: applyAsymmetry(ev, a) },
                m, CAL);
}

/** Все снимки набора, у которых есть сохранённый ответ модели. */
const answered = () => readdirSync(`${ROOT}demo`)
  .filter((f) => f.endsWith(".extract.json"))
  .map((f) => f.slice(0, -".extract.json".length))
  .sort();

const PHOTO = "005-2tim-8-18-parentes-8-15-dubbelpil";
const period = (state: string, conditions: string[]): Period => ({
  start: parseNaive("2026-09-02T10:00"), end: parseNaive("2026-09-02T12:00"),
  state, conditions, maxDurationMinutes: null, note: null,
});

describe("ответ целиком", () => {
  // py: test_api::test_analyze_returns_the_four_blocks
  it("состоит из тех же блоков", () => {
    const b = answerFor(PHOTO);
    expect(["full", "partial"]).toContain(b.completeness.category);
    expect(b.what_we_saw.panels.length, "блок 1: панели").toBeGreaterThan(0);
    expect(b.regimes.length, "блок 3: шкала периодов").toBeGreaterThan(0);
    expect(b.day_class).toBe("weekday");
    expect(b.has_answer).toBe(true);
  });

  // py: test_api::test_response_states_its_contract_version
  it("называет версию контракта", () => {
    expect(answerFor(PHOTO).contract).toBe(CONTRACT);
    expect(Number.isInteger(CONTRACT)).toBe(true);
  });

  // py: test_api::test_forbidden_wording_never_appears
  it("не разрешает и не приказывает", () => {
    const raw = JSON.stringify(answerFor(PHOTO)).toLowerCase();
    for (const bad of ["parking allowed", "you may park", "you need to move the car",
                       "you can park here"]) {
      expect(raw, bad).not.toContain(bad);
    }
  });

  // py: test_api::test_general_rules_never_ride_inside_an_analysis
  it("общие правила внутри разбора не едут", () => {
    // Их нет на знаке, и в вычисления они не входят: не путешествуя вместе
    // с ответом, они не могут случайно оказаться его частью.
    const b = answerFor(PHOTO);
    expect(b).not.toHaveProperty("general_rules");
    expect(b).not.toHaveProperty("rules");
  });

  // py: test_api::test_wording_comes_from_the_reference_not_from_the_api
  it("формулировки приходят из справочника готовыми", () => {
    const b = answerFor("006-tillstand-07-17-ovrig-tid-avgift");
    const terms = b.regimes.flatMap((r: any) => r.periods.flatMap((p: any) => p.conditions));
    expect(terms.length, "условия размечены ключами справочника").toBeGreaterThan(0);
    for (const t of terms) {
      expect(t.known, t.key).toBe(true);
      expect(t.text).not.toBe(t.key);
    }
  });

  // py: test_api::test_state_wording_is_authored_by_the_backend
  it("подписи состояний приходят готовыми", () => {
    const b = answerFor(PHOTO);
    const texts = b.regimes.flatMap((r: any) => r.periods.map((p: any) => p.state_text));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.startsWith("The sign"), t).toBe(true);
    expect(b.completeness.category_text).toBeTruthy();
  });

  // py: test_api::test_no_internal_token_is_shown_without_words
  it("служебный токен не показывается без слов", () => {
    // «Stretch: here» — та самая ошибка, с которой началась обкатка.
    const b = answerFor(PHOTO);
    for (const r of b.regimes) {
      expect(r.extent_text.startsWith("The sign"), r.extent_text).toBe(true);
      expect(r.extent_text).not.toBe(r.extent);
    }
    for (const item of [...b.completeness.reasons, ...b.uncertainties]) {
      expect(item.text, `токен без текста: ${item.token}`).not.toBe(item.token);
    }
  });

  // py: test_api::test_an_unknown_token_never_reaches_the_screen_as_itself
  it("неизвестный токен на экран как есть не выходит", () => {
    const pair = explain("совершенно_новый_повод", REASON_TEXT);
    expect(pair.token).toBe("совершенно_новый_повод");
    expect(pair.text).toBe("");
  });

  // py: test_api::test_every_reason_and_uncertainty_token_has_wording
  it("у каждого повода и каждой неопределённости есть формулировка", () => {
    const produced = new Set<string>();
    for (const file of ["completeness.ts", "engine.ts"]) {
      const src = read(`web/src/lib/${file}`);
      for (const m of src.matchAll(/(?:reasons|uncertainties)\.push\("([a-z_0-9:]+)"/g)) {
        produced.add(m[1].replace(/:$/, ""));
      }
    }
    expect(produced.size, "токены не нашлись — проверка потеряла смысл").toBeGreaterThan(0);
    const known = new Set([...Object.keys(REASON_TEXT), ...Object.keys(UNCERTAINTY_TEXT),
                           "unread_panels", "uninterpreted_plates"]);
    expect([...produced].filter((t) => !known.has(t))).toEqual([]);
    const extents = new Set([...Object.values(ARROW_EXTENT), "here"]);
    expect([...extents].filter((e) => !(e in EXTENT_TEXT))).toEqual([]);
    expect(CATEGORY_TEXT).toHaveProperty(FULL);
  });

  // py: test_api::test_every_reason_the_code_can_produce_has_a_caption
  it("у каждой причины, какую умеет породить полнота, есть подпись", () => {
    const refusals = (TRIAGE_SCHEMA as Record<string, any>).properties.category.enum
      .filter((c: string) => c !== "parking_sign");
    const reasons = new Set<string>();
    for (const category of refusals) {
      for (const r of grade(null, { triageCategory: category }).reasons) reasons.add(r);
    }
    for (const r of grade(null, { schemaValid: false }).reasons) reasons.add(r);
    // разбор с каждым мыслимым изъяном сразу
    const bad: SignDoc = {
      schema_version: 1,
      main_sign: { type: "unknown", background_color: "blue", form: "regular",
                   legibility: { readable: false } },
      panels: [{ index: 1, kind: "sign_plate", lines: [], parsed: {},
                 background_color: "yellow", legibility: { readable: false } }],
      panel_count: 1, boundaries: { certain: false },
    };
    for (const r of grade(bad, { flags: ["panel_count_disagreement:1!=2",
                                         "uninterpreted_panels:1"],
                                 repairs: ["что-то починили"], imagePixels: 10 }).reasons) {
      reasons.add(r);
    }
    expect([...reasons].filter((t) => !explain(t, REASON_TEXT).text)).toEqual([]);
  });

  // py: test_api::test_user_facing_text_never_explains_the_machinery
  it("текст для человека не рассказывает про внутреннюю кухню", () => {
    // «Two independent readings counted the plates differently» — рассказ об
    // устройстве, из которого нельзя понять, чему верить.
    const forbidden = ["independent reading", "triage", "extraction", "fixture", "schema",
                       "panel_count", "validator", "pipeline", "prompt", "the model",
                       "vision api", "json"];
    const texts = [...Object.values(STATE_TEXT), ...Object.values(CATEGORY_TEXT),
                   ...Object.values(EXTENT_TEXT), ...Object.values(REASON_TEXT),
                   ...Object.values(UNCERTAINTY_TEXT)];
    for (const e of allEntries()) texts.push(e.en, e.short, e.label);
    for (const text of texts) {
      for (const bad of forbidden) {
        expect(text.toLowerCase(), `внутренняя кухня в тексте: ${text}`).not.toContain(bad);
      }
    }
  });

  // py: test_api::test_confidence_caveats_do_not_contradict_the_headline
  it("оговорки уверенности не спорят с заголовком", () => {
    expect(REASON_TEXT.panel_count_disagreement.startsWith("Confidence is lower")).toBe(true);
    expect(REASON_TEXT.day_class_unknown.startsWith("Confidence is lower")).toBe(true);
  });

  // py: test_api::test_completeness_tone_is_decided_by_the_backend
  it("цвет полноты решает не вёрстка", () => {
    expect(toneOf("full", 0.975)).toBe("good");
    expect(toneOf("full", GOOD_ENOUGH - 0.01), "оговорка снимает зелёный").toBe("caution");
    expect(toneOf("partial", 0.99), "прочитано не всё — не зелёный").toBe("caution");
    expect(toneOf("insufficient", 0.99)).toBe("bad");
    expect(toneOf("not_a_parking_sign", 1.0)).toBe("bad");
  });

  // py: test_api::test_tone_travels_with_the_answer
  it("цвет едет вместе с ответом", () => {
    const c = answerFor(PHOTO, "2026-09-02T17:11").completeness;
    expect(["good", "caution", "bad"]).toContain(c.tone);
    expect(c.tone === "good").toBe(c.category === "full" && c.confidence >= 0.9);
  });
});

describe("блок «что мы прочли»", () => {
  // py: test_api::test_every_shown_value_carries_its_field_name
  it("у каждого значения написано имя поля", () => {
    const w = answerFor(PHOTO).what_we_saw;
    const mainNames = new Set(w.main_sign_fields.map((f: any) => f.name));
    for (const name of ["type", "form", "background_color"]) expect(mainNames).toContain(name);
    for (const p of w.panels) {
      const names = p.fields.map((f: any) => f.name);
      expect(names.slice(0, 2), "порядок полей фиксирован").toEqual(["index", "kind"]);
      expect(names, "пустой список строк — тоже факт").toContain("lines");
      for (const f of p.fields) expect(f.value, f.name).toBeTruthy();
    }
  });

  // py: test_api::test_parsed_fields_are_named_with_their_schema_path
  it("разобранные поля названы путём из схемы", () => {
    const w = answerFor(PHOTO).what_we_saw;
    const rows: Record<string, string> = {};
    for (const p of w.panels) for (const f of p.fields) rows[f.name] = f.value;
    expect(rows["parsed.duration_limit"]).toBe("2 hours");
    expect(rows["parsed.time_windows"]).toContain("08:00–18:00 (weekday)");
  });

  // py: test_api::test_no_parsed_field_is_silently_dropped_from_the_screen
  it("незнакомое поле разбора не теряется молча", () => {
    const rows = panelFields({ index: 1, kind: "sign_plate", lines: ["x"],
                               parsed: { "выдуманное_поле": "значение" } } as unknown as Panel, []);
    expect(rows.some((r) => r.name === "parsed.выдуманное_поле")).toBe(true);
  });

  // py: test_api::test_panels_are_titled_panel_without_a_number
  it("панели подписаны «Panel», без номера", () => {
    const w = answerFor(PHOTO).what_we_saw;
    expect(w.panels.map((p: any) => p.title)).toEqual(w.panels.map(() => "Panel"));
  });

  // py: test_api::test_primary_sign_is_named_and_coded
  it("основной знак назван и снабжён кодом", () => {
    const w = answerFor(PHOTO).what_we_saw;
    expect(w.primary_sign.label).toBe("Parking");
    expect(w.primary_sign.code).toBe("E19");
  });

  // py: test_api::test_info_board_says_what_it_is_and_shows_its_text
  it("табло говорит, чем оно является, и показывает свой текст", () => {
    const w = answerFor("008-rorelsehindrad-avgift").what_we_saw;
    const boards = w.panels.filter((p: any) => p.kind === "info_board");
    expect(boards.length, "на 008 есть платёжное табло").toBeGreaterThan(0);
    expect(boards[0].meanings[0].label).toBe("Info board");
    expect(boards[0].meanings[0].code, "у табло кода нет").toBe("");
    expect(boards[0].text, "текст табла показывается").toBeTruthy();
  });

  // py: test_api::test_a_time_plate_reads_as_one_sentence
  it("табличка времени читается одним предложением", () => {
    const panel: Panel = { index: 1, kind: "sign_plate",
      lines: ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"],
      background_color: "yellow", legibility: { readable: true },
      parsed: { prohibition: true, time_windows: [{ from: "10:00", to: "14:00",
        day_class: "named_weekday", named_weekday: "thursday", week_parity: "even",
        dates: { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] } }] } };
    const doc: SignDoc = { main_sign: { type: "parking", form: "regular",
      background_color: "blue", legibility: { readable: true } }, panels: [panel] };
    const view = panelView(panel, recognise(doc).panelKeys[1]);
    const meanings = view.meanings as any[];
    expect(meanings).toHaveLength(1);
    expect(meanings[0].label).toBe("No parking");
    expect(meanings[0].code).toBe("C35");
    expect(meanings[0].continues, "одно предложение, без точки").toBe(true);
    for (const part of ["Thursdays", "10:00", "14:00", "even weeks"]) {
      expect(meanings[0].short).toContain(part);
    }
    expect(meanings[0].short).toContain("all year except July");
  });

  // py: test_api::test_two_plates_with_the_same_code_merge_into_one_line
  it("две таблички с одним кодом сливаются в одну строку", () => {
    const merged = merge([
      { key: "avgift", label: "Fee", code: "T16", text: "payment required",
        short: "Parking is not free", continues: false },
      { key: "taxa", label: "Fee", code: "T16", text: "tariff number",
        short: "Municipal tariff number", continues: false },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].short).toContain("Parking is not free");
    expect(merged[0].short).toContain("Municipal tariff number");
  });

  // py: test_api::test_a_hyphenated_word_is_joined_back_into_one_word
  it("перенос с дефисом склеивается обратно в одно слово", () => {
    expect(joinLines(["Beskicknings-", "fordon"])).toBe("Beskickningsfordon");
    // дефис внутри строки — часть записи времени, а не перенос
    expect(joinLines(["2 tim", "8-18", "(8-15)"])).toBe("2 tim 8-18 (8-15)");
    expect(joinLines(["0-12 m"])).toBe("0-12 m");
  });

  // py: test_api::test_an_uninterpreted_panel_does_not_repeat_its_own_text
  it("непонятая панель не повторяет свой же текст", () => {
    expect(notInterpreted([], ["Beskicknings-", "fordon"]))
      .toBe("Not interpreted — shown above exactly as printed");
    // у панели с понятыми ключами остаток называется: строкой выше не он
    expect(notInterpreted(["boende"], ["Ci"])).toBe("Not interpreted: Ci");
  });

  // py: test_api::test_a_plate_the_reference_knows_is_not_called_uninterpreted
  it("понятая табличка не зовётся непонятой", () => {
    for (const label of ["015-motorcykel", "017-rorelsehindrad",
                         "032-rorelsehindrad-pil-hoger"]) {
      for (const p of answerFor(label).what_we_saw.panels) {
        expect(p.not_interpreted_text, `${label}, панель ${p.index}`).toBeNull();
      }
    }
  });

  // py: test_api::test_a_plate_with_an_unknown_symbol_narrows_instead_of_widening
  it("табличка с неизвестным рисунком сужает, а не расширяет", () => {
    // Снимок `042`: пиктограмма приходила как `other` без текста, и знак читался
    // как стоянка для всех.
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panels: [{ index: 1, kind: "sign_plate", lines: [], background_color: "blue",
                 legibility: { readable: true }, parsed: { pictogram: "other" } }],
      panel_count: 1, boundaries: { certain: true } };
    const rec = recognise(doc);
    expect(rec.panelKeys[1]).toEqual([]);
    expect(rec.uninterpreted, "бессловесная табличка обязана считаться непонятой")
      .toHaveProperty("1");
    const a = grade(doc, { flags: ["uninterpreted_panels:1"] });
    expect(a.category).toBe(PARTIAL);
    expect(a.uninterpretedPlates).toEqual([1]);
  });
});

describe("шкала периодов", () => {
  // py: test_api::test_the_timeline_ends_where_the_stay_ends
  it("кончается там, где кончается стоянка", () => {
    const r = answerFor("008-rorelsehindrad-avgift", "2026-09-02T17:11").regimes[0];
    expect(r.duration_expires_at).toBe("2026-09-03T17:11");
    expect(r.periods[r.periods.length - 1].end).toBe(r.duration_expires_at);
    expect(r.periods.some((p: any) => p.ends_at_horizon)).toBe(false);
    expect(r.periods[r.periods.length - 1].stay_end_text).toContain("24-hour rule");
  });

  // py: test_api::test_the_stay_end_is_stated_under_its_own_period
  it("конец стоянки сказан под своим отрезком", () => {
    const r = answerFor(PHOTO, "2026-09-02T17:11").regimes[0];
    const marked = r.periods.filter((p: any) => p.stay_end_text);
    expect(marked, "ровно один отрезок кончает стоянку").toHaveLength(1);
    expect(marked[0]).toBe(r.periods[r.periods.length - 1]);
    expect(marked[0].stay_end_text.toLowerCase()).toContain("the sign");
  });

  // py: test_api::test_without_a_limit_the_timeline_stops_at_the_first_change
  it("без предела шкала доводится до первой смены состояния", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-02T17:11").regimes[0];
    const states = r.periods.map((p: any) => p.state);
    expect(states[0]).toBe("prohibited");
    expect(states[states.length - 1], "доведено до снятия запрета").not.toBe(states[0]);
    expect(states).toHaveLength(2);
  });

  // py: test_api::test_identical_neighbouring_segments_are_joined
  it("одинаковые соседние отрезки склеиваются", () => {
    const r = answerFor(PHOTO, "2026-09-02T17:11").regimes[0];
    expect(r.periods).toHaveLength(1);
    expect(r.duration_expires_at).toBe("2026-09-03T10:00");
    expect(r.duration_source).toBe("plate");
    expect(r.periods[0].start).toBe("2026-09-02T17:11");
    expect(r.periods[0].end).toBe(r.duration_expires_at);
  });

  // py: test_api::test_joining_never_hides_a_change_of_rule
  it("склейка не прячет смену правила", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-01T23:30").regimes[0];
    for (let i = 1; i < r.periods.length; i += 1) {
      const a = r.periods[i - 1];
      const b = r.periods[i];
      expect(a.tone !== b.tone || JSON.stringify(a.notes) !== JSON.stringify(b.notes))
        .toBe(true);
    }
  });

  // py: test_api::test_period_tone_and_headline_come_from_the_rule
  it("цвет и заголовок отрезка — свойство правила", () => {
    expect(periodTone(period("allowed", ["avgift"]))).toBe("paid");
    expect(periodTone(period("allowed", []))).toBe("free");
    expect(periodTone(period("prohibited", []))).toBe("prohibited");
    expect(periodTone(period("uncertain", []))).toBe("uncertain");
    // «Free parking» разрешена там, где условий нет вовсе: иначе она соседствовала
    // бы с «требуется диск».
    const free = period("allowed", []);
    const withDisc = period("allowed", ["p-skiva"]);
    expect(headline(free, periodTone(free))).toBe("Free parking");
    expect(headline(withDisc, periodTone(withDisc))).toBe("No fee stated for this period");
    expect(headline(withDisc, periodTone(withDisc)).toLowerCase()).not.toContain("free");
  });

  // py: test_api::test_period_carries_its_duration_and_notes
  it("отрезок несёт свою длительность, а плата в примечания не дублируется", () => {
    const r = answerFor(PHOTO, "2026-09-02T22:59").regimes[0];
    for (const p of r.periods) {
      expect(p.minutes).toBeGreaterThan(0);
      expect(p.headline).toBeTruthy();
      expect(p.notes.every((n: any) => n.key !== "avgift"), JSON.stringify(p.notes)).toBe(true);
    }
  });

  // py: test_api::test_stay_end_reason_says_why_without_repeating_when
  it("причина конца стоянки говорит ПОЧЕМУ, не повторяя КОГДА", () => {
    const r = answerFor("008-rorelsehindrad-avgift", "2026-09-02T23:24").regimes[0];
    const last = r.periods[r.periods.length - 1];
    expect(last.stay_end_reason).toBe("general 24-hour rule, not written on the sign");
    expect(last.stay_end_reason, "когда — говорит узел").not.toContain("must end here");
  });

  // py: test_api::test_every_duration_source_has_a_reason
  it("у каждого источника предела есть причина", () => {
    expect(Object.keys(STAY_END_REASON).sort()).toEqual(Object.keys(STAY_END_TEXT).sort());
    expect(Object.keys(STAY_END_REASON).sort()).toEqual(["24h_default", "plate", "prohibition"]);
    for (const text of Object.values(STAY_END_REASON)) {
      expect(text).toBeTruthy();
      expect(text[0], text).toBe(text[0].toLowerCase());
    }
  });

  // py: test_api::test_an_endless_prohibition_is_marked_as_reaching_the_horizon
  it("бессрочный запрет помечен как упирающийся в горизонт", () => {
    // `169 h 30 min` под запретом — свойство расчёта, а не знака.
    const r = answerFor("007-gul-forbud-forhyrda-platser", "2026-09-04T22:29").regimes[0];
    const last = r.periods[r.periods.length - 1];
    expect(last.state).toBe("prohibited");
    expect(last.ends_at_horizon, "запрет без конца обязан быть помечен").toBe(true);
    expect(r.duration_expires_at).toBeNull();
  });

  // py: test_api::test_the_ban_period_itself_is_still_computed
  it("сам запрет по-прежнему считается", () => {
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 1, boundaries: { certain: true },
      panels: [{ index: 1, kind: "sign_plate", lines: ["Fredag 0-6"],
                 background_color: "yellow", legibility: { readable: true },
                 parsed: { prohibition: true, time_windows: [{ from: "00:00", to: "06:00",
                   day_class: "named_weekday", named_weekday: "friday" }] } }] };
    const r = evaluateParkingRules(doc, parseNaive("2026-09-04T02:15"), CAL).regimes[0];
    expect(r.periods[0].state).toBe("prohibited");
    expect(r.periods[0].end.hh, "запрет снимается в 06:00").toBe(6);
  });

  // py: test_api::test_the_day_class_stands_under_the_date_on_the_scale
  it("класс дня стоит под датой", () => {
    // Пятница 30 октября 2026 — канун Alla helgons dag, и работают часы в скобках.
    let r = answerFor(PHOTO, "2026-10-30T14:00").regimes[0];
    expect(r.periods[0].start_day)
      .toEqual({ text: "Eve of Alla helgons dag (All Saints' Day)", kind: "eve" });
    expect(r.periods[r.periods.length - 1].end_day, "понедельник — будний").toBeNull();

    r = answerFor(PHOTO, "2026-12-25T10:00").regimes[0];
    expect(r.periods[0].start_day)
      .toEqual({ text: "Red day: Juldagen (Christmas Day)", kind: "red" });

    // Обычные воскресенье и суббота подписи не получают (решение 119).
    expect(answerFor(PHOTO, "2026-09-13T10:00").regimes[0].periods[0].start_day).toBeNull();
    expect(answerFor(PHOTO, "2026-09-12T10:00").regimes[0].periods[0].start_day).toBeNull();
    // А суббота перед Пасхой — получает: завтрашний день именован.
    expect(answerFor(PHOTO, "2026-04-04T10:00").regimes[0].periods[0].start_day)
      .toEqual({ text: "Eve of Påskdagen (Easter Sunday)", kind: "eve" });
  });
});

describe("кому отведены места", () => {
  // py: test_api::test_who_can_park_never_addresses_the_reader
  it("никогда не обращается к читателю", () => {
    // Продукт называет круг и останавливается: относится ли к нему стоящий
    // у знака, знает только он сам.
    const forbidden = ["you may", "you can", "you cannot", "you must", "your car",
                       "not allowed to", "you need"];
    for (const label of ["008-rorelsehindrad-avgift", "015-motorcykel",
                         "009-besokande-avgift", "003-p-2tim"]) {
      const r = answerFor(label, "2026-09-02T17:11").regimes[0];
      expect(r.who_can_park.length, `${label}: круг обязан быть назван`).toBeGreaterThan(0);
      for (const term of r.who_can_park) {
        const low = term.text.toLowerCase();
        expect(low.startsWith("the sign"), `${label}: ${term.text}`).toBe(true);
        for (const bad of forbidden) expect(low, `${label}: ${bad}`).not.toContain(bad);
      }
    }
  });

  // py: test_api::test_a_sign_that_narrows_nobody_still_names_the_circle
  it("знак, никого не сужающий, всё равно называет круг", () => {
    const r = answerFor("003-p-2tim", "2026-09-02T17:11").regimes[0];
    expect(r.eligibility, "круг знаком не сужен").toEqual([]);
    expect(r.who_can_park[0].text).toContain("all vehicles");
    expect(r.who_can_park[0].text).toContain("general parking rules");
  });

  // py: test_api::test_a_complementary_plate_does_not_replace_the_general_rule
  it("дополняющая табличка не заменяет общее правило знака", () => {
    // `Boende` не запрещает никому — он сообщает, что у жильцов свои условия.
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 1, boundaries: { certain: true },
      panels: [{ index: 1, kind: "sign_plate", lines: ["Boende Solna"],
                 background_color: "white", legibility: { readable: true },
                 parsed: { eligibility: "residents" } }] };
    const r = evaluateParkingRules(doc, parseNaive("2026-09-02T22:52"), CAL).regimes[0];
    const who = whoCanPark(r, "main-parking", false, false);
    expect(who).toHaveLength(2);
    expect(who[0].text, "общее правило идёт первым").toContain("all vehicles");
    expect(who[1].text, "дополнение — вторым").toContain("residents");
  });

  // py: test_api::test_a_narrowing_plate_does_replace_the_general_rule
  it("сужающая табличка общее правило заменяет", () => {
    for (const [label, expected] of [
      ["008-rorelsehindrad-avgift", "disabled parking permit"],
      ["009-besokande-avgift", "visitors"],
      ["015-motorcykel", "motorcycles"]] as const) {
      const r = answerFor(label, "2026-09-02T22:52").regimes[0];
      const texts = r.who_can_park.map((x: any) => x.text);
      expect(texts, label).toHaveLength(1);
      expect(texts[0], label).toContain(expected);
      expect(texts[0], label).not.toContain("all vehicles");
    }
  });

  // py: test_api::test_an_unknown_plate_is_named_in_who_can_park
  it("непонятая табличка названа в круге стоящих", () => {
    // `Beskickningsfordon` сообщал «стоянка для всех» — формально верно и ровно
    // поэтому опасно.
    const r = { extent: "here", eligibility: [], placeNotes: [], periods: [],
                durationExpiresAt: null, durationSource: null, audience: null,
                audienceExcluded: [] };
    const plain = whoCanPark(r, "main-parking", false, false);
    const guarded = whoCanPark(r, "main-parking", true, false);
    expect(guarded).toHaveLength(plain.length + 1);
    expect(guarded[guarded.length - 1].text).toContain("may narrow who these spaces are for");
    expect(guarded[guarded.length - 1].known, "оговорка не притворяется знанием").toBe(false);
  });

  // py: test_api::test_a_prohibition_with_hours_is_not_stated_as_a_prohibition_always
  it("запрет с часами не подаётся как запрет всегда", () => {
    const r = answerFor("019-forbud-7-18-avgift-ovrig-tid", "2026-09-06T19:27").regimes[0];
    const line = r.who_can_park[0].text;
    expect(line).toContain("only during the hours it names");
    expect(line, "«не запрещает» не равно «разрешает»").toContain("general parking rules");
  });

  // py: test_api::test_a_prohibition_without_hours_keeps_its_plain_wording
  it("запрет без часов сохраняет прямую формулировку", () => {
    const r = answerFor("055-forbud-stannande-snotackt-pil").regimes[0];
    expect(r.who_can_park[0].text).toBe("The sign prohibits stopping and parking");
  });
});

describe("подпись окна", () => {
  // py: test_api::test_the_window_says_who_it_is_for_when_it_is_not_for_everyone
  it("окно говорит, для кого оно, когда оно не для всех", () => {
    const r = answerFor("008-rorelsehindrad-avgift").regimes[0];
    expect(r.window_for.map((x: any) => x.text))
      .toEqual(["A disabled parking permit is required"]);
    expect(r.who_can_park.some((x: any) => x.text.includes("disabled parking permit")))
      .toBe(true);
  });

  // py: test_api::test_a_sign_for_everyone_says_nothing_extra_under_the_window
  it("у знака для всех под окном ничего лишнего", () => {
    expect(answerFor("003-p-2tim").regimes[0].window_for).toEqual([]);
  });

  // py: test_api::test_a_complementary_plate_is_not_mistaken_for_the_circle
  it("дополняющая табличка не принимается за круг окна", () => {
    const regimes = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen").regimes;
    const withNotes = regimes.filter((r: any) => r.notes.length);
    expect(withNotes.length, "режим с табличкой жильцов не найден").toBeGreaterThan(0);
    for (const r of withNotes) expect(r.window_for).toEqual([]);
  });

  // py: test_api::test_under_a_prohibition_the_circle_is_named_as_an_exception
  it("под запретом круг назван исключением", () => {
    const r = answerFor("007-gul-forbud-forhyrda-platser").regimes[0];
    for (const p of r.periods) if (p.aside.length) expect(p.state).toBe("prohibited");
    expect(r.window_for.map((x: any) => x.text))
      .toEqual(["The sign names an exception: Rented spaces"]);
    for (const x of r.window_for) expect(x.text.toLowerCase()).not.toContain(" you ");
  });

  // py: test_api::test_under_a_permission_the_circle_is_not_called_an_exception
  it("под разрешением тот же круг исключением не зовётся", () => {
    const r = answerFor("004-endast-besokande-pingstkyrkan").regimes[0];
    for (const p of r.periods) if (p.aside.length) expect(p.state).toBe("allowed");
    expect(r.window_for.map((x: any) => x.text)).toEqual(["Visitors only"]);
  });

  // py: test_api::test_each_window_says_which_stretch_it_covers
  it("каждое окно говорит, какой участок оно покрывает", () => {
    const regimes = answerFor("010-forhyrda-platser-tva-pilar").regimes;
    expect(regimes).toHaveLength(2);
    expect(regimes.map((r: any) => r.extent_short))
      .toEqual(["To the left of the sign", "To the right of the sign"]);
    expect(regimes[0].who_can_park).not.toEqual(regimes[1].who_can_park);
  });

  // py: test_api::test_every_extent_the_engine_can_produce_has_a_short_caption
  it("у каждого участка, какой умеет движок, есть короткая подпись", () => {
    const extents = new Set([...Object.values(ARROW_EXTENT), "here"]);
    expect([...extents].filter((e) => !(e in EXTENT_SHORT))).toEqual([]);
    expect(Object.keys(EXTENT_SHORT).sort()).toEqual(Object.keys(EXTENT_TEXT).sort());
  });

  // py: test_api::test_a_plate_bound_to_hours_is_not_printed_as_the_circle_of_the_window
  it("указание, расписанное по часам, кругом окна не печатается", () => {
    // `012`: «A special parking permit is required» стояло под НОЧНЫМ отрезком,
    // где довольно платы.
    const r = answerFor("012-tillstand-7-17-ovrig-tid-avgift", "2026-09-06T16:29").regimes[0];
    expect(r.window_for).toEqual([]);
    const withPermit = r.periods.filter((p: any) =>
      p.notes.some((n: any) => n.text.includes("permit")));
    expect(withPermit.length, "разрешение осталось у своего отрезка").toBeGreaterThan(0);
    for (const p of withPermit) expect(p.start.endsWith("07:00"), p.start).toBe(true);
  });

  // py: test_api::test_no_line_under_a_window_is_printed_twice
  it("ни одна строка под окном не печатается дважды", () => {
    // `010` справа: одна табличка выводилась и условием, и кругом — разными словами.
    const trouble: [string, string[]][] = [];
    for (const label of answered()) {
      for (const r of answerFor(label, "2026-03-02T12:00").regimes) {
        const circle = [...r.window_for.map((t: any) => t.key),
                        ...r.notes.map((t: any) => t.key)];
        for (const p of r.periods) {
          const together = [...p.notes.map((t: any) => t.key), ...circle];
          if (together.length !== new Set(together).size) trouble.push([label, together.sort()]);
        }
      }
    }
    expect(trouble).toEqual([]);
  });

  // py: test_api::test_the_circle_never_names_what_the_timeline_states_by_the_hour
  it("круг окна никогда не называет то, что шкала говорит по часам", () => {
    const trouble: [string, string[]][] = [];
    for (const label of answered()) {
      for (const r of answerFor(label, "2026-03-02T12:00").regimes) {
        const circle = new Set(r.window_for.map((t: any) => t.key));
        const hourly = new Set(r.periods.flatMap((p: any) => p.notes.map((n: any) => n.key)));
        const both = [...circle].filter((k) => hourly.has(k as string));
        if (both.length) trouble.push([label, both as string[]]);
      }
    }
    expect(trouble).toEqual([]);
  });
});

describe("окна по адресату", () => {
  /** Знак из Frihamnen через показ. */
  function frihamnenWindows(moment: string) {
    const doc: SignDoc = { schema_version: 1,
      main_sign: { type: "parking", background_color: "blue", form: "regular",
                   legibility: { readable: true } },
      panel_count: 2, boundaries: { certain: true },
      panels: [
        { index: 1, kind: "sign_plate", lines: ["30 min", "00-24", "(00-14)"],
          background_color: "blue", legibility: { readable: true },
          parsed: { duration_limit: { amount: 30, unit: "minutes" }, time_windows: [
            { from: "00:00", to: "24:00", day_class: "weekday" },
            { from: "00:00", to: "14:00", day_class: "eve" }] } },
        { index: 2, kind: "sign_plate", lines: ["Avgift", "(14-24)", "00-24"],
          background_color: "blue", legibility: { readable: true },
          parsed: { fee: true, vehicle_class: "bus", time_windows: [
            { from: "14:00", to: "24:00", day_class: "eve" },
            { from: "00:00", to: "24:00", day_class: "red" }] } },
      ] };
    const m = parseNaive(moment);
    const ev = evaluateParkingRules(doc, m, CAL);
    return windows(ev.regimes.map((r) => regimeView(r, horizonEnd(m), CAL, "main-parking")));
  }

  // py: test_api::test_a_condition_addressed_to_one_vehicle_class_gets_its_own_window
  it("условие для одного вида транспорта получает своё окно", () => {
    const wins = frihamnenWindows("2026-09-13T10:00");        // воскресенье
    expect(wins.map((w: any) => w.audience_short))
      .toEqual(["All vehicles except buses", "Buses"]);
    const [everyone, buses] = wins;
    expect(everyone.who_can_park.some((t: any) => t.text.includes("buses"))).toBe(false);
    expect(everyone.periods.some((p: any) => p.conditions.length)).toBe(false);
    expect(buses.periods[0].headline).toBe("Parking fee");
    expect(everyone.periods[0].headline).toBe("Free parking");
    expect(everyone.duration_expires_at).toBeTruthy();
    expect(buses.duration_expires_at).toBeTruthy();
  });

  // py: test_api::test_the_second_window_is_hidden_when_it_says_the_same
  it("второе окно прячется, когда говорит то же самое", () => {
    const wins = frihamnenWindows("2026-09-10T21:15");
    expect(wins).toHaveLength(1);
    expect(wins[0].audience_short).toBeNull();
    expect(wins[0].periods[0].headline).toBe("Free parking");
    expect(wins[0].periods[0].minutes).toBe(30);
  });

  // py: test_api::test_silence_about_a_fee_is_not_called_free
  it("молчание о плате не зовётся бесплатностью", () => {
    // `049`: плата названа только «в остальное время», а границу задаёт табличка мопедов.
    const doc: SignDoc = readJson("testset/expected/049-moped-sasong-avgift-tva-taxor.json");
    const inSeason = parseNaive("2026-07-15T12:00");
    let ev = evaluateParkingRules(doc, inSeason, CAL);
    let wins = windows(ev.regimes.map((r) =>
      regimeView(r, horizonEnd(inSeason), CAL, "main-parking")));
    const [everyone, mopeds] = wins;
    const segment = everyone.periods[0];
    expect(segment.headline).toBe("No fee stated for this period");
    expect(segment.tone).toBe("free");
    const aside = segment.aside.map((t: any) => t.text);
    expect(aside.some((t: string) => t.includes("other times") && t.includes("motorcycles")),
           JSON.stringify(aside)).toBe(true);
    expect(mopeds.periods[0].headline).toBe("Parking fee");

    // Вне сезона платят все, и оговорке взяться неоткуда.
    const offSeason = parseNaive("2026-11-16T12:00");
    ev = evaluateParkingRules(doc, offSeason, CAL);
    wins = windows(ev.regimes.map((r) =>
      regimeView(r, horizonEnd(offSeason), CAL, "main-parking")));
    expect(wins).toHaveLength(1);
    expect(wins[0].periods[0].headline).toBe("Parking fee");
    expect(wins[0].periods[0].aside).toEqual([]);
  });

  // py: test_api::test_a_residents_note_is_repeated_under_every_stretch_of_the_window
  it("примечание жильцов повторяется под каждым отрезком окна", () => {
    const r = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen",
                        "2026-09-06T21:43").regimes[0];
    expect(r.periods.length, "нужен знак с несколькими отрезками").toBeGreaterThan(1);
    for (const p of r.periods) {
      expect(p.aside.some((x: any) => x.text.includes("residents")), p.start).toBe(true);
    }
  });

  // py: test_api::test_boende_alone_never_makes_the_answer_incomplete
  it("`Boende` сам по себе неполноты не создаёт", () => {
    const d = answerFor("033-avgift-8-21-uppstallning-zon-e-boende-storskogen",
                        "2026-09-06T21:43");
    expect(d.completeness.category, JSON.stringify(d.completeness.reasons)).toBe("full");
    for (const r of d.regimes) for (const p of r.periods) expect(p.certain).toBe(true);
  });
});

describe("арендованные места и частная земля", () => {
  // py: test_api::test_a_rented_space_gets_no_parking_window
  it("арендованное место окна стоянки не получает", () => {
    // `020`: «Free parking ● 28 h 19 min max» — число целиком из правила 24 часов.
    const r = answerFor("020-forhyrda-platser-13-och-14-avstand").regimes[0];
    expect(r.no_window_text, "шкала должна быть убрана").toBeTruthy();
    expect(r.no_window_text).toContain("rented");
    expect(r.who_can_park.some((x: any) => x.text.includes("rented"))).toBe(true);
  });

  // py: test_api::test_a_rented_sign_that_states_its_own_hours_keeps_the_timeline
  it("арендованные места со своими часами шкалу сохраняют", () => {
    const r = answerFor("007-gul-forbud-forhyrda-platser").regimes[0];
    expect(r.no_window_text).toBeNull();
    expect(r.periods.length, "шкала должна остаться").toBeGreaterThan(0);
  });

  // py: test_api::test_only_rented_spaces_lose_the_timeline
  it("прочие круги шкалу сохраняют", () => {
    for (const label of ["004-endast-besokande-pingstkyrkan", "008-rorelsehindrad-avgift",
                         "015-motorcykel", "003-p-2tim"]) {
      for (const r of answerFor(label).regimes) {
        expect(r.no_window_text, label).toBeNull();
      }
    }
  });

  // py: test_api::test_private_land_is_named_in_both_places_and_keeps_its_timeline
  it("частная земля названа в обоих местах и шкалу сохраняет", () => {
    const r = answerFor("021-privat-parkering-brf").regimes[0];
    expect(r.who_can_park.some((x: any) => x.text.includes("private land"))).toBe(true);
    expect(r.window_for.some((x: any) => x.text.includes("Private land"))).toBe(true);
    expect(r.no_window_text).toBeNull();
    expect(r.periods.length, "шкала должна остаться").toBeGreaterThan(0);
    expect(r.who_can_park.some((x: any) => x.text.includes("permits parking"))).toBe(true);
  });

  // py: test_api::test_an_ordinary_sign_says_nothing_about_private_land
  it("обычный знак о частной земле молчит", () => {
    const r = answerFor("003-p-2tim").regimes[0];
    for (const x of [...r.who_can_park, ...r.window_for]) {
      expect(x.text.toLowerCase()).not.toContain("private land");
    }
  });
});

describe("за что продукт ручается", () => {
  // py: test_api::test_an_incomplete_parse_marks_its_periods_as_not_vouched_for
  it("неполный разбор помечает свои отрезки", () => {
    for (const label of ["021-privat-parkering-brf",          // частная земля
                         "029-beskickningsfordon-0-12m",      // табличка не понята
                         "061-lastplats-langt-avstand"]) {    // не хватило пикселей
      const d = answerFor(label);
      expect(d.completeness.category, label).not.toBe("full");
      for (const r of d.regimes) {
        for (const p of r.periods) expect(p.certain, label).toBe(false);
      }
    }
  });

  // py: test_api::test_a_complete_parse_keeps_a_solid_line
  it("полный разбор держит сплошную линию", () => {
    for (const label of ["003-p-2tim", "008-rorelsehindrad-avgift",
                         "007-gul-forbud-forhyrda-platser"]) {
      const d = answerFor(label);
      expect(d.completeness.category, label).toBe("full");
      for (const r of d.regimes) {
        for (const p of r.periods) expect(p.certain, label).toBe(true);
      }
    }
  });

  // py: test_api::test_certainty_follows_completeness_across_the_whole_set
  it("связь та же на всём наборе", () => {
    const trouble: [string, boolean, string][] = [];
    for (const label of answered()) {
      const d = answerFor(label, "2026-03-02T12:00");
      const full = d.completeness.category === "full";
      const privateLand = d.regimes.some((r: any) =>
        r.window_for.some((t: any) => t.text.includes("Private land")));
      for (const r of d.regimes) {
        for (const p of r.periods) {
          if (p.certain !== (full && !privateLand)) {
            trouble.push([label, p.certain, d.completeness.category]);
          }
        }
      }
    }
    expect(trouble.slice(0, 5)).toEqual([]);
  });

  // py: test_api::test_the_engine_note_reaches_the_screen_as_a_sentence_not_a_token
  it("заметка движка доходит до экрана предложением, а не токеном", () => {
    // `037`: на странице стояло `wayfinding_sign_permits_nothing`.
    const d = answerFor("037-hanvisning-p-med-pil");
    expect(d.note.token).toBe("wayfinding_sign_permits_nothing");
    expect(d.note.text.startsWith("This sign points the way")).toBe(true);
    expect(d.note.text).not.toContain("_");
  });

  // py: test_api::test_every_note_the_engine_can_produce_has_a_caption
  it("у каждой заметки движка есть подпись", () => {
    const src = read("web/src/lib/engine.ts");
    const tokens = new Set([...src.matchAll(/note: "([a-z_]+)"/g)].map((m) => m[1]));
    expect(tokens.size, "заметок в движке не нашлось").toBeGreaterThan(0);
    expect([...tokens].filter((t) => !(t in NOTE_TEXT))).toEqual([]);
  });
});

describe("вёрстка не сочиняет слов", () => {
  const timeline = () => read("web/src/components/PeriodTimeline.tsx");

  // py: test_api::test_the_circle_is_not_repeated_once_per_window
  it("круг стоящих не повторяется по разу на окно", () => {
    const page = read("web/src/components/WhoCanPark.tsx");
    expect(page).toContain("distinctCircles(");
    const rule = read("web/src/lib/circles.ts");
    expect(rule).toContain("seen.has(id)");
    expect(rule).toContain('map((t) => t.key).join("|")');
  });

  // py: test_api::test_the_clock_on_screen_is_the_clock_on_the_sign
  it("часы на экране — часы со знака", () => {
    const fmt = read("web/src/lib/when.ts");
    expect(fmt).toContain("hour12: false");
    expect(fmt).toContain('hourCycle: "h23"');
    expect(fmt).toContain("toLocaleString(LOCALE");
    expect(fmt).not.toContain("undefined");
    expect(timeline()).toContain('from "../lib/when"');
    expect(timeline(), "формат обязан жить в одном месте").not.toContain("toLocaleString");
  });

  // py: test_api::test_the_scale_stays_continuous_when_a_node_grows
  it("шкала остаётся непрерывной, когда узел растёт", () => {
    const page = timeline();
    expect(page).toContain("function Rail(");
    expect(page.split("<Rail p=").length - 1).toBeGreaterThanOrEqual(4);
    expect(page).toContain('className="flex items-stretch gap-3"');
    const dayNote = page.split("const DAY_NOTE =")[1].split(";")[0];
    expect(dayNote).toContain("font-semibold");
    expect(dayNote).toContain("text-ink-2");
    // Цвета смысла сюда не идут: красный на этой шкале уже значит «стоять нельзя»,
    // а класс дня — пояснение, а не правило. Запрет назван именами ТОКЕНОВ: прежние
    // «red» и «amber» после перехода на токены не встречаются в файле вовсе,
    // и проверка на них стала бы пустой, не перестав быть зелёной.
    for (const meaning of ["text-deny", "text-fee", "text-free"]) {
      expect(dayNote, meaning).not.toContain(meaning);
    }
    expect(page).toContain("note.text");
  });

  // py: test_api::test_the_window_never_claims_to_be_the_driver_s_plan
  it("окно не выдаёт себя за план водителя", () => {
    const page = timeline();
    expect(page).toContain('title="Window starts"');
    expect(page).toContain('title="Window ends"');
    expect(page).toContain("the sign carries on");
    expect(page).toContain("more windows to follow");
    expect(page, "длительность названа пределом, а не планом").toContain("max");
    for (const gone of ['title="Park start"', 'title="Park end"', "end of this stay"]) {
      expect(page, gone).not.toContain(gone);
    }
  });

  // py: test_api::test_a_ban_at_the_selected_time_is_shown_before_the_window
  it("запрет в начале показан ДО окна", () => {
    const page = timeline();
    const rule = read("web/src/lib/period.ts");
    expect(page).toContain('title="Your selected start time"');
    expect(page).toContain("splitWindow(periods)");
    expect(rule).toContain('periods[i].tone === "prohibited"');
    expect(page).toContain("{last && (");
    expect(page).toContain('title="Window ends"');
    expect(page).toContain("isStayLimit(p.tone)");
    expect(rule).toContain('tone !== "prohibited" && tone !== "not_stated"');
  });
});

describe("даты называются так, как их называет табличка", () => {
  // py: test_api::test_dates_are_stated_as_the_plate_states_them
  it("исключение остаётся исключением", () => {
    const phrase = timePhrase({ time_windows: [{ from: "00:00", to: "06:00",
      day_class: "named_weekday", named_weekday: "friday",
      dates: { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] } }] });
    expect(phrase).toContain("all year except July");
    expect(phrase).not.toContain("January");
    expect(phrase).not.toContain("December");
  });

  // py: test_api::test_single_excluded_days_are_named_as_days
  it("отдельные исключённые дни названы днями", () => {
    const phrase = timePhrase({ time_windows: [{ from: "00:00", to: "06:00",
      day_class: "named_weekday", named_weekday: "friday",
      dates: { mode: "except", ranges: [{ from: "06-15", to: "06-15" },
                                        { from: "08-15", to: "08-15" }] } }] });
    expect(phrase).toContain("all year except 15 June and 15 August");
  });

  // py: test_api::test_a_season_keeps_its_day_precision
  it("сезон сохраняет точность до дня", () => {
    const phrase = timePhrase({ time_windows: [{ from: "12:00", to: "15:00",
      day_class: "named_weekday", named_weekday: "tuesday",
      dates: { mode: "only", ranges: [{ from: "11-01", to: "05-15" }] } }] });
    expect(phrase).toContain("from 1 November to 15 May inclusive");
  });

  // py: test_api::test_a_whole_month_is_named_by_its_month
  it("целый месяц называется месяцем", () => {
    expect(rangeName({ from: "07-01", to: "07-31" })).toBe("July");
    expect(rangeName({ from: "06-15", to: "06-15" })).toBe("15 June");
    expect(rangeName({ from: "11-01", to: "05-15" })).toBe("1 November to 15 May");
  });
});

describe("справочник как источник слов", () => {
  // py: test_api::test_every_prohibiting_main_sign_has_a_wording_for_the_timed_case
  it("у каждого запрещающего знака есть формулировка для случая с часами", () => {
    const prohibiting = allEntries()
      .filter((e) => e.key.startsWith("main-") && e.key.includes("prohibition"))
      .map((e) => e.key);
    expect(prohibiting.filter((k) => !(k in TIMED_PROHIBITION_TEXT))).toEqual([]);
  });
});

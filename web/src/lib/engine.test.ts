// Движок правил. Перенесено из `tests/test_engine.py` ЦЕЛИКОМ (шаг 8).
//
// Тесты постоянные: каждый закрывает ошибку, уже допущенную при разборе вручную
// или найденную на проверке модели, и за многими стоит решение разработчика.
// Раньше сюда переехала только часть (16 из 63): остальное держала сверка
// с питоном, а сверка уходит вместе с ним.

import { describe, expect, it } from "vitest";

import { Calendar, EVE, RED, UNKNOWN, WEEKDAY } from "./calendar";
import { addDays, isoNaive, parseDate, parseNaive, weekday,
         type Civil, type Naive } from "./civil";
import { ALLOWED, FEE_PERIOD_ELSEWHERE, NOT_STATED, PROHIBITED, UNCERTAIN,
         evaluateParkingRules, horizonEnd, isoWeek, twentyFourHourExpiry,
         windowApplies, type Regime } from "./engine";
import { NO_WINDOW_NOTHING_STATED, regimeView, visible } from "./present";
import { recognise } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

const CAL = new Calendar();
const at = (iso: string): Naive => parseNaive(iso);
const iso = (t: Naive | null) => (t ? isoNaive(t) : null);

// --- конструкторы знаков ---------------------------------------------------

function sign(panels: Panel[] = [], main = "parking", form = "regular"): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: main as SignDoc["main_sign"]["type"], background_color: "blue",
                 form, legibility: { readable: true } },
    panels: panels.map((p, i) => ({ ...p, index: i + 1 })),
    panel_count: panels.length,
    boundaries: { certain: true },
  };
}

function plate(parsed: Parsed, lines: string[] = [], kind = "sign_plate",
               color = "blue"): Panel {
  return { kind: kind as Panel["kind"], lines, background_color: color,
           legibility: { readable: true }, parsed };
}

function win(from: string, to: string, dayClass = "unspecified", named?: string): TimeWindow {
  const w: TimeWindow = { from, to, day_class: dayClass as TimeWindow["day_class"] };
  if (named) w.named_weekday = named as TimeWindow["named_weekday"];
  return w;
}

/** Состояние и условия режима в конкретный момент. */
function state(r: Regime, moment: string): [string | null, string[]] {
  for (const p of r.periods) {
    if (isoNaive(p.start) <= moment && moment < isoNaive(p.end)) return [p.state, p.conditions];
  }
  return [null, []];
}

const evaluate = (doc: SignDoc, moment: string) => evaluateParkingRules(doc, at(moment), CAL);
const first = (doc: SignDoc, moment: string) => evaluate(doc, moment).regimes[0];
const expiry = (moment: string) => iso(twentyFourHourExpiry(at(moment), CAL));
/** Что экран скажет вместо шкалы, если скажет. */
const noWindow = (r: Regime, moment: string) =>
  regimeView(r, horizonEnd(at(moment)), CAL).no_window_text;

const TWO_TIM: Parsed = { duration_limit: { amount: 2, unit: "hours" } };
const AVGIFT_8_18: Parsed = { fee: true, time_windows: [win("08:00", "18:00", WEEKDAY)] };

/** Зональный запрет: `Onsdag 9-12`, чётные недели, с 1 октября по 30 апреля. */
function zonal(): TimeWindow {
  const w = win("09:00", "12:00", "named_weekday", "wednesday");
  w.week_parity = "even";
  w.dates = { mode: "only", ranges: [{ from: "10-01", to: "04-30" }] };
  return w;
}

describe("календарь в движке", () => {
  // py: test_engine::test_day_classes_match_fixture
  it("кануны 2026 года: 57, из них 48 суббот", () => {
    const eves: Civil[] = [];
    for (let d: Civil = { y: 2026, m: 1, d: 1 }; d.y === 2026; d = addDays(d, 1)) {
      if (CAL.dayClass(d) === EVE) eves.push(d);
    }
    expect(eves).toHaveLength(57);
    expect(eves.filter((d) => weekday(d) === 5)).toHaveLength(48);
  });

  // py: test_engine::test_red_beats_eve
  it("праздник на субботу остаётся красным: канун — РАБОЧИЙ день перед красным", () => {
    expect(CAL.dayClass(parseDate("2026-06-06"))).toBe(RED);     // Sveriges nationaldag
    expect(CAL.dayClass(parseDate("2026-12-25"))).toBe(RED);     // перед вторым днём
    expect(CAL.dayClass(parseDate("2026-01-10"))).toBe(EVE);     // обычная суббота
    expect(CAL.dayClass(parseDate("2026-04-30"))).toBe(EVE);     // будний канун
    expect(CAL.dayClass(parseDate("2026-01-09"))).toBe(WEEKDAY); // пятница
  });

  // py: test_engine::test_date_outside_calendar_is_unknown
  it("вне окна с запасом — «неизвестно», а не выдумка", () => {
    expect(CAL.dayClass(parseDate("2035-03-01"))).toBe(UNKNOWN);
    expect(CAL.dayClass(parseDate("2019-03-01"))).toBe(UNKNOWN);
  });
});

describe("правило 24 часов", () => {
  // py: test_engine::test_24h_guaranteed_continuity
  it("выходные обрывают сутки, и они даются заново с понедельника", () => {
    // Правило спорное; разработчик сверил распространённость трактовок и выбрал
    // преобладающую — «гарантированная непрерывность» (решение 82).
    expect(expiry("2026-03-02T13:00")).toBe("2026-03-03T13:00");
    expect(expiry("2026-03-05T13:00")).toBe("2026-03-06T13:00");
    expect(expiry("2026-03-06T13:00")).toBe("2026-03-10T00:00");
    expect(expiry("2026-03-06T23:30")).toBe("2026-03-10T00:00");
  });

  // py: test_engine::test_24h_all_weekend_starts_give_the_same_answer
  it("любое начало в выходные даёт один ответ — до вторника 00:00", () => {
    for (const start of ["2026-03-07T00:01", "2026-03-07T08:00", "2026-03-08T23:59"]) {
      expect(expiry(start), start).toBe("2026-03-10T00:00");
    }
  });

  // py: test_engine::test_24h_friday_afternoon_is_not_cut_short_by_saturday
  it("пятница 13:00 не обрезается субботой: сутки даются целиком позже", () => {
    expect(expiry("2026-03-06T13:00")).not.toBe("2026-03-07T13:00");
    expect(expiry("2026-03-06T13:00")).toBe("2026-03-10T00:00");
  });

  // py: test_engine::test_duration_plate_overrides_24h
  it("табличка длительности перекрывает умолчание, а не складывается с ним", () => {
    const bare = first(sign(), "2026-03-02T13:00");
    const limited = first(sign([plate({ duration_limit: { amount: 30, unit: "minutes" } },
                                      ["30 min"])]), "2026-03-02T13:00");
    expect(bare.durationSource).toBe("24h_default");
    expect(limited.durationSource).toBe("plate");
    expect(iso(limited.durationExpiresAt)).toBe("2026-03-02T13:30");
  });
});

describe("официальная пара: одни и те же слова, разная группировка", () => {
  // py: test_engine::test_official_pair_two_plates
  it("ДВЕ таблички: 2 часа всегда, плата — только 8-18", () => {
    const r = first(sign([plate(TWO_TIM, ["2 tim"]), plate(AVGIFT_8_18, ["Avgift", "8-18"])]),
                    "2026-03-02T20:00");
    expect(r.durationSource).toBe("plate");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
  });

  // py: test_engine::test_official_pair_one_plate
  it("ОДНА табличка: и лимит, и плата живут внутри окна", () => {
    const joint = sign([plate({ ...TWO_TIM, ...AVGIFT_8_18 }, ["2 tim", "Avgift", "8-18"])]);
    const r = first(joint, "2026-03-02T20:00");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
    // Вечером, вне окна, лимит не идёт — отсчитывать не с чего. Но и «сутки» —
    // не ответ: в 08:00 окно откроется, и с этой минуты пойдут два часа.
    // Раньше тест утверждал `24h_default` и закреплял ошибку со снимка `005`.
    expect(iso(r.durationExpiresAt)).not.toBe("2026-03-02T22:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T10:00");
    expect(r.durationSource).toBe("plate");
    // Внутри окна лимит идёт от самой постановки.
    const inside = first(joint, "2026-03-03T10:00");
    expect(inside.durationSource).toBe("plate");
    expect(iso(inside.durationExpiresAt)).toBe("2026-03-03T12:00");
  });

  // py: test_engine::test_a_limit_that_starts_later_ends_the_stay_when_it_starts
  it("вступающий позже предел обрывает стоянку с начала своего окна", () => {
    // Снимок `005`: пятница 22:10, продукт отвечал «сутки, до вторника».
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "18:00", WEEKDAY),
                                                             win("08:00", "15:00", EVE)] },
                                ["2 tim", "8-18", "(8-15)"])]), "2026-09-04T22:10");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-05T10:00");
    expect(r.durationSource).toBe("plate");
  });

  // py: test_engine::test_a_limit_wider_than_its_window_never_bites
  it("предел шире своего окна не кусается вовсе", () => {
    // `2 tim` в окне `08-09`: в 09:00 ограничение уже кончилось.
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "09:00", WEEKDAY)] },
                                ["2 tim", "8-9"])]), "2026-03-02T20:00");
    expect(r.durationSource).toBe("24h_default");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T20:00");
  });

  // py: test_engine::test_conclusion_differs_from_any_single_plate
  it("итог стопки не совпадает с итогом ни одной её таблички", () => {
    const now = "2026-03-03T10:00";
    const full = first(sign([plate(TWO_TIM, ["2 tim"]), plate(AVGIFT_8_18, ["Avgift", "8-18"])]), now);
    const a = first(sign([plate(TWO_TIM, ["2 tim"])]), now);
    const b = first(sign([plate(AVGIFT_8_18, ["Avgift", "8-18"])]), now);
    expect(state(full, now)).not.toEqual(state(a, now));   // у первой нет платы
    expect(full.durationSource).not.toBe(b.durationSource); // у второй нет лимита
  });
});

describe("дни без указания и `alla dagar`", () => {
  // py: test_engine::test_unspecified_days_means_weekdays_only
  it("дни не указаны — это будни, а не каждый день", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                ["Avgift 8-18"])]), "2026-03-03T10:00");
    expect(state(r, "2026-03-03T10:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T10:00")).toEqual([ALLOWED, []]);   // суббота
  });

  // py: test_engine::test_all_days_token_covers_weekend
  it("`alla dagar` накрывает выходные", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00", "all_days")] },
                                ["Avgift 8-18", "alla dagar"])]), "2026-03-03T10:00");
    expect(state(r, "2026-03-07T10:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("приоритет запрета и окна под запрещающим знаком", () => {
  // py: test_engine::test_prohibition_overrides_permission
  it("«час бесплатно, но стоять нельзя» решается в пользу запрета", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
    expect(state(r, "2026-03-05T08:00")[0]).toBe(ALLOWED);
  });

  // py: test_engine::test_a_window_under_a_prohibiting_sign_limits_the_prohibition
  it("окно под запрещающим знаком очерчивает запрет", () => {
    // Зональный `E20`: «No parking» в сентябрьскую среду нечётной недели, когда
    // ни одно условие таблички не выполнено (решение 113).
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    const stateFrom = (moment: string, from: string) => state(first(s, from), moment)[0];
    expect(stateFrom("2026-09-09T12:33", "2026-09-09T12:33")).toBe(NOT_STATED);
    expect(stateFrom("2026-10-14T10:00", "2026-10-13T12:00")).toBe(PROHIBITED);  // чётная
    expect(stateFrom("2026-10-14T13:00", "2026-10-13T12:00")).toBe(NOT_STATED);  // после 12:00
    expect(stateFrom("2026-10-15T10:00", "2026-10-13T12:00")).toBe(NOT_STATED);  // четверг
    expect(stateFrom("2026-10-21T10:00", "2026-10-20T12:00")).toBe(NOT_STATED);  // нечётная
  });

  // py: test_engine::test_a_sign_that_states_nothing_shows_no_window_at_all
  it("знак, которому нечего сказать, окна не показывает вовсе", () => {
    const moment = "2026-09-09T16:27";
    const silent = first(sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12"])],
                              "prohibition_parking"), moment);
    expect(new Set(silent.periods.map((p) => p.state))).toEqual(new Set([NOT_STATED]));
    expect(noWindow(silent, moment)).toBe(NO_WINDOW_NOTHING_STATED);
    // А там, где знаку есть что сказать, шкала остаётся.
    expect(noWindow(first(sign([plate({ fee: true }, ["Avgift"])]), moment), moment)).toBeNull();
  });

  // py: test_engine::test_the_scale_shows_only_what_the_sign_states
  it("шкала — только о том, что знак говорит о выбранном моменте", () => {
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    // Понедельник: знак молчит — шкалы нет, есть фраза.
    const quiet = first(s, "2026-10-12T10:00");
    expect(visible(quiet)).toEqual([]);
    expect(noWindow(quiet, "2026-10-12T10:00")).toBe(NO_WINDOW_NOTHING_STATED);
    // Среда внутри окна: только запрет, и ничего после него.
    const ban = first(s, "2026-10-14T10:00");
    const shown = visible(ban);
    expect(shown.map((p) => p.state)).toEqual([PROHIBITED]);
    expect(isoNaive(shown[0].end)).toBe("2026-10-14T12:00");
    expect(noWindow(ban, "2026-10-14T10:00")).toBeNull();
    // Знак, которому есть что сказать, показывает окно целиком.
    const paid = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                   ["Avgift 8-18"])]), "2026-03-02T09:00");
    expect(visible(paid).length).toBeGreaterThanOrEqual(1);
    expect(noWindow(paid, "2026-03-02T09:00")).toBeNull();
  });

  // py: test_engine::test_a_window_under_a_permitting_sign_still_returns_to_permission
  it("под разрешающим знаком вне окна возвращается разрешение, а не молчание", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("08:00", "18:00")] },
                                ["Avgift 8-18"])]), "2026-03-02T07:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
  });

  // py: test_engine::test_ovrig_tid_still_beats_silence_under_a_prohibiting_sign
  it("`övrig tid` сильнее молчания и под запрещающим знаком", () => {
    const r = first(sign([
      plate({ time_windows: [win("07:00", "18:00")] }, ["7-18"]),
      plate({ scope_shift: "remaining_time", permits_parking: true, fee: true },
            ["P Avgift övrig tid"]),
    ], "prohibition_parking"), "2026-03-02T06:00");
    expect(state(r, "2026-03-02T12:00")[0]).toBe(PROHIBITED);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
  });

  // py: test_engine::test_named_weekday_ignores_holiday_calendar
  it("названный день недели — литерал: запрет и в праздничный четверг", () => {
    expect(CAL.dayClass(parseDate("2026-01-01"))).toBe(RED);     // Nyårsdagen, четверг
    const r = first(sign([
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2025-12-31T23:00");
    expect(state(r, "2026-01-01T03:00")).toEqual([PROHIBITED, []]);
  });

  // py: test_engine::test_a_prohibiting_sign_without_plates_prohibits_always
  it("запрещающий знак без табличек запрещает всегда", () => {
    const r = first(sign([], "prohibition_parking"), "2026-09-09T12:00");
    expect(state(r, "2026-09-09T12:00")[0]).toBe(PROHIBITED);
    expect(state(r, "2026-09-12T03:00")[0]).toBe(PROHIBITED);
  });

  // py: test_engine::test_prohibition_main_sign_inverts_base
  it("запрещающий основной знак переворачивает базу; `övrig tid` открывает дополнение", () => {
    // Снимок `019`: запрет в будни 7-18, в остальное время — обычный P с платой.
    const r = first(sign([
      plate({ time_windows: [win("07:00", "18:00", WEEKDAY)] }, ["7-18"], "sign_plate", "yellow"),
      plate({ fee: true, scope_shift: "remaining_time", permits_parking: true },
            ["P Avgift", "övrig tid"]),
    ], "prohibition_parking"), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([PROHIBITED, []]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("предел и окно", () => {
  // py: test_engine::test_a_window_to_24_00_runs_to_the_end_of_the_day
  it("`24:00` и `23:59` — конец суток, а не минута до него", () => {
    const r = first(sign([plate({ fee: true, time_windows: [win("00:00", "24:00")] },
                                ["Avgift 00-24"])]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T23:59")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    // Модель пишет `00:00-23:59` там, где на знаке `00-24` (снимок `049`).
    const almost = first(sign([plate({ fee: true, time_windows: [win("00:00", "23:59")] },
                                     ["Avgift 00-24"])]), "2026-03-02T12:00");
    expect(state(almost, "2026-03-02T23:59")).toEqual([ALLOWED, ["avgift"]]);
    const edges = almost.periods.flatMap((p) => [p.start, p.end])
      .filter((t) => t.hh === 23 && t.mm === 59);
    expect(edges, "сутки не режутся на куски").toEqual([]);
  });

  // py: test_engine::test_a_limit_does_not_outlive_the_window_that_set_it
  it("предел не переживает окно, которое его ввело", () => {
    // Снимок `005`, пятница 30 октября 2026 — канун Alla helgons dag: окно в скобках
    // закрывается в 15:00, а продукт отвечал «до 16:00» (решение 118).
    const s = sign([plate({ ...TWO_TIM, time_windows: [win("08:00", "18:00", WEEKDAY),
                                                       win("08:00", "15:00", EVE)] },
                          ["2 tim", "8-18", "(8-15)"])]);
    expect(CAL.dayClass(parseDate("2026-10-30"))).toBe(EVE);
    const r = first(s, "2026-10-30T14:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-11-02T10:00");
    expect(r.durationSource).toBe("plate");
    expect(iso(first(s, "2026-10-30T09:00").durationExpiresAt)).toBe("2026-10-30T11:00");
  });

  // py: test_engine::test_a_window_cut_by_midnight_is_still_one_window
  it("окно, разрезанное полуночью, остаётся одним окном", () => {
    const r = first(sign([plate({ ...TWO_TIM, time_windows: [win("20:00", "02:00")] },
                                ["2 tim", "20-02"])]), "2026-09-09T23:00");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-10T01:00");
    expect(r.durationSource).toBe("plate");
  });

  // py: test_engine::test_a_silent_period_carries_no_stay_limit
  it("молчащий отрезок не несёт предела стоянки", () => {
    // Рядом с «Nothing stated on the sign» стояло «47 h max» — число от начала
    // ближайшего запрета, читавшееся как позволение столько простоять.
    const s = sign([plate({ time_windows: [zonal()] }, ["Onsdag 9-12", "jämna veckor"])],
                   "prohibition_parking");
    const r = first(s, "2026-10-12T10:00");
    expect(state(r, "2026-10-12T10:00")[0]).toBe(NOT_STATED);
    expect(r.periods.some((p) => p.state === PROHIBITED)).toBe(true);
    expect(r.durationExpiresAt).toBeNull();
    expect(r.durationSource).toBeNull();
    // А там, где знак стоянку даёт, запрет её по-прежнему обрывает.
    const speaking = first(sign([
      plate({ prohibition: true, time_windows: [win("10:00", "14:00", "named_weekday", "thursday")] },
            ["Torsd 10-14"], "sign_plate", "yellow"),
    ]), "2026-03-04T12:00");
    expect(speaking.durationSource).toBe("prohibition");
    expect(iso(speaking.durationExpiresAt)).toBe("2026-03-05T10:00");
  });

  // py: test_engine::test_prohibition_ends_the_stay_earlier_than_the_24h_limit
  it("запрет обрывает стоянку раньше суток", () => {
    // `Torsdag 10-14` — машину убрать в 10:00, а не досидеть до 18:41 следующего дня.
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, time_windows: [win("10:00", "14:00", "named_weekday", "thursday")] },
            ["Torsdag 10-14"]),
    ]), "2026-09-02T18:41");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-03T10:00");
    expect(r.durationSource).toBe("prohibition");
  });

  // py: test_engine::test_without_a_prohibition_the_24h_limit_still_governs
  it("без запрета правит правило 24 часов", () => {
    const r = first(sign([plate({ fee: true }, ["Avgift"])]), "2026-09-02T18:41");
    expect(iso(r.durationExpiresAt)).toBe("2026-09-03T18:41");
    expect(r.durationSource).toBe("24h_default");
  });
});

describe("адресат условия: пиктограмма на табличке (решение 120)", () => {
  /** Frihamnen: `30 min 00-24 (00-14)` для всех, `[автобус] Avgift (14-24) 00-24`. */
  const frihamnen = () => sign([
    plate({ duration_limit: { amount: 30, unit: "minutes" },
            time_windows: [win("00:00", "24:00", WEEKDAY), win("00:00", "14:00", EVE)] },
          ["30 min", "00-24", "(00-14)"]),
    plate({ fee: true, vehicle_class: "bus",
            time_windows: [win("14:00", "24:00", EVE), win("00:00", "24:00", RED)] },
          ["Avgift", "(14-24)", "00-24"]),
  ]);

  // py: test_engine::test_a_pictogram_on_a_plate_with_a_rule_addresses_that_rule
  it("пиктограмма рядом с условием говорит, КОМУ условие, а не кому места", () => {
    const ev = evaluate(frihamnen(), "2026-09-13T10:00");
    expect(ev.regimes.map((r) => r.audience)).toEqual([null, "pictogram-bus"]);
    expect(ev.regimes.every((r) => r.eligibility.length === 0)).toBe(true);
    expect(ev.regimes[0].audienceExcluded).toEqual(["pictogram-bus"]);
    const [everyone, buses] = ev.regimes;
    expect(state(everyone, "2026-09-13T10:00")).toEqual([ALLOWED, []]);        // воскресенье
    expect(state(buses, "2026-09-13T10:00")).toEqual([ALLOWED, ["avgift"]]);
    // Будни: обеим половинам одно и то же — полчаса с первой таблички.
    const moment = "2026-09-10T21:15";
    for (const r of evaluate(frihamnen(), moment).regimes) {
      const p = r.periods.find((x) => isoNaive(x.start) <= moment && moment < isoNaive(x.end))!;
      expect([p.state, p.conditions, p.maxDurationMinutes]).toEqual([ALLOWED, [], 30]);
    }
  });

  // py: test_engine::test_a_pictogram_alone_still_narrows_the_whole_sign
  it("пиктограмма отдельной табличкой — круг стоящих", () => {
    // Снимок `038`: места отведены автобусам.
    const ev = evaluate(sign([plate({ vehicle_class: "bus", pictogram: "bus" }),
                              plate({ eligibility: "visitors" }, ["Besökande"])]),
                        "2026-03-02T12:00");
    expect(ev.regimes).toHaveLength(1);
    expect(ev.regimes[0].audience).toBeNull();
    expect(ev.regimes[0].eligibility).toContain("pictogram-bus");
  });

  // py: test_engine::test_only_a_pictogram_standing_alone_narrows_the_sign
  it("сужает круг только пиктограмма, стоящая на табличке одна", () => {
    // Правило разработчика: рядом с ней что угодно ещё — и табличка уже не отводит
    // места, а ставит условие своему транспорту.
    const alone = evaluate(sign([plate({ vehicle_class: "bus", pictogram: "bus" })]),
                           "2026-03-02T12:00");
    expect(alone.regimes).toHaveLength(1);
    expect(alone.regimes[0].eligibility).toEqual(["pictogram-bus"]);
    expect(alone.regimes[0].audience).toBeNull();
    const withRule = evaluate(sign([plate({ vehicle_class: "bus", fee: true }, ["Avgift"])]),
                              "2026-03-02T12:00");
    expect(withRule.regimes.map((r) => r.audience)).toEqual([null, "pictogram-bus"]);
    expect(withRule.regimes.every((r) => r.eligibility.length === 0)).toBe(true);
  });

  // py: test_engine::test_ovrig_tid_counts_the_whole_sign_not_half_of_it
  it("«övrig tid» считается по всему знаку, а не по половине", () => {
    // Снимок `049`: сезон занят табличкой мопедов — для прочих машин он
    // «остальным временем» НЕ является (решение 121).
    const season = win("00:00", "24:00", "all_days");
    season.dates = { mode: "only", ranges: [{ from: "04-01", to: "09-30" }] };
    const s = sign([
      plate({ fee: true, tariff_code: "Taxa 12", vehicle_class: "motorcycle",
              time_windows: [season] }, ["1/4-30/9", "Avgift", "Taxa 12"]),
      plate({ fee: true, tariff_code: "Taxa 2", scope_shift: "remaining_time" },
            ["Övrig tid", "Avgift", "Taxa 2"]),
    ]);
    const [everyone, mopeds] = evaluate(s, "2026-07-15T12:00").regimes;
    expect(state(everyone, "2026-07-15T12:00")).toEqual([ALLOWED, []]);      // знак молчит
    expect(state(mopeds, "2026-07-15T12:00")).toEqual([ALLOWED, ["avgift"]]);
    // Молчание не выдаётся за бесплатность: отрезок помечен.
    const now = everyone.periods.find((p) => isoNaive(p.start) <= "2026-07-15T12:00"
                                           && "2026-07-15T12:00" < isoNaive(p.end))!;
    expect(now.note).toBe(FEE_PERIOD_ELSEWHERE);
    expect(mopeds.periods.every((p) => p.note === null)).toBe(true);
    // Вне сезона платят все, и половины сходятся.
    for (const r of evaluate(s, "2026-11-16T12:00").regimes) {
      expect(state(r, "2026-11-16T12:00")).toEqual([ALLOWED, ["avgift"]]);
    }
  });

  // py: test_engine::test_arrows_and_audience_divide_the_sign_independently
  it("стрелка и адресат делят знак по очереди и независимо", () => {
    // Автобусная табличка над стрелкой влево делит только левый участок.
    const ev = evaluate(sign([
      plate({ duration_limit: { amount: 30, unit: "minutes" } }, ["30 min"]),
      plate({ fee: true, vehicle_class: "bus" }, ["Avgift"]),
      plate({ arrow: "left" }),
      plate(TWO_TIM, ["2 tim"]),
      plate({ arrow: "right" }),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => [r.extent, r.audience])).toEqual([
      ["left", null], ["left", "pictogram-bus"], ["right", null]]);
    expect(state(ev.regimes[0], "2026-03-02T12:00")).toEqual([ALLOWED, []]);
    expect(state(ev.regimes[1], "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("сдвиг охвата", () => {
  // py: test_engine::test_ovrig_tid_fills_the_complement
  it("`övrig tid` заполняет дополнение к окну", () => {
    const r = first(sign([
      plate({ permit_required: true, time_windows: [win("07:00", "17:00", WEEKDAY)] },
            ["Särskilt P-tillstånd erfordras", "07-17"]),
      plate({ fee: true, scope_shift: "remaining_time" }, ["Övrig tid", "avgift"]),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["sarskilt-p-tillstand"]]);
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(state(r, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);   // суббота
  });

  // py: test_engine::test_without_scope_shift_base_returns_outside_window
  it("без сдвига вне окна возвращается базовый режим", () => {
    const r = first(sign([plate(AVGIFT_8_18, ["Avgift 8-18"])]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T20:00")).toEqual([ALLOWED, []]);
  });
});

describe("эталоны знаков Б и В", () => {
  // py: test_engine::test_sign_b_developer_reading
  it("знак Б: мотоциклам платно в свои часы, прочим свободно, запрет для всех", () => {
    // Разбор перечитан разработчиком 2026-09-10: пиктограмма стоит вместе
    // с `Avgift 7-19 (11-17) Taxa 13`, значит мест не отводит.
    const ev = evaluate(sign([
      plate({ vehicle_class: "motorcycle", fee: true, tariff_code: "Taxa 13",
              time_windows: [win("07:00", "19:00", WEEKDAY), win("11:00", "17:00", EVE)] },
            ["Avgift", "7-19", "(11-17)", "Taxa 13"]),
      plate({ stretch_metres: { from: 0, to: 5 } }, ["0-5 m"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"], "sign_plate", "yellow"),
    ]), "2026-03-02T12:00");
    const [everyone, bikes] = ev.regimes;
    expect([everyone.audience, bikes.audience]).toEqual([null, "pictogram-motorcycle"]);
    expect(everyone.eligibility).toEqual([]);
    expect(bikes.eligibility).toEqual([]);
    expect(everyone.placeNotes).toContain("stretch-metres");
    expect(state(bikes, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);   // будни 7-19
    expect(state(bikes, "2026-03-07T12:00")).toEqual([ALLOWED, ["avgift"]]);   // суббота 11-17
    expect(state(bikes, "2026-03-07T09:00")).toEqual([ALLOWED, []]);           // суббота до 11
    expect(state(bikes, "2026-03-02T20:00")).toEqual([ALLOWED, []]);           // вне окна
    expect(state(everyone, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
    expect(state(everyone, "2026-03-07T12:00")).toEqual([ALLOWED, []]);
    expect(state(everyone, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
    expect(state(bikes, "2026-03-05T03:00")).toEqual([PROHIBITED, []]);
  });

  // py: test_engine::test_sign_v_no_vehicle_plate_does_not_narrow
  it("знак В: без таблички транспорта круг по транспорту не сужается", () => {
    const r = first(sign([
      plate({ fee: true, tariff_code: "Taxa 3",
              time_windows: [win("07:00", "19:00", WEEKDAY), win("11:00", "17:00", EVE)] },
            ["Avgift", "7-19", "(11-17)", "Taxa 3"]),
      plate({ prohibition: true, time_windows: [win("00:00", "06:00", "named_weekday", "monday")] },
            ["Månd 0-6"], "sign_plate", "yellow"),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-03T12:00");
    const vehicles = ["pictogram-motorcycle", "bil-personbil", "pictogram-electric-car"];
    expect(r.eligibility.filter((k) => vehicles.includes(k))).toEqual([]);
    expect(r.eligibility).toEqual(["boende"]);
    expect(state(r, "2026-03-09T03:00")).toEqual([PROHIBITED, []]);   // понедельник 0-6
    expect(state(r, "2026-03-03T12:00")).toEqual([ALLOWED, ["avgift"]]);
  });
});

describe("стрелки и участки", () => {
  // py: test_engine::test_arrows_split_into_two_regimes
  it("стрелка закрывает указание над собой: два участка — два режима", () => {
    // Снимок `010`.
    const ev = evaluate(sign([
      plate({ eligibility: "rented" }, ["Förhyrda platser"]),
      plate({ arrow: "left" }, [], "sign_plate", "white"),
      plate({ eligibility: "rented", permit_required: true },
            ["Förhyrd plats", "Särskilt P-tillstånd erfordras"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes).toHaveLength(2);
    const [left, right] = ev.regimes;
    expect([left.extent, right.extent]).toEqual(["left", "right"]);
    expect(left.eligibility).toEqual(["forhyrda-platser"]);
    expect(right.eligibility).toEqual(["forhyrda-platser", "sarskilt-p-tillstand"]);
  });

  // py: test_engine::test_no_arrow_means_here
  it("нет стрелки — место здесь", () => {
    const ev = evaluate(sign([plate({ vehicle_class: "motorcycle" })]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["here"]);
  });

  // py: test_engine::test_info_board_below_the_arrow_is_not_a_second_stretch
  it("табло под стрелкой второго участка не заводит", () => {
    const ev = evaluate(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ arrow: "both_horizontal" }),
      plate({ area_code: "8010" }, ["Områdeskod 8010"], "info_board"),
    ]), "2026-09-02T18:41");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["both_sides"]);
  });

  // py: test_engine::test_plates_below_the_last_arrow_do_not_make_a_second_stretch
  it("таблички ниже последней стрелки второго участка не заводят", () => {
    // Снимок `033`: `Zon E` и `Boende Storskogen` под стрелкой влево.
    const ev = evaluate(sign([
      plate(AVGIFT_8_18, ["Avgift", "8-18"]),
      plate({ arrow: "left" }),
      plate({ tariff_code: "Zon E" }, ["Zon E"]),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["left"]);
    expect(ev.regimes[0].eligibility).toContain("boende");
  });

  // py: test_engine::test_the_tail_reaches_every_stretch_not_just_the_last
  it("хвост стопки достаётся каждому участку, а не последнему", () => {
    const ev = evaluate(sign([
      plate(TWO_TIM, ["2 tim"]),
      plate({ arrow: "left" }),
      plate(AVGIFT_8_18, ["Avgift", "8-18"]),
      plate({ arrow: "right" }),
      plate({ eligibility: "residents" }, ["Boende"], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(ev.regimes.map((r) => r.extent)).toEqual(["left", "right"]);
    for (const r of ev.regimes) expect(r.eligibility, r.extent).toContain("boende");
  });

  // py: test_engine::test_a_sign_without_arrows_is_still_one_stretch_here
  it("знак без стрелок — по-прежнему один участок здесь", () => {
    expect(evaluate(sign([plate(TWO_TIM, ["2 tim"])]), "2026-03-02T12:00").regimes
      .map((r) => r.extent)).toEqual(["here"]);
  });

  // py: test_engine::test_an_arrow_under_a_wayfinding_sign_means_direction_not_extent
  it("стрелка под указателем — направление, а не протяжённость", () => {
    // Снимок `037`: указатель стоянки не разрешает вовсе, протягивать нечего.
    const keys = recognise(sign([plate({ arrow: "right", pictogram: "arrow" })],
                                "wayfinding_parking_house")).panelKeys[1];
    expect(keys).toEqual(["wayfinding-direction"]);
  });

  // py: test_engine::test_the_same_arrow_under_a_parking_sign_is_still_the_extent
  it("та же стрелка под обычным `P` — по-прежнему протяжённость", () => {
    const keys = recognise(sign([plate({ arrow: "right", pictogram: "arrow" })])).panelKeys[1];
    expect(keys).toEqual(["arrow-right"]);
  });
});

describe("границы продукта", () => {
  // py: test_engine::test_info_board_never_enters_rules
  it("платёжное табло в правила не попадает", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ area_code: "31370" }, ["Områdeskod 31370"], "info_board", "other"),
    ]), "2026-03-02T12:00");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(r.placeNotes).toEqual([]);
  });

  // py: test_engine::test_wayfinding_sign_permits_nothing
  it("указатель не разрешает ничего", () => {
    const ev = evaluate(sign([], "wayfinding_park_and_ride"), "2026-03-02T12:00");
    expect(ev.permitsParking).toBe(false);
    expect(ev.regimes).toEqual([]);
  });

  // py: test_engine::test_date_outside_calendar_is_uncertain_not_error
  it("дата вне календаря — неопределённость, а не ошибка", () => {
    const ev = evaluate(sign([plate(AVGIFT_8_18)]), "2035-05-03T10:00");
    expect(ev.uncertainties).toContain("date_outside_calendar");
    expect(ev.regimes[0].periods.some((p) => p.state === UNCERTAIN)).toBe(true);
  });

  // py: test_engine::test_residents_plate_answers_who_can_park
  it("`Boende` отвечает на вопрос «кому»", () => {
    const r = first(sign([plate({ eligibility: "residents" }, ["Boende Solna"])]),
                    "2026-09-02T19:27");
    expect(r.eligibility).toEqual(["boende"]);
  });
});

describe("эталоны со снимков 020-026", () => {
  // py: test_engine::test_sign_022_charging_electric_only
  it("022: два места справа только для заряжающихся электромобилей, 4 часа, платно", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ duration_limit: { amount: 4, unit: "hours" } }, ["4 tim"]),
      plate({ vehicle_class: "electric" }, ["Endast laddande elbilar"]),
      plate({ place_count: 2 }, ["2 platser"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
      plate({ area_code: "31308" }, ["Områdeskod 31308"], "info_board", "other"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("right");
    expect(r.eligibility).toEqual(["pictogram-electric-car"]);
    expect(r.placeNotes).toContain("place-count");
    // Плата и лимит без окон действуют всегда: и в будни, и в выходные, и ночью.
    for (const moment of ["2026-03-02T12:00", "2026-03-07T03:00", "2026-03-08T23:00"]) {
      expect(state(r, moment), moment).toEqual([ALLOWED, ["avgift"]]);
    }
    expect(r.durationSource).toBe("plate");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T16:00");
  });

  // py: test_engine::test_sign_023_same_rule_without_count_and_arrow
  it("023: то же правило без числа мест и стрелки — вывод тот же", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ duration_limit: { amount: 4, unit: "hours" } }, ["4 tim"]),
      plate({ vehicle_class: "electric" }, ["Endast laddande elbilar"]),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("here");
    expect(r.placeNotes).toEqual([]);
    expect(r.eligibility).toEqual(["pictogram-electric-car"]);
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T16:00");
  });

  // py: test_engine::test_forhyrda_platser_with_numbered_spaces
  it("020: арендованные места с номерами — ворота по аренде", () => {
    const r = first(sign([
      plate({ eligibility: "rented" }, ["Förhyrda platser", "Gäller plats 13 och 14"]),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("right");
    expect(r.eligibility).toEqual(["forhyrda-platser"]);
  });

  // py: test_engine::test_privat_parkering_does_not_restrict
  it("021: «Privat parkering» правил не задаёт", () => {
    // Знак `P` на частной земле означает то же: стоять может кто угодно, 24 часа.
    const r = first(sign([
      plate({ operator: { name: "Brf Ängslyckan" } } as unknown as Parsed,
            ["Privat parkering", "Brf Ängslyckan"], "operator_plate"),
      plate({ arrow: "right" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.eligibility, "круг не сужается").toEqual([]);
    expect(r.durationSource, "умолчание в 24 часа действует").toBe("24h_default");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
  });

  // py: test_engine::test_sign_024_payment_by_phone_only
  it("024: способ оплаты в область продукта не входит — важно только «платно»", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift erläggs med"]),
      plate({ arrow: "both_horizontal" }, [], "sign_plate", "white"),
      plate({ operator: { name: "Västia Parkering", phone: "0771-501550" } } as unknown as Parsed,
            ["Västia Parkering", "0771-501550"], "operator_plate"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("both_sides");
    for (const moment of ["2026-03-02T12:00", "2026-03-07T23:00"]) {
      expect(state(r, moment), moment).toEqual([ALLOWED, ["avgift"]]);
    }
    expect(r.durationSource).toBe("24h_default");
  });

  // py: test_engine::test_sign_025_eligibility_and_duration_on_one_plate
  it("025: `30 min` и «только гостям» на одной табличке — одно указание", () => {
    const r = first(sign([
      plate({ stretch_metres: { from: 0, to: 30 } }, ["0-30 m"]),
      plate({ duration_limit: { amount: 30, unit: "minutes" }, eligibility: "visitors" },
            ["30 min", "Endast gäster till Franks Gatukök"]),
      plate({ arrow: "left" }, [], "sign_plate", "white"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("left");
    expect(r.eligibility).toEqual(["besokande"]);
    expect(r.placeNotes).toContain("stretch-metres");
    expect(r.durationSource).toBe("plate");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-02T12:30");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, []]);
  });

  // py: test_engine::test_metres_are_not_minutes
  it("метры не становятся минутами", () => {
    // Ловушка снимка `025`: `0-30 m` и `30 min` стоят рядом.
    const r = first(sign([plate({ stretch_metres: { from: 0, to: 30 } }, ["0-30 m"])]),
                    "2026-03-02T12:00");
    expect(r.durationSource).toBe("24h_default");
    expect(iso(r.durationExpiresAt)).toBe("2026-03-03T12:00");
  });

  // py: test_engine::test_sign_026_zone_reads_as_ordinary_sign
  it("026: зональный щит читается как обычный знак", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true, placement: "marked_bay_only" },
            ["Utanför markerad plats"], "sign_plate", "yellow"),
      plate({ operator: { name: "Mölndals Parkerings AB" } } as unknown as Parsed,
            ["Mölndals Parkerings AB"], "operator_plate", "yellow"),
    ], "parking", "zone"), "2026-03-02T12:00");
    expect(r.placeNotes).toContain("utanfor-markerad-plats");
    expect(state(r, "2026-03-02T12:00")).toEqual([ALLOWED, ["avgift"]]);
    expect(r.durationSource).toBe("24h_default");
  });
});

describe("чётные недели, сезоны и отдельные дни", () => {
  const tuesdaySeason = () => {
    const w = win("12:00", "15:00", "named_weekday", "tuesday");
    w.dates = { mode: "only", ranges: [{ from: "11-01", to: "05-15" }] };
    return sign([plate({ prohibition: true, time_windows: [w] }, ["Tisdag 12-15", "1 nov-15 maj"])]);
  };

  // py: test_engine::test_even_week_prohibition_applies_every_second_week
  it("`jämna veckor` — запрет через неделю, а не каждую", () => {
    const w = win("10:00", "14:00", "named_weekday", "thursday");
    w.week_parity = "even";
    const s = sign([plate({ prohibition: true, time_windows: [w] }, ["Torsdag 10-14", "Jämna veckor"])]);
    expect(isoWeek(parseDate("2026-09-03")) % 2).toBe(0);    // неделя 36
    expect(isoWeek(parseDate("2026-09-10")) % 2).toBe(1);    // неделя 37
    expect(state(first(s, "2026-09-03T11:00"), "2026-09-03T11:00")[0]).toBe(PROHIBITED);
    expect(state(first(s, "2026-09-10T11:00"), "2026-09-10T11:00")[0]).toBe(ALLOWED);
  });

  // py: test_engine::test_date_range_may_wrap_the_year_end
  it("диапазон дат может переходить через Новый год", () => {
    expect(state(first(tuesdaySeason(), "2026-12-01T13:00"), "2026-12-01T13:00")[0]).toBe(PROHIBITED);
    expect(state(first(tuesdaySeason(), "2026-06-02T13:00"), "2026-06-02T13:00")[0]).toBe(ALLOWED);
  });

  // py: test_engine::test_mid_month_boundary_is_kept_to_the_day
  it("граница посреди месяца держится до дня", () => {
    // `15 maj` — это 15 мая, а не май целиком (снимок `034`).
    expect(state(first(tuesdaySeason(), "2026-05-12T13:00"), "2026-05-12T13:00")[0]).toBe(PROHIBITED);
    expect(state(first(tuesdaySeason(), "2026-05-19T13:00"), "2026-05-19T13:00")[0]).toBe(ALLOWED);
  });

  // py: test_engine::test_single_days_are_ranges_of_one_day
  it("отдельные дни — промежутки длиной в день", () => {
    // `Gäller ej 15/6 15/8` разработчик прочёл как два отдельных дня.
    const w = win("00:00", "06:00", "named_weekday", "friday");
    w.dates = { mode: "except", ranges: [{ from: "06-15", to: "06-15" },
                                         { from: "08-15", to: "08-15" }] };
    const s = sign([plate({ prohibition: true, time_windows: [w] }, ["Fred 0-6", "Gäller ej 15/6 15/8"])]);
    expect(weekday(parseDate("2026-06-19"))).toBe(4);        // пятница, но не 15-е
    expect(state(first(s, "2026-06-19T03:00"), "2026-06-19T03:00")[0]).toBe(PROHIBITED);
    // Сам исключённый день — ровно один день, не больше.
    const onlyJune: TimeWindow = { from: "00:00", to: "24:00", day_class: "all_days",
                                   dates: { mode: "except", ranges: [{ from: "06-15", to: "06-15" }] } };
    expect(windowApplies(onlyJune, at("2026-06-15T12:00"), CAL), "15 июня исключён").toBe(false);
    expect(windowApplies(onlyJune, at("2026-06-16T12:00"), CAL), "16 июня — нет").toBe(true);
  });

  // py: test_engine::test_parity_and_season_are_named_to_the_reader
  it("чётность и сезон названы читателю", () => {
    // Правило, которое применяется молча, человек проверить не может.
    const w = win("10:00", "14:00", "named_weekday", "thursday");
    w.week_parity = "even";
    w.dates = { mode: "except", ranges: [{ from: "07-01", to: "07-31" }] };
    const keys = recognise(sign([plate({ prohibition: true, time_windows: [w] },
                                       ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"])])).panelKeys[1];
    expect(keys).toContain("jamna-veckor");
    expect(keys).toContain("datumintervall");
  });
});

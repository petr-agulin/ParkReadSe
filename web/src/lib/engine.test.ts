// Разборы знаков, которые прочёл разработчик. Перенесены из `tests/test_engine.py`
// вместе с кодом: сверка (`parity`) доказывает, что две реализации согласны,
// а эти тесты говорят, ПОЧЕМУ ответ такой. Механику сверка покрывает сама —
// 174 случая, — поэтому сюда переехали только правила, за которыми стоит решение
// разработчика или находка на живом снимке (16 из 63).

import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";
import { isoNaive, parseNaive, type Naive } from "./civil";
import { ALLOWED, NOT_STATED, PROHIBITED, evaluateParkingRules,
         twentyFourHourExpiry, type Regime } from "./engine";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

const CAL = new Calendar();
const at = (iso: string): Naive => parseNaive(iso);

function sign(panels: Panel[], main = "parking"): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: main as SignDoc["main_sign"]["type"], background_color: "blue",
                 form: "regular", legibility: { readable: true } },
    panels: panels.map((p, i) => ({ ...p, index: i + 1 })),
    panel_count: panels.length,
    boundaries: { certain: true },
  };
}

function plate(parsed: Parsed, lines: string[] = [], kind = "sign_plate"): Panel {
  return { kind: kind as Panel["kind"], lines, background_color: "blue",
           legibility: { readable: true }, parsed };
}

function win(from: string, to: string, dayClass = "unspecified",
             named?: string): TimeWindow {
  const w: TimeWindow = { from, to, day_class: dayClass as TimeWindow["day_class"] };
  if (named) w.named_weekday = named as TimeWindow["named_weekday"];
  return w;
}

/** Состояние и условия режима в конкретный момент. */
function state(r: Regime, moment: Naive): [string | null, string[]] {
  const m = isoNaive(moment);
  for (const p of r.periods) {
    if (isoNaive(p.start) <= m && m < isoNaive(p.end)) return [p.state, p.conditions];
  }
  return [null, []];
}

const first = (doc: SignDoc, moment: string) =>
  evaluateParkingRules(doc, at(moment), CAL).regimes[0];

describe("правило 24 часов", () => {
  it("выходные обрывают сутки, и они даются заново с понедельника", () => {
    // Разработчик сверил распространённость трактовок и выбрал преобладающую —
    // «гарантированная непрерывность» (решение 82).
    expect(isoNaive(twentyFourHourExpiry(at("2026-03-02T13:00"), CAL)!))
      .toBe("2026-03-03T13:00");
    const tuesday = "2026-03-10T00:00";
    expect(isoNaive(twentyFourHourExpiry(at("2026-03-06T13:00"), CAL)!)).toBe(tuesday);
    expect(isoNaive(twentyFourHourExpiry(at("2026-03-06T23:30"), CAL)!)).toBe(tuesday);
  });
});

describe("предел с таблички", () => {
  const двухчасовая: Parsed = {
    duration_limit: { amount: 2, unit: "hours" },
    time_windows: [win("08:00", "18:00", "weekday"), win("08:00", "15:00", "eve")],
  };

  it("вступающий позже предел обрывает стоянку с начала своего окна", () => {
    // Снимок `005`, найдено разработчиком: машина поставлена в пятницу в 22:10,
    // продукт отвечал «сутки, до вторника». В субботу в 08:00 окно открывается,
    // и с этой минуты действуют два часа — до 10:00.
    const r = first(sign([plate(двухчасовая, ["2 tim", "8-18", "(8-15)"])]),
                    "2026-09-04T22:10");
    expect(isoNaive(r.durationExpiresAt!)).toBe("2026-09-05T10:00");
    expect(r.durationSource).toBe("plate");
  });

  it("предел не переживает окно, которое его ввело", () => {
    // Снимок `005`, пятница 30 октября 2026 — канун Alla helgons dag: окно
    // в скобках закрывается в 15:00, а продукт отвечал «до 16:00». Разбор
    // разработчика: «15:00 — это когда кончается ограничение, а не право стоять»
    // (решение 118). Суббота и воскресенье красные, поэтому ближайшее окно —
    // понедельник в 08:00, и два часа считаются от него.
    const s = sign([plate(двухчасовая, ["2 tim", "8-18", "(8-15)"])]);
    const r = first(s, "2026-10-30T14:00");
    expect(isoNaive(r.durationExpiresAt!)).toBe("2026-11-02T10:00");
    expect(r.durationSource).toBe("plate");

    // А внутри окна предел кусается как прежде.
    expect(isoNaive(first(s, "2026-10-30T09:00").durationExpiresAt!))
      .toBe("2026-10-30T11:00");
  });

  it("окно, разрезанное полуночью, остаётся одним окном", () => {
    const s = sign([plate({ duration_limit: { amount: 2, unit: "hours" },
                            time_windows: [win("20:00", "02:00")] }, ["2 tim", "20-02"])]);
    const r = first(s, "2026-09-09T23:00");
    expect(isoNaive(r.durationExpiresAt!)).toBe("2026-09-10T01:00");
  });

  it("запрет обрывает стоянку раньше предела", () => {
    // `Torsdag 10-14` посреди суток означает, что машину надо убрать в 10:00,
    // а не досидеть до 18:41 следующего дня.
    const s = sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ prohibition: true,
              time_windows: [win("10:00", "14:00", "named_weekday", "thursday")] },
            ["Torsdag 10-14"]),
    ]);
    const r = first(s, "2026-09-02T18:41");
    expect(isoNaive(r.durationExpiresAt!)).toBe("2026-09-03T10:00");
    expect(r.durationSource).toBe("prohibition");
  });
});

describe("запрет, очерченный окном", () => {
  const зональный = () => {
    const w = win("09:00", "12:00", "named_weekday", "wednesday");
    w.week_parity = "even";
    w.dates = { mode: "only", ranges: [{ from: "10-01", to: "04-30" }] };
    return sign([plate({ time_windows: [w] }, ["Onsdag 9-12", "jämna veckor"])],
                "prohibition_parking");
  };

  it("вне окна знак молчит, а не разрешает", () => {
    // Снимок зонального `E20`: приложение отвечало «No parking» в сентябрьскую
    // среду нечётной недели, когда ни одно условие таблички не выполнено
    // (решение 113). Молчание — не «можно»: действуют общие правила.
    expect(state(first(зональный(), "2026-09-09T12:33"), at("2026-09-09T12:33"))[0])
      .toBe(NOT_STATED);
    const oct = first(зональный(), "2026-10-13T12:00");
    expect(state(oct, at("2026-10-14T10:00"))[0]).toBe(PROHIBITED);   // среда, чётная
    expect(state(oct, at("2026-10-14T13:00"))[0]).toBe(NOT_STATED);   // после 12:00
    expect(state(oct, at("2026-10-15T10:00"))[0]).toBe(NOT_STATED);   // четверг
  });

  it("молчащий отрезок не несёт предела стоянки", () => {
    // Рядом с «Nothing stated on the sign» стояло «47 h max» — число от начала
    // ближайшего запрета, читавшееся как позволение столько простоять.
    const r = first(зональный(), "2026-10-12T10:00");
    expect(state(r, at("2026-10-12T10:00"))[0]).toBe(NOT_STATED);
    expect(r.periods.some((p) => p.state === PROHIBITED)).toBe(true);
    expect(r.durationExpiresAt).toBeNull();
    expect(r.durationSource).toBeNull();
  });

  it("запрет без табличек остаётся вечным", () => {
    const r = first(sign([], "prohibition_parking"), "2026-09-09T12:00");
    expect(state(r, at("2026-09-09T12:00"))[0]).toBe(PROHIBITED);
    expect(state(r, at("2026-09-12T03:00"))[0]).toBe(PROHIBITED);
  });
});

describe("адресат условия", () => {
  it("пиктограмма с условием адресует условие, а не отводит места", () => {
    // Снимок из Frihamnen: `30 min 00-24 (00-14)` для всех и `[автобус] Avgift`
    // для автобусов. Продукт отвечал «места отведены автобусам» (решение 120).
    const s = sign([
      plate({ duration_limit: { amount: 30, unit: "minutes" },
              time_windows: [win("00:00", "24:00", "weekday"),
                             win("00:00", "14:00", "eve")] },
            ["30 min", "00-24", "(00-14)"]),
      plate({ fee: true, vehicle_class: "bus",
              time_windows: [win("14:00", "24:00", "eve"), win("00:00", "24:00", "red")] },
            ["Avgift", "(14-24)", "00-24"]),
    ]);
    const ev = evaluateParkingRules(s, at("2026-09-13T10:00"), CAL);
    expect(ev.regimes.map((r) => r.audience)).toEqual([null, "pictogram-bus"]);
    expect(ev.regimes.every((r) => r.eligibility.length === 0)).toBe(true);

    const [всем, автобусам] = ev.regimes;
    expect(state(всем, at("2026-09-13T10:00"))).toEqual([ALLOWED, []]);
    expect(state(автобусам, at("2026-09-13T10:00"))).toEqual([ALLOWED, ["avgift"]]);
  });

  it("пиктограмма ОДНА — сужает круг стоящих", () => {
    // Снимок `038`: пиктограмма висит отдельной табличкой и ничего не обусловливает.
    const одна = evaluateParkingRules(
      sign([plate({ vehicle_class: "bus", pictogram: "bus" })]), at("2026-03-02T12:00"), CAL);
    expect(одна.regimes).toHaveLength(1);
    expect(одна.regimes[0].eligibility).toEqual(["pictogram-bus"]);
    expect(одна.regimes[0].audience).toBeNull();
  });

  it("знак Б: мотоциклам платно, прочим свободно", () => {
    // Левая стопка с `images/ParkingSignExample.png`. Разбор перечитан
    // разработчиком 2026-09-10: прежнее «место для мотоциклов» неверно —
    // пиктограмма стоит вместе с `Avgift 7-19 (11-17) Taxa 13`.
    const s = sign([
      plate({ vehicle_class: "motorcycle", fee: true, tariff_code: "Taxa 13",
              time_windows: [win("07:00", "19:00", "weekday"),
                             win("11:00", "17:00", "eve")] },
            ["Avgift", "7-19", "(11-17)", "Taxa 13"]),
      plate({ stretch_metres: { from: 0, to: 5 } }, ["0-5 m"]),
      plate({ prohibition: true,
              time_windows: [win("00:00", "06:00", "named_weekday", "thursday")] },
            ["Torsd 0-6"]),
    ]);
    const [всем, мотоциклам] = evaluateParkingRules(s, at("2026-03-02T12:00"), CAL).regimes;
    expect([всем.audience, мотоциклам.audience]).toEqual([null, "pictogram-motorcycle"]);
    expect(всем.eligibility).toEqual([]);
    expect(всем.placeNotes).toContain("stretch-metres");

    expect(state(мотоциклам, at("2026-03-02T12:00"))).toEqual([ALLOWED, ["avgift"]]);
    expect(state(всем, at("2026-03-02T12:00"))).toEqual([ALLOWED, []]);
    // Запрет в четверг 0-6 действует на всех.
    expect(state(всем, at("2026-03-05T03:00"))[0]).toBe(PROHIBITED);
    expect(state(мотоциклам, at("2026-03-05T03:00"))[0]).toBe(PROHIBITED);
  });

  it("«övrig tid» считается по всему знаку, а не по половине", () => {
    // Снимок `049`: сезон занят табличкой мопедов — для прочих машин он
    // «остальным временем» НЕ является (решение 121).
    const сезон = win("00:00", "24:00", "all_days");
    сезон.dates = { mode: "only", ranges: [{ from: "04-01", to: "09-30" }] };
    const s = sign([
      plate({ fee: true, tariff_code: "Taxa 12", vehicle_class: "motorcycle",
              time_windows: [сезон] }, ["1/4-30/9", "Avgift", "Taxa 12"]),
      plate({ fee: true, tariff_code: "Taxa 2", scope_shift: "remaining_time" },
            ["Övrig tid", "Avgift", "Taxa 2"]),
    ]);
    const [всем, мопедам] = evaluateParkingRules(s, at("2026-07-15T12:00"), CAL).regimes;
    expect(state(всем, at("2026-07-15T12:00"))).toEqual([ALLOWED, []]);
    expect(state(мопедам, at("2026-07-15T12:00"))).toEqual([ALLOWED, ["avgift"]]);
    // Молчание не выдаётся за бесплатность: отрезок помечен.
    const сейчас = всем.periods.find((p) => isoNaive(p.start) <= "2026-07-15T12:00"
                                         && "2026-07-15T12:00" < isoNaive(p.end))!;
    expect(сейчас.note).toBe("fee_period_belongs_to_another_audience");

    // Вне сезона платят все, и половины сходятся.
    for (const r of evaluateParkingRules(s, at("2026-11-16T12:00"), CAL).regimes) {
      expect(state(r, at("2026-11-16T12:00"))).toEqual([ALLOWED, ["avgift"]]);
    }
  });
});

describe("стрелки и участки", () => {
  it("таблички ниже последней стрелки второго участка не заводят", () => {
    // Снимок `033`, найдено разработчиком: `Zon E` и `Boende Storskogen` стоят
    // под стрелкой влево, и продукт делал из них второй режим «здесь, у знака».
    const ev = evaluateParkingRules(sign([
      plate({ fee: true, time_windows: [win("08:00", "18:00")] }, ["Avgift", "8-18"]),
      plate({ arrow: "left" }),
      plate({ tariff_code: "Zon E" }, ["Zon E"]),
      plate({ eligibility: "residents" }, ["Boende"]),
    ]), at("2026-03-02T12:00"), CAL);
    expect(ev.regimes.map((r) => r.extent)).toEqual(["left"]);
    // И хвостовые таблички не потерялись: круг жильцов достался участку.
    expect(ev.regimes[0].eligibility).toContain("boende");
  });
});

describe("эталоны со снимков", () => {
  it("022: места справа только для заряжающихся электромобилей", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift"]),
      plate({ duration_limit: { amount: 4, unit: "hours" } }, ["4 tim"]),
      plate({ vehicle_class: "electric" }, ["Endast laddande elbilar"]),
      plate({ place_count: 2 }, ["2 platser"]),
      plate({ arrow: "right" }),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("right");
    expect(r.eligibility).toEqual(["pictogram-electric-car"]);
    expect(r.placeNotes).toContain("place-count");
  });

  it("024: способ оплаты в область продукта не входит, важно только «платно»", () => {
    const r = first(sign([
      plate({ fee: true }, ["Avgift erläggs med"]),
      plate({ arrow: "both_horizontal" }),
      plate({ operator: "Västia Parkering" }, ["Västia Parkering"], "operator_plate"),
    ]), "2026-03-02T12:00");
    expect(r.extent).toBe("both_sides");
    for (const moment of ["2026-03-02T12:00", "2026-03-07T23:00"]) {
      expect(state(r, at(moment))[1]).toEqual(["avgift"]);
    }
  });

  it("021: «Privat parkering» правил не задаёт", () => {
    // Исправленный разбор разработчика: знак `P` на частной земле означает
    // то же самое — стоять может кто угодно, действует умолчание в 24 часа.
    const r = first(sign([
      plate({ operator: "Brf Ängslyckan" }, ["Privat parkering"], "operator_plate"),
      plate({ arrow: "right" }),
    ]), "2026-03-02T12:00");
    expect(r.eligibility).toEqual([]);
    expect(r.durationSource).toBe("24h_default");
    expect(state(r, at("2026-03-02T12:00"))).toEqual([ALLOWED, []]);
  });

  it("одиночные дни — промежутки длиной в день", () => {
    // `Gäller ej 15/6 15/8` разработчик прочёл как два отдельных дня.
    const w = win("00:00", "06:00", "named_weekday", "friday");
    w.dates = { mode: "except", ranges: [{ from: "06-15", to: "06-15" },
                                         { from: "08-15", to: "08-15" }] };
    const s = sign([plate({ prohibition: true, time_windows: [w] },
                          ["Fred 0-6", "Gäller ej 15/6 15/8"])]);
    // Пятница 19 июня — запрет действует; пятница 15 августа — исключение.
    expect(state(first(s, "2026-06-19T03:00"), at("2026-06-19T03:00"))[0])
      .toBe(PROHIBITED);
  });
});

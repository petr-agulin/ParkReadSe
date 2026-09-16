// Стадия 4 конвейера: разбор в форму, пригодную для показа. Порт `parkread/present.py`.
//
// Здесь НЕ СЧИТАЮТ ПРАВИЛА — всё уже посчитано движком и оценкой полноты; здесь их
// раскладывают по блокам экрана.
//
// **Формулировки берутся из справочника, а не сочиняются.** Ключ вроде `avgift`
// заменяется готовой строкой записи. Ключ, которого в справочнике нет, отдаётся
// как есть — по принципу «чего нет в белом списке, показывается дословно
// и не интерпретируется».
//
// Все подписи о смысле знака живут здесь, а не во вёрстке: фронтенд не сочиняет
// ни одной фразы, поэтому запрещённая формулировка ловится одним тестом и не может
// просочиться через разметку.

import { Calendar, EVE, RED } from "./calendar";
import { isoDate, isoNaive, type Civil, type Naive, addDays } from "./civil";
import { realMinutes, switchBetween } from "./clock";
import { FULL, PARTIAL, type Assessment } from "./completeness";
import { ALLOWED, FEE_PERIOD_ELSEWHERE, NOT_STATED, PROHIBITED, horizonEnd,
         type Evaluation, type Period, type Regime } from "./engine";
import { countsTowardsRules, get as refGet, type Recognised } from "./reference";
import type { Panel, Parsed, SignDoc, TimeWindow } from "./sign";

export const CONTRACT = 7;

export const STATE_TEXT: Record<string, string> = {
  allowed: "The sign permits parking during this period",
  prohibited: "The sign is a no-parking sign for this period",
  uncertain: "The sign's conditions for this period could not be read in full",
  // Прочитали всё и знаем, что знак об этом времени не говорит: его запрет
  // ограничен окном, а разрешения он не даёт.
  not_stated: "The sign's restriction does not cover this period, and the sign "
            + "states nothing else about it",
};

// Участок — внутренний токен, и показывать его человеку нельзя: «here» ничего
// не сообщает тому, кто стоит перед знаком.
export const EXTENT_SHORT: Record<string, string> = {
  here: "Here at the sign",
  left: "To the left of the sign",
  right: "To the right of the sign",
  ahead: "Ahead of the sign",
  behind: "Up to the sign",
  both_sides: "Both sides of the sign",
  both_directions: "Both ahead of the sign and up to it",
};

export const EXTENT_TEXT: Record<string, string> = {
  here: "The sign carries no arrow, so it covers the spaces here, at the sign",
  left: "The sign's arrow points left: it covers the stretch to the left of the sign",
  right: "The sign's arrow points right: it covers the stretch to the right of the sign",
  ahead: "The sign's arrow points ahead: it covers the stretch forward from the sign",
  behind: "The sign's arrow points back: it covers the stretch up to the sign, not past it",
  both_sides: "The sign's arrows point left and right: it covers the stretch "
            + "on both sides of the sign, along the street",
  both_directions: "The sign's arrows point up and down: it covers the stretch "
                 + "both ahead of the sign and up to it",
};

// «Free parking» — особый случай. Словарь продукта эту формулировку запрещает:
// она обещает бесплатность там, где может требоваться диск или билет. Там, где
// продукт установил, что условий НЕТ ВООБЩЕ, она точнее длинной фразы — и разрешена
// ровно в этом случае.
export const PERIOD_HEADLINE: Record<string, string> = {
  paid: "Parking fee",
  free: "Free parking",
  free_with_conditions: "No fee stated for this period",
  prohibited: "No parking",
  uncertain: "Conditions could not be read in full",
  not_stated: "Nothing stated on the sign",
};

// Кому адресовано окно. Существительное берётся отсюда, а не из справочника:
// там у записи стоит «Buses only» — утверждение о знаке, а здесь нужно название.
export const AUDIENCE_NOUN: Record<string, string> = {
  "pictogram-bus": "buses",
  "pictogram-truck": "lorries",
  "pictogram-motorcycle": "motorcycles",
  "pictogram-electric-car": "electric cars",
  "pictogram-bicycle": "bicycles and class II mopeds",
  "bil-personbil": "cars",
};

export const STAY_END_REASON: Record<string, string> = {
  plate: "the limit stated on the sign",
  "24h_default": "general 24-hour rule, not written on the sign",
  prohibition: "the sign prohibits parking from this moment",
};

export const STAY_END_TEXT: Record<string, string> = {
  plate: "This stay must end here — the limit stated on the sign",
  prohibition: "This stay must end here — the sign prohibits parking from this moment",
  "24h_default": "This stay must end here — general 24-hour rule, not written on the sign",
};

// Порог откалиброван замером на наборе снимков, а не выбран.
export const GOOD_ENOUGH = 0.9;

export function toneOf(category: string, confidence: number): string {
  if (category === "insufficient" || category === "not_a_parking_sign") return "bad";
  if (category === "full" && confidence >= GOOD_ENOUGH) return "good";
  return "caution";
}

export const CATEGORY_TEXT: Record<string, string> = {
  full: "Every plate on the sign was read",
  partial: "Part of the sign was not read; what follows is incomplete",
  insufficient: "Too little of the sign was read to say what it states",
  not_a_parking_sign: "This photograph does not show a parking sign",
};

// Формулировка объясняет ПОСЛЕДСТВИЕ, а не устройство: пользователь не знает,
// что разбор идёт двумя вызовами модели, и знать не должен.
export const REASON_TEXT: Record<string, string> = {
  main_sign_unknown: "The sign at the top of the pole could not be identified",
  main_sign_unreadable: "The sign at the top of the pole could not be read",
  "triage:other_road_sign": "The photograph shows a road sign, but not one about parking",
  "triage:not_a_sign": "The photograph shows no road sign at all",
  schema_invalid: "The sign could not be read into a form the service can work "
                + "with, so there is nothing here to go on",
  panel_count_disagreement: "Confidence is lower: it is not certain where one "
                          + "plate ends and the next begins",
  day_class_unknown: "Confidence is lower: whether this date counts as a public "
                   + "holiday could not be established",
  text_exceeds_the_pixels: "The photograph is too small to carry all the text "
                         + "reported on the sign, so some of it may not have "
                         + "been read from the plates at all",
  main_sign_uncorroborated: "No plate on this sign states a parking rule, so the "
                          + "reading rests on the symbol at the top of the pole "
                          + "alone — a sign pointing the way to a car park "
                          + "elsewhere looks much the same",
};

export const NOTE_TEXT: Record<string, string> = {
  wayfinding_sign_permits_nothing:
    "This sign points the way to parking; it does not itself designate spaces",
};

export const UNCERTAINTY_TEXT: Record<string, string> = {
  day_class_unknown: "Whether this date counts as a public holiday could not be "
                   + "established, and the sign's hours depend on it",
  date_outside_calendar: "Whether this date counts as a public holiday could not "
                       + "be established, and the sign's hours depend on it",
  main_sign_unknown: "The sign at the top of the pole could not be identified",
  "24h_expiry_outside_calendar": "When the 24-hour limit would run out could not be "
                               + "worked out this far ahead",
};

export type Explained = { token: string; text: string };

/** Токен → пара «токен и текст». Токен нужен замеру, текст — человеку. */
export function explain(token: string, table: Record<string, string>): Explained {
  if (token.startsWith("uninterpreted_plates:")) {
    const which = token.slice("uninterpreted_plates:".length);
    const many = which.includes(",");
    return { token, text: "Confidence is lower: " + (many
      ? `plates ${which} state something the service does not know`
      : `plate ${which} states something the service does not know`) };
  }
  if (token.startsWith("unread_panels:")) {
    const which = token.slice("unread_panels:".length);
    return { token, text: `Plates ${which} on the sign could not be read` };
  }
  // Подписи нет — на экран не выходит НИЧЕГО: служебное слово на странице видел бы
  // каждый, а пропажу строки ловит тест.
  return { token, text: table[token] ?? "" };
}

// Подписи к непонятой табличке. Видов три, и путать их нельзя.
const NOT_INTERPRETED: Record<string, string> = {
  shown_above: "Not interpreted — shown above exactly as printed",
  symbol: "A symbol here that the service does not know — it may narrow "
        + "who these spaces are for",
};

export function notInterpreted(keys: string[], leftovers: string[] | null): string | null {
  if (leftovers === null) return null;
  if (leftovers.length) {
    return keys.length ? "Not interpreted: " + leftovers.join("; ")
                       : NOT_INTERPRETED.shown_above;
  }
  return NOT_INTERPRETED.symbol;
}

export type Term = { key: string; text: string; known: boolean };

/** Ключ справочника → готовая для показа пара. Неизвестный ключ не выдумывается. */
function term(key: string): Term {
  const entry = refGet(key);
  if (entry === null) return { key, text: key, known: false };
  return { key, text: entry.en, known: true };
}

const EXCEPTION_PREFIX = "The sign names an exception: ";

/** Короткая подпись из справочника — для мест, где длинная фраза не помещается. */
function shortTerm(key: string, exception = false): Term {
  const entry = refGet(key);
  if (entry === null) return { key, text: key, known: false };
  const text = entry.short || entry.en;
  return { key, text: exception ? EXCEPTION_PREFIX + text : text, known: true };
}

const dateOf = (t: Naive): Civil => ({ y: t.y, m: t.m, d: t.d });
const sameMoment = (a: Naive, b: Naive) => isoNaive(a) === isoNaive(b);

/** Склеить соседние отрезки, неотличимые на экране: две одинаковые полосы подряд
 *  читаются как ошибка, а различие между ними и так сказано концом стоянки. */
function joinAlike(periods: Period[]): Period[] {
  const out: Period[] = [];
  for (const p of periods) {
    const prev = out[out.length - 1];
    if (prev && sameMoment(prev.end, p.start) && prev.state === p.state
        && prev.conditions.join("|") === p.conditions.join("|")) {
      out[out.length - 1] = { ...prev, end: p.end };
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/** Шкала — про то, что знак о моменте ГОВОРИТ. Молчание на ней не рисуется:
 *  спрошено про молчащий момент — шкалы нет вовсе; молчание в хвосте — «Window
 *  ends» после запрета обещало окно, которого знак не даёт. */
function stated(periods: Period[]): Period[] {
  if (periods.length && periods[0].state === NOT_STATED) return [];
  let out = periods;
  while (out.length && out[out.length - 1].state === NOT_STATED) out = out.slice(0, -1);
  return out;
}

/** Сколько шкалы показывать: есть предел стоянки — шкала кончается им; нет —
 *  доводим до первой смены состояния включительно. */
export function visible(r: Regime): Period[] {
  const periods = r.periods;
  if (!periods.length) return periods;

  if (r.durationExpiresAt) {
    const limit = isoNaive(r.durationExpiresAt);
    const out: Period[] = [];
    for (const p of periods) {
      if (isoNaive(p.start) >= limit) break;
      out.push(isoNaive(p.end) <= limit ? p : { ...p, end: r.durationExpiresAt });
    }
    return stated(joinAlike(out.length ? out : periods.slice(0, 1)));
  }

  const first = periods[0].state;
  for (let i = 0; i < periods.length; i += 1) {
    if (periods[i].state !== first) return stated(joinAlike(periods.slice(0, i + 1)));
  }
  return stated(joinAlike(periods));
}

// Класс дня строкой под датой. Подпись появляется там, где день ИМЕНОВАН:
// у праздника и у кануна перед праздником. Обычные воскресенья и субботы её
// не получают — «Red day: Sunday» под строкой «Sunday, 13 September» повторяет
// уже написанное.
function holidayLabel(cal: Calendar, d: Civil): string | null {
  const sv = cal.holidayName(d);
  if (!sv) return null;
  const en = cal.holidayNameEn(d);
  return en ? `${sv} (${en})` : sv;
}

export type DayNote = { text: string; kind: string };

function dayNote(cal: Calendar, d: Civil): DayNote | null {
  const day = cal.dayClass(d);
  if (day === RED) {
    const name = holidayLabel(cal, d);
    return name ? { text: `Red day: ${name}`, kind: "red" } : null;
  }
  if (day === EVE) {
    // «Eve of», а не «день перед красным: имя»: после двоеточия имя читалось
    // как название СЕГОДНЯШНЕГО дня, хотя праздник — завтра.
    const name = holidayLabel(cal, addDays(d, 1));
    return name ? { text: `Eve of ${name}`, kind: "eve" } : null;
  }
  return null;
}

export function periodTone(p: Period): string {
  if (p.state === "prohibited") return "prohibited";
  if (p.state === "not_stated") return "not_stated";
  if (p.state === "uncertain") return "uncertain";
  return p.conditions.includes("avgift") ? "paid" : "free";
}

/** «Free parking» — только когда условий нет вовсе, и только когда знак об этом
 *  времени высказался (снимок `049`). */
export function headline(p: Period, tone: string): string {
  if (tone === "free" && (p.conditions.length || p.note === FEE_PERIOD_ELSEWHERE)) {
    return PERIOD_HEADLINE.free_with_conditions;
  }
  return PERIOD_HEADLINE[tone];
}

function periodView(p: Period, horizon: Naive, cal: Calendar, stayEnd: string,
                    reason: string, certain: boolean, aside: Term[]): Record<string, unknown> {
  const tone = periodTone(p);
  return {
    start: isoNaive(p.start),
    end: isoNaive(p.end),
    // Класс дня у обоих концов отрезка: узлы шкалы показывают именно их.
    start_day: dayNote(cal, dateOf(p.start)),
    end_day: dayNote(cal, dateOf(p.end)),
    state: p.state,
    state_text: STATE_TEXT[p.state] ?? p.state,
    tone,
    headline: headline(p, tone),
    // Длительность настоящая, а не по циферблату: ночь перевода длится 23 или 25 часов.
    minutes: realMinutes(p.start, p.end),
    // Плата уже названа заголовком отрезка; ниже — то, что к ней добавляется.
    notes: p.conditions.filter((c) => c !== "avgift").map(term),
    // Период, упирающийся в конец горизонта, ничем не кончается: знак в этот
    // момент не меняется, а дата тут была бы выдумкой продукта.
    ends_at_horizon: isoNaive(p.end) >= isoNaive(horizon),
    stay_end_text: stayEnd,
    stay_end_reason: reason,
    conditions: p.conditions.map(term),
    max_duration_minutes: p.maxDurationMinutes,
    note: p.note,
    certain,
    aside,
  };
}

// Пояснение к дырке в стопке: плата названа «в остальное время», а границу этого
// времени задаёт табличка, обращённая к другому транспорту (снимок `049`).
function feeElsewhereTerm(excluded: string[]): Term {
  const nouns = excluded.map((k) => AUDIENCE_NOUN[k]).filter(Boolean);
  const кому = nouns.join(", ") || "another kind of vehicle";
  return {
    key: "fee-period-elsewhere",
    known: true,
    text: `The fee plate applies to “other times”; the period it refers `
        + `to is written on a plate addressed to ${кому}`,
  };
}

const UNKNOWN_PLATE_TERM: Term = {
  key: "unknown-plate",
  known: false,
  text: "One plate could not be interpreted; it may narrow who these spaces are for",
};

// Запрет С ЧАСАМИ — не то же самое, что запрет всегда (снимок `019`).
// «Не запрещает» не равно «разрешает»: вне названных часов знак просто молчит.
export const TIMED_PROHIBITION_TEXT: Record<string, string> = {
  "main-prohibition-parking":
    "The sign prohibits parking only during the hours it names — outside "
    + "them the general parking rules apply",
  "main-prohibition-stopping":
    "The sign prohibits stopping and parking only during the hours it names "
    + "— outside them the general parking rules apply",
  "main-zone-prohibition":
    "Inside the area the sign marks, parking is prohibited only during the "
    + "hours it names — outside them the general parking rules apply",
};

const RENTED = "forhyrda-platser";
export const PRIVATE_LAND = "privat-parkering";

const NO_WINDOW_RENTED =
  "The sign sets no parking window here: these spaces are rented, and how "
  + "long a rented space may be used follows from its rental, not from this sign.";

export const NO_WINDOW_NOTHING_STATED =
  "The sign restricts parking only at the times written on its plate. About "
  + "parking here at other times the sign states nothing: the general rules of "
  + "the road apply, and they are not on this sign.";

// Заметка о переводе часов. Даты в тексте нет намеренно: перевод может прийтись
// и на ближайшую ночь, и на следующее воскресенье. Часы, наоборот, постоянные.
export const CLOCK_CHANGE_TEXT: Record<string, string> = {
  back: "The clocks go back on the night shown here: at 03:00 they return to "
      + "02:00, so that night is an hour longer. The times shown already allow for it.",
  forward: "The clocks go forward on the night shown here: at 02:00 they jump to "
         + "03:00, so that night is an hour shorter. The times shown already allow for it.",
};

function clockChange(periods: Period[]): string | null {
  if (!periods.length) return null;
  const side = switchBetween(periods[0].start, periods[periods.length - 1].end);
  return side ? CLOCK_CHANGE_TEXT[side] : null;
}

/** Есть ли смысл рисовать шкалу — или её содержание вводит в заблуждение. */
function noWindow(r: Regime, circle: Term[]): string | null {
  // Знак молчит о СПРОШЕННОМ моменте — этого довольно: между «сейчас» и запретом
  // он не разрешает ничего, и рисовать там окно значит обещать своё.
  if (r.periods.length && r.periods[0].state === NOT_STATED) {
    return NO_WINDOW_NOTHING_STATED;
  }
  // Снимок `020`: «Free parking, 28 h max» под знаком арендованных мест — число
  // целиком из правила 24 часов, а не со знака.
  if (!circle.some((t) => t.key === RENTED)) return null;
  if (r.periods.some((p) => p.state !== ALLOWED)) return null;
  if (r.durationSource !== "24h_default") return null;
  return NO_WINDOW_RENTED;
}

/** Подпись основного знака: запрет на весь срок и запрет с 7 до 18 — разные
 *  утверждения, и второе без оговорки читается как первое. */
function mainTerm(r: Regime, mainKey: string): Term {
  const base = term(mainKey);
  const timed = TIMED_PROHIBITION_TEXT[mainKey];
  if (timed && r.periods.some((p) => p.state === ALLOWED)) return { ...base, text: timed };
  return base;
}

/** Таблички, которые СУЖАЮТ круг стоящих. Дополняющие (`Boende`) сюда не входят. */
function narrowing(r: Regime): string[] {
  return r.eligibility.filter((k) => {
    const e = refGet(k);
    return e !== null && countsTowardsRules(e);
  });
}

function audienceShort(r: Regime): string | null {
  if (r.audience) {
    const noun = AUDIENCE_NOUN[r.audience];
    return noun ? noun[0].toUpperCase() + noun.slice(1) : null;
  }
  if (r.audienceExcluded.length) {
    const nouns = r.audienceExcluded.map((k) => AUDIENCE_NOUN[k]).filter(Boolean);
    if (nouns.length) return "All vehicles except " + nouns.join(", ");
  }
  return null;
}

/** Круг стоящих: сначала общее правило знака, если его никто не сузил.
 *
 *  Непонятая табличка обязана быть названа здесь — правило асимметрии: при неполном
 *  разборе можно сузить, но не расширить. */
export function whoCanPark(r: Regime, mainKey: string | null, unknownPlates: boolean,
                    privateLand: boolean): Term[] {
  const narrow = narrowing(r);
  const extra = r.eligibility.filter((k) => !narrow.includes(k));

  let caveat: Term[] = unknownPlates ? [{ ...UNKNOWN_PLATE_TERM }] : [];
  // Оговорка про частную землю идёт ПОСЛЕ общего правила знака, а не вместо него:
  // знак `P` и правда разрешает стоянку, но условий владельца на столбе нет.
  if (privateLand) caveat = [...caveat, term(PRIVATE_LAND)];
  if (narrow.length) return [...narrow, ...extra].map(term).concat(caveat);
  const head = mainKey ? [mainTerm(r, mainKey)] : [];
  return [...head, ...extra.map(term), ...caveat];
}

export function regimeView(r: Regime, horizon: Naive, cal: Calendar,
                           mainKey: string | null = null, unknownPlates = false,
                           privateLand = false, certain = true): Record<string, any> {
  // Под синим `P` табличка сужает разрешение; под запретом — вводит исключение.
  const запрет = Boolean(mainKey) && (mainKey as string).includes("prohibition");
  const нужное = запрет ? PROHIBITED : ALLOWED;

  const shown = visible(r);
  // Указание, расписанное ПО ЧАСАМ, кругом окна не является: там оно уже сказано,
  // и сказано точнее — с часами, к которым относится (снимок `012`).
  const поЧасам = new Set(r.periods.flatMap((p) => p.conditions));
  let круг = narrowing(r).filter((k) => !поЧасам.has(k))
                         .map((k) => shortTerm(k, запрет));
  // Частная земля — не круг стоящих, а оговорка ко всему окну.
  if (privateLand) круг = [...круг, shortTerm(PRIVATE_LAND)];
  const примечания = r.eligibility
    .filter((k) => { const e = refGet(k); return e !== null && !countsTowardsRules(e); })
    .map(term);

  const expiresIso = r.durationExpiresAt ? isoNaive(r.durationExpiresAt) : null;

  return {
    extent: r.extent,
    extent_text: EXTENT_TEXT[r.extent] ?? r.extent,
    extent_short: EXTENT_SHORT[r.extent] ?? r.extent,
    audience: r.audience,
    audience_short: audienceShort(r),
    eligibility: r.eligibility.map(term),
    who_can_park: whoCanPark(r, mainKey, unknownPlates, privateLand),
    notes: примечания,
    window_for: круг,
    no_window_text: noWindow(r, [...круг, ...примечания]),
    clock_change_text: clockChange(shown),
    place_notes: r.placeNotes.map(term),
    duration_expires_at: expiresIso,
    duration_source: r.durationSource,
    periods: shown.map((p) => {
      const last = expiresIso !== null && isoNaive(p.end) === expiresIso;
      const aside = [...(p.state === нужное ? круг : []), ...примечания]
        .filter((t) => !p.conditions.includes(t.key));
      if (p.note === FEE_PERIOD_ELSEWHERE) aside.push(feeElsewhereTerm(r.audienceExcluded));
      return periodView(p, horizon, cal,
                        last ? STAY_END_TEXT[r.durationSource ?? ""] ?? "" : "",
                        last ? STAY_END_REASON[r.durationSource ?? ""] ?? "" : "",
                        certain && !privateLand, aside);
    }),
  };
}

// --- блок «что сервис увидел» ----------------------------------------------
//
// Блок показывает не пересказ, а РАЗБОР: что именно прочитано и как это поле
// называется. Порядок фиксирован здесь, а не собирается из словаря.

const PANEL_ORDER = ["index", "kind", "background_color", "lines"];
const PARSED_ORDER = [
  "duration_limit", "time_windows", "fee", "payment_method", "permit_required",
  "scope_shift", "eligibility", "vehicle_class", "arrow", "place_count",
  "stretch_metres", "placement", "prohibition", "pictogram", "operator",
  "tariff_code", "area_code", "permits_parking", "uninterpreted",
];

/** Значение поля одной строкой: `2 hours` читается, объект — нет. */
function fmt(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.map(fmt).join(", ") : "—";
  if (typeof value === "object") {
    const v = value as Record<string, any>;
    if ("amount" in v && "unit" in v) return `${v.amount} ${v.unit}`;
    if ("from" in v && "to" in v) {
      return `${v.from}–${v.to}` + (v.day_class ? ` (${v.day_class})` : "");
    }
    if ("readable" in v) {
      const out = v.readable ? "readable" : "not readable";
      const obs = v.obstructions ?? [];
      return out + (obs.length ? `; ${obs.join(", ")}` : "");
    }
    return Object.entries(v).filter(([, x]) => x !== null && x !== "")
                 .map(([k, x]) => `${k}: ${x}`).join(", ");
  }
  return String(value);
}

type Field = { name: string; value: string };

function row(name: string, value: unknown): Field | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && !value.length) return null;
  if (typeof value === "object" && !Array.isArray(value)
      && !Object.keys(value as object).length) return null;
  return { name, value: fmt(value) };
}

function mainSignFields(main: Record<string, unknown>): Field[] {
  return ["type", "form", "background_color", "legibility"]
    .map((k) => row(k, main[k])).filter((r): r is Field => r !== null);
}

export function panelFields(panel: Panel, referenceKeys: string[]): Field[] {
  const raw = panel as unknown as Record<string, unknown>;
  const rows: (Field | null)[] = PANEL_ORDER.map((k) => row(k, raw[k]));
  // `lines` показывается всегда: пустой список здесь — факт о панели.
  if (!(panel.lines ?? []).length) rows.push({ name: "lines", value: "(no text)" });

  const parsed = (panel.parsed ?? {}) as Record<string, unknown>;
  for (const key of PARSED_ORDER) {
    if (key in parsed) rows.push(row(`parsed.${key}`, parsed[key]));
  }
  for (const key of Object.keys(parsed).filter((k) => !PARSED_ORDER.includes(k)).sort()) {
    rows.push(row(`parsed.${key}`, parsed[key]));      // поле вне схемы не прячем
  }
  rows.push(row("legibility", panel.legibility));
  rows.push(row("reference_keys", referenceKeys));
  return rows.filter((r): r is Field => r !== null);
}

// --- время одной фразой ----------------------------------------------------
//
// Табличка `Torsdag 10-14 / Jämna veckor / Augusti-Juni` — ОДНО указание, и на
// экране оно должно быть одной строкой.

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];

const DAY_PHRASE: Record<string, string> = {
  weekday: "on weekdays",
  eve: "on Saturdays and days before a holiday",
  red: "on Sundays and public holidays",
  all_days: "every day",
  unspecified: "on weekdays",
};

// Ключи справочника, которые описывают ВРЕМЯ: они уходят в общую фразу.
export const TIME_KEYS = new Set(["window-weekday", "window-eve", "window-red", "alla-dagar",
                           "named-weekday", "jamna-veckor", "udda-veckor", "datumintervall"]);

const MONTH_LEN: Record<number, number> = { 1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
                                            7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 };

const md = (value: string): [number, number] => {
  const [m, d] = value.split("-");
  return [Number(m), Number(d)];
};

/** Промежуток дат по-человечески: целый месяц — месяцем, один день — днём. */
export function rangeName(rng: { from: string; to: string }): string {
  const [am, ad] = md(rng.from);
  const [bm, bd] = md(rng.to);
  if (am === bm && ad === bd) return `${ad} ${MONTHS[am]}`;
  const fullEnd = bd >= MONTH_LEN[bm] || (bm === 2 && bd >= 28);
  if (ad === 1 && fullEnd) {
    return am === bm ? MONTHS[am] : `${MONTHS[am]} to ${MONTHS[bm]}`;
  }
  return `${ad} ${MONTHS[am]} to ${bd} ${MONTHS[bm]}`;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/** Даты группы окон одной фразой — так, как написано на табличке. */
function datesPhrase(windows: TimeWindow[]): string {
  const dates = windows.map((w) => w.dates);
  if (dates.some((d) => d === undefined || d === null)) return "";

  const ranges = dates.flatMap((d) => d!.ranges ?? []);
  const modes = new Set(dates.map((d) => d!.mode));
  if (modes.size !== 1) return "";       // разные режимы в одной группе
  const names = ranges.map(rangeName);

  if ([...modes][0] === "except") return "all year except " + joinNames(names);
  if (names.length === 1 && names[0].includes(" to ")) return `from ${names[0]} inclusive`;
  return "in " + joinNames(names);
}

/** Чем окна отличаются, кроме дат. */
const windowKey = (w: TimeWindow) =>
  [w.day_class, w.named_weekday, w.from, w.to, w.week_parity].join("|");

function windowPhrase(w: TimeWindow, dates: string): string {
  const day = w.day_class;
  const part = day === "named_weekday" && w.named_weekday
    ? "on " + w.named_weekday[0].toUpperCase() + w.named_weekday.slice(1) + "s"
    : (DAY_PHRASE[day ?? ""] ?? "on weekdays");

  const out = [`${part} between ${w.from} and ${w.to}`];
  if (w.week_parity) out.push(`in ${w.week_parity} weeks`);
  if (dates) out.push(dates);
  return out.join(", ");
}

/** Окна, отличающиеся только датами, сливаются в одно предложение. */
export function timePhrase(parsed: Parsed): string {
  const windows = (parsed.time_windows ?? []).filter((w) => w.from);
  const groups = new Map<string, TimeWindow[]>();
  for (const w of windows) {
    const k = windowKey(w);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(w);
  }
  return [...groups.values()]
    .map((g) => windowPhrase(g[0], datesPhrase(g))).join("; ");
}

type Meaning = { key: string; label: string; code: string; text: string;
                 short: string; continues: boolean };

/** Ключ справочника → как табличка называется официально и что она значит. */
function meaning(key: string): Meaning {
  const e = refGet(key);
  if (e === null) {
    return { key, label: key, code: "", text: "", short: "", continues: false };
  }
  return { key, label: e.label || key, code: e.code, text: e.en,
           short: e.short, continues: false };
}

/** Две записи с одним названием и кодом — одна строка на экране (`Avgift` и `Taxa 2`
 *  обе несут код T16). Смысл разный, поэтому короткие подписи склеиваются. */
export function merge(items: Meaning[]): Meaning[] {
  const out: Meaning[] = [];
  for (const item of items) {
    const same = out.find((o) => o.label === item.label && o.code === item.code);
    if (!same) {
      out.push({ ...item });
      continue;
    }
    for (const field of ["short", "text"] as const) {
      if (item[field] && !same[field].includes(item[field])) {
        same[field] = same[field] ? `${same[field]}; ${item[field]}` : item[field];
      }
    }
  }
  return out;
}

/** Строки таблички в одну фразу. Шведские таблички переносят слово с дефисом:
 *  `Beskicknings-` / `fordon` — одно слово, а не два. */
export function joinLines(lines: string[]): string {
  let out = "";
  for (const raw of lines) {
    const part = raw.trim();
    if (!part) continue;
    if (out.endsWith("-")) out = out.slice(0, -1) + part;
    else if (out) out += " " + part;
    else out = part;
  }
  return out;
}

export function panelView(panel: Panel, keys: string[]): Record<string, unknown> {
  const kind = panel.kind;
  const text = joinLines(panel.lines ?? []);
  const carriesRule = kind === "sign_plate";

  let meanings: Meaning[];
  if (!carriesRule) {
    const key = kind === "info_board" ? "info-board" : "operator-plate";
    const entry = refGet(key);
    meanings = [{ key, label: entry ? entry.label : "Info board", code: "",
                  text: "", short: "", continues: false }];
  } else {
    const parsed = panel.parsed ?? {};
    const phrase = timePhrase(parsed);
    let items = merge(keys.filter((k) => !TIME_KEYS.has(k)).map(meaning));
    if (phrase) {
      // Фраза о времени прицепляется к тому указанию, которое она уточняет:
      // «No parking (C35) on Thursdays between 10:00 and 14:00, in even weeks».
      if (items.length) items[0] = { ...items[0], short: phrase, continues: true };
      else items = [{ key: "time-window", label: "Hours", code: "T6",
                      text: "", short: phrase, continues: true }];
    }
    meanings = items;
  }

  return { title: "Panel", text, meanings, carries_rule: carriesRule };
}

export type Sighting = {
  doc: SignDoc | null;
  recognised: Recognised | null;
};

/** Блок 1: что сервис увидел. Панели показываются ВСЕ, включая те, что правил
 *  не задают: на фотографии они видны, и их отсутствие выглядит потерей. */
function whatWeSaw(s: Sighting): Record<string, unknown> {
  if (!s.doc) {
    return { main_sign: null, main_sign_fields: [], primary_sign: null, panels: [] };
  }
  const rec = s.recognised;
  const panels = (s.doc.panels ?? []).map((p) => {
    const index = p.index as number;
    const keys = rec ? rec.panelKeys[index] ?? [] : [];
    const leftovers = rec
      ? (index in rec.uninterpreted ? rec.uninterpreted[index] : null)
      : null;
    return {
      index,
      kind: p.kind,
      lines: p.lines ?? [],
      background_color: p.background_color ?? null,
      carries_rule: p.kind === "sign_plate",
      reference_keys: keys,
      uninterpreted: leftovers ?? [],
      not_interpreted_text: notInterpreted(keys, leftovers),
      fields: panelFields(p, keys),
      ...panelView(p, keys),
    };
  });

  const mk = rec ? rec.mainSignKey : null;
  return {
    main_sign: s.doc.main_sign,
    main_sign_fields: mainSignFields(s.doc.main_sign as unknown as Record<string, unknown>),
    primary_sign: mk ? meaning(mk) : null,
    panels,
  };
}

/** Подпись к полноте. У `partial` причин две, и они разные: знак без единой
 *  таблички с правилом прочитан ЦЕЛИКОМ — просто читать было нечего. */
function categoryText(a: Assessment): string {
  if (a.category === PARTIAL && a.reasons.length === 1
      && a.reasons[0] === "main_sign_uncorroborated") {
    return "The sign carries no plate stating a parking rule, so what follows "
         + "rests on the symbol at the top of the pole alone";
  }
  return CATEGORY_TEXT[a.category] ?? a.category;
}

function completenessView(a: Assessment): Record<string, unknown> {
  return {
    category: a.category,
    category_text: categoryText(a),
    tone: toneOf(a.category, a.confidence),
    confidence: a.confidence,
    signals: a.signals,
    reasons: a.reasons.map((r) => explain(r, REASON_TEXT)),
    unread_panels: a.unreadPanels,
    may_hide_prohibition: a.mayHideProhibition,
  };
}

function sameWindow(a: Record<string, any>, b: Record<string, any>): boolean {
  return JSON.stringify(a.periods) === JSON.stringify(b.periods)
    && a.duration_expires_at === b.duration_expires_at
    && a.no_window_text === b.no_window_text;
}

/** Окно адресата показывается, только когда оно ОТЛИЧАЕТСЯ от общего. */
export function windows(views: Record<string, any>[]): Record<string, any>[] {
  const общее = new Map<string, Record<string, any>>();
  for (const v of views) if (!v.audience) общее.set(v.extent, v);

  const kept = views.filter((v) => !(v.audience && общее.has(v.extent)
                                     && sameWindow(общее.get(v.extent)!, v)));
  // Не осталось ни одного адресата на участке — общему окну подпись не нужна.
  const withAudience = new Set(kept.filter((v) => v.audience).map((v) => v.extent));
  for (const v of kept) {
    if (!v.audience && !withAudience.has(v.extent)) v.audience_short = null;
  }
  return kept;
}

export type Analysis = {
  doc: SignDoc | null;
  recognised: Recognised | null;
  assessment: Assessment;
  evaluation: Evaluation | null;
  stoppedAt?: string | null;
  reason?: string | null;
  flags?: string[];
  triage?: { category: string; what_i_see: string;
             panels_below_main_sign: number | null } | null;
};

/** Полный ответ по снимку. Форма одна и та же во всех исходах: сначала полнота,
 *  потом то, что удалось прочитать. Отказ — не другая форма ответа. */
export function toJson(analysis: Analysis, moment: Naive, cal: Calendar): Record<string, any> {
  const a = analysis.assessment;
  const ev = analysis.evaluation;
  const hasAnswerHere = (a.category === FULL || a.category === PARTIAL) && ev !== null;

  const body: Record<string, any> = {
    contract: CONTRACT,
    moment: isoNaive(moment),
    day_class: cal.dayClass(dateOf(moment)),
    completeness: completenessView(a),
    has_answer: hasAnswerHere,
    what_we_saw: whatWeSaw({ doc: analysis.doc, recognised: analysis.recognised }),
    stopped_at: analysis.stoppedAt ?? null,
    reason: analysis.reason ?? null,
    flags: analysis.flags ?? [],
    triage: analysis.triage ?? null,
    regimes: [],
    uncertainties: [],
    permits_parking: null,
  };

  if (ev !== null) {
    const mainKey = analysis.recognised ? analysis.recognised.mainSignKey : null;
    // Непонятая табличка — свойство всего разбора, а не участка: какому именно
    // участку она принадлежит, мы как раз и не знаем.
    const unknownPlates = a.uninterpretedPlates.length > 0;
    // Частная земля — свойство площадки, а не участка.
    const privateLand = analysis.recognised !== null
      && Object.values(analysis.recognised.panelKeys).some((ks) => ks.includes(PRIVATE_LAND));
    // За что продукт может поручиться: разбор неполный — ни за один отрезок.
    const certain = a.category === FULL;
    body.regimes = windows(ev.regimes.map(
      (r) => regimeView(r, horizonEnd(moment), cal, mainKey, unknownPlates,
                        privateLand, certain)));
    body.uncertainties = ev.uncertainties.map((u) => explain(u, UNCERTAINTY_TEXT));
    body.permits_parking = ev.permitsParking;
    if (ev.note) body.note = explain(ev.note, NOTE_TEXT);
  }
  return body;
}

export { isoDate };

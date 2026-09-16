// Полнота извлечения и политика ответа. Порт `parkread/completeness.py`, дословный.
//
// Разрыв, который этот модуль закрывает: уверенность как одно число даёт два исхода —
// «ответ» или «отказ». Реальность богаче: чаще всего часть знака прочитана, а часть
// нет, и обслуживать надо именно этот случай.
//
// КАТЕГОРИЮ ЗАДАЁТ ТО, ЧЕГО НЕ ХВАТАЕТ, а не то, насколько сильно код в себе
// сомневается. Число уверенности работает внутри категории, а не вместо неё.
//
// Главное правило частичного разбора — СУЗИТЬ МОЖНО, РАСШИРИТЬ НЕЛЬЗЯ. Непрочитанная
// панель может оказаться запретом. Ошибка в сторону сужения стоит пользователю лишней
// осторожности, ошибка в сторону расширения стоит эвакуации.

import { ALLOWED, UNCERTAIN, type Evaluation } from "./engine";
import type { Panel, Parsed, SignDoc } from "./sign";

export const NOT_A_PARKING_SIGN = "not_a_parking_sign";
export const FULL = "full";
export const PARTIAL = "partial";
export const INSUFFICIENT = "insufficient";

// пометки на периодах
export const MAY_PROHIBIT = "unread_panel_may_prohibit";
export const MAY_BE_INCOMPLETE = "conditions_may_be_incomplete";

export type Assessment = {
  category: string;
  confidence: number;
  signals: Record<string, number>;
  reasons: string[];
  unreadPanels: number[];
  mayHideProhibition: boolean;
  uninterpretedPlates: number[];
};

export function hasAnswer(a: Assessment): boolean {
  return a.category === FULL || a.category === PARTIAL;
}

// Веса калиброваны замером (`npm run measure`). Шесть сигналов из одиннадцати на наборе
// не изменились ни разу, и весят вместе 0.55 — но перекладывать их вес нельзя:
// постоянны они потому, что в наборе нет снимков, где основной знак не читается
// или день непонятен. `schema_valid` постоянен по другой причине: разбор, схему
// не прошедший, до формулы не доходит вовсе, поэтому его вес и равен нулю.
export const WEIGHTS: Record<string, number> = {
  schema_valid: 0.0,
  main_sign_identified: 0.15,
  main_sign_readable: 0.10,
  panels_read_share: 0.20,
  // Прочитать текст таблички и понять её — разные вещи (`Beskickningsfordon`
  // разбирался с уверенностью 98%: текст снят, смысл неизвестен).
  plates_interpreted: 0.10,
  panel_count_agreement: 0.10,
  // Чем подтверждается, что знак прочитан верно, кроме него самого: табличка
  // с ПРАВИЛОМ — независимое подтверждение, стрелка — нет (снимок `050`).
  main_sign_corroborated: 0.10,
  // Хватило ли на прочитанный текст пикселей. Продукт меряет это САМ: сколько
  // пикселей у снимка — факт, а не мнение модели.
  text_fits_the_pixels: 0.10,
  no_repairs_needed: 0.05,
  day_class_known: 0.05,
  model_confidence: 0.05,
};

// Площадь кадра на печатный знак, ниже которой прочтение неправдоподобно.
// Число из замера: три самых «плотных» снимка набора — ровно те три, на которых
// ответ разошёлся с эталоном.
export const PIXELS_PER_CHARACTER = 1000;

// Ниже этой доли разбор перестаёт быть полным: заявлено больше текста, чем кадр
// может содержать.
export const TEXT_PLAUSIBLE_ENOUGH = 0.5;

const parsedOf = (p: Panel): Parsed => p.parsed ?? {};
const platesOf = (doc: SignDoc): Panel[] =>
  (doc.panels ?? []).filter((p) => p.kind === "sign_plate");

/** Насколько заявленный текст умещается в пиксели снимка. Размер неизвестен
 *  или текста не заявлено — единица: наказывать не за что. */
function textFits(sign: SignDoc, imagePixels: number | null): number {
  if (!imagePixels) return 1.0;
  const chars = platesOf(sign)
    .reduce((sum, p) => sum + (p.lines ?? []).join("").length, 0);
  if (!chars) return 1.0;
  return Math.min(1.0, imagePixels / (chars * PIXELS_PER_CHARACTER));
}

/** Панель считается непрочитанной, если модель прямо сказала «нечитаемо» либо
 *  на ней нет ни текста, ни единого разобранного поля. */
function unreadPanels(panels: Panel[]): Panel[] {
  return panels.filter((p) => {
    if (p.kind !== "sign_plate") return false;
    const unreadable = !(p.legibility?.readable ?? true);
    const empty = !(p.lines ?? []).length && Object.keys(parsedOf(p)).length === 0;
    return unreadable || empty;
  });
}

// Поля, которые говорят о ПРАВИЛЕ стоянки: сколько, кому, когда, почём.
export const RULE_KEYS = new Set([
  "fee", "tariff_code", "payment_method", "duration_limit", "time_windows",
  "eligibility", "vehicle_class", "permit_required", "prohibition",
  "scope_shift", "permits_parking",
]);

// Поля, которые говорят лишь о ПОЛОЖЕНИИ: куда, сколько метров, сколько мест, как
// ставить. Правило они уточняют, но сами не свидетельствуют, что оно есть: стрелка
// на указателе к стоянке выглядит точно так же. В подсчёте не участвуют — список
// держит границу: тест не даст ни одному из них попасть в `RULE_KEYS`.
export const PLACEMENT_KEYS = new Set([
  "arrow", "placement", "stretch_metres", "place_count", "pictogram",
]);

/** Есть ли хоть одна табличка, подтверждающая, что знак и правда о стоянке ЗДЕСЬ.
 *
 *  Без таких табличек весь ответ держится на одном поле `main_sign.type` — одном
 *  прочтении одной картинки, которому нечего противопоставить (снимок `050`). */
function corroborated(plates: Panel[]): boolean {
  return plates.some((p) => Object.keys(parsedOf(p)).some((k) => RULE_KEYS.has(k)));
}

/** Может ли непрочитанная панель оказаться запретом. Жёлтый в Швеции носят
 *  запрещающие знаки; нечитаемый цвет — худший случай, и он тоже считается. */
function mayProhibit(panel: Panel): boolean {
  const color = panel.background_color;
  return color === "yellow" || color === "unreadable" || color === "other"
      || color === null || color === undefined;
}

/** Прочитано ли настолько мало, что говорить не о чем. Условие вынесено сюда,
 *  чтобы конвейер мог спросить об этом ДО подсчёта полноты целиком. */
export function tooLittle(sign: SignDoc): boolean {
  const main = sign.main_sign;
  const plates = platesOf(sign);
  const unread = unreadPanels(sign.panels ?? []);
  const readShare = plates.length ? (plates.length - unread.length) / plates.length : 1.0;
  return main.type === "unknown"
      || !(main.legibility?.readable ?? true)
      || readShare < 0.5;
}

export type GradeOptions = {
  triageCategory?: string;
  schemaValid?: boolean;
  flags?: string[];
  repairs?: string[];
  evaluation?: Evaluation | null;
  imagePixels?: number | null;
};

/** Категория и уверенность по тому, что вернули стадии 0-1 и движок. */
export function grade(sign: SignDoc | null, options: GradeOptions = {}): Assessment {
  const { triageCategory = "parking_sign", schemaValid = true,
          flags = [], repairs = [], evaluation = null, imagePixels = null } = options;

  const empty = { signals: {}, reasons: [], unreadPanels: [],
                  mayHideProhibition: false, uninterpretedPlates: [] };

  if (triageCategory !== "parking_sign") {
    return { ...empty, category: NOT_A_PARKING_SIGN, confidence: 1.0,
             reasons: [`triage:${triageCategory}`] };
  }
  if (!schemaValid || sign === null) {
    return { ...empty, category: INSUFFICIENT, confidence: 0.0,
             reasons: ["schema_invalid"] };
  }

  const panels = sign.panels ?? [];
  const plates = platesOf(sign);
  const unread = unreadPanels(panels);
  const unreadIdx = unread.map((p) => p.index as number);
  const hides = unread.some(mayProhibit);

  const main = sign.main_sign;
  const mainOk = main.type !== "unknown";
  const mainReadable = main.legibility?.readable ?? true;
  const disagreement = flags.some((f) => f.startsWith("panel_count_disagreement"));
  // Таблички, текст которых снят, а смысл в справочнике не найден: для продукта
  // это не «прочитано», а «прочитано и не понято».
  const plateIdx = new Set(plates.map((p) => p.index));
  const uninterpretedIdx = [...new Set(
    flags.filter((f) => f.startsWith("uninterpreted_panels:"))
         .flatMap((f) => f.split(":").slice(1).join(":").split(","))
         .map((n) => n.trim())
         .filter((n) => /^\d+$/.test(n))
         .map(Number))]
    .sort((a, b) => a - b)
    .filter((i) => plateIdx.has(i));

  const readShare = plates.length ? (plates.length - unread.length) / plates.length : 1.0;
  const isCorroborated = corroborated(plates);
  const fits = textFits(sign, imagePixels);
  const dayKnown = !(evaluation
                     && evaluation.uncertainties.includes("date_outside_calendar"));

  const signals: Record<string, number> = {
    schema_valid: 1.0,
    main_sign_identified: mainOk ? 1.0 : 0.0,
    main_sign_readable: mainReadable ? 1.0 : 0.0,
    panels_read_share: readShare,
    plates_interpreted: uninterpretedIdx.length ? 0.0 : 1.0,
    panel_count_agreement: disagreement ? 0.0 : 1.0,
    main_sign_corroborated: isCorroborated ? 1.0 : 0.0,
    text_fits_the_pixels: round(fits, 3),
    no_repairs_needed: repairs.length ? 0.0 : 1.0,
    day_class_known: dayKnown ? 1.0 : 0.0,
    model_confidence: Number(sign.model_confidence ?? 0.5) || 0.5,
  };
  const confidence = round(
    Object.entries(signals).reduce((sum, [k, v]) => sum + WEIGHTS[k] * v, 0), 3);

  // --- категория: её задаёт то, чего не хватает ---
  const reasons: string[] = [];
  if (!mainOk) reasons.push("main_sign_unknown");
  if (!mainReadable) reasons.push("main_sign_unreadable");
  if (disagreement) reasons.push("panel_count_disagreement");
  if (unreadIdx.length) reasons.push(`unread_panels:${unreadIdx.join(",")}`);
  if (uninterpretedIdx.length) {
    reasons.push(`uninterpreted_plates:${uninterpretedIdx.join(",")}`);
  }
  if (!isCorroborated) reasons.push("main_sign_uncorroborated");
  if (fits < TEXT_PLAUSIBLE_ENOUGH) reasons.push("text_exceeds_the_pixels");
  if (!dayKnown) reasons.push("day_class_unknown");

  // Расхождение в счёте панелей — сигнал, а не приговор: оно снижает уверенность
  // и попадает в причины, но ответа не отнимает. Замер на 22 ответах: флаг
  // сработал 5 раз, все пять — ложная тревога, а цена молчания — самая дорогая
  // ошибка продукта по его же таблице рисков.
  let category: string;
  if (tooLittle(sign)) {
    category = INSUFFICIENT;
  } else if (unreadIdx.length || uninterpretedIdx.length || !isCorroborated
             || fits < TEXT_PLAUSIBLE_ENOUGH) {
    // Непонятая табличка — это именно PARTIAL: часть знака до продукта не дошла.
    // Знак без единой таблички с правилом — тоже PARTIAL, с другой стороны:
    // понимать нечего, потому что подтверждения нет. Ответ при этом остаётся.
    category = PARTIAL;
  } else {
    category = FULL;
  }

  return { category, confidence, signals, reasons, unreadPanels: unreadIdx,
           mayHideProhibition: hides, uninterpretedPlates: uninterpretedIdx };
}

/** Округление «как в питоне»: половина уходит от нуля.
 *
 *  `Math.round` половину всегда двигает вверх, а `round()` питона — к чётному,
 *  и на `.5` они расходятся. Здесь важно совпадение до знака: уверенность
 *  сравнивается с порогом 0.9, и разница в третьем знаке меняет цвет строки. */
function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = Math.round(scaled);
  // Python: банковское округление ровно на половине.
  if (Math.abs(scaled - Math.trunc(scaled) ) === 0.5) {
    const down = Math.floor(scaled);
    return (down % 2 === 0 ? down : down + 1) / factor;
  }
  return rounded / factor;
}

// --- правило асимметрии ----------------------------------------------------

/** Сузить можно, расширить нельзя.
 *
 *  При частичном разборе ответ не вправе утверждать то, что непрочитанная панель
 *  могла бы отменить: если она МОЖЕТ БЫТЬ ЗАПРЕТОМ, ни один период не подаётся
 *  как разрешающий; если она скорее уточняет разрешение, период с пустым списком
 *  условий помечается — «в остальное время ограничений нет» при неполном разборе
 *  есть утверждение, основанное на отсутствии данных. */
export function applyAsymmetry(evaluation: Evaluation, assessment: Assessment): Evaluation {
  if (assessment.category !== PARTIAL) return evaluation;

  const out: Evaluation = {
    ...evaluation,
    uncertainties: [...evaluation.uncertainties],
    regimes: evaluation.regimes.map((r) => ({
      ...r,
      periods: r.periods.map((p) => ({ ...p })),
    })),
  };
  for (const regime of out.regimes) {
    for (const period of regime.periods) {
      if (period.state !== ALLOWED) continue;
      if (assessment.mayHideProhibition) {
        period.state = UNCERTAIN;
        period.note = MAY_PROHIBIT;
      } else if (!period.conditions.length) {
        period.note = MAY_BE_INCOMPLETE;
      }
    }
  }
  if (assessment.mayHideProhibition) out.uncertainties.push(MAY_PROHIBIT);
  return out;
}

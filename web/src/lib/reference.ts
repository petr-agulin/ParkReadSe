// Справочник — он же белый список. Порт `parkread/reference.py`.
//
// Чего в `reference/signs/` нет, продукт не интерпретирует: показывает дословно
// и помечает. Сами записи приезжают из `reference.data.ts`, который порождает
// питон из markdown (`cli.py reference --emit`): парсить преамбулы на устройстве
// нечем, а источником остаётся markdown.

import { ENTRIES, type RefEntry } from "./reference.data";
import type { Parsed, SignDoc } from "./sign";

export type Entry = RefEntry;

/** Считается ли запись правилом — то есть влияет ли её отсутствие на полноту. */
export function countsTowardsRules(e: Entry): boolean {
  return e.category === "main_sign" || e.category === "rule";
}

export function get(key: string): Entry | null {
  return ENTRIES[key] ?? null;
}

export function has(key: string): boolean {
  return key in ENTRIES;
}

export function keys(): string[] {
  return Object.keys(ENTRIES).sort();
}

/** Все записи в порядке ключа — тем, кто показывает справочник целиком. */
export function all(): Entry[] {
  return keys().map((k) => ENTRIES[k]);
}

// --- сопоставление извлечённой панели со справочником ----------------------
//
// Ключи берутся из ПОЛЕЙ схемы, а не из текста: текст муниципальный и разный,
// а поля закрыты списком. Поэтому сопоставление детерминированное.

const MAIN: Record<string, string> = {
  parking: "main-parking",
  prohibition_parking: "main-prohibition-parking",
  prohibition_stopping: "main-prohibition-stopping",
  wayfinding_parking_house: "main-wayfinding-parking-house",
  wayfinding_park_and_ride: "main-wayfinding-park-and-ride",
};
const ZONE: Record<string, string> = {
  parking: "main-zone-parking",
  prohibition_parking: "main-zone-prohibition",
};

const DAY: Record<string, string> = {
  weekday: "window-weekday", eve: "window-eve", red: "window-red",
  named_weekday: "named-weekday", all_days: "alla-dagar",
};

const SIMPLE: [keyof Parsed, string][] = [
  ["duration_limit", "duration-limit"],
  ["place_count", "place-count"],
  ["stretch_metres", "stretch-metres"],
  ["permit_required", "sarskilt-p-tillstand"],
  ["operator", "operator-plate"],
  ["tariff_code", "taxa"],
  ["area_code", "omradeskod"],
];

// Единственные таблицы соответствия «значение схемы → запись справочника».
// Своя копия однажды уже разошлась со схемой и потеряла автобусы (снимок `038`).
export const ELIGIBILITY_KEYS: Record<string, string> = {
  visitors: "besokande",
  rented: "forhyrda-platser",
  permit_holders: "sarskilt-p-tillstand",
  disabled_permit: "pictogram-wheelchair",
  residents: "boende",
};

export const VEHICLE_KEYS: Record<string, string> = {
  motorcycle: "pictogram-motorcycle",
  car_only: "bil-personbil",
  electric: "pictogram-electric-car",
  bus: "pictogram-bus",
  truck: "pictogram-truck",
  // `T8-8`: велосипеды и мопеды класса II. Мопед класса I идёт с мотоциклами —
  // единственный вид транспорта, поделённый между двумя пиктограммами.
  bicycle: "pictogram-bicycle",
};

const PAYMENT: Record<string, string> = { ticket: "p-biljett", parking_disc: "p-skiva" };
const PLACEMENT: Record<string, string> = {
  marked_bay_only: "utanfor-markerad-plats",
  as_shown: "placement-as-shown",
};

export type Recognised = {
  mainSignKey: string | null;
  panelKeys: Record<number, string[]>;        // индекс панели → ключи справочника
  uninterpreted: Record<number, string[]>;    // индекс панели → строки как есть
  missingKeys: string[];                      // поля есть, а записи в справочнике нет
};

export const PRIVATE_LAND_PHRASE = "privat parkering";

export function recognise(doc: SignDoc): Recognised {
  const main = doc.main_sign;
  const wayfinding = main.type.startsWith("wayfinding");
  const zone = main.form === "zone";
  let mainKey: string | null =
    (zone ? ZONE[main.type] : undefined) ?? MAIN[main.type] ?? null;
  const missing: string[] = [];
  if (mainKey && !has(mainKey)) {
    missing.push(mainKey);
    mainKey = null;
  }

  const panelKeys: Record<number, string[]> = {};
  const uninterpreted: Record<number, string[]> = {};

  for (const p of doc.panels ?? []) {
    const i = p.index as number;
    const keys: string[] = [];
    if (p.kind === "info_board") keys.push("info-board");
    if (p.kind === "operator_plate") keys.push("operator-plate");
    // `Privat parkering` — единственная запись, которую опознаём ПО ТЕКСТУ.
    // Схема под неё поля не имеет и не должна: свободный текст регламентом
    // не предусмотрен. Но следствие важное — земля частная, условий владельца
    // на столбе нет.
    if ((p.lines ?? []).join(" ").toLowerCase().includes(PRIVATE_LAND_PHRASE)) {
      keys.push("privat-parkering");
    }
    const parsed: Parsed = p.parsed ?? {};

    for (const [field, key] of SIMPLE) if (parsed[field]) keys.push(key);
    if (parsed.fee) keys.push("avgift");
    if (parsed.prohibition) {
      keys.push(parsed.placement === "marked_bay_only"
        ? "utanfor-markerad-plats" : "main-prohibition-parking");
    }
    if (parsed.scope_shift === "remaining_time") keys.push("ovrig-tid");
    for (const [value, table] of [
      [parsed.eligibility, ELIGIBILITY_KEYS],
      [parsed.vehicle_class, VEHICLE_KEYS],
      [parsed.payment_method, PAYMENT],
      [parsed.placement, PLACEMENT],
    ] as [string | undefined, Record<string, string>][]) {
      if (value && value in table) keys.push(table[value]);
    }
    if (parsed.arrow) {
      // Стрелка под УКАЗАТЕЛЕМ значит «туда», а не «дотуда» (снимок `037`):
      // `T11` описывает МЕСТО, где можно стоять, а у указателя места нет вовсе.
      keys.push(wayfinding ? "wayfinding-direction"
                           : `arrow-${parsed.arrow.replace(/_/g, "-")}`);
    }
    for (const w of parsed.time_windows ?? []) {
      const k = w.day_class ? DAY[w.day_class] : undefined;
      if (k) keys.push(k);
      // Чётность недели и сезон сужают окно и обязаны быть НАЗВАНЫ: правило,
      // которое молча применяется, пользователь проверить не может.
      if (w.week_parity) keys.push(w.week_parity === "even" ? "jamna-veckor" : "udda-veckor");
      if (w.dates) keys.push("datumintervall");
    }

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const k of keys) {
      if (seen.has(k)) continue;
      seen.add(k);
      if (has(k)) unique.push(k);
      else missing.push(k);
    }
    panelKeys[i] = unique;

    // Нераспознанное. Табличка с правилом, из которой не вышло НИ ОДНОГО ключа,
    // не понята — есть на ней текст или нет (снимок `042`: пиктограмма
    // неизвестного класса приезжала как `pictogram: other` без строк текста
    // и проваливалась между двумя сетями).
    const notUnderstood = unique.length === 0 && p.kind === "sign_plate";
    const leftovers = [...(parsed.uninterpreted ?? [])];
    if (notUnderstood) leftovers.push(...(p.lines ?? []));
    if (leftovers.length || notUnderstood) uninterpreted[i] = leftovers;
  }

  return {
    mainSignKey: mainKey,
    panelKeys,
    uninterpreted,
    missingKeys: [...new Set(missing)].sort(),
  };
}

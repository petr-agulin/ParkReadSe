// Разбор знака — форма, в которой его возвращает модель.
//
// Поля и перечисления **взяты из `schema/sign.schema.json`**, а не придуманы здесь:
// схема — граница между моделью и кодом, и второй её экземпляр однажды разойдётся
// с первым. Расхождение ловит питон-тест `test_the_types_match_the_schema`.
//
// Необязательно почти всё: модель возвращает только то, что прочитала, а движок
// обязан работать с любым подмножеством. Отсутствие поля — это «на знаке этого
// не написано», а не ошибка.

export type DayClass =
  | "unspecified" | "all_days" | "weekday" | "eve" | "red" | "named_weekday";

export type Weekday =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type DateRange = { from: string; to: string };        // `MM-DD`

export type Dates = { mode?: "only" | "except"; ranges?: DateRange[] };

export type TimeWindow = {
  from: string;                       // `HH:MM`, и `24:00` — конец суток
  to: string;
  day_class?: DayClass;
  named_weekday?: Weekday;
  week_parity?: "even" | "odd";
  dates?: Dates;
};

export type DurationLimit = { amount: number; unit: "minutes" | "hours" };

export type VehicleClass =
  | "motorcycle" | "car_only" | "electric" | "truck" | "bus" | "bicycle";

export type Eligibility =
  | "residents" | "visitors" | "rented" | "permit_holders" | "disabled_permit" | "custom";

export type Arrow =
  | "up" | "down" | "both_vertical" | "left" | "right" | "both_horizontal";

export type Parsed = {
  duration_limit?: DurationLimit;
  time_windows?: TimeWindow[];
  fee?: boolean;
  payment_method?: "ticket" | "parking_disc";
  permit_required?: boolean;
  scope_shift?: "remaining_time";
  eligibility?: Eligibility;
  vehicle_class?: VehicleClass;
  arrow?: Arrow;
  place_count?: number;
  stretch_metres?: { from?: number; to?: number };
  placement?: "marked_bay_only" | "as_shown";
  prohibition?: boolean;
  pictogram?: string;
  operator?: string;
  tariff_code?: string;
  area_code?: string;
  uninterpreted?: string[];
  permits_parking?: boolean;
};

export type Panel = {
  index?: number;
  kind?: "sign_plate" | "operator_plate" | "info_board";
  lines?: string[];
  background_color?: string | null;
  legibility?: { readable?: boolean; reason?: string };
  parsed?: Parsed;
};

export type MainSign = {
  type: "parking" | "prohibition_parking" | "prohibition_stopping"
      | "wayfinding_parking_house" | "wayfinding_park_and_ride" | "unknown";
  background_color?: string | null;
  form?: string;
  legibility?: { readable?: boolean; reason?: string };
};

export type SignDoc = {
  schema_version?: number;
  main_sign: MainSign;
  panels?: Panel[];
  panel_count?: number;
  boundaries?: { certain?: boolean };
  notes?: string;
  model_confidence?: number;
};

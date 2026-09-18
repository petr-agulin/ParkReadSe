// The reading of a sign — the shape in which the model returns it.
//
// The fields and the enumerations are **taken from `schema/sign.schema.json`** rather
// than invented here: the schema is the border between the model and the code, and a
// second copy of it will one day drift from the first. The drift is caught by the
// double run, in `tools/goldens.test.ts`.
//
// Almost everything is optional: the model returns only what it read, and the engine
// is obliged to work with any subset of it. A field that is absent means "the sign
// does not say this", not an error.

export type DayClass =
  | "unspecified" | "all_days" | "weekday" | "eve" | "red" | "named_weekday";

export type Weekday =
  | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type DateRange = { from: string; to: string };        // `MM-DD`

export type Dates = { mode?: "only" | "except"; ranges?: DateRange[] };

export type TimeWindow = {
  from: string;                       // `HH:MM`, and `24:00` is the end of the day
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

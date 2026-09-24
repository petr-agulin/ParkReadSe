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
  day_of_month?: number;              // `1:a varje månad` - this day of every month
  nth_of_month?: number;              // with `named_weekday`: its Nth in the month
};

export type DurationLimit = { amount: number; unit: "minutes" | "hours" | "days" };

export type VehicleClass =
  | "motorcycle" | "car_only" | "electric" | "truck" | "bus" | "bicycle" | "taxi";

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
  road_sign?: "priority_road" | "speed_limit" | "speed_bump" | "pedestrian_crossing"
            | "other";
  street_side?: "even_numbers" | "odd_numbers";
  unrecognised_slot?: "who" | "when" | "how_long" | "how_much" | "where";
};

// Taken from the schema: `readable`, and the obstructions it lists. An earlier copy
// here had a `reason` the schema never allowed, and lacked `obstructions`.
export type Legibility = { readable?: boolean; obstructions?: string[] };

export type Panel = {
  index?: number;
  kind?: "sign_plate" | "operator_plate" | "info_board" | "other_sign";
  lines?: string[];
  background_color?: string | null;
  legibility?: Legibility;
  parsed?: Parsed;
};

export type MainSign = {
  type: "parking" | "prohibition_parking" | "prohibition_stopping"
      | "wayfinding_parking_house" | "wayfinding_park_and_ride" | "unknown";
  background_color?: string | null;
  form?: string;
  legibility?: Legibility;
};

export type SignDoc = {
  schema_version?: number;
  main_sign: MainSign;
  panels?: Panel[];
  panel_count?: number;
  boundaries?: { certain?: boolean };
  notes?: string;
  model_confidence?: number;
  another_post_in_frame?: boolean;
};

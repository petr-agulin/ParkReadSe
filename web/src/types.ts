// The shape of the backend's answer. It mirrors `lib/present.ts` — let the two drift
// apart and the disagreement surfaces here, at build time, rather than on a person's
// screen.

export type Term = { key: string; text: string; known: boolean };

// The token stays beside the text: the measurement and the post-mortems need it,
// while what is shown to a person is the text.
export type Explained = { token: string; text: string };

// The name of a field comes from the schema word for word: names are not invented in
// the markup, or they would part company with the schema at its very first edit.
export type Field = { name: string; value: string };

// The official name and code of a plate, out of the reference. The code is empty
// where no code exists: an operator's board is not a road sign.
export type Meaning = { key: string; label: string; code: string;
                       text: string; short: string; continues: boolean };

// The class of the day under a date on the scale: a red day or an eve. The text is
// prepared by the backend; from `kind` the markup takes the colour and nothing else.
export type DayNote = { text: string; kind: "red" | "eve" };

export type Period = {
  start: string;
  end: string;
  state: "allowed" | "prohibited" | "uncertain";
  state_text: string;
  ends_at_horizon: boolean;
  /** Whether the product can vouch for the rule of this stretch. False — the reading
   *  is incomplete, or the sign refers to conditions outside itself; the line is
   *  dotted then. */
  certain: boolean;
  /** Whether the window holds for a NAMED CIRCLE only rather than for whoever is
   *  reading — a taxi bay, a bay for staff. The line is broken then too, and for a
   *  different reason from `certain`: here the product vouches for the rule, it is
   *  simply not addressed to everyone. */
  restricted: boolean;
  /** The lines under the stretch: the circle of those who may stand, and the notes of
   *  the stretch. Counted by the backend. */
  aside: Term[];
  stay_end_text: string;
  stay_end_reason: string;
  // `not_stated` — the sign says nothing whatever about this time: its prohibition is
  // bounded by the window, and permission it does not give. Not the same as
  // `uncertain`: there the reading did not succeed, here it did and there is nothing
  // to say.
  tone: "paid" | "free" | "prohibited" | "uncertain" | "not_stated";
  /** The class of the day at the ends of the stretch — under the date in the scale's
   *  node. Empty on ordinary weekdays. */
  start_day: DayNote | null;
  end_day: DayNote | null;
  headline: string;
  minutes: number;
  notes: Term[];
  conditions: Term[];
  max_duration_minutes: number | null;
  note: string | null;
};

export type Regime = {
  extent: string;
  extent_text: string;
  /** The stretch in a short line — as the window's heading. */
  extent_short: string;
  /** Who this window is addressed to: a pictogram on a plate carrying a condition
   *  addresses that condition to its own kind of vehicle rather than narrowing the
   *  circle of those who may stand. Empty when the sign does not divide. */
  audience: string | null;
  audience_short: string | null;
  eligibility: Term[];
  who_can_park: Term[];
  notes: Term[];
  /** Filled in — there is no scale, and this line stands in its place: what a scale
   *  showed would mislead (a rented bay, where the limit came out of a default). */
  no_window_text: string | null;
  /** A note about the change of the clocks. Filled in only when the stretch shown
   *  crosses a change; the text comes from the backend, as does everything about the
   *  meaning of a sign. */
  clock_change_text: string | null;
  /** Who the window suits: the short caption of the circle of those who may stand.
   *  Empty when nobody narrowed the circle — on an ordinary P there is nothing to
   *  qualify. */
  window_for: Term[];

  place_notes: Term[];
  duration_expires_at: string | null;
  duration_source: string | null;
  periods: Period[];
};

export type Panel = {
  index: number;
  kind: string;
  lines: string[];
  background_color: string | null;
  carries_rule: boolean;
  reference_keys: string[];
  uninterpreted: string[];
  /** The finished caption "this was not interpreted", or null. Counted by the
   *  backend. */
  not_interpreted_text: string | null;
  /** The plate could not be read reliably, so `text` is empty and its words are not
   *  shown. Either the model called the plate illegible, or the whole reading failed
   *  the pixel budget. */
  unreliable: boolean;
  fields: Field[];
  title: string;
  text: string;
  meanings: Meaning[];
};

export type Analysis = {
  id: number;
  contract: number;
  moment: string;
  day_class: string;
  completeness: {
    category: "full" | "partial" | "insufficient" | "not_a_parking_sign";
    category_text: string;
    tone: "good" | "caution" | "bad";
    confidence: number;
    signals: Record<string, number>;
    reasons: Explained[];
    unread_panels: number[];
    may_hide_prohibition: boolean;
  };
  has_answer: boolean;
  what_we_saw: {
    main_sign: Record<string, unknown> | null;
    main_sign_fields: Field[];
    primary_sign: Meaning | null;
    panels: Panel[];
  };
  stopped_at: string | null;
  reason: string | null;
  flags: string[];
  triage: { category: string; what_i_see: string; panels_below_main_sign: number | null } | null;
  regimes: Regime[];
  uncertainties: Explained[];
  permits_parking: boolean | null;
  /** The engine's note on the whole reading — as a finished caption, not a token.
   *  Shown ONCE, as a card of its own: it is about the sign itself, not about how
   *  completely the sign was read. */
  note?: { token: string; text: string } | null;
};

export type GeneralRule = { key: string; text: string; source: string };

export type ApiError = { error: string; message?: string };

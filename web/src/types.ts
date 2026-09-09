// Форма ответа бэкенда. Повторяет parkread/present.py — если тот изменится,
// расхождение всплывёт здесь при сборке, а не у пользователя на экране.

export type Term = { key: string; text: string; known: boolean };

// Токен остаётся рядом с текстом: он нужен замеру и разбору полётов,
// а показывается человеку текст.
export type Explained = { token: string; text: string };

// Имя поля приходит из схемы дословно: во вёрстке имена не придумываются,
// иначе они разойдутся со схемой при первой же её правке.
export type Field = { name: string; value: string };

// Официальное название и код таблички из справочника. Код пуст там,
// где его не существует: табло оператора — не дорожный знак.
export type Meaning = { key: string; label: string; code: string;
                       text: string; short: string; continues: boolean };

// Класс дня под датой на шкале: красный день или канун. Текст готовит бэкенд,
// вёрстка выбирает по `kind` только цвет.
export type DayNote = { text: string; kind: "red" | "eve" };

export type Period = {
  start: string;
  end: string;
  state: "allowed" | "prohibited" | "uncertain";
  state_text: string;
  ends_at_horizon: boolean;
  /** Может ли продукт поручиться за правило этого отрезка. Ложь — разбор
   *  неполон или знак отсылает к условиям вне себя; линия тогда пунктирная. */
  certain: boolean;
  /** Строки под отрезком: круг стоящих и примечания участка. Считает бэкенд. */
  aside: Term[];
  stay_end_text: string;
  stay_end_reason: string;
  // `not_stated` — знак об этом времени не говорит вовсе: его запрет ограничен
  // окном, а разрешения он не даёт. Не то же, что `uncertain`: там прочитать
  // не удалось, здесь прочитано и сказать нечего.
  tone: "paid" | "free" | "prohibited" | "uncertain" | "not_stated";
  /** Класс дня у концов отрезка — под датой в узле шкалы. Пусто у обычных будней. */
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
  /** Участок короткой строкой — заголовком окна. */
  extent_short: string;
  eligibility: Term[];
  who_can_park: Term[];
  notes: Term[];
  /** Кому годится это окно: короткая подпись круга стоящих.
   *  Пусто, когда круг никто не сузил, — у обычного P уточнять нечего. */
  /** Заполнено — шкалы нет, вместо неё эта строка: её содержание вводило бы
   *  в заблуждение (арендованное место, где предел взялся из умолчания). */
  no_window_text: string | null;
  /** Заметка о переводе часов. Заполнена, только когда показанный отрезок
   *  перевод пересекает; текст — с бэкенда, как и всё о смысле знака. */
  clock_change_text: string | null;
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
  /** Готовая подпись «это не истолковано», или null. Считает бэкенд. */
  not_interpreted_text: string | null;
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
  /** Заметка движка ко всему разбору — готовой подписью, а не токеном.
   *  Показывается ОДИН раз, отдельной карточкой: это про сам знак, а не про
   *  полноту его чтения. */
  note?: { token: string; text: string } | null;
};

export type GeneralRule = { key: string; text: string; source: string; body: string };

export type ApiError = { error: string; message?: string };

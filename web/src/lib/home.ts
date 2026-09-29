// The decisions of the home screen: what the moment chip says, and how the path to a
// reading begins. No markup and no browser - only what a test can check
// (decision 151).

import { when } from "./when";

/** The edges of the product's window. The calendar is computed in code and covers
 *  2026-2030; a moment outside that window cannot be chosen, because there is
 *  nothing to answer for it with. */
export const MOMENT_FROM = "2026-01-01T00:00";
export const MOMENT_TO = "2030-12-31T23:59";

/** A moment by the device's clock, in the shape the moment field gives:
 *  `2026-09-28T14:05`. */
export function localMinute(t: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
       + `T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** Where the signs are. */
export const SWEDEN = "Europe/Stockholm";

/** The minute in Sweden, in the same shape, whatever time zone the device keeps
 *  (step 20e).
 *
 *  A sign's hours are Swedish hours. A phone that sets its zone by itself shows
 *  Swedish time in Sweden, and then this is the device's own minute. But one with the
 *  automatic zone switched off, or a laptop planning a trip from abroad, would read
 *  "now" an hour or more off - and nothing on the screen would say so. */
export function swedishMinute(t: Date): string {
  return minuteIn(t, SWEDEN);
}

/** The minute in a given time zone - the device's own zone plays no part. */
export function minuteIn(t: Date, zone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(t).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A line for the home screen when the device is not on Swedish time; `null` when it
 *  is - and then nothing is said, because nothing differs. */
export function swedishTimeNote(t: Date): string | null {
  return timeNote(swedishMinute(t), localMinute(t));
}

/** The same, from the two minutes already read: the Swedish one and the device's. */
export function timeNote(sweden: string, device: string): string | null {
  if (sweden === device) return null;
  return `Your device is not on Swedish time — readings use Swedish time, now ${sweden.slice(11)}.`;
}

/** What the moment field holds on a desktop browser: the chosen moment, or - while
 *  it is "now" - the current minute.
 *
 *  An empty date-and-time field is complete only once both halves are filled, and a
 *  desktop calendar sets the date alone: a day picked in it left the field half
 *  empty, the value stayed "", and the moment stayed "now" (developer's report,
 *  2026-09-28). Started from the current minute, the field is whole from the first
 *  click, and a picked day or a typed hour is a moment at once. */
export function fieldMoment(moment: string, now: string): string {
  return moment.trim().length > 0 ? moment : now;
}

/**
 * What is written on the plates of the drawn sign.
 *
 * One place for both states of the screen: this same list used to stand verbatim in
 * `2f` and in `3a`, and a line repeated across files drifts apart - the only question
 * is when. The sign on both screens must be one and the same sign.
 *
 * Each plate has its own lines: on a real sign the hours stand under the word rather
 * than beside it.
 */
export const SIGN_PLATES: string[][] = [
  ["Vardagar", "7–17"],
  ["Övrig tid", "avgift"],
];

/** The heading of the first launch. */
export const HEADLINE = "Snap a sign.";

/**
 * What a person will get - one line per promise.
 *
 * The set is shared by both states of the home screen, and that is its main property
 * here. The developer's first remark from the phone was precisely that the two states
 * spoke about the same thing in different words and read as two different
 * applications. A line repeated across files will drift again - the only question is
 * when.
 */
export const BENEFITS = [
  "Know who can park here.",
  "See your parking window.",
  "Read plate by plate.",
];

/**
 * The heading of the home screen once there is a key.
 *
 * It leads with the OUTCOME rather than with a verb. The literal `Snap a sign.` from
 * the first launch could not be reused: the button at the foot of the same screen
 * says `Scan a sign`, and two nearly identical words a hand's breadth apart read as a
 * stutter. On the first launch there is no such button, so a verb belongs there and
 * not here.
 */
export const HOME_HEADLINE = BENEFITS[1];

/** The lines beneath it - the same promises, less the one raised into the heading. */
export const HOME_LINES = [BENEFITS[0], BENEFITS[2]];

/**
 * Three short promises about what happens to the key and to the photograph.
 *
 * "Key stays on your device" is about the default (decision 146): the remember
 * control is on, and the key is saved. It can be turned off in the same place, in the
 * settings, and the full rule is stated there: a short label cannot carry the caveat,
 * and it must not lie.
 */
export const ASSURANCES = [
  "Key stays on your device",
  "No ParkRead Sweden server",
  "Only the framed part is sent",
];

/** The non-breaking space, named rather than pasted.
 *
 *  As a literal character it is invisible in the source, and a transcription that
 *  turns it into an ordinary space changes behaviour while looking identical. That
 *  happened once here, in the test asserting it. Named, it cannot. */
const NBSP = String.fromCharCode(0xA0);

export type Chip = { label: string; canReset: boolean };

/**
 * The moment chip.
 *
 * Empty means "now", and the time is taken at the minute of sending. So at rest the
 * chip says a WORD rather than a frozen count: a drawn "now · Tue 19:38" would have
 * to be refreshed every minute, or it lies to anyone who has stood at the sign for
 * five of them.
 */
export function momentChip(moment: string): Chip {
  const chosen = moment.trim().length > 0;
  // A chosen moment is a long string ("Thursday 17 September at 02:01"), and on a
  // narrow screen it wraps. The wrap is left to the browser at exactly one place -
  // before "at": the space after "at" is non-breaking, so the time is not torn from
  // the preposition and left alone on a line. The line breaks where a person would
  // break it: the date, and the time beneath it.
  // The shortening is now done by `when` itself, here and on the reading alike.
  // There is no reason to keep a second dictionary beside it; what remains here is
  // only the non-breaking space.
  const label = chosen ? when(moment).replace(/\bat (?=\d)/, `at${NBSP}`) : "Now";
  return { label, canReset: chosen };
}

export type Entry = {
  /** Which action stands as the primary one. */
  primary: "scan" | "pick";
  primaryLabel: string;
  primaryNote: string;
  /** The quiet link beneath it; with no camera there is none - picking a photograph
   *  is already the action above. */
  secondary: string | null;
  /** Why there is no camera. Empty means the camera is there. */
  unavailable: string | null;
};

/**
 * How the path to a reading begins.
 *
 * The camera is the ordinary case: the application is used from a phone. But
 * `getUserMedia` lives only in a secure context, and at an address of the form
 * `http://192.168.x.x` it does not exist at all. A dead button has no place there:
 * picking a photograph becomes the primary action, and the reason is said aloud -
 * otherwise the person concludes that we are the ones who are broken.
 */
export function entryActions(cameraAvailable: boolean): Entry {
  return cameraAvailable
    ? {
      primary: "scan",
      primaryLabel: "Scan a sign",
      primaryNote: "Opens the camera",
      secondary: "Pick a photo you already took",
      unavailable: null,
    }
    : {
      primary: "pick",
      primaryLabel: "Pick a photo",
      primaryNote: "Choose one you already took",
      secondary: null,
      unavailable: "The camera needs a secure address, so it is unavailable here.",
    };
}

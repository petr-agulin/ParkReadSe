// How a moment in time is written on screen.
//
// **The clock is a twenty-four-hour one, always.** That is exactly how a sign is
// written: `8-18`, `(8-15)`, `00-24`. An answer about a sign printed in another
// notation makes the reader convert one into the other while standing at the pole —
// and a mistake in the converting costs a fine. Found by the developer: the phone
// showed "2:00 pm" where the laptop showed "14:00", because the format was taken from
// the device.
//
// **The language of the dates is fixed too.** The product's screen is English
// throughout, and a "måndag" in the middle of English phrases is not localisation but
// a mismatch: what would be localised is the whole screen, not one line in twenty.

const LOCALE = "en-GB";

const FULL: Intl.DateTimeFormatOptions = {
  weekday: "long", day: "numeric", month: "long",
  hour: "2-digit", minute: "2-digit",
  hour12: false, hourCycle: "h23",      // midnight is "00:00", not "24:00"
};

/**
 * The short forms of the day and the month.
 *
 * Full words ("Thursday 17 September") take up so much room that the line wraps even
 * on a wide phone. The argument that short forms read worse inside phrases was put
 * and was rightly rejected by the developer: this line is not read as prose — it is
 * scanned, standing at a pole.
 *
 * "May" has no full stop: there is nothing in it to shorten.
 */
const SHORT: Record<string, string> = {
  Monday: "Mon.", Tuesday: "Tue.", Wednesday: "Wed.", Thursday: "Thu.",
  Friday: "Fri.", Saturday: "Sat.", Sunday: "Sun.",
  January: "Jan.", February: "Feb.", March: "Mar.", April: "Apr.",
  May: "May", June: "Jun.", July: "Jul.", August: "Aug.",
  September: "Sep.", October: "Oct.", November: "Nov.", December: "Dec.",
};

/** A moment in words: "Fri. 30 Oct. at 14:00". */
export function when(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, FULL)
    .replace(/[A-Z][a-z]+/g, (word) => SHORT[word] ?? word);
}

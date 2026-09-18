// The decisions of the reading screen: how a plate's row looks, what the confidence
// is captioned with, and which moment the answer was computed for.
//
// No markup and no browser. The component paints what is decided here
// (decision 151).

import type { Meaning, Panel, Regime } from "../types";
import { when } from "./when";

/**
 * One meaning of a plate, as a line.
 *
 * The code follows the name in brackets - as it does on the sign itself.
 * `continues` means the caption carries the heading on as a single sentence:
 * "No parking (C35) on Thursdays between 10:00 and 14:00", rather than two stumps.
 */
export function meaningLine(m: Meaning): string {
  const head = m.code ? `${m.label} (${m.code})` : m.label;
  if (!m.short) return head;
  return m.continues ? `${head} ${m.short}` : `${head}. ${m.short}`;
}

/**
 * A plate as a card: its own text on top, the meanings beneath it.
 *
 * The old form - a caption on the left, the value on the right - held while there was
 * one value and came apart beyond that. A card reads like the plate itself: first
 * what is written on it, then what that means.
 */
export type PlateRow = {
  /** What is written on the plate itself. Empty happens: a pictogram has no text of
   *  its own, and there is no reason to invent any - the card then begins with the
   *  meaning. */
  quote: string;
  /** What it means - a line per meaning, plus whatever was not understood. */
  lines: string[];
  /** The main sign, or a plate beneath it. */
  tag: "Primary sign" | "Panel";
};

export function plateRow(panel: Panel): PlateRow {
  const lines = panel.meanings.map(meaningLine);
  // The note about what was not understood is not a meaning of the plate, but it
  // must not be lost either.
  if (panel.not_interpreted_text) lines.push(panel.not_interpreted_text);

  const quote = panel.text.trim();
  // Neither text nor meanings: the card would have been left an empty box on the
  // screen. That did happen once, and ever since a nameless panel has a name.
  if (!quote && lines.length === 0) lines.push(`Panel ${panel.index}`);

  return {
    quote,
    lines,
    // `kind` is an open string rather than an enumeration. So the main sign is what
    // gets checked, and everything else counts as a plate: an unfamiliar kind lands
    // in "Panel" rather than in nothing.
    tag: panel.kind === "main_sign" ? "Primary sign" : "Panel",
  };
}

// The caption of the confidence is no longer here: it stood twice - as a chip in the
// header of the "what we read" card and as a line beneath it, in `Completeness`. The
// line remains, where the completeness, the reasons and the tone stand beside it.

/**
 * Whether a window card is drawn for this regime.
 *
 * The rule lived inside the card itself, and that was enough while nobody asked which
 * card is first. Now something does: the "Read for ..." line goes under the heading of
 * the FIRST one, and the first may not be the first regime - a regime with no periods
 * and no explanation is not drawn at all. Let two places ask, and the rule drifts
 * apart; so it lives here, once.
 */
export function showsWindow(regime: Regime): boolean {
  return (regime.periods ?? []).length > 0 || Boolean(regime.no_window_text);
}

/**
 * The index of the first window card that is actually drawn. `-1` means none.
 *
 * Not the same as "the first regime": a regime with no timeline and no explanation
 * yields no card at all, and the "Read for ..." line hung on it would disappear from
 * the screen along with it. The decision lives here rather than in the markup,
 * because here it can be checked (decision 151).
 */
export function firstWindow(regimes: Regime[]): number {
  return regimes.findIndex(showsWindow);
}

/**
 * Which moment the answer was computed for.
 *
 * The moment is chosen on the home screen, so the answer is obliged to name it aloud:
 * otherwise a reading "for 07:00" cannot be told from a reading "for now".
 *
 * The caveat about whose decision it is has moved from here to under the window's
 * heading: the product reads a sign rather than permitting parking - but that has to
 * be said where the window is shown, not beside the date.
 */
export function readFor(moment: string): string {
  return `Read for ${when(moment)}.`;
}

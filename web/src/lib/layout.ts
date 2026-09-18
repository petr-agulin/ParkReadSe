// How much of the screen to give the photograph.
//
// The rule is a single one, and it was chosen by hand on two phones: the photograph
// takes the whole width of the column, and for height whatever is left on the screen
// below it. A frame of ordinary shape then occupies the width entirely, while a tall
// one gives up a little width but does not carry the buttons past the edge. Three
// other layouts (margins, the full screen, the buttons over the photograph) were
// tried and dropped.

/** Less than this we do not give a photograph: aiming at it would be pointless. */
export const MIN_STAGE = 240;

/** The gap below the photograph, so the buttons do not cling to it. */
export const GAP = 12;

/**
 * How much height is left to the photograph on the screen.
 *
 * `topOffset` is measured from the top of the PAGE and not of the window: otherwise
 * the size of the photograph would depend on where the page happened to be scrolled
 * at the moment of measuring, and one and the same screen would measure differently.
 */
export function roomBelow(topOffset: number, footer: number, viewport: number): number {
  return Math.max(MIN_STAGE, viewport - topOffset - footer - GAP);
}

// The decisions of the home screen. Requirements 9 and 10 of step 11.

import { describe, expect, it } from "vitest";

import {
  BENEFITS, HOME_HEADLINE, HOME_LINES, MOMENT_FROM, MOMENT_TO, entryActions, momentChip,
} from "./home";
import { when } from "./when";

describe("the moment chip", () => {
  it("says a word rather than a time while no moment is chosen", () => {
    // A frozen count would lie to anyone who had stood at the sign for five minutes:
    // the time is taken at the minute of sending, not at the minute the screen
    // opened.
    expect(momentChip("")).toEqual({ label: "Now", canReset: false });
    expect(momentChip("   ")).toEqual({ label: "Now", canReset: false });
  });

  it("names a chosen moment by its weekday and date", () => {
    const chip = momentChip("2026-09-16T07:00");
    expect(chip.label).not.toBe("Now");
    // Every absolute time names its own day: "at 07:00" with no day is the question
    // "on which date", put to a person standing at a pole. In the line the weekday
    // and the month are abbreviated: they share the space with the time.
    expect(chip.label).toMatch(/^Wed\./);
    expect(chip.label).toContain("Sep.");
    // The abbreviating is now done by `when` itself: on the reading screen the same
    // line is scanned rather than read, and the developer asked for it to be
    // shortened there too.
    expect(when("2026-09-16T07:00")).toMatch(/^Wed\. 16 Sep\./);
  });

  it("leaves neither the weekday nor the month as a whole word", () => {
    // A whole word is the very extra width that made the line break. All twelve
    // months and all seven weekdays are checked: a line missed in the dictionary
    // would otherwise surface once a year, for one person.
    const longWord = /[A-Za-z]{5,}/;
    for (let m = 1; m <= 12; m++) {
      const label = momentChip(`2026-${String(m).padStart(2, "0")}-05T09:00`).label;
      expect(label, label).not.toMatch(longWord);
    }
    for (let d = 5; d <= 18; d++) {
      const label = momentChip(`2026-01-${String(d).padStart(2, "0")}T09:00`).label;
      expect(label, label).not.toMatch(longWord);
    }
  });

  it("keeps the time from being torn from \"at\" when the line wraps", () => {
    // The line "Thursday 17 September at 02:01" wraps on a narrow screen, and without
    // this it broke after "at": the preposition hung at the end of a line and the
    // time fell below on its own. A non-breaking space leaves the browser one
    // sensible place to break - before "at".
    const label = momentChip("2026-09-17T02:01").label;
    expect(label).toContain(" ");
    // No ordinary space is left between "at" and the digits: that was the place it
    // broke.
    expect(label).not.toMatch(/at (?=\d)/);
  });

  it("lets a chosen moment be reset back to \"now\"", () => {
    expect(momentChip("2026-09-16T07:00").canReset).toBe(true);
    expect(momentChip("").canReset).toBe(false);
  });

  it("carries the product's window, 2026 to 2030, as the calendar does", () => {
    // For years the calendar does not compute, the product does not answer.
    expect(MOMENT_FROM.startsWith("2026")).toBe(true);
    expect(MOMENT_TO.startsWith("2030")).toBe(true);
  });
});

describe("how the path to a reading begins", () => {
  it("with a camera, the primary action is to take one", () => {
    const e = entryActions(true);
    expect(e.primary).toBe("scan");
    expect(e.primaryLabel).toBe("Scan a sign");
    expect(e.secondary).toBe("Pick a photo you already took");
    expect(e.unavailable).toBeNull();
  });

  it("without a camera, picking a photograph becomes primary, and the reason is said", () => {
    // A dead button in its place would be a promise that cannot be kept:
    // `getUserMedia` lives only in a secure context.
    const e = entryActions(false);
    expect(e.primary).toBe("pick");
    expect(e.primaryLabel).toBe("Pick a photo");
    expect(e.unavailable).toBeTruthy();
    expect(e.unavailable).toMatch(/secure address/);
  });

  it("without a camera there is no quiet link below: picking is already above", () => {
    expect(entryActions(false).secondary).toBeNull();
  });

  it("in neither case promises what the screen does not do", () => {
    // "Scan a sign" is offered only where a camera genuinely exists.
    expect(entryActions(false).primaryLabel).not.toMatch(/Scan/);
  });
});

describe("the two states of one screen say the same thing", () => {
  it("the lines of the home screen are exactly those of the first launch", () => {
    // The developer's first remark from the phone was precisely this: the two states
    // spoke about the same thing in different words and read as two different
    // applications. Their rank differs - one is raised into the heading - but the set
    // must stay the same, or the screens will drift apart again.
    expect([HOME_HEADLINE, ...HOME_LINES].sort()).toEqual([...BENEFITS].sort());
  });

  it("the heading does not repeat the verb of the button beneath it", () => {
    // The literal `Snap a sign.` from the first launch could not be reused: the
    // button at the foot of THIS screen says `Scan a sign`, and two nearly identical
    // words a hand's breadth apart read as a stutter. Both ends are checked: the
    // condition holds on both, not on one.
    expect(HOME_HEADLINE).not.toMatch(/\b(?:scan|snap)\b/i);
    expect(entryActions(true).primaryLabel).toMatch(/Scan/);
  });
});

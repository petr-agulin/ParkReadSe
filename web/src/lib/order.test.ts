// The order of the blocks on the reading screen. Requirements 14 and 15 of step 11.
//
// What is checked is the TEXT of the component: there is no DOM environment in the
// suite (decision 151), and the order of the blocks is a product decision rather
// than styling, so it cannot be left unguarded. Swapping three cards around is easy
// and invisible; the only person who would notice is the one standing at a sign,
// scrolling for the answer.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const reading = () => readFileSync(`${ROOT}web/src/components/Reading.tsx`, "utf-8");

describe("the answer comes before the evidence (decision 149)", () => {
  it("window, then who may park, then the plates - in that order", () => {
    // A person at a sign wants the answer; the reconstruction is there so they can
    // check that answer, not instead of it. The developer swapped the two answer
    // blocks: the window first, the audience after. The substance of decision 149
    // survives that - the plates are still last.
    const page = reading();
    const who = page.indexOf('id="who"');
    const window_ = page.indexOf('id="window"');
    const plates = page.indexOf('id="plates"');

    expect(who, "the block of who may park is missing entirely").toBeGreaterThan(-1);
    expect(window_, "the window block is missing entirely").toBeGreaterThan(-1);
    expect(plates, "the plates block is missing entirely").toBeGreaterThan(-1);

    expect(window_).toBeLessThan(who);
    expect(who).toBeLessThan(plates);
  });

  it("the caveat about an unread panel stands ABOVE the window", () => {
    // It qualifies the whole timeline. Moved below it, the caveat would sit under
    // the thing it qualifies - and the person would read the periods as a promise.
    const page = reading();
    const caveat = page.indexOf("may_hide_prohibition");
    const window_ = page.indexOf('id="window"');

    expect(caveat, "the caveat is missing entirely").toBeGreaterThan(-1);
    expect(caveat).toBeLessThan(window_);
  });

  it("confidence is named once, at the bottom, beside what was read", () => {
    // It used to be said twice: as a chip in the card's header and as a line right
    // beneath it. The chip is gone and the line remains - together with the
    // completeness, the reasons and the tone.
    const what = readFileSync(`${ROOT}web/src/components/WhatWeSaw.tsx`, "utf-8");
    const completeness = readFileSync(
      `${ROOT}web/src/components/Completeness.tsx`, "utf-8");

    expect(completeness, "confidence is missing at the bottom too").toContain("confidence");
    expect(what, "confidence came back to the header").not.toContain("confident");
    // And the caveat about a prohibition does not belong here: it would stand twice.
    expect(completeness).not.toContain("no period below is presented");
  });

  it("the moment the answer was computed for is named on the screen", () => {
    // The moment is chosen on the home screen, and otherwise a reading "for 07:00"
    // cannot be told apart from a reading "for now".
    expect(reading()).toContain("readFor(");
  });
});

// The decisions of the reading screen. Requirements 14 and 17 of step 11.

import { describe, expect, it } from "vitest";

import { firstWindow, meaningLine, plateRow, readFor, showsWindow } from "./reading";
import type { Meaning, Panel, Period, Regime } from "../types";

const meaning = (over: Partial<Meaning> = {}): Meaning => ({
  key: "avgift", label: "Fee", code: "T16", text: "", short: "A fee applies",
  continues: false, ...over,
});

const panel = (over: Partial<Panel> = {}): Panel => ({
  index: 1, kind: "sign_plate", lines: [], background_color: "blue",
  carries_rule: true, reference_keys: [], uninterpreted: [],
  not_interpreted_text: null, fields: [], title: "", text: "Avgift",
  meanings: [meaning()], ...over,
});

describe("a plate's meaning as a line", () => {
  it("puts the code in brackets after the name, as on the sign", () => {
    expect(meaningLine(meaning())).toBe("Fee (T16). A fee applies");
  });

  it("may have no code: an operator's board is not a road sign", () => {
    expect(meaningLine(meaning({ code: "" }))).toBe("Fee. A fee applies");
  });

  it("`continues` carries the heading on in one sentence", () => {
    // "No parking (C35) on Thursdays…", not two stumps with a full stop between.
    expect(meaningLine(meaning({ label: "No parking", code: "C35",
                                 short: "on Thursdays", continues: true })))
      .toBe("No parking (C35) on Thursdays");
  });

  it("leaves the name alone when there is no explanation", () => {
    expect(meaningLine(meaning({ short: "" }))).toBe("Fee (T16)");
  });
});

describe("a plate as a card", () => {
  it("puts what the plate says on top and what it means beneath", () => {
    const row = plateRow(panel());
    expect(row.quote).toBe("Avgift");
    expect(row.lines).toEqual(["Fee (T16). A fee applies"]);
    expect(row.tag).toBe("Panel");
  });

  it("has no top line for a plate with no text of its own", () => {
    // A pictogram: there is no text on it and no reason to invent any — the card
    // starts straight with the meaning.
    const row = plateRow(panel({ text: "", meanings: [meaning({ label: "Motorcycle" })] }));
    expect(row.quote).toBe("");
    expect(row.lines).toEqual(["Motorcycle (T16). A fee applies"]);
  });

  it("names the main sign primary and everything else a panel", () => {
    // `kind` is an open string: an unfamiliar kind has to land in "Panel".
    expect(plateRow(panel({ kind: "main_sign" })).tag).toBe("Primary sign");
    expect(plateRow(panel({ kind: "something new" })).tag).toBe("Panel");
  });

  it("gives several meanings a line each", () => {
    const row = plateRow(panel({ meanings: [meaning(), meaning({ key: "b", label: "Hours" })] }));
    expect(row.lines).toHaveLength(2);
  });

  it("does not lose the part that was not understood", () => {
    const row = plateRow(panel({ not_interpreted_text: "This wording is not interpreted" }));
    expect(row.lines).toContain("This wording is not interpreted");
  });

  it("does not leave an empty panel as a bare card", () => {
    // No text and no meanings would put an empty frame on screen. That happened once,
    // which is why a nameless panel has a name.
    const row = plateRow(panel({ text: "", meanings: [], index: 3 }));
    expect(row.quote).toBe("");
    expect(row.lines).toEqual(["Panel 3"]);
  });
});

const period = (over: Partial<Period> = {}): Period => ({
  start: "2026-09-17T10:00", end: "2026-09-17T12:00", state: "allowed",
  state_text: "Parking allowed", ends_at_horizon: false, certain: true,
  aside: [], stay_end_text: "", stay_end_reason: "", tone: "free",
  start_day: null, end_day: null, headline: "Free parking", minutes: 120,
  notes: [], conditions: [], max_duration_minutes: null, note: null, ...over,
});

const regime = (over: Partial<Regime> = {}): Regime => ({
  extent: "here", extent_text: "", extent_short: "", audience: null,
  audience_short: null, eligibility: [], who_can_park: [], notes: [],
  no_window_text: null, clock_change_text: null, window_for: [], place_notes: [],
  duration_expires_at: null, duration_source: null, periods: [period()], ...over,
});

describe("which window card is drawn", () => {
  it("draws no card when there is neither a scale nor an explanation", () => {
    expect(showsWindow(regime({ periods: [], no_window_text: null }))).toBe(false);
  });

  it("draws a card when there is a scale", () => {
    expect(showsWindow(regime())).toBe(true);
  });

  it("draws a card when there is no scale but something to say", () => {
    // A rented bay: there is no window, but a line about it is needed.
    expect(showsWindow(regime({ periods: [], no_window_text: "Leased bay" }))).toBe(true);
  });

  it("counts the first DRAWN card as first, not the first in the list", () => {
    // Otherwise the "Read for …" line would hang on a card that is not on screen, and
    // vanish together with it.
    const empty = regime({ periods: [], no_window_text: null });
    expect(firstWindow([empty, regime()])).toBe(1);
    expect(firstWindow([regime(), regime()])).toBe(0);
    expect(firstWindow([empty, empty])).toBe(-1);
  });
});

describe("the moment the answer was computed for", () => {
  it("names the moment in words, shortened", () => {
    // The caveat "the decision is yours" moved from here to under the window's heading:
    // it is about the window, not about the date it used to stand beside.
    const line = readFor("2026-09-16T07:00");
    expect(line).toMatch(/^Read for /);
    expect(line).toMatch(/Wed\./);
    expect(line).not.toContain("Judgement");
  });
});

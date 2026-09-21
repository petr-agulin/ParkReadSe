import { describe, expect, it } from "vitest";
import { GAP, MIN_STAGE, roomBelow } from "./layout";

describe("how much height is left to the photograph", () => {
  it("gives away everything the wrapping does not take", () => {
    // A screen of 735, the photograph starting at 139, with 66 beneath it — so 518
    // are the photograph's.
    expect(roomBelow(139, 66, 735)).toBe(735 - 139 - 66 - GAP);
  });

  it("gives away no less than is sensible, however much stands below", () => {
    expect(roomBelow(400, 400, 700)).toBe(MIN_STAGE);
  });

  it("leaves less to the photograph the more wrapping there is, and the reverse", () => {
    expect(roomBelow(103, 66, 707)).toBeGreaterThan(roomBelow(159, 66, 707));
  });
});

import { describe, expect, it } from "vitest";
import { GAP, MIN_STAGE, roomBelow } from "./layout";

describe("сколько высоты остаётся снимку", () => {
  it("отдаёт всё, что не занято обвязкой", () => {
    // Экран 735, снимок начинается на 139, под ним 66 — значит снимку 518.
    expect(roomBelow(139, 66, 735)).toBe(735 - 139 - 66 - GAP);
  });

  it("не отдаёт меньше разумного, даже если внизу много", () => {
    expect(roomBelow(400, 400, 700)).toBe(MIN_STAGE);
  });

  it("больше обвязки — меньше снимку, и наоборот", () => {
    expect(roomBelow(103, 66, 707)).toBeGreaterThan(roomBelow(159, 66, 707));
  });
});

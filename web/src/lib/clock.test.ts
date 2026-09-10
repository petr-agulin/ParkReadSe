import { describe, expect, it } from "vitest";

import { isoNaive, parseNaive } from "./civil";
import { SUMMER, WINTER, add, autumnBack, normalise, offset, realMinutes,
         springForward, switchBetween } from "./clock";

const at = (iso: string) => parseNaive(iso);

describe("перевод часов", () => {
  it("переходы стоят там, куда их ставит правило ЕС", () => {
    expect(isoNaive(springForward(2026))).toBe("2026-03-29T02:00");
    expect(isoNaive(autumnBack(2026))).toBe("2026-10-25T03:00");
    expect(isoNaive(springForward(2027))).toBe("2027-03-28T02:00");
    expect(isoNaive(autumnBack(2027))).toBe("2027-10-31T03:00");
  });

  it("смещение: зимой +1, летом +2, и края точные", () => {
    expect(offset(at("2026-01-15T12:00"))).toBe(WINTER);
    expect(offset(at("2026-07-15T12:00"))).toBe(SUMMER);
    expect(offset(at("2026-03-29T01:59"))).toBe(WINTER);
    expect(offset(at("2026-03-29T03:00"))).toBe(SUMMER);
    expect(offset(at("2026-10-25T02:59"))).toBe(SUMMER);   // первое вхождение
    expect(offset(at("2026-10-25T03:00"))).toBe(WINTER);
  });

  it("час, которого не было, сдвигается вперёд", () => {
    expect(isoNaive(normalise(at("2027-03-28T02:30")))).toBe("2027-03-28T03:30");
    expect(isoNaive(normalise(at("2027-03-28T01:30")))).toBe("2027-03-28T01:30");
  });

  it("ночь перевода длится 23 или 25 часов", () => {
    expect(realMinutes(at("2026-10-25T00:00"), at("2026-10-26T00:00"))).toBe(25 * 60);
    expect(realMinutes(at("2027-03-28T00:00"), at("2027-03-29T00:00"))).toBe(23 * 60);
    expect(realMinutes(at("2026-09-09T00:00"), at("2026-09-10T00:00"))).toBe(24 * 60);
  });

  it("два часа — это два прожитых часа, а не два деления циферблата", () => {
    expect(isoNaive(add(at("2026-10-25T02:30"), 120))).toBe("2026-10-25T03:30");
    expect(isoNaive(add(at("2027-03-28T01:30"), 120))).toBe("2027-03-28T04:30");
    expect(isoNaive(add(at("2026-09-09T10:00"), 120))).toBe("2026-09-09T12:00");
    expect(isoNaive(add(at("2026-10-24T20:00"), 1440))).toBe("2026-10-25T19:00");
  });

  it("пересечение перевода находится и не выдумывается", () => {
    expect(switchBetween(at("2026-10-24T20:00"), at("2026-10-26T00:00"))).toBe("back");
    expect(switchBetween(at("2026-10-25T12:00"), at("2026-10-26T00:00"))).toBeNull();
    expect(switchBetween(at("2027-03-27T20:00"), at("2027-03-29T00:00"))).toBe("forward");
    expect(switchBetween(at("2026-09-09T00:00"), at("2026-09-17T00:00"))).toBeNull();
  });
});

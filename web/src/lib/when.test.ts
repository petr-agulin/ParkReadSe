import { describe, expect, it } from "vitest";

import { when } from "./when";

describe("момент на экране", () => {
  it("часы двадцатичетырёхчасовые, как на знаке", () => {
    // Знак пишет `8-18` и `00-24`; ответ про него в am/pm заставлял бы
    // переводить одно в другое, стоя у столба.
    const text = when("2026-10-30T14:00");
    expect(text).toContain("14:00");
    expect(text.toLowerCase()).not.toContain("pm");
    expect(text.toLowerCase()).not.toContain("am");
  });

  it("полночь — 00:00, а не 24:00", () => {
    expect(when("2026-10-27T00:00")).toContain("00:00");
  });

  it("день недели и месяц названы по-английски и сокращённо", () => {
    // Сокращённо — потому что строку не читают, а сканируют: полные слова
    // переносят её на вторую строку даже на широком телефоне.
    const text = when("2026-10-30T14:00");
    expect(text).toContain("Fri.");
    expect(text).toContain("Oct.");
    expect(text).toContain("30");
    expect(text).not.toContain("Friday");
    expect(text).not.toContain("October");
  });

  it("формат не зависит от устройства", () => {
    // Тот же момент — та же строка, где бы страницу ни открыли.
    expect(when("2026-09-13T09:05")).toBe(when("2026-09-13T09:05"));
    expect(when("2026-09-13T09:05")).toContain("09:05");
  });
});

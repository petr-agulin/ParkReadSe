// Справочник — граница компетенции продукта: чего в нём нет, то показывается
// дословно и не толкуется. Здесь проверяется именно эта граница и разборы,
// переехавшие вместе со справочником.

import { describe, expect, it } from "vitest";

import { all, get, has, recognise } from "./reference";
import type { Panel, SignDoc } from "./sign";

function doc(panels: Panel[], main = "parking", form = "regular"): SignDoc {
  return {
    schema_version: 1,
    main_sign: { type: main as SignDoc["main_sign"]["type"], background_color: "blue",
                 form, legibility: { readable: true } },
    panels: panels.map((p, i) => ({ ...p, index: i + 1 })),
    panel_count: panels.length,
  };
}

const plate = (parsed: Panel["parsed"], lines: string[] = [],
               kind: Panel["kind"] = "sign_plate"): Panel =>
  ({ kind, lines, background_color: "blue", legibility: { readable: true }, parsed });

describe("справочник", () => {
  it("записи приехали из markdown целиком", () => {
    expect(all().length).toBeGreaterThan(40);
    const parking = get("main-parking")!;
    expect(parking.category).toBe("main_sign");
    expect(parking.en.length).toBeGreaterThan(0);
    expect(has("такого-ключа-нет")).toBe(false);
  });

  it("ключ, которого в справочнике нет, толковать нечем", () => {
    // Граница компетенции: продукт называет то, чего не понял, и не выдумывает.
    const rec = recognise(doc([plate({ pictogram: "other" }, ["Något helt nytt"])]));
    expect(rec.panelKeys[1]).toEqual([]);
    // Текст сохраняется дословно, чтобы человек прочёл его сам.
    expect(rec.uninterpreted[1]).toEqual(["Något helt nytt"]);
  });

  it("табличка без ключей не понята, даже когда текста на ней нет", () => {
    // Снимок `042` (велосипеды и мопеды): пиктограмма неизвестного класса
    // приезжала как `pictogram: other` без единой строки текста и проваливалась
    // между двумя сетями — непрочитанной не считалась, непонятой тоже.
    const rec = recognise(doc([plate({ pictogram: "other" })]));
    expect(rec.panelKeys[1]).toEqual([]);
    expect(rec.uninterpreted[1]).toEqual([]);
    expect(1 in rec.uninterpreted).toBe(true);
  });

  it("стрелка под указателем значит «туда», а не «дотуда»", () => {
    // Снимок `037`, найдено разработчиком в браузере: под `F28` стоит стрелка
    // поворота, и продукт называл её протяжённостью участка (`T11`) — «действует
    // справа от знака». Но указатель стоянки не разрешает, и протягивать вправо
    // нечего: `T11` описывает МЕСТО, а места здесь нет вовсе.
    const указатель = recognise(doc([plate({ arrow: "right", pictogram: "arrow" })],
                                    "wayfinding_parking_house"));
    expect(указатель.panelKeys[1]).toEqual(["wayfinding-direction"]);

    // Под обычным `P` та же стрелка — это участок.
    const обычный = recognise(doc([plate({ arrow: "right" })]));
    expect(обычный.panelKeys[1]).toEqual(["arrow-right"]);
  });

  it("«Privat parkering» опознаётся по тексту — единственная такая запись", () => {
    // Схема под неё поля не имеет и не должна: свободный текст регламентом
    // не предусмотрен. Но следствие важное — земля частная.
    const rec = recognise(doc([
      plate({ operator: "Brf Ängslyckan" }, ["Privat parkering", "Brf Ängslyckan"],
            "operator_plate"),
    ]));
    expect(rec.panelKeys[1]).toContain("privat-parkering");
  });

  it("зональный знак опознаётся отдельной записью", () => {
    const zone = recognise(doc([], "parking", "zone"));
    expect(zone.mainSignKey).toBe("main-zone-parking");
    expect(recognise(doc([])).mainSignKey).toBe("main-parking");
  });

  it("чётность недели и сезон обязаны быть названы", () => {
    // Правило, которое молча применяется, пользователь проверить не может.
    const rec = recognise(doc([plate({
      time_windows: [{ from: "09:00", to: "12:00", day_class: "named_weekday",
                       named_weekday: "wednesday", week_parity: "even",
                       dates: { mode: "only", ranges: [{ from: "10-01", to: "04-30" }] } }],
    }, ["Onsdag 9-12"])]));
    expect(rec.panelKeys[1]).toContain("named-weekday");
    expect(rec.panelKeys[1]).toContain("jamna-veckor");
    expect(rec.panelKeys[1]).toContain("datumintervall");
  });
});

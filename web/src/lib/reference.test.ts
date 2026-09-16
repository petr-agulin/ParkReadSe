// Справочник — граница компетенции продукта: чего в нём нет, то показывается
// дословно и не толкуется. Здесь проверяется именно эта граница и разборы,
// переехавшие вместе со справочником.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TIME_KEYS } from "./present";
import { ELIGIBILITY_KEYS, PRIVATE_LAND_PHRASE, VEHICLE_KEYS, all, get, has,
         recognise } from "./reference";
import { SIGN_SCHEMA } from "./schema.data";
import type { Panel, SignDoc } from "./sign";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const source = (path: string) => readFileSync(ROOT + path, "utf-8");

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

describe("записи справочника годны для показа", () => {
  // Перенесено из `tests/test_api.py` (шаг 8): справочник — источник всех слов
  // о знаке, и дыра в нём выходит на экран ключом или пустотой.

  // py: test_api::test_every_reference_entry_has_a_human_label
  it("у каждой записи есть человеческое название", () => {
    // Запись без названия покажется человеку ключом справочника — то есть кодом.
    expect(all().filter((e) => !e.label).map((e) => e.key)).toEqual([]);
  });

  // py: test_api::test_every_entry_has_a_short_caption_too
  it("у каждой записи есть и короткая подпись", () => {
    // `en` — полное утверждение для шкалы, `short` — строка под текстом панели.
    for (const e of all()) {
      expect(e.short, `${e.key}: нет короткой подписи`).toBeTruthy();
      expect(e.short.length, `${e.key}: подпись длинная — ${e.short}`).toBeLessThanOrEqual(60);
    }
  });

  // py: test_api::test_official_codes_look_like_official_codes
  it("коды выглядят как официальные", () => {
    // C — запрещающие, D — предписывающие, E — указательные, F — направления,
    // S — символы, T — таблички. Пустой код допустим («кода не существует»),
    // выдуманный — нет.
    for (const e of all()) {
      expect(e.code === "" || /^[CDEFST]\d{1,2}$/.test(e.code), `${e.key}: ${e.code}`)
        .toBe(true);
    }
  });

  // py: test_api::test_no_time_key_is_left_out_of_the_composed_phrase
  it("ни один ключ времени не забыт в общей фразе", () => {
    // Забытый ключ выходит второй строкой и повторяет то, что фраза уже сказала.
    const t6 = all().filter((e) => e.code === "T6").map((e) => e.key).sort();
    expect(t6).toEqual([...TIME_KEYS].sort());
  });

  // py: test_api::test_every_schema_value_reaches_the_reference
  it("каждое значение схемы доходит до записи справочника", () => {
    // Значение без записи — тупик: модель читает его верно, ключа не находится,
    // и указание молча исчезает из разбора (`vehicle_class: bus`, снимок `038`).
    const parsed = (SIGN_SCHEMA as Record<string, any>).$defs.parsed.properties;
    for (const [field, table] of [["vehicle_class", VEHICLE_KEYS],
                                  ["eligibility", ELIGIBILITY_KEYS]] as const) {
      // `custom` не сопоставляется намеренно: он значит «ничего из списка не подошло».
      const values = (parsed[field].enum as string[]).filter((v) => v !== "custom");
      expect(values.filter((v) => !(v in table)), field).toEqual([]);
      for (const v of values) expect(get(table[v]), `${field}: ${v}`).not.toBeNull();
    }
  });

  // py: test_api::test_the_vehicle_table_exists_in_one_place_only
  it("таблица транспорта существует в одном месте", () => {
    // Таблиц было две, и значение, добавленное в схему, приходилось вносить
    // в оба места. Автобус внесли в схему и забыли в движке — снимок `038`.
    const engine = source("web/src/lib/engine.ts");
    expect(engine).toContain('import { ELIGIBILITY_KEYS, VEHICLE_KEYS } from "./reference"');
    expect(engine, "движок снова завёл собственную копию таблицы")
      .not.toContain('"motorcycle": "pictogram-motorcycle"');
  });

  // py: test_api::test_the_bicycle_symbol_is_a_class_of_its_own
  it("велосипед — отдельный класс, и мопед поделён между двумя пиктограммами", () => {
    // Класс II идёт с велосипедом, класс I — с мотоциклом. Перепутать значит
    // отправить мопедиста не на ту стоянку, поэтому обе статьи говорят об этом.
    expect(VEHICLE_KEYS.bicycle).toBe("pictogram-bicycle");
    const bicycle = get("pictogram-bicycle")!;
    expect(bicycle).not.toBeNull();
    expect(bicycle.code).toBe("T8");
    expect(bicycle.en).toContain("class II");
    // Текст статьи в браузер не едет — он живёт в markdown, из которого собран
    // справочник, и проверяется там же.
    expect(source("reference/signs/pictogram-motorcycle.md"),
           "статья мотоцикла обязана называть класс I").toContain("класса I");
    expect(source("reference/signs/pictogram-bicycle.md"),
           "статья велосипеда — класс II").toContain("класса II");
  });

  // py: test_api::test_the_phrase_matched_in_code_is_the_one_the_article_declares
  it("оборот, по которому опознаёт код, объявлен в самой статье", () => {
    // Разойдись они — правило молча перестанет срабатывать, а статья останется
    // выглядеть рабочей.
    const article = source("reference/signs/privat-parkering.md");
    const tokens = article.split("---")[1].split("\n")
      .find((line) => line.startsWith("tokens:"))!;
    expect(tokens.toLowerCase()).toContain(PRIVATE_LAND_PHRASE);
  });
});

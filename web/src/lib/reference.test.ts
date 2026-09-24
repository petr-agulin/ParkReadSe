// The reference is the boundary of the product's competence: what is not in it is
// shown verbatim and not interpreted. What is checked here is that boundary, and the
// readings that moved across together with the reference.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { TIME_KEYS } from "./present";
import { BY_TEXT, ELIGIBILITY_KEYS, VEHICLE_KEYS, all, get, has,
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

describe("the reference", () => {
  it("the entries arrived from the markdown in full", () => {
    expect(all().length).toBeGreaterThan(40);
    const parking = get("main-parking")!;
    expect(parking.category).toBe("main_sign");
    expect(parking.en.length).toBeGreaterThan(0);
    expect(has("no-such-key")).toBe(false);
  });

  it("the README counts the entries right", () => {
    // Step 15a added an entry and the README went on saying 50. Held here, next to the
    // entries themselves, so the next one cannot slip past the same way.
    expect(Number(/(\d+) sign entries/.exec(source("README.md"))?.[1])).toBe(all().length);
  });

  it("a key the reference does not have is a key there is nothing to interpret with", () => {
    // The boundary of competence: the product names what it did not understand and
    // invents nothing.
    const rec = recognise(doc([plate({ pictogram: "other" }, ["Något helt nytt"])]));
    expect(rec.panelKeys[1]).toEqual([]);
    // The text is kept verbatim, so the person can read it themselves.
    expect(rec.uninterpreted[1]).toEqual(["Något helt nytt"]);
  });

  it("a plate with no keys is not understood, even with no text on it", () => {
    // Photograph `042` (bicycles and mopeds): a pictogram of an unknown class
    // arrived as `pictogram: other` without a single line of text and fell between
    // two nets - it counted as neither unread nor not understood.
    const rec = recognise(doc([plate({ pictogram: "other" })]));
    expect(rec.panelKeys[1]).toEqual([]);
    expect(rec.uninterpreted[1]).toEqual([]);
    expect(1 in rec.uninterpreted).toBe(true);
  });

  it("an arrow under a wayfinding sign means \"that way\", not \"up to here\"", () => {
    // Photograph `037`, found by the developer in the browser: under an `F28` stands
    // a turning arrow, and the product called it the extent of a stretch (`T11`) -
    // "applies to the right of the sign". But a sign pointing to parking permits
    // nothing, and there is nothing to extend: `T11` describes a PLACE, and here
    // there is no place at all.
    const wayfinding = recognise(doc([plate({ arrow: "right", pictogram: "arrow" })],
                                     "wayfinding_parking_house"));
    expect(wayfinding.panelKeys[1]).toEqual(["wayfinding-direction"]);

    // Under an ordinary `P` the same arrow is a stretch.
    const ordinary = recognise(doc([plate({ arrow: "right" })]));
    expect(ordinary.panelKeys[1]).toEqual(["arrow-right"]);
  });

  it("\"Privat parkering\" is recognised by its text - the only entry that is", () => {
    // The schema has no field for it and should not: free text is not something the
    // regulations provide for. But the consequence matters - the land is private.
    const rec = recognise(doc([
      plate({ operator: "Brf Ängslyckan" }, ["Privat parkering", "Brf Ängslyckan"],
            "operator_plate"),
    ]));
    expect(rec.panelKeys[1]).toContain("privat-parkering");
  });

  it("a zone sign is recognised by an entry of its own", () => {
    const zone = recognise(doc([], "parking", "zone"));
    expect(zone.mainSignKey).toBe("main-zone-parking");
    expect(recognise(doc([])).mainSignKey).toBe("main-parking");
  });

  it("the week parity and the season must be named", () => {
    // A rule applied silently is one the user cannot check.
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

describe("the reference entries are fit to be shown", () => {
  // Carried over from `tests/test_api.py` (step 8): the reference is the source of
  // every word about a sign, and a hole in it reaches the screen as a key or as
  // nothing at all.

  it("every entry has a human name", () => {
    // An entry with no name would appear to a person as a reference key - a code.
    expect(all().filter((e) => !e.label).map((e) => e.key)).toEqual([]);
  });

  it("every entry has a short caption as well", () => {
    // `en` is the full statement for the timeline, `short` the line under a panel's
    // text.
    for (const e of all()) {
      expect(e.short, `${e.key}: no short caption`).toBeTruthy();
      expect(e.short.length, `${e.key}: the caption is long - ${e.short}`)
        .toBeLessThanOrEqual(60);
    }
  });

  it("the codes look like official codes", () => {
    // C for prohibitions, D for mandatory signs, E for location signs, F for
    // direction, S for symbols, T for plates. An empty code is allowed ("no such
    // code exists"); an invented one is not.
    for (const e of all()) {
      expect(e.code === "" || /^[CDEFST]\d{1,2}$/.test(e.code), `${e.key}: ${e.code}`)
        .toBe(true);
    }
  });

  it("no key about time is left out of the composed phrase", () => {
    // A forgotten key comes out as a second line, repeating what the phrase already
    // said.
    const t6 = all().filter((e) => e.code === "T6").map((e) => e.key).sort();
    expect(t6).toEqual([...TIME_KEYS].sort());
  });

  it("every value of the schema reaches an entry of the reference", () => {
    // A value with no entry is a dead end: the model reads it correctly, no key is
    // found, and the instruction vanishes from the reading in silence
    // (`vehicle_class: bus`, photograph `038`).
    const parsed = (SIGN_SCHEMA as Record<string, any>).$defs.parsed.properties;
    for (const [field, table] of [["vehicle_class", VEHICLE_KEYS],
                                  ["eligibility", ELIGIBILITY_KEYS]] as const) {
      // `custom` included: it was left unmapped until step 15a gave the reference an
      // entry for a group the plate names in its own words, which is what it means.
      const values = parsed[field].enum as string[];
      expect(values.filter((v) => !(v in table)), field).toEqual([]);
      for (const v of values) expect(get(table[v]), `${field}: ${v}`).not.toBeNull();
    }
  });

  it("the table of vehicles exists in one place only", () => {
    // There used to be two tables, and a value added to the schema had to be entered
    // in both. The bus was entered into the schema and forgotten in the engine -
    // photograph `038`.
    const engine = source("web/src/lib/engine.ts");
    expect(engine).toMatch(/import \{ ELIGIBILITY_KEYS, VEHICLE_KEYS[^}]*\} from "\.\/reference"/);
    expect(engine, "the engine has started its own copy of the table again")
      .not.toContain('"motorcycle": "pictogram-motorcycle"');
  });

  it("the moped is split between the two pictograms, and both say so in English", () => {
    // A motorcycle pictogram covers motorcycles and heavy class I mopeds; a bicycle
    // pictogram covers bicycles and light class II mopeds. Confusing the two sends a
    // moped rider to the wrong bay, so the distinction is stated in the text the
    // reader actually sees - not only in the article written for the developer.
    expect(VEHICLE_KEYS.bicycle).toBe("pictogram-bicycle");
    expect(VEHICLE_KEYS.motorcycle).toBe("pictogram-motorcycle");

    const bicycle = get("pictogram-bicycle")!;
    const motorcycle = get("pictogram-motorcycle")!;
    expect(bicycle).not.toBeNull();
    expect(motorcycle).not.toBeNull();
    expect(bicycle.code).toBe("T8");
    expect(motorcycle.code).toBe("T8");

    // The longer class is checked first on each side: one numeral is a prefix of the
    // other, so asserting the shorter one alone would pass on either entry and prove
    // nothing.
    expect(bicycle.en, "the bicycle entry must name the light class").toContain("class II mopeds");
    expect(motorcycle.en, "the motorcycle entry must name the heavy class")
      .toContain("class I mopeds");
    expect(motorcycle.en, "the light class belongs to the bicycle").not.toContain("class II");
  });

  it("names the residents' area without losing the residents", () => {
    // Photographs `097` (`Boende Solna`) and `114` (`Boende GK-J`): the plate said who,
    // the district said which, and the screen called the whole line not interpreted.
    // The article declares `schema: —`, so the text is the only road to this entry.
    const rec = recognise(doc([plate({ uninterpreted: ["Boende GK-J"] }, ["Boende GK-J"])]));
    expect(rec.panelKeys[1]).toContain("boende");
    expect(rec.uninterpreted[1] ?? []).toEqual([]);
  });

  it("keeps a line with figures on it in plain sight", () => {
    // `Boende 8-18` narrows the circle BY THE HOUR, and what that means is still an
    // open question in the plan. A line carrying figures is never struck for the sake
    // of a word that was recognised inside it: it stays where it can be read.
    const rec = recognise(doc([plate({ uninterpreted: ["Boende 8-18"] }, ["Boende 8-18"])]));
    expect(rec.panelKeys[1]).toContain("boende");
    expect(rec.uninterpreted[1]).toEqual(["Boende 8-18"]);
  });

  it("reads a plate that names a group as one rule, whatever the word", () => {
    // `066`, `067`, `069`, `070`, `072`. In the schema they all arrive as
    // `eligibility: custom` - "nothing listed fitted" - so the field cannot tell them
    // from any other plate that fitted nothing. The word on the plate can.
    for (const word of ["Personal", "Reserverad Vaktmästare", "BLODBIL", "REGIONSERVICE"]) {
      const rec = recognise(doc([plate({ eligibility: "custom" }, [word])]));
      expect(rec.panelKeys[1], word).toContain("reserved-for-named-group");
    }
  });

  it("the words the code matches on are the ones the articles declare", () => {
    // Let the two drift apart and the rule quietly stops firing, while the article
    // goes on looking as though it works. Checked for every entry read by its text,
    // not only for the first one.
    for (const [key, words] of BY_TEXT) {
      const article = source(`reference/signs/${key}.md`);
      const declared = article.split("---")[1].split("\n")
        .find((line) => line.startsWith("tokens:"))!.toLowerCase();
      for (const word of words) expect(declared, `${key}: ${word}`).toContain(word);
    }
  });
});

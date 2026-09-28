// The transitions between screens and the gate on the key. Requirements 3 and 4 of
// step 11.
//
// The tests were written BEFORE the markup: the screen afterwards only paints what
// was decided here.

import { describe, expect, it } from "vitest";

import { EMPTY_SETTINGS, type Settings } from "./settings";
import { WITHOUT_KEY, go, reachable, start, type Screen, type View } from "./view";

const READY: Settings = {
  apiKey: "k",
  remember: true,
  provider: { baseUrl: "https://example.invalid/v1", visionModel: "a-model" },
};
const EMPTY: Settings = { ...EMPTY_SETTINGS };
// Half the settings is still "nothing can be read": a key with no address is useless.
const HALF: Settings = { ...EMPTY_SETTINGS, apiKey: "k" };

const ALL: Screen[] = ["first-launch", "home", "settings", "help", "about", "camera",
                       "frame", "reading"];
const at = (screen: Screen, from?: Screen): View => ({ screen, from });

describe("which screen comes first", () => {
  it("without a key the first launch, with one the home screen", () => {
    expect(start(EMPTY)).toBe("first-launch");
    expect(start(HALF)).toBe("first-launch");
    expect(start(READY)).toBe("home");
  });
});

describe("the gate on the key (decision 147)", () => {
  it("without a key exactly four screens are reachable", () => {
    // No camera, no gallery, no frame: a path leading to "a key is needed" is worse
    // than an honest request for the key at the very beginning.
    expect(ALL.filter((s) => reachable(EMPTY, s))).toEqual([...WITHOUT_KEY]);
  });

  it("incomplete settings give the same four", () => {
    expect(ALL.filter((s) => reachable(HALF, s))).toEqual([...WITHOUT_KEY]);
  });

  it("with a key everything is reachable except the first launch", () => {
    // `2f` is the state "there is no key", not a screen one can return to.
    expect(ALL.filter((s) => reachable(READY, s)))
      .toEqual(["home", "settings", "help", "about", "camera", "frame", "reading"]);
  });

  it("taking and choosing a photograph do not open at all without a key", () => {
    const here = at("first-launch");
    expect(go(here, "scan", EMPTY)).toEqual(here);
    expect(go(here, "pick", EMPTY)).toEqual(here);
    expect(go(here, "sent", EMPTY)).toEqual(here);
  });
});

describe("the settings and the help return where they were entered from", () => {
  it("from the first launch, back to the first launch", () => {
    const open = go(at("first-launch"), "open-settings", EMPTY);
    expect(open).toEqual({ screen: "settings", from: "first-launch" });
    expect(go(open, "back", EMPTY)).toEqual({ screen: "first-launch" });
  });

  it("from the home screen, back to the home screen", () => {
    const open = go(at("home"), "open-settings", READY);
    expect(open).toEqual({ screen: "settings", from: "home" });
    expect(go(open, "back", READY)).toEqual({ screen: "home" });
  });

  it("the help opens from the settings and returns there", () => {
    // There is one way into the help - from the settings: the link was taken off the
    // first launch so that the first screen asks one thing and one thing only. The
    // model still allows the transition from anywhere, but there is nobody left to
    // offer it.
    const fromSettings = go(at("settings", "home"), "open-help", READY);
    expect(fromSettings).toEqual({ screen: "help", from: "settings" });
    expect(go(fromSettings, "back", READY)).toEqual({ screen: "settings" });
  });

  it("the about page opens from the settings and returns there, with a key or without", () => {
    // It explains the app before a key exists, so it is readable without one, like
    // the help.
    for (const settings of [READY, EMPTY]) {
      const open = go(at("settings", "home"), "open-about", settings);
      expect(open).toEqual({ screen: "about", from: "settings" });
      expect(go(open, "back", settings)).toEqual({ screen: "settings" });
    }
  });

  it("a way that has become unreachable does not lead back into a dead end", () => {
    // We came to the settings from the home screen and forgot the key - back leads to
    // the first launch, not to a screen that does not exist with empty settings.
    expect(go(at("settings", "home"), "back", EMPTY))
      .toEqual({ screen: "first-launch" });
  });

  it("with no way recorded, \"back\" leads to the beginning", () => {
    expect(go(at("settings"), "back", READY)).toEqual({ screen: "home" });
  });
});

describe("the path from the home screen to the reading", () => {
  it("taking one: home, camera, frame, reading", () => {
    let v = go(at("home"), "scan", READY);
    expect(v).toEqual({ screen: "camera" });
    v = go(v, "captured", READY);
    expect(v).toEqual({ screen: "frame" });
    v = go(v, "sent", READY);
    expect(v).toEqual({ screen: "reading" });
  });

  it("choosing a photograph: home, and straight to the frame", () => {
    expect(go(at("home"), "pick", READY)).toEqual({ screen: "frame" });
  });

  it("\"Replace\" on the frame leads to the camera - which is also the way to the gallery", () => {
    // One control instead of a pair of "Take another / Another photo": `3d` has both
    // a shutter and a gallery tile, so both sources are one tap away.
    expect(go(at("frame"), "replace", READY)).toEqual({ screen: "camera" });
  });

  it("\"Scan another sign\" leads to the camera, not to the home screen", () => {
    // From the reading one goes to photograph the next sign: the person is standing
    // at a pole.
    expect(go(at("reading"), "scan-another", READY)).toEqual({ screen: "camera" });
  });

  it("without a key this transition is closed as well", () => {
    // It no longer has a special case of its own - so the general gate is working.
    const here = at("reading");
    expect(go(here, "scan-another", EMPTY)).toEqual(here);
  });

  it("\"back\" from the camera and the frame leads to the beginning", () => {
    // The reading is not in the list: the arrow in its header sends `scan-another`,
    // as does the button at the foot - both lead to the camera rather than to the
    // beginning.
    for (const screen of ["camera", "frame"] as Screen[]) {
      expect(go(at(screen), "back", READY), screen).toEqual({ screen: "home" });
    }
  });

  it("only the settings, the help and the about page remember the way", () => {
    // Otherwise "back" from the frame would lead into the camera the person has
    // already left.
    expect(go(at("home"), "scan", READY).from).toBeUndefined();
    expect(go(at("camera"), "captured", READY).from).toBeUndefined();
    expect(go(at("frame"), "sent", READY).from).toBeUndefined();
  });
});

// Which screen to show, and where the actions lead.
//
// Only decisions here: no markup, no React state, no calls to the browser. The
// component paints what has already been decided and checked here - by the same rule
// that keeps the words about a sign in `present` rather than in the markup. There is
// no DOM environment in the suite at all (decision 151), and this is the only way to
// keep the transitions under test.

import { canAnswerHere, type Settings } from "./settings";

export type Screen =
  | "first-launch"   // 2f - there is no key yet
  | "home"           // 3a - there is a key
  | "settings"       // 3e
  | "help"           // 2h - where to get a key
  | "about"          // 2i - what the app is
  | "camera"         // 3d
  | "frame"          // 3b - framing
  | "reading";       // 3c - the reading

/** The screens reachable without a key (decision 147).
 *
 *  Taking or choosing a photograph is not among them: a frame captured without a key
 *  ends in the message "a key is needed", and a path leading to a dead end is worse
 *  than an honest "the key first". What was rejected was the other thing - meeting a
 *  person with a DEMAND instead of an explanation; `2f` explains: it shows a sign,
 *  says what it reads, and asks last. */
export const WITHOUT_KEY: readonly Screen[] = ["first-launch", "settings", "help", "about"];

/** The first screen: without a key the first launch, with one the home screen.
 *  These are two states of one place, not two different screens along a path. */
export function start(settings: Settings): Screen {
  return canAnswerHere(settings) ? "home" : "first-launch";
}

/** Whether this screen can be reached at all with these settings. */
export function reachable(settings: Settings, screen: Screen): boolean {
  if (!canAnswerHere(settings)) return WITHOUT_KEY.includes(screen);
  // With a key there is no first launch: the home screen takes its place.
  return screen !== "first-launch";
}

export type Action =
  | "open-settings"   // the settings control on the home screen, "Add your key" on 2f
  | "open-help"       // "How keys work, and where to get one"
  | "open-about"      // "About the app"
  | "back"            // the arrow in the header
  | "scan"            // "Scan a sign" - into the viewfinder
  | "pick"            // "Pick a photo you already took" - straight to the frame
  | "captured"        // the shutter was pressed: there is a photograph, now the frame
  | "replace"         // "Replace" on the framing screen - back to the camera
  | "sent"            // the frame went to the model, and an answer came back
  | "scan-another";   // "Scan another sign" - and the arrow in the reading's header

/** Where we are now and where we came from.
 *
 *  `from` is needed by the settings, the help and the about page: they are reached
 *  from more than one place, and "back" must return where the person came from. A "Back to Settings" button, as drawn in the
 *  mock-up, would be untrue half the time, which is why there will not be one. */
export type View = { screen: Screen; from?: Screen };

const TARGET: Record<Action, Screen | null> = {
  "open-settings": "settings",
  "open-help": "help",
  "open-about": "about",
  back: null,           // decided by `from`
  scan: "camera",
  pick: "frame",
  captured: "frame",
  replace: "camera",
  sent: "reading",
  // From the reading one goes to photograph the next sign, not to the home screen:
  // the person is standing at a pole, and their next action is the camera again. The
  // home screen is reached by the browser's own back button.
  "scan-another": "camera",
};

/**
 * The next view. An unreachable screen is not shown: the view stays as it was.
 *
 * This is the second gate, not the first. The first is the screen itself: without a
 * key it carries neither "Scan a sign" nor "Pick a photo", and there is nothing to
 * press. But a gate that rests only on a button not having been drawn rests on the
 * memory of whoever writes the markup.
 */
export function go(view: View, action: Action, settings: Settings): View {
  if (action === "back") {
    // The settings, the help and the about page return where they were entered from;
    // everything else returns to the beginning.
    const to = view.from ?? start(settings);
    return { screen: reachable(settings, to) ? to : start(settings) };
  }
  const to = TARGET[action];
  if (!to || !reachable(settings, to)) return view;
  // Only those obliged to travel back along it remember the way.
  return to === "settings" || to === "help" || to === "about"
    ? { screen: to, from: view.screen }
    : { screen: to };
}

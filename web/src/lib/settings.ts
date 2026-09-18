// The user's key and the provider's address.
//
// **Decision 125.** The key lives in the memory of the tab. It is saved on the device
// only by an explicit "remember" tick, and that same tick can be cleared - which
// erases what was saved. The product has no right to decide for a person where their
// paid key should live.
//
// The key goes to exactly one place - the header of the request to the provider
// (`vision.ts`). It reaches no log, no report and no address, and it never goes to
// anybody else's server: this application has no server of its own.

const KEY = "parkread.key";
const PROVIDER = "parkread.provider";

// There is one model: triage and the reading both go to it (decision 134). They
// always did go to the same one, and a second field asked the person for something
// they do not know.
export type Provider = {
  baseUrl: string;
  visionModel: string;
};

export const EMPTY_PROVIDER: Provider = { baseUrl: "", visionModel: "" };

/** A store that may not exist at all: a private tab, a site denied storage, an old
 *  phone. The product does not break on that - it simply does not remember. */
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserStore(): Store | null {
  try {
    const probe = "parkread.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;               // nowhere to store it means we do not store it
  }
}

export type Settings = {
  apiKey: string;
  remember: boolean;
  provider: Provider;
};

export const EMPTY_SETTINGS: Settings = {
  apiKey: "", remember: false, provider: EMPTY_PROVIDER,
};

/** What could be remembered when the page opened. */
export function load(store: Store | null): Settings {
  if (!store) return { ...EMPTY_SETTINGS };
  const apiKey = store.getItem(KEY) ?? "";
  let provider = EMPTY_PROVIDER;
  try {
    const raw = store.getItem(PROVIDER);
    if (raw) provider = { ...EMPTY_PROVIDER, ...JSON.parse(raw) };
  } catch {
    provider = EMPTY_PROVIDER;      // a corrupted record reads as its absence
  }
  return { apiKey, remember: Boolean(apiKey), provider };
}

/** Save what we were asked to save. The key only under `remember`; clearing the tick
 *  erases what was stored at once, not at the next launch. */
export function save(store: Store | null, settings: Settings): void {
  if (!store) return;
  if (settings.remember && settings.apiKey) store.setItem(KEY, settings.apiKey);
  else store.removeItem(KEY);
  // The provider's address and the model's name are no secret, and remembering them
  // is always useful: without them the key is useless, and typing them again at a
  // sign is painful.
  store.setItem(PROVIDER, JSON.stringify(settings.provider));
}

/** Forget the key everywhere: in memory and on the device alike. */
export function forget(store: Store | null): Settings {
  store?.removeItem(KEY);
  return { ...EMPTY_SETTINGS, provider: load(store).provider };
}

/** Is the browser ready to answer by itself: a key, an address and a model. */
export function canAnswerHere(s: Settings): boolean {
  return Boolean(s.apiKey && s.provider.baseUrl && s.provider.visionModel);
}

/** What is missing, as a list, so the screen can say it in words rather than as
 *  "an error". */
export function missing(s: Settings): string[] {
  const out: string[] = [];
  if (!s.apiKey) out.push("your API key");
  if (!s.provider.baseUrl) out.push("the provider address");
  if (!s.provider.visionModel) out.push("the model name");
  return out;
}

// --- what the settings screen shows -----------------------------------------
//
// The screen's decisions live here, beside the settings themselves, rather than in
// the markup: there is no DOM environment in the suite (decision 151), and this is
// the only way they can be checked.

/** A row of the settings at rest: what is visible and what the action on the right is
 *  called. */
export type Row = {
  /** The value, the mask, or "not set yet". */
  shown: string;
  /** While there is no value, "Add"; afterwards "Edit". Not "Replace": a thing is
   *  replaced, a value is edited, and the second is what the person is doing. */
  action: "Add" | "Edit";
  filled: boolean;
};

export const NOT_SET = "Not set";

/** The mask of the key is of constant length. A number of dots matching the key's
 *  length would show the size of a paid credential beside it: a small thing, and one
 *  there is no reason to tell either a neighbour on the train or a screenshot. */
export const MASK = "••••••••••••••••";

export function row(value: string, { secret = false } = {}): Row {
  const filled = value.trim().length > 0;
  return {
    shown: !filled ? NOT_SET : secret ? MASK : value,
    action: filled ? "Edit" : "Add",
    filled,
  };
}

/** The "remember on this device" control (decision 146).
 *
 *  While the key field is empty it shows the default - on - but cannot be pressed:
 *  there is nothing to choose yet. With the first character typed it comes alive,
 *  still on, and it can be turned off BEFORE saving. The default is thereby
 *  "remember", but the choice is not taken away: it is on the same screen, at the
 *  minute when there is still nothing to save. */
export function rememberToggle(draftKey: string, chosen?: boolean):
    { on: boolean; disabled: boolean } {
  const empty = draftKey.trim().length === 0;
  return { on: empty ? true : chosen ?? true, disabled: empty };
}

/** Whether the application is configured, and if not, what is missing, in words. */
export type Readiness = { ready: boolean; chip: string; missing: string[] };

export function readiness(s: Settings): Readiness {
  const gaps = missing(s);
  return {
    ready: gaps.length === 0,
    // The label answers the question "is everything ready": either everything, or
    // "go and configure it". "Configure" is a verb: it says what to do, not only what
    // is absent. Neither is painted red: red in this product means "the sign
    // prohibits", and nothing else.
    chip: gaps.length === 0 ? "All set" : "Configure",
    missing: gaps,
  };
}

/** Whether to show "Forget key". A button with nothing to do has no place on the
 *  screen: it promises an action and performs none. */
export const canForget = (s: Settings): boolean => s.apiKey.trim().length > 0;

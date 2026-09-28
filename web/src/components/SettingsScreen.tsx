// Screen 3e - the settings: the key and the provider.
//
// What to show and what to call the actions is decided by `lib/settings`: `row`,
// `rememberToggle`, `readiness`, `canForget`. Here there is only paint - and not one
// decision that a test could not check (decision 151).
//
// The look of the fields is the old one: a caption, a box with the value beneath it,
// the action on the right. There are no section headings: under each of them stood a
// field caption saying the same thing.

import { useState } from "react";

import { canForget, readiness, rememberToggle, row, type Settings } from "../lib/settings";

type Props = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onForget: () => void;
  onBack: () => void;
  onHelp: () => void;
  onAbout: () => void;
};

type Field = "key" | "address" | "model";

const FIELD = "min-w-0 flex-1 rounded-field bg-inset px-4 py-3 text-body text-ink "
            + "shadow-[inset_0_0_0_1.5px_var(--color-field)] outline-none";

const QUIET = "rounded-button-sm px-4 py-2.5 text-label font-semibold text-ink-2";

export default function SettingsScreen(
  { settings, onChange, onForget, onBack, onHelp, onAbout }: Props,
) {
  // Editing is explicit: an open field, with Save and Cancel beside it. Saving
  // silently as the person types is not allowed - half a key is as useless as no key,
  // and it would look like a saved setting.
  const [editing, setEditing] = useState<Field | null>(
    // Arriving from the first launch, where there is nothing: the key field is open
    // at once, or there would be one extra tap between "Add your key" and the
    // keyboard.
    settings.apiKey || settings.provider.baseUrl || settings.provider.visionModel
      ? null : "key",
  );
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState(false);
  const [remember, setRemember] = useState<boolean | undefined>(undefined);

  const state = readiness(settings);

  const valueOf = (id: Field) =>
    id === "key" ? settings.apiKey
    : id === "address" ? settings.provider.baseUrl
    : settings.provider.visionModel;

  function open(id: Field) {
    setEditing(id);
    setDraft(valueOf(id));
    setShown(false);
    setRemember(undefined);
  }

  function saveField(id: Field) {
    const value = draft.trim();
    if (id === "key") {
      const { on } = rememberToggle(value, remember);
      onChange({ ...settings, apiKey: value, remember: on });
    } else if (id === "address") {
      onChange({ ...settings, provider: { ...settings.provider, baseUrl: value } });
    } else {
      onChange({ ...settings, provider: { ...settings.provider, visionModel: value } });
    }
    setEditing(null);
    setDraft("");
  }

  function field(id: Field, label: string, opts: { secret?: boolean; mono?: boolean } = {}) {
    const view = row(valueOf(id), { secret: opts.secret });
    const editing_ = editing === id;
    const mono = opts.mono ? "font-mono" : "";

    if (!editing_) {
      return (
        <div className="flex items-end gap-3">
          {/* `min-w-0` is obligatory: without it a long value refuses to shrink and
              pushes the button off the edge of the screen - which is exactly what was
              found on a phone with a long key. */}
          <span className="min-w-0 flex-1">
            <span className="block text-label text-ink-3">{label}</span>
            {/* Monospaced only for somebody else's text: the key and the address.
                "Not set" is our own word, and it looks like the rest of our words. */}
            <span
              className={`mt-1.5 block truncate rounded-field bg-inset px-4 py-3
                          text-body ${view.filled ? `${mono} text-ink` : "text-ink-3"}
                          shadow-[inset_0_0_0_1.5px_var(--color-field)]`}
            >
              {view.shown}
            </span>
          </span>
          <button
            type="button"
            onClick={() => open(id)}
            className="shrink-0 rounded-button-sm bg-chip px-4 py-3 text-label
                       font-semibold text-ink-2"
          >
            {view.action}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <span className="block text-label text-ink-3">{label}</span>
        <div className="flex items-start gap-2">
          {opts.secret && shown ? (
            // A revealed key goes in a wrapping field: it is visible whole, and the
            // screen need not be dragged sideways. A hidden one stays a password
            // input: there are dots there, nothing to read, and a wrapping field
            // cannot be masked - a text area has no password type, and the CSS
            // property for it quietly fails in places, so the key would be exposed
            // where dots were promised.
            <textarea
              autoFocus
              rows={3}
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              className={`${FIELD} ${mono} resize-none break-all`}
            />
          ) : (
            <input
              autoFocus
              type={opts.secret ? "password" : "text"}
              value={draft}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              className={`${FIELD} ${mono}`}
            />
          )}
          {/* The eye was brought back deliberately: a long key typed on a phone
              cannot be checked any other way. */}
          {opts.secret && (
            <button
              type="button"
              onClick={() => setShown(!shown)}
              aria-pressed={shown}
              aria-label={shown ? "Hide the key" : "Show the key"}
              className="shrink-0 rounded-field bg-chip px-3 py-3 text-label
                         font-semibold text-ink-2"
            >
              {shown ? "Hide" : "Show"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => saveField(id)}
            className="rounded-button-sm bg-accent px-5 py-2.5 text-label font-bold
                       text-on-dark"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setDraft(""); }}
            className={QUIET}
          >
            Cancel
          </button>
          {/* Clearing belongs here rather than as a separate control on the screen:
              erasing a long value from a keyboard is painful, and an "erase
              everything" would overlap with "Forget key" and would carry off the
              provider's address, which `forget` deliberately keeps. */}
          <button type="button" onClick={() => setDraft("")} className={`${QUIET} ml-auto`}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  // The box is always visible, not only while editing: it is about the fate of the
  // key rather than about the current input. While editing it watches the draft; at
  // rest, what was saved.
  const keyOpen = editing === "key";
  const check = keyOpen
    ? rememberToggle(draft, remember)
    : rememberToggle(settings.apiKey, settings.remember);

  return (
    <section className="flex flex-1 flex-col gap-6">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-chip
                     text-lg font-semibold text-ink-2"
        >
          ‹
        </button>
        <h1 className="flex-1 text-nav font-bold text-ink-strong">Settings</h1>
        {/* Configured or not is visible without reading. The backing is needed:
            without it the word did not read as a state. But this is a label rather
            than a button - a pill half the height of `Add`/`Edit` and softer in
            colour, so that it does not argue with them.
            The amber is the same as the note below; the mint is its own (`ok-bg`):
            the colours of meaning belong to the reading of a sign and are taken only
            there. */}
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-bold ${
          state.ready ? "bg-ok-bg text-ok" : "bg-note text-note-ink"}`}>
          {state.chip}
        </span>
      </header>

      <div className="flex flex-col gap-3">
        {field("key", "API key", { secret: true, mono: true })}

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={check.on}
            disabled={check.disabled}
            onChange={() => {
              if (keyOpen) setRemember(!check.on);
              else onChange({ ...settings, remember: !check.on });
            }}
            className="h-5 w-5 shrink-0 accent-accent"
          />
          <span className={`text-body ${check.disabled ? "text-ink-off" : "text-ink"}`}>
            Remember on this device
          </span>
        </label>

        {/* Two lines, no more: a long promise here goes unread. The word "Unticked"
            is about that very box beside it, and not about the sliding control that
            `design.md` once called for and that is not on this screen. */}
        <p className="text-caption text-ink-3">
          Sent only to the provider you name — this app has no server. Unticked, the
          key is forgotten when the tab closes.
        </p>

        {/* Forgetting the key stands with the key, not at the foot of the screen: it
            is an action on that one field, and it appears only when there is a key to
            forget. A quiet button the size of its text - the danger is spoken by the
            words, not by a fill. */}
        {canForget(settings) && (
          <div className="flex w-full items-center gap-3">
            <button
              type="button"
              onClick={onForget}
              className="shrink-0 rounded-button-sm bg-chip px-4 py-3 text-label
                         font-semibold text-ink-2"
            >
              Forget key
            </button>
            {/* The line stands on the RIGHT and wraps within itself rather than
                dropping under the button: `min-w-0` lets it shrink - without it, it
                would force the row wide, exactly as happened with a long key.

                It says where the key goes from: `forget` erases it both from the
                page's memory and from the browser's storage. The address and the
                model it deliberately keeps, and the person should not have to guess
                that. */}
            <span className="min-w-0 text-caption text-ink-3">
              Erased from this page and browser. Address and model stay.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {field("address", "Provider address", { mono: true })}
        {field("model", "Vision model")}
      </div>

      {/* A note rather than a grey line: this is the one place that says why the
          application is not reading signs yet, and people walked straight past it. */}
      {!state.ready && (
        <p className="rounded-card-sm bg-note px-4 py-3 text-label text-note-ink">
          To read a sign the app still needs {state.missing.join(", ")}.
        </p>
      )}

      {/* At the foot: the help and the page about the app, as the last lines of the
          screen. */}
      <div className="mt-auto flex flex-col items-start gap-4 pt-2">
        <button
          type="button"
          onClick={onHelp}
          className="text-left text-label font-semibold text-link"
        >
          How keys work, and where to get one
        </button>
        <button
          type="button"
          onClick={onAbout}
          className="text-left text-label font-semibold text-link"
        >
          About the app
        </button>
      </div>
    </section>
  );
}

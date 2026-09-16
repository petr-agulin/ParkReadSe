// Экран 3e — настройки: ключ и провайдер.
//
// Что показывать и как называть действия, решает `lib/settings`: `row`,
// `rememberToggle`, `readiness`, `canForget`. Здесь только краска — и ни одного
// решения, которое нельзя было бы проверить тестом (решение 151).

import { useState } from "react";

import { canForget, readiness, rememberToggle, row, type Settings } from "../lib/settings";

type Props = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onForget: () => void;
  onBack: () => void;
  onHelp: () => void;
};

type Field = "key" | "address" | "model";

const FIELD = "w-full rounded-field bg-inset px-4 py-3 text-body text-ink "
            + "shadow-[inset_0_0_0_1.5px_var(--color-field)] outline-none";

export default function SettingsScreen(
  { settings, onChange, onForget, onBack, onHelp }: Props,
) {
  // Правка — явная: открытая строка, кнопка Save и Cancel рядом. Молча
  // сохранять по ходу ввода нельзя — половина ключа так же бесполезна, как его
  // отсутствие, а выглядела бы как сохранённая настройка.
  const [editing, setEditing] = useState<Field | null>(
    // Пришли с первого запуска, где нет ничего: строка ключа открыта сразу,
    // иначе между «Add your key» и клавиатурой стоял бы лишний тап.
    settings.apiKey || settings.provider.baseUrl || settings.provider.visionModel
      ? null : "key",
  );
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState(false);
  const [remember, setRemember] = useState<boolean | undefined>(undefined);

  const state = readiness(settings);
  const rows: { id: Field; label: string; value: string; secret?: boolean }[] = [
    { id: "key", label: "API key", value: settings.apiKey, secret: true },
    { id: "address", label: "Provider address", value: settings.provider.baseUrl },
    { id: "model", label: "Vision model", value: settings.provider.visionModel },
  ];

  function open(id: Field, value: string) {
    setEditing(id);
    setDraft(value);
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

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
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
        {/* Настроено или нет — видно, не читая. Уйти отсюда, не заметив, что
            читать всё ещё нечем, человек не должен: платится это у знака. */}
        <span
          className={`rounded-full px-3 py-1.5 text-caption font-bold ${
            state.ready ? "bg-tint text-tint-ink" : "bg-chip text-ink-2"}`}
        >
          {state.chip}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <p className="pl-1.5 text-section font-bold uppercase tracking-[0.1em] text-ink-3">
          Your key
        </p>

        <div className="rounded-card-sm bg-ground shadow-card">
          {rows.map((r, i) => {
            const view = row(r.value, { secret: r.secret });
            const open_ = editing === r.id;
            return (
              <div key={r.id}>
                {i > 0 && <span className="mx-4 block h-px bg-line" />}
                <div className="flex items-center gap-3 px-4 py-4">
                  <span className="flex-1">
                    <span className="block text-body font-semibold text-ink">{r.label}</span>
                    {!open_ && (
                      <span className={`mt-0.5 block text-label text-ink-3 ${
                        r.secret || r.id === "address" ? "font-mono" : ""}`}>
                        {view.shown}
                      </span>
                    )}
                  </span>
                  {!open_ && (
                    <button type="button" onClick={() => open(r.id, r.value)}
                            className="text-label font-semibold text-link">
                      {view.action}
                    </button>
                  )}
                </div>

                {open_ && (
                  <div className="flex flex-col gap-3 px-4 pb-4">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type={r.secret && !shown ? "password" : "text"}
                        value={draft}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => setDraft(e.target.value)}
                        className={FIELD}
                      />
                      {/* Глаз возвращён сознательно: длинный ключ, набранный
                          на телефоне, нечем проверить иначе. */}
                      {r.secret && (
                        <button type="button" onClick={() => setShown(!shown)}
                                aria-pressed={shown}
                                aria-label={shown ? "Hide the key" : "Show the key"}
                                className="shrink-0 rounded-field bg-chip px-3 py-3
                                           text-label font-semibold text-ink-2">
                          {shown ? "Hide" : "Show"}
                        </button>
                      )}
                    </div>

                    {r.id === "key" && (() => {
                      const toggle = rememberToggle(draft, remember);
                      return (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={toggle.on}
                            disabled={toggle.disabled}
                            onClick={() => setRemember(!toggle.on)}
                            className={`flex h-7 w-[46px] shrink-0 items-center rounded-full
                                        px-0.5 ${toggle.disabled ? "bg-chip"
                                          : toggle.on ? "bg-accent" : "bg-field"}`}
                          >
                            <span className={`block h-[22px] w-[22px] rounded-full bg-ground
                                              ${toggle.on ? "ml-auto" : ""}`} />
                          </button>
                          <span className={`text-body ${
                            toggle.disabled ? "text-ink-off" : "text-ink"}`}>
                            Remember on this device
                          </span>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveField(r.id)}
                              className="rounded-button-sm bg-accent px-5 py-3 text-body
                                         font-bold text-on-dark">
                        Save
                      </button>
                      <button type="button"
                              onClick={() => { setEditing(null); setDraft(""); }}
                              className="rounded-button-sm px-4 py-3 text-body
                                         font-semibold text-ink-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="px-1.5 text-caption text-ink-3">
          Sent from this device to the provider you name, and nowhere else — this app
          has no server of its own. Switched off, the key is forgotten when the tab
          closes.
        </p>
      </div>

      {!state.ready && (
        <p className="px-1.5 text-label text-ink-2">
          To read a sign the app still needs {state.missing.join(", ")}.
        </p>
      )}

      <button type="button" onClick={onHelp}
              className="px-1.5 text-left text-label font-semibold text-link">
        How keys work, and where to get one
      </button>

      {/* Опасное действие — отдельно и внизу, как ему и положено. Нет ключа —
          нет и кнопки: обещать действие, которого не будет, незачем. */}
      {canForget(settings) && (
        <button type="button" onClick={onForget}
                className="rounded-card-sm bg-danger-bg py-4 text-body font-bold text-deny">
          Forget the key
        </button>
      )}
    </section>
  );
}

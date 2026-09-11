// Ключ пользователя и адрес провайдера.
//
// **Решение 125.** Ключ платный и личный, и решать за человека, где ему лежать,
// продукт не вправе: по умолчанию он живёт в памяти вкладки, а сохраняется только
// по явной галочке. Здесь же сказано прямым текстом, куда он уходит, — потому что
// вопрос «кому я сейчас отдаю свой ключ» возникает у всякого, кто его вводит.
//
// Экран работает и БЕЗ ключа: снимок, кадр и рамка доступны всегда, а отправка
// объясняет, чего не хватает. Первое, что видит новый человек, — не требование.

import { useState } from "react";

import { canAnswerHere, missing, type Settings } from "../lib/settings";

type Props = {
  settings: Settings;
  onChange: (next: Settings) => void;
  onForget: () => void;
};

const FIELD = "w-full rounded-lg border border-line px-2 py-1 text-[13px]";

export default function KeyPanel({ settings, onChange, onForget }: Props) {
  const [open, setOpen] = useState(!canAnswerHere(settings));
  const ready = canAnswerHere(settings);
  const набор = settings.provider;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-slate-800">Your key</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] text-accent underline"
        >
          {open ? "hide" : ready ? "change" : "add"}
        </button>
      </div>

      {!open && (
        <p className="mt-1 text-[12px] text-ink-3">
          {ready
            ? "Ready: signs are read on this device with your own key."
            : `To read a sign the app needs ${missing(settings).join(", ")}.`}
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-ink-3">API key</span>
            <input
              type="password"
              value={settings.apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
              className={FIELD}
            />
          </label>

          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={settings.remember}
              onChange={(e) => onChange({ ...settings, remember: e.target.checked })}
            />
            Remember on this device
          </label>

          {/* Адрес и модели — не секрет, и помнятся всегда: без них ключ
              бесполезен, а вводить их заново у знака мучительно. */}
          <label className="block">
            <span className="mb-1 block text-[12px] text-ink-3">Provider address</span>
            <input
              type="text"
              value={набор.baseUrl}
              placeholder="https://…/v1"
              spellCheck={false}
              onChange={(e) => onChange({ ...settings,
                                          provider: { ...набор, baseUrl: e.target.value } })}
              className={FIELD}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[12px] text-ink-3">Triage model</span>
              <input
                type="text"
                value={набор.triageModel}
                spellCheck={false}
                onChange={(e) => onChange({ ...settings,
                                            provider: { ...набор, triageModel: e.target.value } })}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-ink-3">Reading model</span>
              <input
                type="text"
                value={набор.visionModel}
                spellCheck={false}
                onChange={(e) => onChange({ ...settings,
                                            provider: { ...набор, visionModel: e.target.value } })}
                className={FIELD}
              />
            </label>
          </div>

          <p className="text-[12px] leading-snug text-ink-3">
            The key is sent from this device to the provider you name above, and
            nowhere else — this app has no server of its own. Unticked, it is
            forgotten when the tab closes.
          </p>

          {settings.apiKey && (
            <button
              type="button"
              onClick={onForget}
              className="rounded-lg border border-line px-3 py-1 text-[13px] text-ink-2"
            >
              Forget the key
            </button>
          )}
        </div>
      )}
    </section>
  );
}

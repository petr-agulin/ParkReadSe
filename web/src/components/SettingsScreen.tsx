// Экран 3e — настройки: ключ и провайдер.
//
// Что показывать и как называть действия, решает `lib/settings`: `row`,
// `rememberToggle`, `readiness`, `canForget`. Здесь только краска — и ни одного
// решения, которое нельзя было бы проверить тестом (решение 151).
//
// Вид полей — прежний: подпись, под ней коробка со значением, справа действие.
// Заголовков разделов нет: под каждым из них стояла подпись поля, говорившая
// то же самое.

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

const FIELD = "min-w-0 flex-1 rounded-field bg-inset px-4 py-3 text-body text-ink "
            + "shadow-[inset_0_0_0_1.5px_var(--color-field)] outline-none";

const QUIET = "rounded-button-sm px-4 py-2.5 text-label font-semibold text-ink-2";

export default function SettingsScreen(
  { settings, onChange, onForget, onBack, onHelp }: Props,
) {
  // Правка — явная: открытое поле, Save и Cancel рядом. Молча сохранять по ходу
  // ввода нельзя — половина ключа так же бесполезна, как его отсутствие,
  // а выглядела бы как сохранённая настройка.
  const [editing, setEditing] = useState<Field | null>(
    // Пришли с первого запуска, где нет ничего: поле ключа открыто сразу,
    // иначе между «Add your key» и клавиатурой стоял бы лишний тап.
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
          {/* `min-w-0` обязателен: без него длинное значение отказывается ужиматься
              и выталкивает кнопку за край экрана — ровно это и было найдено
              на телефоне с длинным ключом. */}
          <span className="min-w-0 flex-1">
            <span className="block text-label text-ink-3">{label}</span>
            {/* Моноширинным — только чужой текст: ключ и адрес. «Not set» — наше
                слово, и выглядит оно как остальные наши слова. */}
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
            // Показанный ключ — в переносящемся поле: он виден целиком, и возить
            // экран вбок не приходится. Скрытый остаётся `password`: там точки,
            // читать нечего, а замаскировать переносящееся поле нечем — `textarea`
            // не умеет `password`, а `-webkit-text-security` местами молча не
            // работает, и ключ оказался бы открыт там, где обещаны точки.
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
          {/* Глаз возвращён сознательно: длинный ключ, набранный на телефоне,
              нечем проверить иначе. */}
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
          {/* Очистка — здесь, а не отдельной кнопкой на экране: стирать длинное
              значение с клавиатуры мучительно, а «стереть всё» пересекалось бы
              с «Forget the key» и уносило бы адрес провайдера, который `forget`
              бережёт нарочно. */}
          <button type="button" onClick={() => setDraft("")} className={`${QUIET} ml-auto`}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  // Флажок виден всегда, а не только в правке: он про судьбу ключа, а не про
  // текущий ввод. В правке смотрит на черновик, в покое — на сохранённое.
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
        {/* Настроено или нет — видно, не читая. Подложка нужна: без неё слово
            не читалось как состояние. Но это метка, а не кнопка — пилюля вдвое
            ниже `Add`/`Edit` и мягче по цвету, чтобы не спорить с ними.
            Амбра — та же, что у заметки ниже; мята своя (`ok-bg`): цвета смысла
            принадлежат разбору знака и берутся только там. */}
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

        {/* Две строки, не больше: длинное обещание здесь не читают. Слово
            «Unticked» — про тот самый флажок рядом, а не про переключатель,
            которого на экране нет. */}
        <p className="text-caption text-ink-3">
          Sent only to the provider you name — this app has no server. Unticked, the
          key is forgotten when the tab closes.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {field("address", "Provider address", { mono: true })}
        {field("model", "Vision model")}
      </div>

      {/* Заметкой, а не серой строкой: это единственное место, где сказано,
          почему приложение ещё не читает знаки, и мимо него проходили. */}
      {!state.ready && (
        <p className="rounded-card-sm bg-note px-4 py-3 text-label text-note-ink">
          To read a sign the app still needs {state.missing.join(", ")}.
        </p>
      )}

      {/* Внизу: опасное действие тихой кнопкой по размеру текста — нет ключа,
          нет и кнопки, — а под ним помощь, последней строкой экрана. Заливки
          нет: об опасности говорят слова. */}
      <div className="mt-auto flex flex-col items-start gap-4 pt-2">
        {canForget(settings) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={onForget}
              className="shrink-0 rounded-button-sm bg-chip px-4 py-3 text-label
                         font-semibold text-ink-2"
            >
              Forget the key
            </button>
            {/* Рядом сказано, что именно уйдёт: адрес и модель `forget` бережёт
                нарочно, и гадать об этом человек не должен. */}
            <span className="text-caption text-ink-3">
              Removes the key; the address and model stay.
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onHelp}
          className="text-left text-label font-semibold text-link"
        >
          How keys work, and where to get one
        </button>
      </div>
    </section>
  );
}

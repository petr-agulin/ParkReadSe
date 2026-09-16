// Экран 2h — «где взять ключ». Текст и ничего кроме: ни состояния, ни решений.
//
// О чужих моделях говорится только проверяемое — имя и совместимость (решение 150).
// Всё, что мы знаем о качестве, измерено на одной модели и одном наборе из 55
// снимков; «не хуже» про чужой товар мы не мерили и не скажем.

type Props = { onBack: () => void };

const PROVIDERS: { name: string; note: string }[] = [
  {
    name: "Google Gemini",
    note: "What this app is used with day to day, and the only one its accuracy "
        + "has been measured on. A key is free to create, with no card.",
  },
  { name: "OpenAI", note: "Vision models of the GPT family." },
  { name: "Mistral", note: "Pixtral." },
  { name: "OpenRouter", note: "One key, many models from several vendors." },
  {
    name: "A model you host yourself",
    note: "If it answers at your own address in the same dialect, point ParkRead at it.",
  },
];

const STEPS = [
  "Open an account with the provider you picked, and turn on API access.",
  "Create an API key there. Copy it once — most providers show it only that one time.",
  "In Settings, paste the key, set the provider address, and name the vision model.",
];

export default function KeyHelp({ onBack }: Props) {
  return (
    <section className="flex flex-col gap-4">
      {/* Возврат — стрелкой, и она ведёт туда, откуда пришли: `2h` открывается
          и с первого запуска, и из настроек, поэтому кнопки «Back to Settings»
          внизу нет вовсе — она была бы неправдой в половине случаев. */}
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
        <h1 className="text-nav font-bold text-ink-strong">Where to get a key</h1>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card font-extrabold text-ink-strong">
          Any vision model will do.
        </h2>
        <p className="mt-3 text-body text-ink-2">
          ParkRead is not tied to one provider. You bring the key, you pick the model,
          and you pay whoever you chose.
        </p>
        {/* Требование к провайдеру названо прямо: «умеет смотреть на снимок» мало.
            Модель за другим интерфейсом не заработает, и человек не поймёт почему. */}
        <p className="mt-3 text-body text-ink-2">
          One thing is required: the provider must answer in the OpenAI-compatible way
          (<code className="font-mono text-label">POST /chat/completions</code>).
          A vision model behind a different interface will not work here.
        </p>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">Providers that speak it</h2>
        <div className="mt-4 flex flex-col gap-4">
          {PROVIDERS.map((p) => (
            <div key={p.name} className="border-l-2 border-line pl-3.5">
              <p className="text-row font-bold text-ink">{p.name}</p>
              <p className="mt-0.5 text-label text-ink-2">{p.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">The shape of it</h2>
        <ol className="mt-4 flex flex-col gap-3.5">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center
                               rounded-tile bg-tint text-label font-extrabold text-tint-ink">
                {i + 1}
              </span>
              <span className="text-body text-ink">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-label text-ink-3">
          Each provider words its screens differently, so these are the parts to look
          for rather than the exact clicks.
        </p>
        {/* Цена названа здесь же: открытый вопрос спрашивал и «где взять», и «сколько
            стоит», и без второй половины экран отвечал бы наполовину. */}
        <p className="mt-2 text-label text-ink-3">
          Reading one sign costs two model calls — roughly 1700 tokens.
        </p>
      </div>

      <div className="rounded-card-sm bg-note p-5">
        <p className="text-label text-note-ink">
          A key is a payment instrument. ParkRead keeps it on this device unless you
          switch that off, so on a phone that is not yours, use “Forget the key” in
          Settings.
        </p>
      </div>
    </section>
  );
}

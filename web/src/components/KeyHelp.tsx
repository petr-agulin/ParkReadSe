// Экран 2h — «где взять ключ». Текст и ничего кроме: ни состояния, ни решений.
//
// О чужих моделях говорится только проверяемое — имя и совместимость (решение 150).
// Всё, что мы знаем о качестве, измерено на одной модели и одном наборе из 55
// снимков; «не хуже» про чужой товар мы не мерили и не скажем.
//
// **Про деньги здесь не обещается ничего.** У провайдеров бывают и бесплатные квоты,
// и платные тарифы, и меняются они без нашего ведома. Экран называет размер запроса
// и говорит, зачем он человеку, — примерить к своему тарифу. Слов «платно», «бесплатно»
// и «без карты» на нём нет.

type Props = { onBack: () => void };

// О чужих провайдерах — только проверяемое: имя и совместимость (решение 150).
// Ни «дёшево», ни «бесплатно», ни «лучше»: тарифы и наборы моделей меняются без нас,
// и обещание, данное здесь, устареет молча. Чем приложение пользуются каждый день —
// тоже не их дело: человеку нужен работающий ключ, а не наша биография.
const PROVIDERS: { name: string; note: string }[] = [
  { name: "Google Gemini", note: "One place to look for a vision model and a key." },
  { name: "OpenAI", note: "Vision models of the GPT family." },
  { name: "Mistral", note: "Pixtral." },
  { name: "OpenRouter", note: "One key, many models from several vendors." },
  {
    name: "A model you host yourself",
    note: "If it answers at your address in the same dialect, point ParkRead at it.",
  },
];

// Четыре шага, а не три: выбор модели был пропущен, хотя без её точного имени
// последний шаг выполнить нечем.
const STEPS = [
  "Open your provider's API keys page.",
  "Create a key there. Copy it once — most providers show it only that one time.",
  "Pick a vision model from the provider's list and note its exact name.",
  "In ParkRead's settings, paste the key, set the provider address and the model name.",
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
          ParkRead is not tied to one provider: you bring the key and pick the model.
        </p>
        {/* Требование к провайдеру названо прямо: «умеет смотреть на снимок» мало.
            Модель за другим интерфейсом не заработает, и человек не поймёт почему.
            Последняя фраза — мост к списку ниже: до неё абзац обрывался на технике. */}
        <p className="mt-3 text-body text-ink-2">
          One requirement: the provider must answer the OpenAI-compatible way
          (<code className="font-mono text-label">POST /chat/completions</code>).
          A model behind a different interface will not work here. Some that do are
          listed below.
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
          Providers word their screens differently, so look for these parts rather than
          the exact clicks. For example:{" "}
          <a
            href="https://aistudio.google.com/docs/api-key"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-link"
          >
            aistudio.google.com/docs/api-key
          </a>.
        </p>
        {/* Размер запроса назван с причиной: сам по себе он ничего человеку
            не говорит. Сказано, ЗАЧЕМ он ему — примерить к тарифу или к бесплатной
            квоте, не гадая. Про «платно» здесь не сказано ни слова: у провайдеров
            бывает и то, и другое. */}
        <p className="mt-2 text-label text-ink-3">
          Reading one sign takes two model calls, about 1700 tokens — enough to weigh
          against your provider's free allowance or its rates.
        </p>
      </div>

      <div className="rounded-card-sm bg-note p-5">
        {/* Не «платёжный инструмент»: ключ бывает и от бесплатной квоты. Опасность
            от этого не меньше — тратит её тот, у кого ключ на руках. */}
        <p className="text-label text-note-ink">
          The key is yours, and whoever holds it spends your allowance. ParkRead keeps
          it on this device unless you switch that off — on a phone that is not yours,
          use “Forget key” in Settings.
        </p>
      </div>
    </section>
  );
}

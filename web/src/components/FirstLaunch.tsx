// Экран 2f — первый запуск, ключа ещё нет.
//
// Это состояние «ключа нет» у главного экрана, а не отдельная станция пути.
// Камеры и галереи здесь нет вовсе (решение 147): кадр, снятый без ключа,
// кончился бы сообщением «нужен ключ», а путь в тупик хуже честной просьбы
// в самом начале. Поэтому экран сперва ОБЪЯСНЯЕТ, а просит последним.

import SignPlate from "./SignPlate";

type Props = { onAddKey: () => void; onHelp: () => void };

const FACTS: { label: string; text: string }[] = [
  {
    label: "The photo",
    text: "Only the part you frame is sent, to the provider you name",
  },
  {
    // Не «Stored on this device»: по умолчанию ключ живёт во вкладке и уходит
    // вместе с ней. На устройство он попадает только по просьбе (решение 146).
    label: "The key",
    text: "Stays on this device, and is saved only if you ask. This app has no "
        + "server of its own",
  },
];

export default function FirstLaunch({ onAddKey, onHelp }: Props) {
  return (
    <section className="flex min-h-[70vh] flex-col gap-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="text-nav font-bold text-ink-strong">ParkRead</span>
      </header>

      <div className="flex items-center gap-5 rounded-button bg-hero p-5">
        <SignPlate size="small" lines={["Servicefordon", "Vardagar 7–17", "Övrig tid avgift"]} />
        <p className="text-row text-on-dark">
          Signs like this one, plate by plate, in plain words.
        </p>
      </div>

      <div>
        <h1 className="text-screen font-extrabold text-ink-strong">Add a key to start.</h1>
        {/* Не «until a key is saved»: ключ работает и несохранённым, в памяти
            вкладки. Обещать обратное значит требовать лишнего. */}
        <p className="mt-2.5 text-row text-ink-2">
          ParkRead reads with a vision model you choose and pay for. Until you add a key,
          there is nothing to read signs with.
        </p>
      </div>

      <div className="rounded-card-sm bg-ground p-5 shadow-card">
        {FACTS.map((fact, i) => (
          <div key={fact.label}>
            {i > 0 && <span className="my-3.5 block h-px bg-line" />}
            <div className="flex items-baseline gap-3.5">
              <span className="w-[74px] shrink-0 text-caption text-ink-3">{fact.label}</span>
              <span className="flex-1 text-body text-ink">{fact.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Основное действие прижато к низу — туда, где большой палец. */}
      <div className="mt-auto flex flex-col gap-3.5">
        <button
          type="button"
          onClick={onAddKey}
          className="flex w-full items-center gap-4 rounded-button bg-accent px-6 py-5
                     text-left shadow-primary"
        >
          <span className="flex-1">
            <span className="block text-row font-bold text-on-dark">Add your key</span>
            <span className="block text-label text-on-dark opacity-80">Opens Settings</span>
          </span>
          <span className="text-card text-on-dark opacity-85">›</span>
        </button>
        {/* Экран помощи уже есть (этап 3), поэтому ссылка живая, а не нарисованная. */}
        <button type="button" onClick={onHelp}
                className="text-center text-body font-semibold text-link">
          How keys work, and where to get one
        </button>
      </div>
    </section>
  );
}

// Экран 3a — главный, когда ключ есть.
//
// Второе состояние того же экрана, что и `2f`, и выглядеть они обязаны одним
// приложением: тот же знак, тот же вход в настройки значком, те же три обещания.
// Разница только в ранге — здесь одно из них поднято в заголовок, потому что
// экран уже не просит ключ, а предлагает снять знак (`lib/home`).
//
// Одно основное действие внизу, редкий путь — тихой ссылкой под ним. Что именно
// стоит основным, решает `lib/home`: без камеры это выбор снимка, и причина
// названа вслух.

import { useRef } from "react";

import {
  HOME_HEADLINE, HOME_LINES, MOMENT_FROM, MOMENT_TO, entryActions, momentChip,
} from "../lib/home";
import { Close, Sliders } from "./Icon";
import SignPlate from "./SignPlate";

type Props = {
  moment: string;
  onMoment: (value: string) => void;
  cameraAvailable: boolean;
  offline: boolean;
  offlineNote: string;
  onScan: () => void;
  onPick: (file: File) => void;
  onSettings: () => void;
};

export default function Home({
  moment, onMoment, cameraAvailable, offline, offlineNote, onScan, onPick, onSettings,
}: Props) {
  const file = useRef<HTMLInputElement>(null);
  const entry = entryActions(cameraAvailable);
  const chip = momentChip(moment);

  const primary = () => (entry.primary === "scan" ? onScan() : file.current?.click());

  // Высота считается от видимой части окна: адресная строка мобильного браузера
  // то появляется, то исчезает, и `vh` про неё не знает.
  return (
    <section className="flex min-h-[calc(100dvh-3rem)] flex-col gap-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="flex-1 text-nav font-bold text-ink-strong">ParkRead</span>
        {/* Значком, а не словом: тот же вход в тот же экран, что и на первом
            запуске, и выглядеть он обязан так же. */}
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2"
        >
          <Sliders className="h-6 w-6" />
        </button>
      </header>

      <div className="flex items-center gap-5 rounded-card bg-hero p-6">
        <SignPlate lines={["Servicefordon", "Vardagar 7–17", "Övrig tid avgift"]} />
        <div>
          {/* Кегль подобран под карточку: на первом запуске заголовок один
              на экране, здесь он делит место со знаком. */}
          <h1 className="text-card font-extrabold text-on-dark">{HOME_HEADLINE}</h1>
          <div className="mt-1.5 flex flex-col text-caption text-on-dark-2">
            {HOME_LINES.map((line) => <span key={line}>{line}</span>)}
          </div>
        </div>
      </div>

      {/* Момент: пусто значит «сейчас», и время берётся в минуту отправки.
          Поле выбора лежит поверх чипа прозрачным слоем — так нажатие попадает
          в системный выбор даты, а подписью остаётся наше слово. */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-label text-ink-3">Reading for</span>
        <span className="relative inline-flex items-center rounded-full bg-ground px-3.5
                         py-2 text-label font-bold text-ink shadow-chip">
          {chip.label}
          <input
            type="datetime-local"
            value={moment}
            min={MOMENT_FROM}
            max={MOMENT_TO}
            aria-label="Moment to read the sign at"
            onChange={(e) => onMoment(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
        {chip.canReset && (
          <button type="button" onClick={() => onMoment("")}
                  aria-label="Read for now instead"
                  className="flex h-10 w-10 items-center justify-center rounded-full
                             bg-chip text-ink-2">
            <Close className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-3.5">
        {/* Сеть нужна ровно одному действию — чтению знака. Сказано до отправки,
            а не после: узнать об этом из ошибки — значит узнать поздно. Само
            действие при этом живое: камера и рамка работают и без сети. */}
        {offline && (
          <p className="rounded-card-sm bg-ground p-4 text-label text-ink-2 shadow-card">
            {offlineNote}
          </p>
        )}

        {entry.unavailable && (
          <p className="px-1 text-label text-ink-3">{entry.unavailable}</p>
        )}

        <button
          type="button"
          onClick={primary}
          className="flex w-full items-center gap-4 rounded-button bg-accent px-6 py-6
                     text-left shadow-primary"
        >
          <span className="flex-1">
            <span className="block text-row font-bold text-on-dark">{entry.primaryLabel}</span>
            <span className="block text-label text-on-dark opacity-80">{entry.primaryNote}</span>
          </span>
          <span className="text-card text-on-dark opacity-85">›</span>
        </button>

        {entry.secondary && (
          <button type="button" onClick={() => file.current?.click()}
                  className="text-center text-body font-semibold text-link">
            {entry.secondary}
          </button>
        )}

        {/* Скрытый вход в галерею. `capture` не ставим: он открыл бы камеру
            вместо галереи, и уже снятый кадр стал бы недоступен. */}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            // Сброс значения: иначе повторный выбор того же файла не даёт события.
            e.target.value = "";
            if (picked) onPick(picked);
          }}
        />
      </div>
    </section>
  );
}

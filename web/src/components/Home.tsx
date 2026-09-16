// Экран 3a — главный, когда ключ есть.
//
// Одно основное действие внизу, редкий путь — тихой ссылкой под ним. Что именно
// стоит основным, решает `lib/home`: без камеры это выбор снимка, и причина
// названа вслух.

import { useRef } from "react";

import { MOMENT_FROM, MOMENT_TO, PROMISE, entryActions, momentChip } from "../lib/home";
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

  return (
    <section className="flex min-h-[70vh] flex-col gap-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="flex-1 text-nav font-bold text-ink-strong">ParkRead</span>
        <button type="button" onClick={onSettings}
                className="rounded-full bg-chip px-4 py-2 text-label font-semibold text-ink-2">
          Settings
        </button>
      </header>

      <div className="flex items-center gap-5 rounded-card bg-hero p-6">
        <SignPlate lines={["Servicefordon", "Vardagar 7–17", "Övrig tid avgift"]} />
        <p className="text-card font-extrabold text-on-dark">{PROMISE}</p>
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
                  className="rounded-full bg-chip px-3 py-2 text-label font-semibold text-ink-2">
            ✕
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

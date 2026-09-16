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
import { Camera, Close, Sliders } from "./Icon";
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

  // Высоту держит оболочка (`App`), экран занимает её целиком. Вычитать отступы
  // оболочки руками значило бы хранить её число в чужом файле.
  return (
    <section className="flex flex-1 flex-col gap-6">
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

      {/* Тёмная полоса во всю ширину колонки: выходит за поля оболочки отрицательным
          полем — единственное место в приложении, где поля покидают. Скруглений нет:
          скруглённый угол у самого края экрана читается как недоделка, а не как
          решение. Тянется она по ширине, а высоту берёт от содержимого — ни
          соотношений сторон, ни заданных высот, подбирать нечего.

          На коротком экране полоса ужимается отступами и кеглем заголовка, а не
          пересчётом пропорций: знак остаётся прежним. Само правило — обычный
          `@media` в `index.css`, класс `tight-on-short`: утилита `[@media(...)]:`
          в собранный CSS не попадает вовсе, и забота о коротком экране была бы
          показной. */}
      <div className="tight-on-short -mx-4 flex flex-col gap-7 bg-hero px-6 py-8">
        <SignPlate
          size="large"
          align="start"
          lines={["Servicefordon", "Vardagar 7–17", "Övrig tid avgift"]}
        />
        <div>
          <h1 className="text-display font-extrabold text-on-dark">
            {HOME_HEADLINE}
          </h1>
          <div className="mt-3 flex flex-col text-label text-on-dark-2">
            {HOME_LINES.map((line) => <span key={line}>{line}</span>)}
          </div>
        </div>
      </div>

      {/* Момент: пусто значит «сейчас», и время берётся в минуту отправки.
          Поле выбора лежит поверх всей строки прозрачным слоем, поэтому нажатие
          в любом её месте открывает системный выбор даты, а подписью остаётся
          наше слово. */}
      <div className="relative flex items-center justify-between border-b border-line py-4">
        <span className="text-body text-ink-2">Reading for</span>
        <span className="flex items-center gap-2 text-row font-bold text-ink">
          {chip.label}
          {/* Сброс показывается, только когда момент выбран. Понадеяться на «Clear»
              в системном диалоге нельзя: на Android он обычно есть, в Safari на iOS
              часто нет, и выбранный момент стал бы дверью в одну сторону. Кнопка
              поднята над прозрачным полем, иначе нажатие уходило бы в календарь. */}
          {chip.canReset && (
            <button
              type="button"
              onClick={() => onMoment("")}
              aria-label="Read for now instead"
              className="relative z-10 flex h-8 w-8 items-center justify-center
                         rounded-full bg-chip text-ink-2"
            >
              <Close className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-ink-3">›</span>
        </span>
        <input
          type="datetime-local"
          value={moment}
          min={MOMENT_FROM}
          max={MOMENT_TO}
          aria-label="Moment to read the sign at"
          onChange={(e) => onMoment(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
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
          {/* Значок камеры — только когда предлагается съёмка. Без камеры основным
              действием становится выбор снимка, и камера на кнопке лгала бы. */}
          {entry.primary === "scan" && (
            <Camera className="h-6 w-6 shrink-0 text-on-dark" />
          )}
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

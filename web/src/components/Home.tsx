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
import { Camera, Sliders } from "./Icon";
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
          Поле выбора лежит прозрачным слоем поверх ЗНАЧЕНИЯ, а не всей строки:
          нажимают на «Now» или на выбранное время, а подпись слева ничего
          не обещает и ничего не открывает. */}
      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        {/* Подпись не переносится никогда: «Reading for» в две строки читается
            не как строка списка, а как обрывок. */}
        <span className="shrink-0 whitespace-nowrap text-body text-ink-2">Reading for</span>
        <span className="relative flex items-center gap-2 text-row font-bold text-ink">
          {/* Значение прижато вправо и при нужде переносится — но не где попало:
              время держится за «at» неразрывным пробелом (`momentChip`).

              Отдельной кнопки сброса здесь нет: очистить момент даёт сам системный
              диалог, а лишний кружок в строке стоил дороже, чем экономил. Решение
              разработчика; на Android «Clear» в диалоге есть. */}
          <span className="text-right">{chip.label}</span>
          <span className="text-ink-3">›</span>
          {/* По вертикали поле растянуто за строку текста: сама она около 24 px,
              а цель нажатия меньше 44 px не бывает. Раскладку это не двигает —
              слой лежит поверх. */}
          <input
            type="datetime-local"
            value={moment}
            min={MOMENT_FROM}
            max={MOMENT_TO}
            aria-label="Moment to read the sign at"
            onChange={(e) => onMoment(e.target.value)}
            className="absolute -inset-y-3 inset-x-0 cursor-pointer opacity-0"
          />
        </span>
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

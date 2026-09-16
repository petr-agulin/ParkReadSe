// Экран 2f — первый запуск, ключа ещё нет.
//
// Задача у него одна: объяснить, что это за приложение, и попросить ключ. Камеры
// и галереи здесь нет вовсе (решение 147): кадр, снятый без ключа, кончился бы
// сообщением «нужен ключ», а путь в тупик хуже честной просьбы в самом начале.
//
// **Экран обязан помещаться целиком** — до последней строки, без прокрутки.
// Отсюда `dvh`, а не `vh`: адресная строка мобильного браузера то появляется,
// то исчезает, и `vh` про неё не знает.
//
// Говорит он не теми словами, что главный экран с ключом: там предлагают снять
// знак, здесь объясняют, зачем ключ. Расхождение осознанное (см. `lib/home`).

import { ASSURANCES, BENEFITS, HEADLINE } from "../lib/home";
import { Frame, Key, Lock, Shield, Sliders } from "./Icon";
import SignPlate from "./SignPlate";

type Props = { onAddKey: () => void; onSettings: () => void };

const MARKS = [Lock, Shield, Frame];

export default function FirstLaunch({ onAddKey, onSettings }: Props) {
  return (
    <section className="flex min-h-[calc(100dvh-3rem)] flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="flex-1 text-nav font-bold text-ink-strong">ParkRead</span>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2"
        >
          <Sliders className="h-6 w-6" />
        </button>
      </header>

      {/* Знак — один посреди экрана: это предмет, о котором всё приложение. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <SignPlate size="hero" lines={["Servicefordon", "Vardagar 7–17", "Övrig tid avgift"]} />

        <div>
          <h1 className="text-display font-extrabold text-ink-strong">{HEADLINE}</h1>
          {/* Обещания — мельче и бледнее заголовка: это пояснение к нему,
              а не три отдельных заявления. */}
          <div className="mt-2 flex flex-col text-label text-ink-3">
            {BENEFITS.map((line) => <span key={line}>{line}</span>)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-center text-section font-medium uppercase tracking-[0.1em]
                      text-ink-3">
          1-step setup
        </p>

        <button
          type="button"
          onClick={onAddKey}
          className="flex w-full items-center gap-3 rounded-button bg-accent px-5 py-4
                     text-left shadow-primary"
        >
          <Key className="h-5 w-5 shrink-0 text-on-dark" />
          <span className="flex-1 text-row font-bold text-on-dark">
            Add your vision model key
          </span>
          <span className="text-card text-on-dark opacity-85">›</span>
        </button>

        {/* Не пилюли, а тихий список: у пилюль своя заливка и своя форма, и рядом
            с синей кнопкой они спорят с ней за внимание, хотя это всего лишь
            сноска к ней. Подробности ждут в настройках, рядом с переключателем. */}
        <div className="flex flex-col items-center gap-1.5">
          {ASSURANCES.map((text, i) => {
            const Mark = MARKS[i];
            return (
              <span key={text} className="flex items-center gap-2 text-caption text-ink-3">
                <Mark className="h-3.5 w-3.5 shrink-0" />
                {text}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// Значки интерфейса. Рисуются здесь, а не берутся набором.
//
// Открытый вопрос `design.md` — «взять один набор (Lucide), а не рисовать» —
// решён на первом же экране, которому значки понадобились: рисуем. Причина та же,
// по которой шрифт остался системным (решение 143): набор значков — это чужой
// пакет ради полудюжины путей, а страница обещает не тянуть лишнего.
//
// Цвет берётся у текста (`currentColor`), поэтому значок красится токеном
// на месте: `text-ink-2`, `text-on-dark` и так далее.

type Props = { className?: string };

const BASE = "h-full w-full";

function Svg({ className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? BASE}
    >
      {children}
    </svg>
  );
}

/** Настройки: три ползунка, лёжа. Та же фигура, что стояла вертикально,
 *  повёрнутая на четверть оборота, — поэтому остаётся в одном ряду с остальными. */
export function Sliders(p: Props) {
  return (
    <Svg {...p}>
      <path d="M20 6H14M10 6H4M20 12H12M8 12H4M20 18H16M12 18H4" />
      <path d="M14 3v6M8 9v6M16 15v6" />
    </Svg>
  );
}

/** Камера: основное действие — снять знак. */
export function Camera(p: Props) {
  return (
    <Svg {...p}>
      <path d="M3 9.4a1.9 1.9 0 0 1 1.9-1.9h2.4l1.4-2.3h6.6l1.4 2.3h2.4A1.9 1.9 0 0 1 21 9.4
               v8.3a1.9 1.9 0 0 1-1.9 1.9H4.9A1.9 1.9 0 0 1 3 17.7z" />
      <circle cx="12" cy="13.4" r="3.3" />
    </Svg>
  );
}

/** Ключ. */
export function Key(p: Props) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="12" r="3.2" />
      <path d="M11.2 12H21M18 12v3M15 12v2.2" />
    </Svg>
  );
}

/** Замок: ключ остаётся на устройстве. */
export function Lock(p: Props) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </Svg>
  );
}

/** Щит: своего сервера у приложения нет. */
export function Shield(p: Props) {
  return (
    <Svg {...p}>
      <path d="M12 3.2 19 6v6c0 4.2-2.9 7.4-7 8.8-4.1-1.4-7-4.6-7-8.8V6z" />
    </Svg>
  );
}

// Крестик отсюда убран вместе с кнопкой сброса момента (пункт 27): очищать
// дату даёт системный диалог. Лежать без дела он не должен — историю помнит git.

/** Рамка: наружу уходит только вырезанное. */
export function Frame(p: Props) {
  return (
    <Svg {...p}>
      <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5
               M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
    </Svg>
  );
}

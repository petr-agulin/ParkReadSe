// Нарисованный знак: синий щиток с белой «P» и белые таблички под ним.
//
// Рисуется кодом, а не картинкой: это предмет, о котором продукт говорит,
// и он должен быть чётким на любом экране и работать без единого снимка.
// Настоящих фотографий знаков в интерфейсе нет вовсе — на них номера машин.

type Props = {
  /** Что написано на табличках под основным знаком. */
  lines: string[];
  /** Герой первого запуска чуть меньше, чем на главном: там рядом больше текста. */
  size?: "large" | "small";
};

export default function SignPlate({ lines, size = "large" }: Props) {
  const plate = size === "large" ? "h-21 w-22 text-5xl" : "h-20 w-21 text-[46px]";
  return (
    <div className="flex shrink-0 flex-col items-center gap-[3px]" aria-hidden>
      <span
        className={`flex items-center justify-center rounded-plate bg-plate font-extrabold
                    leading-none text-on-dark shadow-[inset_0_0_0_3px_var(--color-on-dark)]
                    ${plate}`}
      >
        P
      </span>
      {lines.map((line) => (
        <span
          key={line}
          className={`block rounded-[2px] bg-on-dark py-[3px] text-center text-[10px]
                      font-bold text-tint-ink ${size === "large" ? "w-22" : "w-21"}`}
        >
          {line}
        </span>
      ))}
    </div>
  );
}

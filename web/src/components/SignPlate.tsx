// Нарисованный знак: синий щиток с белой «P» и белые таблички под ним.
//
// Рисуется кодом, а не картинкой: это предмет, о котором продукт говорит,
// и он должен быть чётким на любом экране и работать без единого снимка.
// Настоящих фотографий знаков в интерфейсе нет вовсе — на них номера машин.
//
// **Кайма у щитка двойная**, как у настоящего `E19`: снаружи синий кант, под ним
// белая полоса, дальше синее поле с буквой. Сделано двумя внутренними тенями
// на одном элементе, а не вложенными коробками: знак остаётся одним предметом,
// а не сборкой из рамок. Первой в списке лежит тень, которая рисуется поверх,
// поэтому синий кант идёт раньше белого.

type Props = {
  /** Таблички под основным знаком: по массиву строк на каждую. На настоящем
   *  знаке время стоит под словом, а не рядом, поэтому табличка многострочная. */
  plates: string[][];
  /** `hero` — знак стоит один посреди экрана, и мельче его делать незачем. */
  size?: "hero" | "large" | "small";
  /** По умолчанию знак стоит по центру; в тёмной полосе главного — по левому краю. */
  align?: "center" | "start";
};

const PLATE: Record<string, string> = {
  hero: "h-33 w-33 rounded-[10px] text-8xl "
      + "shadow-[inset_0_0_0_3px_var(--color-plate),inset_0_0_0_8px_var(--color-on-dark)]",
  large: "h-21 w-22 rounded-[6px] text-5xl "
       + "shadow-[inset_0_0_0_2px_var(--color-plate),inset_0_0_0_5px_var(--color-on-dark)]",
  small: "h-20 w-21 rounded-[6px] text-[46px] "
       + "shadow-[inset_0_0_0_2px_var(--color-plate),inset_0_0_0_5px_var(--color-on-dark)]",
};

// Табличка под знаком: тонкий кант, чтобы белое на светлом фоне не растворялось.
const LINE: Record<string, string> = {
  hero: "w-33 py-1 text-caption",
  large: "w-22 py-[3px] text-[10px]",
  small: "w-21 py-[3px] text-[10px]",
};

export default function SignPlate({ plates, size = "large", align = "center" }: Props) {
  return (
    <div
      className={`flex shrink-0 flex-col gap-[3px] ${
        align === "start" ? "items-start" : "items-center"}`}
      aria-hidden
    >
      <span
        className={`flex items-center justify-center bg-plate font-extrabold leading-none
                    text-on-dark ${PLATE[size]}`}
      >
        P
      </span>
      {plates.map((plate, i) => (
        <span
          key={i}
          className={`flex flex-col rounded-[3px] bg-on-dark text-center font-bold
                      leading-tight text-tint-ink
                      shadow-[inset_0_0_0_1px_var(--color-field)] ${LINE[size]}`}
        >
          {plate.map((line) => <span key={line}>{line}</span>)}
        </span>
      ))}
    </div>
  );
}

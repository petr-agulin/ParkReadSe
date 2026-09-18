// The drawn sign: a blue shield with a white "P" and white plates beneath it.
//
// It is drawn in code rather than as a picture: this is the thing the product talks
// about, and it has to be crisp on any screen and work without a single photograph.
// There are no real photographs of signs anywhere in the interface - they carry
// number plates.
//
// **The shield's border is double**, as on a real `E19`: a blue edge outside, a white
// band under it, then the blue field with the letter. It is made with two inset
// shadows on one element rather than with nested boxes: the sign stays one object
// rather than an assembly of frames. The first in the list is the shadow drawn on
// top, which is why the blue edge comes before the white.

type Props = {
  /** The plates beneath the main sign: an array of lines for each. On a real sign
   *  the hours stand under the word rather than beside it, so a plate takes several
   *  lines. */
  plates: string[][];
  /** `hero` - the sign stands alone in the middle of the screen, and there is no
   *  reason to make it smaller. */
  size?: "hero" | "large" | "small";
  /** By default the sign is centred; in the dark band of the home screen it sits to
   *  the left. */
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

// A plate beneath the sign: a thin edge, so that white on a pale ground does not
// dissolve into it.
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

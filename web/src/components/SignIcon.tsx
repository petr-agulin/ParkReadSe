// Значки узлов шкалы: начало и конец стоянки.
//
// Рисуются как сам знак `E19` — синий щиток с белой каймой и белой «P», — потому что
// именно его человек держит перед глазами. Конец стоянки — тот же щиток, перечёркнутый
// красным, как запрещающий знак `C35`.
//
// SVG, а не эмодзи и не картинка: чёткость на любом экране, цвет из палитры, размер
// задаётся снаружи.

export default function SignIcon({
  kind, size = "large",
}: { kind: "start" | "end"; size?: "large" | "small" }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={size === "small" ? "h-5 w-5 shrink-0" : "h-9 w-9 shrink-0"}
      role="img"
      aria-label={kind === "start" ? "parking sign" : "end of parking"}
    >
      <rect x="1" y="1" width="38" height="38" rx="7" className="fill-plate" />
      <rect
        x="4" y="4" width="32" height="32" rx="4"
        fill="none" className="stroke-on-dark" strokeWidth="2.5"
      />
      <text
        x="20" y="21"
        textAnchor="middle" dominantBaseline="central"
        className="fill-on-dark" fontSize="20" fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        P
      </text>
      {kind === "end" && (
        <line
          x1="7" y1="33" x2="33" y2="7"
          className="stroke-slash" strokeWidth="4.5" strokeLinecap="round"
        />
      )}
    </svg>
  );
}

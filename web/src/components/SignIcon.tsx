// The icons at the nodes of the timeline: the start of a stay and its close.
//
// They are drawn as the `E19` sign itself - a blue shield with a white border and a
// white "P" - because that is what the person has in front of their eyes. The close
// of a stay is the same shield struck through in red, like a prohibiting `C35`.
//
// An inline drawing rather than an emoji or a picture: crisp on any screen, its
// colours from the palette, its size set from outside.

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

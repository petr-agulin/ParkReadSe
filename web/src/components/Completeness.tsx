// How complete the reading is: how much of the sign could be read, and what that
// stands in the way of.
//
// It lives INSIDE the "what the service saw" block, right under its heading and with
// no frame of its own. This is not a separate finding but a caveat to what is shown
// below, and a frame made it louder than the reading itself.
//
// The engine's uncertainties live here too: the same conversation about what in the
// answer cannot be believed whole.
//
// Not one phrase about the meaning of a sign is composed here — the texts arrive from
// the backend.

import type { Analysis } from "../types";

// The colour is decided by the backend (`tone`), and the markup only paints it: green
// — everything was read and no signal lowered the confidence; yellow — there is an
// answer, but with a caveat; red — there is no answer. The 700 shades were taken for
// legibility on white: 500 on a light ground is already hard to make out, and this
// line is read in passing.
const TONE: Record<string, string> = {
  good: "text-free",
  // A caveat and an alarm are obliged to differ at a small size: the former shades
  // from the bundler's palette ran together into one red at this size. Now both
  // colours are tokens of meaning, and it is the tone that tells them apart rather
  // than the saturation.
  caution: "text-fee",
  bad: "text-deny",
};

export default function Completeness({ data }: { data: Analysis }) {
  const c = data.completeness;
  const uncertainties = data.uncertainties ?? [];
  const tone = TONE[c.tone] ?? TONE.caution;

  return (
    <div className="mb-3">
      <p className={`text-xs font-medium ${tone}`}>
        {c.category_text} <span className="px-0.5 opacity-40">|</span> confidence{" "}
        {(c.confidence * 100).toFixed(0)}%
      </p>

      {/* The caveat about an unread panel lives NOT here but on the reading screen,
          above the window card: it qualifies the scale, and below the scale it would
          be of no use. What stays here is the completeness — the reasons and the
          uncertainties. */}

      {c.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
          {/* A reason without a caption is not shown: a service word has no place on
              the page. That a caption went missing is caught by a check on the API
              side. */}
          {c.reasons.filter((r) => r.text).map((r) => (
            <li key={r.token}>{r.text}</li>
          ))}
        </ul>
      )}

      {uncertainties.length > 0 && (
        <>
          <p className="mt-1 text-xs font-medium text-ink-2">Left undetermined</p>
          <ul className="space-y-0.5 text-xs text-ink-2">
            {uncertainties.map((u) => (
              <li key={u.token}>{u.text}</li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}

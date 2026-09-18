// Screen 3c — the reading of a sign.
//
// **The answer comes before the evidence** (decision 149): the parking window, then
// who the spaces are set aside for, and only after that what exactly was read off the
// plates. A person stands at a sign and wants the answer; the reconstruction is there
// so they can check that answer, not instead of it.
//
// The two answer blocks swapped places at the developer's word; the substance of
// decision 149 is intact — the evidence is still last.
//
// The cards themselves are drawn by the same components as before. What lives here is
// the order, and the caveat that is obliged to stand ABOVE the window.

import { firstWindow, readFor } from "../lib/reading";
import type { Analysis, GeneralRule } from "../types";
import ErrorBoundary from "./ErrorBoundary";
import PeriodTimeline from "./PeriodTimeline";
import WhatWeSaw from "./WhatWeSaw";
import WhoCanPark from "./WhoCanPark";

type Props = {
  data: Analysis;
  preview: string | null;
  rules: GeneralRule[];
  onAnother: () => void;
  /** The arrow in the header. It leads where the button at the bottom leads — to the
   *  camera: from a reading one goes to photograph the next sign. */
  onBack: () => void;
};

export default function Reading({ data, preview, rules, onAnother, onBack }: Props) {
  const c = data.completeness;
  // The first card drawn is not necessarily the first regime: a regime with no periods
  // and no explanation gives no card at all. The moment line is hung on the one that
  // is visible, and which that is `lib/reading` decides, not this markup.
  const firstCard = firstWindow(data.regimes);

  return (
    <ErrorBoundary>
      <section className="flex flex-col gap-3.5">
        {/* Navigation as on the camera. The arrow sends the same action as the button
            at the bottom: from a reading one goes to photograph the next sign, not to
            the home screen. */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-chip
                       text-lg font-semibold text-ink-2"
          >
            ‹
          </button>
          <span className="flex-1 text-nav font-bold text-ink-strong">Sign reading</span>
        </div>

        {/* The caveat stands ABOVE the window because it qualifies exactly that:
            carried off into the "what was read" card it would end up below the thing
            it speaks about. The rest of the completeness lives down there. */}
        {c.may_hide_prohibition && (
          <p className="rounded-card-sm bg-danger-bg p-4 text-body font-semibold text-deny">
            An unread panel may carry a prohibition, so no period below is presented
            as permitted.
          </p>
        )}

        {/* The wording arrives from the answer rather than living in the markup: the
            place for words about a sign is beside the rest, in `present`. */}
        {data.has_answer && data.note && (
          <p className="rounded-card-sm bg-ground p-4 text-label text-ink-2 shadow-card">
            {data.note.text}
          </p>
        )}

        {/* One window card for each regime: arrows divide the sign into stretches and
            the addressees into circles, and each has a window of its own. */}
        <div id="window" className="flex flex-col gap-3.5">
          {data.regimes.map((r, i) => (
            <PeriodTimeline
              key={i}
              regime={r}
              momentLine={i === firstCard ? readFor(data.moment) : undefined}
              showExtent={new Set(data.regimes.map((x) => x.extent)).size > 1
                          || r.extent !== "here"}
            />
          ))}
        </div>

        {/* The addressees go under the window: the developer's word. The substance of
            decision 149 is intact — the plates are still last, and the evidence comes
            after the answer. */}
        <div id="who">
          <WhoCanPark regimes={data.regimes} />
        </div>

        <div id="plates">
          <WhatWeSaw data={data} preview={preview} rules={rules} />
        </div>

        <button
          type="button"
          onClick={onAnother}
          className="rounded-button-sm bg-accent py-4 text-body font-bold text-on-dark"
        >
          Scan another sign
        </button>
      </section>
    </ErrorBoundary>
  );
}

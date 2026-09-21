// Who the spaces are set aside for.
//
// **This is a caption, not a check.** The product names the circle and stops there:
// whether the person at the sign belongs to it, they alone know.
// So there is never a "you may" or a "you may not" here — only what the sign itself
// says.
//
// The circle arrives from the backend as a finished string out of the reference. If
// the sign narrows nobody, its own meaning stands there: `P` is set aside for every
// registered vehicle.

import { distinctCircles } from "../lib/circles";
import type { Regime } from "../types";

export default function WhoCanPark({ regimes }: { regimes: Regime[] }) {
  // There are several windows, and often one circle between them: no reason to repeat
  // it (`lib/circles`). Different circles stay apart.
  const shown = distinctCircles(
    regimes.map((r) => r.who_can_park ?? []).filter((c) => c.length > 0),
  );
  if (shown.length === 0) return null;

  return (
    <section className="rounded-card bg-ground p-6 shadow-raised">
      <h2 className="mb-4 text-card font-extrabold text-ink-strong">Who can park here</h2>

      {shown.map((circle, i) => (
        <div key={i} className={i > 0 ? "mt-3" : undefined}>
          {/* The side of the road is not spoken of here at all: this block answers
              "who", not "where". The place is named by the panel with the arrow. */}
          {/* One condition is simply a line. Several make a list: otherwise they
              stick together into a paragraph, and it is unclear where one ends and
              the next begins. */}
          <ul
            className={
              circle.length > 1
                ? "list-outside list-disc space-y-0.5 pl-5"
                : "space-y-0.5"
            }
          >
            {circle.map((t) => (
              <li key={t.key} className="text-sm text-ink">
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

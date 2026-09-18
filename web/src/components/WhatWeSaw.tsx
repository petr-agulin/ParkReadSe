// Block 1: what the service saw.
//
// A person at a sign reads the sign, not a diagram. For each panel — what is written
// on it and what that means, with the official name and the code
// (`Length of road section (T1)`). The codes come from the reference, where they are
// entered by the E, C and T series; an empty code means no code exists — an operator's
// board is not a road sign.

import { useState } from "react";
import { plateRow } from "../lib/reading";
import type { Analysis, GeneralRule, Panel } from "../types";
import Completeness from "./Completeness";

/**
 * A plate as a card: its own text on top, what that text means beneath it, and in the
 * corner whether this is the main sign or a plate under it.
 *
 * It reads the way the plate itself does. The former shape — caption on the left,
 * meaning on the right — held while the meaning was single and came apart beyond
 * that; the developer looked at both on a phone and chose this one.
 *
 * What to show is decided by `lib/reading`: an empty `quote` means the plate has no
 * text of its own, and then there is no top line at all.
 */
function Plate({ panel }: { panel: Panel }) {
  const row = plateRow(panel);
  return (
    <div className="flex items-start justify-between gap-3 rounded-tile border border-line
                    bg-inset px-4 py-3">
      {/* `min-w-0` so that a long line wraps instead of pushing the label past the
          edge of the card. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {row.quote && <span className="text-body text-ink">{row.quote}</span>}
        {row.lines.map((line, i) => (
          <span key={i} className="text-body text-ink-3">{line}</span>
        ))}
        {/* The mark "this is not a rule" must not be served as the plate's meaning:
            an operator's board is not a road sign. */}
        {!panel.carries_rule && (
          <span className="text-label text-ink-3">Not a parking rule</span>
        )}
      </div>
      <span className="shrink-0 text-label text-link">{row.tag}</span>
    </div>
  );
}

export default function WhatWeSaw({
  data, preview, rules,
}: { data: Analysis; preview: string | null; rules: GeneralRule[] }) {
  const [openRules, setOpenRules] = useState(false);
  // A horizontal photograph in a narrow column turns into a postage stamp. We ask the
  // picture itself about its orientation and lay a wide one above the reading, across
  // the full width.
  const [wide, setWide] = useState(false);
  const saw = data.what_we_saw;
  const panels = saw.panels ?? [];
  const primary = saw.primary_sign;

  const photo = preview && (
    <img
      src={preview}
      alt="the sign you photographed"
      onLoad={(e) => {
        const img = e.currentTarget;
        setWide(img.naturalWidth > img.naturalHeight * 1.1);
      }}
      className={
        wide
          ? "mb-3 max-h-72 w-full rounded-lg object-contain"
          : "max-h-72 w-full rounded-lg object-contain sm:w-44 sm:shrink-0"
      }
    />
  );

  return (
    <section className="rounded-card bg-ground p-6 shadow-raised">
      {/* How sure we are is not in the header: it used to be said twice — as a chip
          here and as a line directly beneath it, in `Completeness`. The line stayed,
          where the completeness, the reasons and the tone stand beside it. */}
      {/* The same size as "Who can park here" and "Your parking window": the three
          reading cards are equals, and the heading of one of them cannot be a step
          smaller than the rest. */}
      <h2 className="mb-3 text-card font-extrabold text-ink-strong">What we read</h2>
      <Completeness data={data} />

      {wide && photo}

      <div className="flex flex-col gap-4 sm:flex-row">
        {!wide && photo}

        <div className="min-w-0 flex-1 space-y-3">
          {primary && (
            <Plate panel={{
              index: 0, kind: "main_sign", lines: [], background_color: null,
              carries_rule: true, reference_keys: [], uninterpreted: [],
              not_interpreted_text: null, fields: [], title: "", text: "",
              meanings: [primary],
            }} />
          )}

          {panels.map((p) => <Plate key={p.index} panel={p} />)}

          {rules.length > 0 && (
            <div className="rounded-md border border-dashed border-line bg-inset p-2.5">
              {/* The button is the heading alone. The unfolded text lies OUTSIDE it:
                  inside the button, a click on the rule itself would fold the list
                  back up. */}
              <button
                type="button"
                onClick={() => setOpenRules(!openRules)}
                className="flex w-full items-baseline gap-3 text-left"
              >
                <span className="min-w-0 flex-1 text-xs text-ink-3">
                  General parking rules
                </span>
                <span className="shrink-0 text-xs text-ink-3 underline-offset-2 hover:underline">
                  {openRules ? "hide" : "show"}
                </span>
              </button>

              {openRules && (
                <>
                  <p className="mt-2 text-xs text-ink-3">
                    These are general parking rules applied by law in Sweden.
                  </p>
                  <ul className="mt-1.5 list-outside list-disc space-y-1 pl-4 text-sm text-ink-2">
                    {rules.map((r) => (
                      <li key={r.key}>{r.text}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

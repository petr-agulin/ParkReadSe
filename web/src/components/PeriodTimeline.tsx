// The "Parking window" block: a vertical timeline from the start of the stay to its
// close.
//
// Two nodes - a start and a close - and a coloured line between them. It answers the
// question "how long can I stand here" at a glance, where a list of periods made the
// reader assemble the answer from lines of text.
//
// The colour of the line is decided by the backend through `tone`: whether a fee
// applies is a property of the rule, not of the styling. Amber means paid, green
// means no fee stated, red and dashed means you may not stand here.
//
// **The geometry here carries meaning.** The icon and the line stand in one column
// exactly as wide as the icon, and a segment has no vertical padding - so the line
// meets both icons flush, and equally above and below. Add padding on one side and
// the timeline stops reading as continuous.

import { isStayLimit, lasting, splitWindow } from "../lib/period";
import type { DayNote, Period, Regime, Term } from "../types";
import { when } from "../lib/when";
import SignIcon from "./SignIcon";
import { showsWindow } from "../lib/reading";

const COLUMN = "w-9 shrink-0";      // the icon's width: the line runs exactly beneath it

// The line and the caption of a segment are one and the same statement, so they share
// a colour. The darker shade is taken from the caption: the lighter one on white is
// paler than the text beside it, and the line read as decoration rather than as part
// of the answer.
const LINE: Record<string, string> = {
  paid: "bg-fee",
  free: "bg-free",
  uncertain: "bg-fee",
  not_stated: "",                   // the sign is silent - no line, only a dash
  prohibited: "",                   // a prohibition is dashed, not a solid fill
};

// A dash means two different things, and the colour tells them apart: red means you
// may not stand here; a colour matching the tone means you may, but the product does
// not vouch for the rule (the reading is incomplete, or the sign defers to conditions
// outside itself, as `Privat parkering` does).
const DASH: Record<string, string> = {
  prohibited: "border-deny",
  paid: "border-fee",
  free: "border-free",
  uncertain: "border-fee",
  not_stated: "border-ink-3",
};

const HEADLINE: Record<string, string> = {
  paid: "text-fee",
  free: "text-free",
  uncertain: "text-fee",
  not_stated: "text-ink-2",
  prohibited: "text-deny",
};

// The caption for the class of the day - grey and semibold, the same for red days and
// for eves. Telling them apart by colour was tried, and the developer rejected it:
// red on this timeline already means "you may not stand here", and a caption under a
// date is an explanation rather than a rule. Its weight sets it apart, not its colour.
const DAY_NOTE = "text-xs font-semibold leading-tight text-ink-2";

// A piece of the line inside the icon's column. A node can be taller than the icon -
// under the date there may also be the class of the day - and without these pieces
// the neighbouring segment's line would not reach the icon, and the timeline would
// stop reading as continuous.
function Rail({ p }: { p?: Period }) {
  if (!p) return <span className="flex-1" />;
  const dashed = p.tone === "prohibited" || p.tone === "not_stated"
    || p.certain === false || p.restricted;
  return dashed ? (
    <span className={`w-0 flex-1 border-l-[3px] border-dashed ${DASH[p.tone] ?? "border-deny"}`} />
  ) : (
    <span className={`w-[3px] flex-1 ${LINE[p.tone] ?? "bg-ink-3"}`} />
  );
}


function Node({
  kind, title, at, note, above, below,
}: {
  kind: "start" | "end"; title: string; at: string;
  note?: DayNote | null; above?: Period; below?: Period;
}) {
  return (
    // The icon is centred and the remaining height is taken by pieces of the line: a
    // node with a third line of text is taller than the icon, and without them a gap
    // opened between the line and the icon.
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex flex-col items-center`}>
        <Rail p={above} />
        <SignIcon kind={kind} />
        <Rail p={below} />
      </div>
      <div className="min-w-0 self-center">
        <p className="font-medium leading-tight text-ink">{title}</p>
        <p className="text-xs leading-tight text-ink-3">{at}</p>
        {/* The class of the day - why these particular hours apply on the sign. The
            text comes from the backend: which day is red is not something the markup
            knows, or should. */}
        {note && <p className={DAY_NOTE}>{note.text}</p>}
      </div>
    </div>
  );
}


function Connector({ at, note, above, below }: {
  at: string; note?: DayNote | null; above?: Period; below?: Period;
}) {
  // The join between two segments is the moment the rule changes. The icon marks it
  // on the line, and the time beside it says what that join actually is: without it
  // the icon would be decoration, and there is no decoration on this timeline.
  return (
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex flex-col items-center`}>
        <Rail p={above} />
        <SignIcon kind="start" size="small" />
        <Rail p={below} />
      </div>
      <div className="min-w-0 self-center">
        <p className="text-xs leading-tight text-ink-3">{when(at)}</p>
        {note && <p className={DAY_NOTE}>{note.text}</p>}
      </div>
    </div>
  );
}


function Segment({ p, extra }: { p: Period; extra: Term[] }) {
  // A dash means "the sign does not answer for this time": a prohibition says so
  // through its own window, silence by having nothing to say.
  const dashed = p.tone === "prohibited" || p.tone === "not_stated"
    || p.certain === false || p.restricted;
  return (
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex justify-center`}>
        {dashed ? (
          <span className={`w-0 border-l-[3px] border-dashed ${DASH[p.tone] ?? "border-deny"}`} />
        ) : (
          <span className={`w-[3px] ${LINE[p.tone] ?? "bg-ink-3"}`} />
        )}
      </div>
      {/* The padding is given to the TEXT, not to the line. The line runs the full
          height of the row, so air appears around the middle while the connection
          between the icons survives: both ends still meet them flush. */}
      <div className="min-w-0 space-y-1 py-8">
        <p className={`text-sm font-medium leading-tight ${HEADLINE[p.tone] ?? "text-ink-2"}`}>
          {p.headline}
          {/* A period running into the edge of the horizon has no known length: the
              sign changes nothing at that moment, the engine simply looks no further.
              Found while running the set - sign `007` prohibits parking with no end,
              and the segment reported "169 h 30 min", passing the edge of the
              computation off as a property of the sign. The date had long been hidden
              here (`ends_at_horizon` exists for that), and the length was the same
              leak through a second exit. */}
          {!p.ends_at_horizon && (
            <>
              <span className="px-1.5" aria-hidden>&#9679;</span>
              <span className="font-normal">
                {lasting(p.minutes)}
                {/* The word below belongs to the stay: that is how long one may
                    stand. Where the sign grants no parking, the length is exact
                    (`lib/period`). */}
                {isStayLimit(p.tone) && " max"}
              </span>
            </>
          )}
        </p>
        {[...(p.notes ?? []), ...extra].map((n) => (
          <p key={n.key} className="text-sm leading-tight text-ink-3">{n.text}</p>
        ))}
      </div>
    </div>
  );
}

export default function PeriodTimeline(
  { regime, showExtent = false, momentLine }:
    { regime: Regime; showExtent?: boolean; momentLine?: string },
) {
  const periods = regime.periods ?? [];
  // There may be no timeline while there is still something to say: a sign that is
  // silent about the chosen moment grants no window, and a sentence stands in place
  // of the timeline. So it is empty here only when both are empty.
  if (!showsWindow(regime)) return null;

  // A prohibition before the window is not yet the window, and `lib/period` divides
  // the two.
  const { leadIn, window } = splitWindow(periods);
  const last = window.length ? window[window.length - 1] : undefined;

  // The line under a segment: who this window suits - or which exception to a
  // prohibition the sign names. It is placed ONCE, under a segment of the kind it
  // belongs to.
  //
  // Placement decides the meaning, not the order: "Visitors only" under "No parking"
  // reads as exactly the opposite of what the sign says, and an exception to a
  // prohibition under a permitting segment hangs with no subject.


  return (
    <section className="rounded-card bg-ground p-6 shadow-raised">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <h2 className="text-card font-extrabold text-ink-strong">Your parking window</h2>
        {/* The stretch goes in a chip beside the heading rather than on a line below:
            a sign with two arrows has two windows, and without the caption they look
            like a repetition though they set different rules. The chip is shown where
            it distinguishes: when there is more than one window, or when an arrow has
            carried the stretch away from the sign itself. */}
        {showExtent && (
          <span className="rounded-full bg-tint px-3 py-1.5 text-caption font-bold text-tint-ink">
            {regime.extent_short}
          </span>
        )}
        {/* Who the window is for. It stands after the stretch: first where, then for
            whom - that is the order in which they are read. The caption comes from
            the backend. */}
        {regime.audience_short && (
          <span className="rounded-full bg-chip px-3 py-1.5 text-caption font-bold text-ink-2">
            {regime.audience_short}
          </span>
        )}
      </div>

      {/* The moment the answer was computed for goes under the window's heading,
          because it qualifies the window itself. It is placed only under the FIRST
          card drawn: there can be several windows, but the reading has one moment,
          and repeated under every heading it would read as several different
          moments. */}
      {momentLine && <p className="mb-3 text-label text-ink-3">{momentLine}</p>}

      {/* There may be no timeline at all. On a sign for rented spaces "Free parking,
          28 h max" is a number that comes from the 24-hour rule rather than from the
          sign: whoever the space belongs to knows the term from their tenancy, and
          nobody else may stand there at all. Drawing them a window means offering
          something that does not exist. */}
      {regime.no_window_text ? (
        <p className="mt-2 text-sm text-ink-2">{regime.no_window_text}</p>
      ) : (
      <>
      {/* The sentence below answers three misunderstandings found while running the
          set: that this window is the only one, when the sign does not stop after it;
          that the moment is the upload, when it may equally be a time chosen ahead,
          and both readings must stay true; and that the close of the window is the
          close of any chance to stand.
          The sentence is about the window, so it stands only where a window exists.
          A sign that currently prohibits and promises nothing beyond forms no window,
          and saying more is coming under a single red line would be speaking for the
          sign. */}
      {/* Two turns of phrase in that sentence are pinned by a guard in
          `screen.test.ts`: the window must not pass itself off as the driver's plan.
          The guard searches the file as plain text, so each of them has to sit whole
          on one line of the source and in lower case.

          They are deliberately NOT repeated here word for word. Quote them in a
          comment and the guard would turn green against any markup at all - it would
          find them in these very lines. That has happened three times in this
          project.

          The comment stands HERE rather than under the `&& (`: there it would be a
          second expression inside the parentheses rather than a comment, and the file
          would stop parsing. */}
      {window.length > 0 && (
        <p className="mb-4 text-sm text-ink-3">
          This is the first window allowed from your start time —
          the sign carries on beyond it, with more windows to follow.
          The judgement is yours.
        </p>
      )}

      {leadIn.length > 0 && (
        <>
          <Node
            kind="end"
            title="Your selected start time"
            at={when(leadIn[0].start)}
            note={leadIn[0].start_day}
            below={leadIn[0]}
          />
          {leadIn.map((p, n) => (
            <Segment key={`lead-${n}`} p={p} extra={p.aside ?? []} />
          ))}
        </>
      )}

      {window.length > 0 && (
        <>
          <Node
            kind="start"
            title="Window starts"
            at={when(window[0].start)}
            note={window[0].start_day}
            above={leadIn.length ? leadIn[leadIn.length - 1] : undefined}
            below={window[0]}
          />
          {window.map((p, n) => (
            <div key={n}>
              {/* A join is drawn before every segment but the first: the first begins
                  at the "Window starts" node, and a second icon there would be one
                  too many. */}
              {n > 0 && (
                <Connector at={p.start} note={p.start_day}
                           above={window[n - 1]} below={p} />
              )}
              {/* What goes under a segment is decided by the backend: who may park
                  goes under segments of its own kind, notes about the stretch
                  (`Boende`) under all of them, and whatever this segment's own
                  conditions already say is not repeated. */}
              <Segment p={p} extra={p.aside ?? []} />
            </div>
          ))}
          {last && (
            <Node kind="end" title="Window ends" at={when(last.end)}
                  note={last.end_day} above={last} />
          )}
        </>
      )}

      {/* The change of the clocks. It stands under the timeline because it qualifies
          the whole of it: this is a caveat about the times shown, not a property of
          one segment. It appears only when a segment shown crosses the change. */}
      {regime.clock_change_text && (
        <p className="mt-4 rounded-lg bg-inset px-3 py-2 text-sm text-ink-2">
          {regime.clock_change_text}
        </p>
      )}
      </>
      )}
    </section>
  );
}

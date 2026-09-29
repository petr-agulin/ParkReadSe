// Screen 3a - the home screen, once there is a key.
//
// It is the second state of the same screen as `2f`, and the two must look like one
// application: the same sign, the same way into the settings by an icon, the same
// three promises. The only difference is rank - here one of them is raised into the
// heading, because the screen is no longer asking for a key but offering to read a
// sign (`lib/home`).
//
// One primary action at the foot, the rarer path as a quiet link beneath it. Which
// one is primary is decided by `lib/home`: with no camera it is picking a photograph,
// and the reason is said aloud.

import { useEffect, useRef, useState } from "react";

import {
  HOME_HEADLINE, HOME_LINES, MOMENT_FROM, MOMENT_TO, SIGN_PLATES, entryActions,
  fieldMoment, momentChip, swedishMinute, swedishTimeNote,
} from "../lib/home";
import { Camera, Sliders } from "./Icon";
import SignPlate from "./SignPlate";

type Props = {
  moment: string;
  onMoment: (value: string) => void;
  cameraAvailable: boolean;
  offline: boolean;
  offlineNote: string;
  onScan: () => void;
  onPick: (file: File) => void;
  onSettings: () => void;
};

export default function Home({
  moment, onMoment, cameraAvailable, offline, offlineNote, onScan, onPick, onSettings,
}: Props) {
  const file = useRef<HTMLInputElement>(null);
  const entry = entryActions(cameraAvailable);
  const chip = momentChip(moment);
  // Said only while the reading is for "now" and the device keeps another zone than
  // Sweden's (step 20e). It names the Swedish minute, so it is kept current.
  const [clock, setClock] = useState(() => new Date());
  const timeNote = moment.trim() ? null : swedishTimeNote(clock);
  useEffect(() => {
    if (!timeNote) return;
    const timer = setInterval(() => setClock(new Date()), 20_000);
    return () => clearInterval(timer);
  }, [timeNote]);
  // A computer with a mouse: its date-and-time field is typed into and picked from a
  // calendar that sets the date alone, so it cannot lie invisible over the value as
  // it does on a phone, where the system dialog asks for date and time together.
  const [desktop] = useState(() => typeof window !== "undefined"
    && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true);

  const primary = () => (entry.primary === "scan" ? onScan() : file.current?.click());

  // The height is held by the shell (`App`), and the screen fills it. Subtracting the
  // shell's padding by hand would mean keeping its number in somebody else's file.
  return (
    <section className="flex flex-1 flex-col gap-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="flex-1 text-nav font-bold text-ink-strong">ParkRead Sweden</span>
        {/* An icon rather than a word: the same way into the same screen as on the
            first launch, and it must look the same. */}
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2"
        >
          <Sliders className="h-6 w-6" />
        </button>
      </header>

      {/* The dark band runs the full width of the column: it leaves the shell's
          padding by a negative margin - the one place in the application where
          anything does. There are no rounded corners: a rounded corner right at the
          edge of the screen reads as something unfinished rather than as a decision.
          It stretches by width and takes its height from its content - no aspect
          ratios, no fixed heights, nothing to tune.

          On a short screen the band is tightened by padding and by the size of the
          heading rather than by recomputing proportions: the sign stays as it is. The
          rule itself is an ordinary media query in `index.css`, under the class
          `tight-on-short`: written as an arbitrary variant it never reached the built
          CSS at all, and the care for a short screen would have been for show. */}
      <div className="tight-on-short -mx-4 flex flex-col gap-7 bg-hero px-6 py-8">
        <SignPlate size="large" align="start" plates={SIGN_PLATES} />
        <div>
          <h1 className="text-display font-extrabold text-on-dark">
            {HOME_HEADLINE}
          </h1>
          <div className="mt-3 flex flex-col text-label text-on-dark-2">
            {HOME_LINES.map((line) => <span key={line}>{line}</span>)}
          </div>
        </div>
      </div>

      {/* The moment: empty means "now", and the time is taken at the minute of
          sending. The picker lies as a transparent layer over the VALUE rather than
          over the whole row: what is pressed is "Now" or the chosen time, while the
          caption on the left promises nothing and opens nothing. */}
      {desktop ? (
        <div className="flex items-center justify-between gap-4 border-b border-line py-4">
          <span className="shrink-0 whitespace-nowrap text-body text-ink-2">Reading for</span>
          {/* On a computer the field is shown as it is: the calendar picks the date,
              and the hour and minute are typed or scrolled in the field itself. It
              starts from the current minute (`fieldMoment`), so a picked day is a
              whole moment at once; "Now" returns to reading at the minute of
              sending. */}
          <span className="flex items-center gap-3">
            {chip.canReset ? (
              <button
                type="button"
                onClick={() => onMoment("")}
                className="text-label font-semibold text-link"
              >
                Now
              </button>
            ) : (
              <span className="text-caption text-ink-3">now</span>
            )}
            <input
              type="datetime-local"
              value={fieldMoment(moment, swedishMinute(new Date()))}
              min={MOMENT_FROM}
              max={MOMENT_TO}
              aria-label="Moment to read the sign at"
              onChange={(e) => onMoment(e.target.value)}
              className="min-w-0 rounded-field bg-inset px-3 py-2 text-body text-ink
                         shadow-[inset_0_0_0_1.5px_var(--color-field)] outline-none"
            />
          </span>
        </div>
      ) : (
      <div className="flex items-center justify-between gap-4 border-b border-line py-4">
        {/* The caption never wraps: "Reading for" on two lines reads as a fragment
            rather than as a row of a list. */}
        <span className="shrink-0 whitespace-nowrap text-body text-ink-2">Reading for</span>
        <span className="relative flex items-center gap-2 text-row font-bold text-ink">
          {/* The value is pushed right and wraps when it must - but not just
              anywhere: the time is held to "at" by a non-breaking space
              (`momentChip`).

              There is no separate reset control here: the system dialog itself offers
              to clear the moment, and one more circle in the row cost more than it
              saved. The developer's decision; on Android the dialog has a clear
              action. */}
          <span className="text-right">{chip.label}</span>
          <span className="text-ink-3">›</span>
          {/* Vertically the field is stretched beyond the line of text: the line is
              about 24 px, and a press target is never smaller than 44 px. This moves
              nothing in the layout - the layer lies on top.

              `w-full` is obligatory. A date picker is given its OWN width by the
              browser (around 200 px in Chrome), and a pair of left and right offsets
              is not enough: the pairing is overridden, the browser's own width wins,
              and the field runs out to the right of a parent as wide as "Now ›". That
              drags the page sideways. */}
          <input
            type="datetime-local"
            value={moment}
            min={MOMENT_FROM}
            max={MOMENT_TO}
            aria-label="Moment to read the sign at"
            onChange={(e) => onMoment(e.target.value)}
            className="absolute -inset-y-3 inset-x-0 w-full min-w-0 cursor-pointer
                       opacity-0"
          />
        </span>
      </div>
      )}

      {timeNote && <p className="-mt-2 text-caption text-ink-3">{timeNote}</p>}

      <div className="mt-auto flex flex-col gap-3.5">
        {/* A network is needed by exactly one action - reading a sign. It is said
            before sending rather than after: learning it from an error means learning
            it too late. The action itself stays alive meanwhile: the camera and the
            frame work with no network at all. */}
        {offline && (
          <p className="rounded-card-sm bg-ground p-4 text-label text-ink-2 shadow-card">
            {offlineNote}
          </p>
        )}

        {entry.unavailable && (
          <p className="px-1 text-label text-ink-3">{entry.unavailable}</p>
        )}

        <button
          type="button"
          onClick={primary}
          className="flex w-full items-center gap-4 rounded-button bg-accent px-6 py-6
                     text-left shadow-primary"
        >
          {/* The camera icon appears only where taking a photograph is what is being
              offered. With no camera the primary action becomes picking a photograph,
              and a camera on the button would be a lie. */}
          {entry.primary === "scan" && (
            <Camera className="h-6 w-6 shrink-0 text-on-dark" />
          )}
          <span className="flex-1">
            <span className="block text-row font-bold text-on-dark">{entry.primaryLabel}</span>
            <span className="block text-label text-on-dark opacity-80">{entry.primaryNote}</span>
          </span>
          <span className="text-card text-on-dark opacity-85">›</span>
        </button>

        {entry.secondary && (
          <button type="button" onClick={() => file.current?.click()}
                  className="text-center text-body font-semibold text-link">
            {entry.secondary}
          </button>
        )}

        {/* The hidden way into the gallery. The capture attribute is deliberately not
            set: it would open the camera instead of the gallery, and a photograph
            already taken would become unreachable. */}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            // Resetting the value: without it, choosing the same file again fires no
            // event.
            e.target.value = "";
            if (picked) onPick(picked);
          }}
        />
      </div>
    </section>
  );
}

// Screen 2f — the first launch, with no key yet.
//
// It has one task: explain what this application is and ask for a key. There is no
// camera and no gallery here at all (decision 147): a frame taken without a key would
// end in the message "a key is needed", and a path into a dead end is worse than an
// honest request at the very start.
//
// **The screen is obliged to fit whole** — down to its last line, with no scrolling.
// The height of the window is set by the shell (`App`) in `svh`; the screen takes it
// through `flex-1` and measures nothing itself.
//
// It speaks in words other than those of the home screen with a key: there they offer
// to photograph a sign, here they explain what the key is for. The divergence is
// deliberate (see `lib/home`).

import { ASSURANCES, BENEFITS, HEADLINE, SIGN_PLATES } from "../lib/home";
import { Frame, Key, Lock, Shield, Sliders } from "./Icon";
import SignPlate from "./SignPlate";

type Props = { onAddKey: () => void; onSettings: () => void };

const MARKS = [Lock, Shield, Frame];

export default function FirstLaunch({ onAddKey, onSettings }: Props) {
  return (
    <section className="flex flex-1 flex-col gap-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-tile bg-accent
                         text-nav font-extrabold text-on-dark">
          P
        </span>
        <span className="flex-1 text-nav font-bold text-ink-strong">ParkRead Sweden</span>
        <button
          type="button"
          onClick={onSettings}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2"
        >
          <Sliders className="h-6 w-6" />
        </button>
      </header>

      {/* The sign stands alone in the middle of the screen: it is the thing the whole
          application is about. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <SignPlate size="hero" plates={SIGN_PLATES} />

        <div>
          <h1 className="text-display font-extrabold text-ink-strong">{HEADLINE}</h1>
          {/* The promises are smaller and paler than the headline: they explain it
              rather than making three separate claims. */}
          <div className="mt-2 flex flex-col text-label text-ink-3">
            {BENEFITS.map((line) => <span key={line}>{line}</span>)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-center text-section font-medium uppercase tracking-[0.1em]
                      text-ink-3">
          1-step setup
        </p>

        <button
          type="button"
          onClick={onAddKey}
          className="flex w-full items-center gap-3 rounded-button bg-accent px-5 py-4
                     text-left shadow-primary"
        >
          <Key className="h-5 w-5 shrink-0 text-on-dark" />
          <span className="flex-1 text-row font-bold text-on-dark">
            Add your vision model key
          </span>
          <span className="text-card text-on-dark opacity-85">›</span>
        </button>

        {/* Not pills but a quiet list: pills have a fill and a shape of their own, and
            next to the blue button they argue with it for attention, though they are
            only a footnote to it. The details wait in the settings, beside the
            switch. */}
        <div className="flex flex-col items-center gap-1.5">
          {ASSURANCES.map((text, i) => {
            const Mark = MARKS[i];
            return (
              // `text-section` is 13 px from the scale, not a size chosen on the spot.
              // `tracking-normal` kills the letter-spacing: that is set up for
              // capitalised section captions, and this is an ordinary phrase.
              <span key={text}
                    className="flex items-center gap-2 text-section tracking-normal
                               text-ink-3">
                <Mark className="h-3.5 w-3.5 shrink-0" />
                {text}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

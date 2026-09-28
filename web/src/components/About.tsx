// Screen 2i — "about the app". Text and nothing besides: no state, no decisions.
//
// What a newcomer needs to know before trusting a reading: what the app does, what it
// does not, where the photo and the key go, and where it stops. The same facts as the
// README, cut to what fits a phone screen. Nothing here promises accuracy or a price.

type Props = { onBack: () => void };

const STEPS = [
  "Take a photo of the sign, or pick one you already took.",
  "Mark the sign in the photo. Only that part is sent to be read.",
  "An AI model writes down what is on the sign. It only describes; it decides nothing.",
  "ParkRead Sweden's own rules work out what applies at the time you chose.",
];

const LIMITS = [
  "Swedish signs only.",
  "One sign per photo.",
  "Dates from 2026 to 2030.",
  "No parking on odd or even dates: treated as every day, stricter than the sign.",
  "Wording it does not know is shown as printed, not guessed at.",
];

export default function About({ onBack }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-chip
                     text-lg font-semibold text-ink-2"
        >
          ‹
        </button>
        <h1 className="text-nav font-bold text-ink-strong">About the app</h1>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card font-extrabold text-ink-strong">
          A plain-English reading of a Swedish parking sign.
        </h2>
        <p className="mt-3 text-body text-ink-2">
          A parking sign in Sweden is a stack of plates: paid hours, time limits, cleaning
          days, residents only, arrows. ParkRead Sweden reads the whole stack and shows
          what it states — who may park, when, for how long, and whether there is a fee.
        </p>
        <p className="mt-3 text-body text-ink-2">
          It never says "you may park here". It tells you what the sign says, how sure
          the reading is, and refuses when the photo is not good enough to answer.
        </p>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">How it works</h2>
        <ol className="mt-4 flex flex-col gap-3.5">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center
                               rounded-tile bg-tint text-label font-extrabold text-tint-ink">
                {i + 1}
              </span>
              <span className="text-body text-ink">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-label text-ink-3">
          Some rules apply without being on the sign, such as the 24-hour limit on a
          street with no signs. They are shown as notes, marked "not on this sign".
        </p>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">Your key and your photo</h2>
        <div className="mt-4 flex flex-col gap-4">
          <div className="border-l-2 border-line pl-3.5">
            <p className="text-row font-bold text-ink">No account, no server of ours</p>
            <p className="mt-0.5 text-label text-ink-2">
              The photo goes only to the AI provider you chose, with your own key.
              Nothing is kept: no history, no copies.
            </p>
          </div>
          <div className="border-l-2 border-line pl-3.5">
            <p className="text-row font-bold text-ink">Your provider, your terms</p>
            <p className="mt-0.5 text-label text-ink-2">
              Reading one sign takes two AI calls. Many providers offer free-tier models
              that can cover this; beyond a free allowance, your provider bills you under
              its own terms.
            </p>
          </div>
          <div className="border-l-2 border-line pl-3.5">
            <p className="text-row font-bold text-ink">Works as a web page</p>
            <p className="mt-0.5 text-label text-ink-2">
              It can be added to the home screen, and it opens offline — but reading a sign
              needs the internet.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">Where it stops</h2>
        <ul className="mt-4 flex flex-col gap-2.5">
          {LIMITS.map((limit) => (
            <li key={limit} className="border-l-2 border-line pl-3.5 text-label text-ink-2">
              {limit}
            </li>
          ))}
        </ul>
      </div>

      {/* Who is behind it, said plainly: a reader should weigh a reading knowing there
          is no company, no team and no support - the same caution the rest of the
          product asks for, applied to the product itself. */}
      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">Who made it</h2>
        <p className="mt-3 text-body text-ink-2">
          ParkRead Sweden is a personal, experimental project, built in spare time by one
          person — a product person, not a programmer — entirely with AI tools.
        </p>
        <p className="mt-3 text-body text-ink-2">
          It is not a professional product. There is no company, no team and no support
          behind it, and nothing is guaranteed: readings can be wrong, and the app can
          change or stop working at any time.
        </p>
      </div>

      <div className="rounded-card-sm bg-note p-5">
        <p className="text-label text-note-ink">
          You use it at your own risk. ParkRead Sweden is a reading aid, not permission and
          not advice: what you see is all there is, and the decision to park is yours —
          check the sign before relying on it.
        </p>
      </div>
    </section>
  );
}

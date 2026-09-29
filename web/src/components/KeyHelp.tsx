// Screen 2h — "where to get a key". Text and nothing besides: no state, no decisions.
//
// Of other people's models only the checkable is said — the name and the compatibility
// (decision 150). Everything we know about quality was measured on one model and one
// set of 55 photographs; "no worse" about somebody else's goods we have not measured
// and will not say.
//
// **Nothing here promises a price.** Providers have free allowances and paid rates
// alike, and both change without our knowing. The screen names the size of a request
// and says what it is for — to weigh against your own provider's terms. It calls no
// provider cheap, and promises nothing about what a key will cost.

type Props = { onBack: () => void };

// Of other people's providers — only the checkable: the name and the compatibility
// (decision 150). Neither "cheap" nor "free" nor "better": rates and model line-ups
// change without us, and a promise given here would go stale in silence. What the
// application is used for every day is not their business either: the person needs a
// working key, not our biography.
const PROVIDERS: { name: string; note: string }[] = [
  { name: "Google Gemini", note: "One place to look for a vision model and a key." },
  { name: "OpenAI", note: "Vision models of the GPT family." },
  { name: "Mistral", note: "Pixtral." },
  { name: "OpenRouter", note: "One key, many models from several vendors." },
  {
    name: "A model you host yourself",
    note: "If it answers at your address in the same dialect, point ParkRead Sweden at it.",
  },
];

// Four steps, not three: choosing a model was skipped, though without its exact name
// there is nothing to carry out the last step with.
const STEPS = [
  "Open your provider's API keys page.",
  "Create a key there. Copy it once — most providers show it only that one time.",
  "Pick a vision model from the provider's list and note its exact name.",
  "In ParkRead Sweden's settings, paste the key, set the provider address and the model name.",
];

export default function KeyHelp({ onBack }: Props) {
  return (
    <section className="flex flex-col gap-4">
      {/* Going back is by arrow, and it leads where we came from: `2h` opens both from
          the first launch and from the settings, so there is no "Back to Settings"
          button at the bottom at all — it would be untrue in half the cases. */}
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
        <h1 className="text-nav font-bold text-ink-strong">Where to get a key</h1>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card font-extrabold text-ink-strong">
          Any vision model will do.
        </h2>
        <p className="mt-3 text-body text-ink-2">
          ParkRead Sweden is not tied to one provider: you bring the key and pick the model.
        </p>
        {/* The requirement on a provider is named outright: "can look at a photograph"
            is not enough. A model behind another interface will not work, and the
            person would not understand why. The last phrase is a bridge to the list
            below: without it the paragraph broke off on technicalities. */}
        <p className="mt-3 text-body text-ink-2">
          One requirement: the provider must answer the OpenAI-compatible way
          (<code className="font-mono text-label">POST /chat/completions</code>).
          A model behind a different interface will not work here. Some that do are
          listed below.
        </p>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">Providers that speak it</h2>
        <div className="mt-4 flex flex-col gap-4">
          {PROVIDERS.map((p) => (
            <div key={p.name} className="border-l-2 border-line pl-3.5">
              <p className="text-row font-bold text-ink">{p.name}</p>
              <p className="mt-0.5 text-label text-ink-2">{p.note}</p>
            </div>
          ))}
        </div>
        {/* Where the photo goes is the person's choice, and for some it matters - GDPR
            above all. The host of this page sees no photo and no key; the provider sees
            both. Only the checkable is said: who the company is and where it is based. */}
        <p className="mt-4 text-label text-ink-3">
          Your photo goes to the provider you choose, and it is handled under that
          provider's terms. If it matters to you where: Google is a US company and may
          process data outside the EU; Mistral is a European company, based in France.
        </p>
      </div>

      <div className="rounded-card bg-ground p-6 shadow-raised">
        <h2 className="text-card-sm font-bold text-ink-strong">The shape of it</h2>
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
          Providers word their screens differently, so look for these parts rather than
          the exact clicks. For example:{" "}
          <a
            href="https://aistudio.google.com/docs/api-key"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-link"
          >
            aistudio.google.com/docs/api-key
          </a>.
        </p>
        {/* The size of a request is named with its reason: by itself it tells a person
            nothing. What it is FOR is said — to hold against a rate or an allowance,
            without guessing. No promise about price is made here: providers have the
            one and the other. */}
        <p className="mt-2 text-label text-ink-3">
          Reading one sign takes two model calls, about 1700 tokens — enough to weigh
          against your provider's free allowance or its rates.
        </p>
      </div>

      <div className="rounded-card-sm bg-note p-5">
        {/* Not "a payment instrument": a key can belong to an allowance that costs
            nothing. The danger is no smaller for that — the one spending it is
            whoever holds it. */}
        <p className="text-label text-note-ink">
          The key is yours, and whoever holds it spends your allowance. ParkRead Sweden keeps
          it on this device unless you switch that off — on a phone that is not yours,
          use “Forget key” in Settings.
        </p>
      </div>
    </section>
  );
}

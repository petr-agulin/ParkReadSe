# ParkRead

**Photograph a Swedish parking sign — get a plain-language breakdown of what it says.**
The main sign, every supplementary plate under it, what applies right now, and what
changes next.

The vision model extracts, the code decides. The model turns the photo into structured
JSON and does nothing else: no tools, no judgements, no clock. Everything with a
consequence — how plates compose, what applies at this hour, the confidence, the
refusal, the wording of every line — is computed in the browser.

| | |
|---|---|
| Answer matches the reference | **51 of 55** photos |
| Real signs wrongly rejected | **0 of 57** |
| Non-parking frames let through | **0 of 7** |
| Automated checks | **487** browser tests, **7** on the built page |

**ParkRead never says "you may park here."** It reports what the sign states, with a
computed confidence, and refuses when the photo does not support an answer. The decision
is the driver's.

---

## The problem

In Sweden a street with no signs is open for parking under the general traffic rules — on
weekdays for at most 24 hours in a row. Where there is a sign, it is rarely just a **P**.
Under it hangs a stack of supplementary plates (*tilläggstavlor*): fee windows, time windows, a
maximum duration, permit or parking-disc requirements, residents-only parking, cleaning
days, arrows for which stretch of kerb is meant.

![Three stacks of Swedish parking signs: under the same P sign hang different sets of supplementary plates — fee windows with bracketed day classes and tariff numbers, the stretch of validity in metres, yellow cleaning-day prohibition plates, a parking-disc requirement and a residents-only plate](images/ParkingSignExample.png)

The grouping is itself data. Several plates apply *each on its own* (*var för sig*);
several lines on one plate apply *jointly* (*gemensamt*). The same three words reach
different results depending only on how they are split:

```
Two plates:                      One plate:
  [ 2 tim ]                        [ 2 tim   ]
  [ Avgift 8-18 ]                  [ Avgift  ]
                                   [ 8-18    ]

- max 2 h, around the clock,     - between 8 and 18: max 2 h and a fee
  every day                      - outside that window: no restriction
- a fee between 8 and 18           from the sign
```

A missed boundary does not give an approximate answer, it gives a different one. When
ParkRead cannot tell one plate from two, it says so instead of guessing.

---

## What you get back

![The result screen: a "What we read" block with the photo beside a reconstruction of the sign, each plate carrying its verbatim Swedish text and a plain-language explanation; a "Who can park here" block; and a "Your parking window" timeline running from the selected start time through a paid period, a free period and the end of the window](images/ResultScreenExample.png)

**What we read.** Your photo beside a reconstruction of the sign: the main sign, then the
panels in reading order, each with its verbatim Swedish text and a plain explanation.
Panels that carry no rule are labelled as such, so an operator's payment board is neither
dropped nor mistaken for a condition. General rules that are *not* on this sign sit behind
a "show" link, outside the reading.

Under the heading, colour-coded in one line: how complete the reading is and the computed
confidence. Green means every panel was read, amber means an answer with a caveat, red
means no answer. A plate that could not be read is named but not quoted, and no window is
drawn: nothing on an unread plate says it does not matter, and a guess would look like an
answer. The plates that were read are still shown. A panel that came back empty gives an
answer with a caveat, and no period below is then presented as permitted.

**Who can park here.** Whom the sign designates the spaces for. It names the category and
stops there.

**Your parking window.** A timeline from the moment you chose: when each period starts,
what the sign says about it, how long the limit leaves you. Arrows splitting the sign into
stretches give one timeline each, labelled with the side. A line is solid where the stretch
is open to anyone and fully read, and broken where it is a prohibition, was not read in
full, or is meant for a named group only — taxis, rented spaces, visitors. Hours named on a
plate are the only hours that plate permits. Where a prohibition's hours are over and the
sign says nothing more, the general 24-hour rule applies, and the window says it is not
from the sign.

Every line is an assertion about the **sign**, never about you. That vocabulary is enforced
by tests over the strings the product can display.

**It refuses on purpose:** too dark, a plate cut off by the frame, an uncertain boundary,
an unrecognised token, contradictory windows — it shows what it could read and asks for
another photo.

---

## How it works

Four stages, fixed order, no branch the model controls.

| Stage | What happens | Who does it |
|---|---|---|
| **0. Triage** | One cheap call answers one question: Swedish parking sign, other road sign, or not a sign. It returns a label; an `if` in the code decides whether to continue | Model, no tools |
| **1. Extraction** | One vision call turns the photo into JSON: the main sign, and the panels below it top to bottom with the boundaries between them — kind, verbatim lines, readability, parsed fields | Model, no tools |
| **2. Evaluation** | Validates against the schema, composes by the *var för sig / gemensamt* rule, splits stretches by arrows, computes the complement over the weekly calendar with day classes and holidays, applies prohibition priority | Code |
| **3. Rendering** | Judges completeness, computes the confidence, builds the explanation from the reference — or builds the refusal | Code |

The confidence is computed, not asked for. It is assembled from signals the code owns:
did the response validate, was the main sign found, what share of panels went unread or
uninterpreted, was the order recovered, do windows contradict each other, is the day class
known, does the image carry enough pixels for the text claimed. The model's own estimate is
one input among them, and not the decisive one.

### Where the interpretation comes from

| Source | What it is | How it is used |
|---|---|---|
| **JSON schema** | A closed list of fields the model must fill | The only thing that reaches the rules engine |
| **Reference (Markdown)** | 56 sign entries: code to plain-language explanation | Supplies the explanation text and acts as a **whitelist** |
| **General rules (Markdown)** | 12 short notes about rules that are *not* on the sign | Shown as marked reference only. The notes never enter a computation; the one rule the engine does apply, the 24 hours, is computed in code |

Anything outside the reference is marked unrecognised: the plate's text is shown verbatim
with an honest "this service does not interpret this wording", and the confidence drops,
possibly to a refusal. Free text never reaches the rule arithmetic.

The reference lives in `reference/`. `signs/` holds one Markdown file per entry, named by
its key; `general_rules/` holds the notes, each marked "this is not on the sign";
`sources/` holds working notes on the official material (where the Transportstyrelsen
catalogue and the textbook disagree, the catalogue wins). An entry's header is plain
`key: value` lines: `key`, `tokens` (what is written on the sign), `category` (`main_sign`,
`rule`, `info` — part of what the sign says about parking, though the engine sets no rule
by it, or `no_rule` — not about the parking rules at all, and the plate is tagged "Not a
parking rule"), `label`, `code`, `schema` (the schema field it maps to), `en` (the interface text
itself), `short` and `source`. The body below the header is a note for the developer and
never reaches the screen. The answer is assembled from the `en` strings, which is why a
forbidden phrasing cannot arrive from the model. After editing, `npm run emit` regenerates
the browser's copy.

Day classes (*vardag* / *vardag före sön- och helgdag* / *sön- och helgdag*) are computed
from Swedish holiday law for 2026–2030. Outside that window the day class is unknown, and
the answer gives both readings rather than picking one.

---

## Accuracy

The test set is **139 photos** taken by the author: 57 parking signs with reference
answers, 7 frames that are not parking signs, and 75 photos added but not yet marked
up. Measurement runs on stored model responses,
so it is deterministic and needs no key. Those responses live in `testset/answers/`, one
file per stage per photo, each marked with the fingerprint of the prompt that produced
it; only real model answers (`origin: model`) are measured. `npm run ask --
testset/photos/<photo>` refreshes them and spends your key.

Each photo is named `NNN-short-slug.jpg`; the three-digit number is the key of its
reference answer `testset/expected/NNN.json` and is never reused. No frame may show a
readable number plate, a face or personal details — this is checked before a commit,
since a photo in git history can only be removed by rewriting it. One exception is
deliberate: photo `019` shows a car's front plate about 20 px wide, unreadable, that no
crop can remove; it is kept because it is the only photo with `Övrig tid` under a
prohibition sign and the only yellow time plate.

- **51 of 55 answers match** the reference. Two diverging photos narrow the answer, two read
  a parking disc as a ticket.
- **Triage: 57 real signs, 0 wrongly rejected; 7 non-parking frames, 0 let through.**
- **Coverage: 55 of 57** (96%). Two photos are excluded because their stored response came
  from an older prompt — the measurement refuses to mix prompt versions in one number.
- Field-level accuracy ranges from 100% (`panel.rule_bearing`, `parsed.duration_limit`) to
  33% (`parsed.payment_method`); the full table is printed by `npm run measure`.

Fields diverge on far more photos than answers do: a plate's colour or the order of two
panels shows up in the parse and never reaches the reader.

---

## Running it

Node 20 or newer. There is no server and no backend.

```powershell
cd web
npm ci
npm run dev                  # development, https for the camera
npm run dev:lan              # the same, reachable from a phone on your Wi-Fi
npm run build                # output in web/dist
npm run preview              # the built page, as a host would serve it
```

To try it on a phone, run `npm run dev:lan` and open the "Network" address it prints on a
phone on the same Wi-Fi. The development certificate is self-signed, so the browser warns
once; the camera needs https. The page is visible to the whole network while it runs, so
avoid this on public Wi-Fi.

The output is self-contained and uses relative paths, so it works from the root of a domain
or from a subfolder — copy `web/dist` to any static host. It installs from the browser as an
app and opens offline; reading a sign needs the network, and the page says so.

| Command | What it checks |
|---|---|
| `npm test` | the browser suite |
| `npm run test:build` | builds the page and checks what ended up in it |
| `npm run measure` | extraction accuracy and the confidence threshold |
| `npm run goldens` | whether the stored reference answers still match what the code computes |
| `npm run emit` | regenerates the browser's data from the Markdown sources and schemas |
| `npm run ask` | re-queries the model for test-set photos (spends your key) |

`npm run ask` and nothing else reads `.env` — see `.env.example` for the three fields.
The provider is not hardcoded: requests speak the OpenAI-compatible dialect, which Google,
Mistral and OpenRouter all understand. Developed against Google AI Studio's
`gemini-3.5-flash-lite`, about 1700 tokens per photo.

---

## Using it

**It is a web page, not an app from a store.** Adding it to a home screen gives it an icon
and a window without an address bar; underneath it stays a page with a page's limits. It can
use the camera while open and with permission, and can reach nothing else on the phone.
Nobody reviewed it — no store saw it.

**You bring your own key.** The provider's address, the model name and your key go in
**Settings**. Without them the app opens and explains itself but cannot read a sign, and the
camera and the gallery stay shut until it can. Each reading costs two model calls, billed to
you by your provider. The key is held in the tab and forgotten when you close it, unless you
tick **Remember on this device**; **Forget key** erases it immediately.

**Your photo goes to your provider and nowhere else.** There is no account, no server of
ours and no history: nothing is stored beyond the app's own files and your saved key —
under half a megabyte in total, inside the browser's storage for the app's address.

**Offline:** the app opens; reading a sign does not, and it says so rather than failing
quietly. Updates arrive the next time you open it with a
signal.

**Uninstalling:** remove the icon *and* clear the site data for the address — on Android via
App info then the browser's site settings, on iPhone via Remove App, which takes its data
with it.

**The parking decision is yours.** ParkRead reads a sign and tells you what it states. It is
a reading, not a permission and not advice. Check the sign yourself before relying on it.

---

## Known limits

- **The calendar runs 2026 to 2030.** A moment outside it cannot be chosen, and nothing is
  guessed beyond it.
- **Not published anywhere yet.** There is no address to open from the street.
- **iOS is untested.** Installing and the camera should work in Safari; that is not a claim
  that they do.
- **Sweden only, and it does not detect otherwise.** A foreign parking sign passes triage and
  is then read by Swedish rules.
- **No claim of domain completeness.** Municipalities write their own plate text. Unknown
  plates are shown verbatim and lower the confidence.
- **One sign per photo.** Multiple signs in one frame are out of scope.
- **Recognised but not computed:** date parking (`C36`–`C38` — the side of the street cannot
  be established from a photo of the sign), zone extent, and "special rules" plates carrying
  a miniature of another sign.
- **`Boende` (residents) is informational.** Residents' terms are agreed with the housing
  organisation and differ building to building.
- **No dialogue.** One photo, one answer. No chat, no clarifying questions, no text input.

---

## Stack and layout

TypeScript · React 19 · Vite · Tailwind · Vitest · JSON Schema · Markdown as the reference
format · an external vision API, addressed by the reader's own key. No backend, no database,
no build-time secrets. `ajv` is a development dependency only, used to cross-check the
project's own schema validator.

One job per module, no file that everything is dumped into.

```
web/
  src/
    App.tsx          the screen; state lives here
    components/      one component per block of the screen
    lib/
      pipeline.ts      the stages, together
      vision.ts        the two model calls
      prompts.ts       prompts; the response skeleton comes from the schema
      validation.ts    schema, plus the rules a schema cannot express
      engine.ts        the rules engine: a pure function, no model, no clock
      calendar.ts      day classes; clock.ts: daylight saving
      completeness.ts  how complete the reading is, and the confidence
      present.ts       the answer in the words the reader sees
      reference.ts     the reference, and what counts as recognised
      settings.ts      the key and provider, held by the browser
      offline.ts       what the service worker caches, and what it never caches
      measure.ts       accuracy and threshold arithmetic
    sw.ts            the service worker
  tools/             developer commands: goldens, emit, icons, ask
  measure/           the measurement report
  build/             tests over the built page
schema/            the contract between model and code
reference/         the reference and the general-rules notes; also the whitelist
prompts/           the prompt texts
testset/           139 photos, their reference readings, and the model's saved answers
parity/            stored answers the code is checked against
```

Layers do not jump over each other: the engine knows nothing about the screen, the screen
knows nothing about the model provider, and `engine.ts` imports nothing but the calendar, the clock, date arithmetic and the
reference tables.

The interface language is English. Technical values — JSON keys, sign codes — stay English
everywhere.

`AGENT_SPEC.md` holds the contract of the model inside the product: role, tools (none),
prohibitions, refusal policy, and the schema its answers must follow.

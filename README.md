# ParkRead

**Photograph a Swedish parking sign — get a plain-language breakdown of what it says.**
The main sign, every supplementary plate under it, what applies right now, and what
changes next.

It is built on one rule: **the model extracts, code decides.** The vision model turns
the photo into structured JSON and does nothing else — it has no tools, makes no
judgements, and never sees a clock. Every consequence is computed in Python: how plates
compose, what applies at this hour, the confidence, the threshold, the refusal, and the
wording of every line the user reads.

That is what makes the answer checkable, and it is measured rather than asserted:

| | |
|---|---|
| Answer matches the reference | **51 of 55** photos |
| Real signs wrongly rejected | **0 of 57** |
| Non-parking frames let through | **0 of 7** |
| Regression tests | **224**, green |

Everything above is reproducible on a clean checkout without an API key — see
[Measured, and how to re-measure it](#measured-and-how-to-re-measure-it).

**The service never says "you may park here."** It reports what the sign says, with an
explicit confidence, and refuses when the photo does not support an answer. The decision
is the driver's.

---

## The problem

In Sweden you may only park in marked places, and the sign is rarely just a **P**.
Under it hangs a stack of supplementary plates (*tilläggstavlor*), each with its own
meaning: a fee window, a time window, a maximum duration, a permit requirement, a
parking-disc requirement, residents-only parking, a street-cleaning day, arrows for
which stretch of kerb is meant.

![Three stacks of Swedish parking signs: under the same P sign hang different sets of supplementary plates — fee windows with bracketed day classes and tariff numbers, the stretch of validity in metres, yellow cleaning-day prohibition plates, a parking-disc requirement and a residents-only plate](images/ParkingSignExample.png)

*Three real signs. The main sign is identical on all three — a plain P. Everything else
is set by the plates: fee windows with day classes in brackets and tariff numbers, the
stretch in metres, a parking disc and a maximum duration, yellow cleaning-day
prohibitions, a residents-only condition. The answer follows from the whole stack, never
from one plate.*

Reading the stack correctly is hard even for a local driver, and a mistake costs a fine
of several hundred kronor — or a tow.

### Why the stack is the hard part

Transportstyrelsen's rule has two halves that pull in opposite directions:

- **several plates** under a sign apply *each on its own* (*var för sig*), read top to
  bottom, each parsed without borrowing words from its neighbours;
- **several lines on one plate** apply *jointly* (*gemensamt*) as a single instruction.

The official examples use the **same three words** — `2 tim`, `Avgift`, `8-18` — and
reach different results depending only on how the lines are split across plates:

```
Two plates:                      One plate:
  [ 2 tim ]                        [ 2 tim   ]
  [ Avgift 8-18 ]                  [ Avgift  ]
                                   [ 8-18    ]

- max 2 h, around the clock,     - between 8 and 18: max 2 h and a fee
  every day                      - outside that window: no restriction
- a fee between 8 and 18           from the sign
```

So the **boundary between plates is data**, exactly as much as the text is. If the
service cannot tell whether it is looking at one plate or two, it has not read the sign
— and it says so instead of guessing. A missed boundary does not produce an approximate
answer, it produces a different one.

---

## What you get back

![The result screen: a "What we read" block with the photo beside a reconstruction of the sign, each plate carrying its verbatim Swedish text and a plain-language explanation; a "Who can park here" block; and a "Your parking window" timeline running from the selected start time through a paid period, a free period and the end of the window](images/ResultScreenExample.png)

*A real sign in Sundbyberg, read end to end: a fee window with a bracketed day class,
a Friday-night cleaning prohibition with a July exception, a tariff zone, and an
operator's payment board that carries no rule at all. Three blocks, top to bottom.*

**What we read.** Your photo beside a reconstruction of the sign: the main sign, then
the panels in the order they were read, each with its verbatim Swedish text and a plain
explanation. You can check in one second whether it read the right thing — and the
grouping that drives the entire rule is visible. Panels that carry no rule are labelled
as such, so an operator's payment board is neither silently dropped nor mistaken for a
condition. The general rules that are *not* on this sign sit behind a "show" link at the
bottom, deliberately out of the reading.

Directly under the heading, in one line and colour-coded: how complete the reading is
and the computed confidence. It is an aside to the answer, not a verdict of its own —
green means every panel was read and nothing lowered the confidence, amber means there
is an answer with a caveat, red means there is no answer. When a panel could not be read,
that line says so plainly: *an unread panel may carry a prohibition, so no period below
is presented as permitted.*

**Who can park here.** Whom the sign designates the spaces for. It names the category
and stops there — whether you belong to it is yours to decide, never the service's.

**Your parking window.** The timeline from the moment you chose: when each period starts,
what the sign says about it, how long the limit leaves you. In the screenshot the fee runs
until 21:00, then eleven free hours, then the fee again at 08:00 — the answer to "what
changes in an hour", which a single "what applies now" cannot give. If arrows split the
sign into several stretches, each gets its own timeline, labelled with the side.

Every line is an assertion about the **sign**, never about you: "the sign permits parking
for all vehicles", not "you may park here". That vocabulary is enforced by tests over the
strings the product can display, not by asking the model nicely.

**It refuses on purpose.** Too dark, a plate cut off by the frame, an uncertain boundary
between plates, an unrecognised scope-shift token, contradictory windows — the service
shows what it could read and asks for another photo. Off-the-shelf apps answer every
time, at the same confident volume; the difference only shows on the bad photo, which is
the one you actually took standing in the street.

---

## How it works

Four stages, fixed order, no branch the model controls.

| Stage | What happens | Who does it |
|---|---|---|
| **0. Triage** | One cheap model call answers a single question: is this a Swedish parking sign, another road sign, or not a sign at all. It returns a label, not a decision — an `if` in the code decides whether to continue | Model, no tools |
| **1. Extraction** | One vision call turns the photo into JSON: the main sign, and the panels below it in top-to-bottom order with the boundaries between them. Per panel: kind, verbatim lines, readability, and parsed fields (time windows, fee windows, maximum duration, permits, day class, arrows) | Model, no tools |
| **2. Evaluation** | A pure Python function validates the JSON against the schema, composes the instructions by the official *var för sig / gemensamt* rule, splits stretches by arrows, computes the complement over the weekly calendar with day classes and holidays, and applies prohibition priority | Code |
| **3. Rendering** | Decides how complete the reading is, computes the confidence, and builds the explanation from the reference — or builds the refusal. Wording comes from the reference, never from the model | Code |

**Why no tool-calling.** A tool the model may call at its own discretion is a branch the
model controls. Here there are none: the pipeline is identical on every request. That
makes "the model performs no actions" checkable in the code rather than asserted in a
prompt.

**The confidence is computed, not asked for.** A vision model's self-reported certainty
is badly calibrated — it is confidently wrong. The final number is assembled from signals
the code owns: did the response validate, was the main sign found, what share of panels
went unread or uninterpreted, was the order recovered, do the windows contradict each
other, is the day class known, does the image have enough pixels for the text claimed.
The model's own estimate is one input among them, and not the decisive one.

### Where the interpretation comes from

Three sources, kept separate:

| Source | What it is | How it is used |
|---|---|---|
| **JSON schema** | A closed list of fields the model must fill: main sign type, time windows, maximum duration, fee window, permit requirement, day class, arrows | The only thing that reaches the rules engine. Everything computable lives here |
| **Reference (Markdown)** | A deliberately small glossary — 50 sign entries, code to plain-language explanation, built from Transportstyrelsen material and the author's own photos | Supplies the explanation text and doubles as a **whitelist** |
| **General rules (Markdown)** | 11 short notes about rules that are *not* on the sign | Shown as clearly marked reference only. Never enters a computation |

**The reference is not a body of law — it is a boundary of competence.** It is small on
purpose. Anything not in it is marked unrecognised: the plate's text is shown verbatim
with an honest "this service does not interpret this wording", and the confidence drops,
possibly to a refusal. Free text never reaches the rule arithmetic.

**Holidays are a data file, not a formula.** The distinction *vardag* / *vardag före
sön- och helgdag* / *sön- och helgdag* cannot be derived from a date — it needs the
Swedish holiday list. When the date falls outside the covered period the day class is
unknown, and the answer says so and gives both readings rather than picking one.

---

## Measured, and how to re-measure it

The test set is **64 photos** taken by the author: 57 real parking signs with reference
answers, plus 7 frames that are declared not to be parking signs. Two commands measure
two different things, and the difference is the point.

`cli.py accuracy` compares extracted **fields** against the reference:

| Field | Accuracy |
|---|---|
| `panel.rule_bearing` | 100% |
| `main_sign.type` | 96% |
| `parsed.eligibility` | 93% |
| `parsed.vehicle_class` | 92% |
| `panel.lines` | 87% |
| `parsed.prohibition` | 72% |
| `parsed.time_windows` | 64% |
| `parsed.scope_shift` | 56% |
| `parsed.stretch_metres` | 45% |
| `parsed.payment_method` | 33% |

`cli.py calibrate` runs the engine twice — once on the reference, once on the model's
answer — and compares **what a person would read**. Fields diverge on far more photos
than answers do: a plate's colour or the order of two panels shows up in the parse and
never reaches the user.

**51 of 55 answers match.** The four that diverge: two narrow the answer (`060`, `061`),
and two read a parking disc as a ticket (`057`, `059`). Two further photos (`014`, `055`)
are excluded because their stored response came from an older prompt — the measurement
refuses to mix prompt versions in one number.

Triage: **57 real signs, 0 wrongly rejected; 7 non-parking frames, 0 let through.**

All of it runs on cached model responses, so it is deterministic and needs no API key:

```powershell
.venv\Scripts\python.exe tests\run.py       # 224 regression checks
.venv\Scripts\python.exe cli.py accuracy    # field-level extraction accuracy
.venv\Scripts\python.exe cli.py calibrate   # threshold, by divergence of the ANSWER
```

---

## Running it

Local only. Python 3.13 and, for the frontend, Node 20 or newer.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python.exe server.py          # http://127.0.0.1:5000
```

Commands are shown with the interpreter spelled out on purpose: `.venv\Scripts\activate`
silently does nothing under a restrictive PowerShell execution policy, and the symptom is
a confusing `ModuleNotFoundError: No module named 'dotenv'` from the system Python.

The frontend is built separately; the same process serves both the page and the API, so
the frontend has no backend address in it — `/api/...` is always its own:

```powershell
cd web
npm ci
npm run build                               # output in web/dist
```

For frontend work, `npm run dev` alongside a running `server.py`: Vite proxies `/api`
to the backend, so the frontend code is identical in both modes.

### Two modes

| Mode | `.env` | What works |
|---|---|---|
| **Demo** (default) | `DEMO_MODE=true`, no key | The whole scenario on cached model responses: parsing, the rules engine, explanations, refusals on deliberately bad photos |
| **Live** | `DEMO_MODE=false` plus your own key | The same, on any new photo — it goes to the vision API |

Demo mode is the default deliberately: **the project must start and show something
without a key.** It is also not a showcase — it is the deterministic bench the accuracy
measurement and the regression suite run on. Note that in live mode every analysis costs
two real model calls, and running the measurement commands will re-query the whole set.

**The provider is not hardcoded.** `VISION_API_BASE_URL`, `VISION_MODEL` and
`VISION_API_KEY` come from `.env`, with no default in the code, so a missing address
produces an honest error rather than a silent fallback. Requests speak the
OpenAI-compatible dialect, which Google, Mistral and OpenRouter all understand — changing
provider is an `.env` edit, not a code change. Developed against Google AI Studio's
`gemini-3.5-flash-lite` (~1700 tokens per photo), chosen by testing it on real photos of
Swedish signs rather than by reading documentation.

The price of that portability: no provider-enforced JSON schema. The response shape is
described in words in the prompt, with the skeleton **generated from the schema itself**
so the two cannot drift apart — and the real guarantee stays where it always was, in the
project's own validator.

### HTTP API

| Endpoint | What it does |
|---|---|
| `POST /api/analyze` | Photo in the `photo` field, optional `moment` as `2026-03-07T12:00`. Returns how complete the reading is, what the service saw, and the timeline per stretch |
| `GET /api/health` | What is configured. About the key: only whether it is set, and its length — never the value |
| `GET /api/reference/<key>` | One reference entry: the ready explanation and where the interpretation comes from |
| `GET /api/general-rules` | The general-rules notes — things that are not on the sign. A separate endpoint on purpose: it never enters a computation, and by not travelling with the analysis it cannot accidentally become part of one |

```bash
curl -F photo=@testset/photos/005-2tim-8-18-parentes-8-15-dubbelpil.jpg \
     -F moment=2026-03-10T12:00 http://127.0.0.1:5000/api/analyze
```

**Photos are never written to disk** — not to a temp file, not to a cache. A photo lives
in the request in memory and goes only to the vision API. The SQLite history stores the
result without the image and **without the filename**: phone filenames carry dates and
sometimes locations, and are of no use here.

---

## Known limits

Named rather than hidden — each is a real boundary of the current build.

- **The holiday calendar ends 2026-12-31.** From January 2027 the day class is unknown on
  every request, and the service says so instead of guessing. It degrades honestly, but it
  does degrade.
- **Local only.** No deployment, no public URL, no HTTPS. You cannot open it from the
  street on your phone yet.
- **Sweden only, and it does not detect otherwise.** A foreign parking sign passes triage
  — it *is* a parking sign — and is then read by Swedish rules. Distinguishing the country
  is a new field, a new prompt line and a full re-run.
- **No claim of domain completeness.** There is no exhaustive list of Swedish plates;
  municipalities write their own text. Unknown plates are shown verbatim and lower the
  confidence.
- **One sign per photo.** Multiple signs in one frame are out of scope.
- **Some sign classes are recognised but not computed:** date parking (`C36`-`C38` — the
  side of the street cannot be established from a photo of the sign), zone extent, and
  "special rules" plates that contain a miniature of another sign.
- **`Boende` (residents) is informational.** Residents' terms are agreed with the housing
  organisation and differ building to building; the service reads the sign for an ordinary
  driver and says so.
- **No dialogue.** One photo, one answer. No chat, no clarifying questions, no text input.

---

## Stack and layout

Python 3.13 · Flask · SQLite · JSON Schema · Markdown as the reference format ·
React 19 + Vite + Tailwind · an external vision API behind `.env`.

The architecture is flat on purpose — no feature-sliced ceremony on a project this size.
The rule instead is **one job per module**, and no file that everything gets dumped into.

```
parkread/          backend: one module per pipeline stage
  config.py          settings from .env; the key is never handed out
  prompts.py         prompts; the response skeleton is generated from the schema
  vision.py          the two model calls plus the demo-mode branch
  validation.py      schema, plus the rules a schema cannot express
  reference.py       the reference, and what counts as recognised
  calendar_se.py     day classes
  engine.py          the rules engine: a pure function, no model
  pipeline.py        the stages, together
  api.py             HTTP layer: take the request, return JSON
web/               frontend: React + Vite + Tailwind
  src/components/    one component per block of the screen
  src/api.ts         the only place that knows the backend's addresses
schema/            the contract between model and code
reference/         the reference and notes; also the whitelist
data/              holiday calendar, history database
testset/           64 photos with reference answers
demo/              cached model responses — the deterministic bench
tests/             the regression suite
```

**Layers do not jump over each other.** The HTTP layer knows nothing about parking rules,
the engine knows nothing about HTTP, the frontend knows nothing about the model provider.
That is checkable rather than aspirational: `engine.py` imports nothing but the calendar
and stays a pure function.

The interface language is English. Technical values — JSON keys, sign codes, column names
— stay English everywhere.

## How this project is documented

Two design documents ship with the code. They are in Russian; the product and its
interface are in English.

| File | What it holds |
|---|---|
| `PROJECT_BRIEF.md` | What the product does and why: business logic, the composition model that turns a stack of plates into one answer, scenarios, MVP boundaries |
| `AGENT_SPEC.md` | The contract of the assistant inside the product: role, tools (none), prohibitions, refusal policy, and how each boundary is enforced in code rather than asked for in a prompt |

Between them they answer the question this repository exists to answer: not "what does
the code do" but "why is the answer trustworthy, and where does it stop".

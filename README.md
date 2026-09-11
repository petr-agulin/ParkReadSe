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

The frontend is built separately, and **the built page needs no server at all**: it reads
the sign in the browser, with the reader's own key, and talks only to the model provider.

```powershell
cd web
npm ci
npm run build                               # output in web/dist
npm run preview                             # the built page, as a host would serve it
```

The output is self-contained and uses relative paths, so it works from the root of a
domain or from a subfolder — copy `web/dist` to any static host. It installs as an app
(manifest plus a hand-written service worker) and opens offline; reading a sign does not,
and the page says so rather than failing quietly.

For frontend work, `npm run dev` alongside a running `server.py`: Vite proxies `/api` to
the backend, and a development-only switch lets you compare the browser's answer with the
Python one. Neither the switch nor the `/api` path exists in the built page.

| Command | What it checks |
|---|---|
| `.venv\Scripts\python.exe tests\run.py` | the Python suite |
| `npm test` (in `web`) | the browser suite, including the parity run against Python |
| `npm run test:build` | builds the page and checks what ended up in it |
| `npm run measure` | extraction accuracy and the confidence threshold |

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

- **The calendar runs 2026 to 2030.** Easter and the holidays that hang off it are
  computed from the law rather than listed, but the window is bounded on purpose: a
  moment outside it cannot be chosen, and nothing is guessed beyond it.
- **Not published anywhere yet.** The page builds, installs and runs entirely in the
  browser — but where it will be hosted is undecided, so there is no address to open from
  the street.
- **iOS is untested.** There was no iPhone to test on. Installing and the camera should
  work in Safari; nothing here is a claim that they do.
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

---

# Using it: what this is, and what it asks of you

Everything below is for the person who wants to *use* ParkRead rather than read its code.
It is deliberately long. Most of it answers questions that only sound technical — what am
I installing, who checked it, where does my photo go, what happens if I clear my browser —
and every one of those has a short, honest answer worth having in writing.

If you send one paragraph along with the link, send this one:

> ParkRead is a web page, not an app from a store. Open the link; your browser can put an
> icon on your home screen so it opens like an app, but nothing is installed beyond that,
> and it has the same access as any website: the camera while it is open, if you allow it.
> Nobody reviewed it — Google and Apple never saw it. There is no account and no server of
> ours: you paste in your own key to an AI provider, your photo goes from your phone
> straight to them, and nobody else sees it. It reads the sign and tells you what it says.
> Check the sign yourself before you trust it.

## It is a website, not an app from a store

Adding it to a home screen does not change what it is. It changes how it looks: an icon
instead of a bookmark, no address bar, opens instantly. Underneath it is the same page
with the same rules as any page. The industry name for this is "progressive web app", a
phrase built to blur exactly the distinction worth keeping.

Three things get conflated when people ask "is it an app or a website", and they do not
move together:

| | App from a store | ParkRead | An ordinary website |
|---|---|---|---|
| **How it arrives** | Downloaded from a store | Opened from a link, optionally pinned to the home screen | Opened from a link |
| **Who vouched for it** | The store reviewed it; the phone checks its signature | Nobody. The author, and whoever sent you the link | Nobody |
| **What it can reach on the phone** | Whatever it asks for: contacts, location, files, background activity | Only what a web page can: the camera, while it is open, with permission | The same |
| **Where the work happens** | On the phone, and on the company's servers | On the phone | On the company's servers |
| **Who holds your data** | They do | Nobody. Your phone | They do, usually behind an account |
| **How it updates** | Through the store, in versions you can see | The next time you open it | The next time you open it |

So it is unlike a store app in that **nobody checked it**. There is no review and no
signature that means anything. And it is unlike an ordinary website in the opposite
direction: **there is no account and no server of ours**, and nothing about you is held
anywhere. Less vouched-for than a store app and less data-hungry than a website, at once.

The reassuring half is real, and it is not a promise — it is what browsers enforce. A web
page cannot read your contacts or messages, cannot see your other apps, cannot run in the
background, cannot touch files you did not hand it, and can use the camera only while it
is open and only after you allow it.

## What happens when you open it

A handful of files travel to your phone: the page, one file of instructions, one of
styling, the icons. About 120 KB over the network, once. After that they live on your
phone, and opening the app costs nothing but a quick check for a newer version.

From then on, the browser runs those instructions on your phone. **Everything ParkRead
decides, it decides there** — the rules engine, the Swedish holiday calendar, the
daylight-saving arithmetic, the reference of plate meanings, the wording of every sentence
it says. None of that is a request to anyone.

One thing is not local: reading the photograph. The cropped picture of the sign goes to
the AI provider whose key you entered, and their model returns what it saw written on the
plates. Judging what that means is done on your phone; recognising the letters is not.

So there are two parties in normal use: **your phone, and the provider you already pay.**
Nothing passes through the author, and there is nothing for it to pass through.

## What you need to bring

Your own key to an AI provider, the provider's address, and the names of the two models it
should use. The Your key panel on the first screen takes all four. Without them the app
opens, explains itself and shows the reference — but cannot read a sign, and says so
rather than failing quietly.

The cost of reading a sign is yours and goes to your provider — about two model calls per
photograph. The author pays nothing, sees nothing, and cannot revoke anything: the key is
yours, and yours to rotate whenever you like.

The key lives in the tab's memory and is forgotten when you close it, unless you tick
**Remember on this device** — then it is kept in your browser's storage for this address,
and nowhere else. **Forget the key** erases it from both, immediately. The provider address
and model names are remembered always: they are not secret, and retyping them at a sign in
the rain is its own kind of cruelty.

## Putting it on your home screen

This is your browser's doing, not the app's — there is no button inside ParkRead asking to
be installed. Any time the page is open:

- **Android, Chrome:** the menu offers *Install app*, and sometimes prompts by itself.
- **iPhone, Safari:** Share, then *Add to Home Screen*. (Untested — see Known limits.)

On Android there are two possible outcomes, and the wording tells them apart. *Install app*
creates a small package that Android installs properly: it appears in the app drawer and
in Settings, and is uninstalled like any app. *Add to Home screen* makes a plain shortcut
— an icon and an address, nothing more. Chrome offers the first only when the page comes
from a proper address with a valid certificate.

Either way, **no program is installed outside the browser.** There is no background
process, no new permission, and nothing that runs when you are not looking. What you gain
is an icon, a window without an address bar, and the offline behaviour described below.

One consequence worth knowing: **the icon is a pin stuck into an address.** If the app
ever moves, the old icon quietly stops working and has to be replaced.

## Without a signal

The app opens, the reference and the general rules are there, the camera works, the frame
works. **Reading a sign does not** — that is the call to the model, and it needs the
network. The app says so on screen instead of failing quietly.

This works because a small piece of the app, called a service worker, is kept by the
browser alongside the page and decides where each thing comes from. It keeps the shell on
your phone. It never keeps a sign reading: a cached answer would be yesterday's answer
handed to you as today's, and at a sign you could not tell the difference.

## Updates

When the author publishes a change, you get it **the next time you open the app** with a
signal. The page itself is always fetched fresh when the network allows, so there is no
version to get stuck on; the heavy parts come off your phone unless they actually changed.
Nothing to accept, no reinstall, your key untouched. With no signal you keep using what
you have until there is one.

## What is stored on your phone, and how much

The whole app is about 355 KB of files. The saved key, provider address and model names
add well under a kilobyte. **Nothing else is ever stored: not a photograph, not a reading,
no history.** Under half a megabyte in total — smaller than one photo from your camera.

It lives inside the browser's storage for the app's address. It is not in Downloads, not
visible to a file manager, and cannot be opened by anything but the browser. You can see
that it exists in Settings, under the app's storage, or in the browser's site settings.

What never reaches your phone at all: the project's tests, the harness that proves the
browser and the original Python agree, the accuracy measurement, the Python itself, and
the sources behind the reference. The published app is eight files — the page, one script,
one stylesheet, three icons, the manifest, and the service worker.

## Clearing data, and uninstalling properly

Nothing you delete can harm you. The worst case is retyping your key and needing a signal
once.

| You clear | What happens |
|---|---|
| Cookies | Nothing. The app does not use any |
| Browser cache | The offline copy may go. Still works online, and fetches itself again |
| **Site data for the app's address** | The saved key, provider address and model names go, and the offline copy with them. The app still opens, and asks again |
| All browser data, or the browser itself | The installed app goes too |

The trap is the wording on Android: **"Clear cookies and site data"** sounds harmless but
is the third row. If the app suddenly asks for your key again, that is why, and nothing is
broken.

To remove it properly, do both halves — taking away the icon does not take away what is
stored:

- **Android, installed:** long-press the icon, App info, Uninstall. Then, to be thorough,
  the browser's site settings for the address, Delete data.
- **Android, shortcut only:** long-press the icon, Remove. The stored data stays under the
  browser until you delete it in site settings.
- **iPhone:** long-press the icon, Remove App, Delete App — that takes its data with it.

If you only want the key gone, nothing needs uninstalling: **Forget the key** in the Your
key panel does exactly that.

**Cleaner and antivirus apps.** Nothing here trips the warnings phones give to sideloaded
software: on Android the installed package is generated and signed by Google's own
servers, and registered as installed by the browser. The realistic annoyance is the
opposite kind of tool — a cleaner that clears browser storage takes the offline copy and
the saved key with it.

## Why it has to live at an address

The obvious idea — send the files to a friend over a messenger — does not work, and the
reason is worth understanding, because it is the same reason the app is safe to open.

**Browsers decide what code may do by where it came from.** Code that arrived from an
address on the internet is treated as a site. The same code sitting in a downloads folder
is treated as a file someone sent you, and a file gets almost nothing: no camera, no home
screen icon, no memory of your key, no offline copy. That is deliberate. If a file arriving
in a messenger could open your camera and keep secrets on your phone, messengers would be
a marvellous way to attack people.

So the files have to sit at an address. **That is all "hosting" means here: a place that
hands out the same few files to whoever asks for them.** It does not read signs, does not
see photographs, does not hold keys, and does not know what anyone did with the app. It is
a shelf, not a service. Every visitor receives an identical copy, and the work happens
afterwards, on their phone.

Which shelf is still an open question for this project.

## Trust, and what could go wrong

Taking the real risks one at a time, since the honest answers are short:

- **Someone on the same wifi** cannot read your key and cannot alter the app. The
  connection is encrypted both when the app is delivered and when it calls your provider.
  That is what the padlock is actually for.
- **Another website** cannot touch it. A saved key can be read only by the app's own
  address.
- **A third-party script inside the app.** There is none: no analytics, no advertising, no
  code loaded from anyone else's server. Every file is the project's own. This is the most
  common way web apps are compromised, and the door is simply absent.
- **Whoever can publish to the address** can change what you run. This is the real one, and
  it is not a code problem but an account problem: it rests on the author's hosting account
  being properly protected.
- **A malicious browser extension, or a compromised phone,** can read anything on any page,
  this one included. True of your bank as well; outside anyone's control but yours.

Two structural things reduce the exposure. The provider address is a field **you** fill in,
so the app has no hidden destination that could be quietly repointed. And there are no
accounts, no logs and no stored photographs anywhere, so there is no pile of anyone's data
to lose.

What the author cannot do, and will not pretend otherwise: see how you used it, recover
anything for you, or revoke a key. The keys are yours.

## Who is responsible for the parking decision

You are. ParkRead reads a sign and tells you what it states; it is a reading, not a
permission and not advice. It can be wrong — the photograph can be poor, the model can
misread a plate, and a sign can say something the project has not met before. The app is
built to say "the sign does not state this" rather than to guess, and to show how complete
its reading is rather than hide it, but none of that makes it an authority.

Check the sign yourself before you rely on it. A parking fine is not an argument you can
have with a web page.

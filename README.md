# ParkRead Sweden

**Take a photo of a Swedish parking sign and get a plain-English explanation of what it
says:** who may park, when, for how long, and whether you pay.

![The result screen: a timeline of the parking window from the chosen time, with free and paid periods and a special permit required; who can park here; and what was read, plate by plate, beside the photo of the sign](images/readme-main.png)

ParkRead Sweden **never says "you may park here"**. It tells you what the sign states, shows how
sure it is, and refuses to answer when the photo is not good enough. The decision stays
with you.

---

## Screenshots

| | | |
|---|---|---|
| ![Taking a photo of a sign](images/screenshots/01-take-photo.png) | ![Picking the sign in the photo](images/screenshots/02-pick-sign.png) | ![A paid stretch with a time limit, on a timeline](images/screenshots/03-result-paid.png) |
| **Take a photo** — of the whole street if you like | **Pick the sign** — only this part is sent | **Read the answer** — plate by plate, and when you pay |
| ![A no-parking zone with rented spaces excepted](images/screenshots/04-exception.png) | ![A refusal with its reason](images/screenshots/05-refusal.png) | ![Settings with the provider and key](images/screenshots/06-settings.png) |
| **Exceptions** — for whom the spaces are | **An honest refusal** — and what to do instead | **Your own key** — no account, no server |

---

## The problem

In Sweden you may park on a street with no signs, for at most 24 hours in a row on
weekdays. Where there is a sign, it is rarely just a **P**. Under it hangs a stack of
small plates, and each one changes the rule: paid hours, a time limit, a parking disc, a
cleaning day, residents only, a permit, an arrow saying which part of the kerb is meant.

![Three stacks of Swedish parking signs with different plates under the same P sign](images/ParkingSignExample.png)

Reading such a stack correctly is hard, even for Swedes, and harder still for visitors
who do not read Swedish. Three things make it tricky:

- **How the text is split into plates changes the rule.** The same three words give two
  different rules:

  ```
  Two plates:                      One plate:
    [ 2 tim ]                        [ 2 tim   ]
    [ Avgift 8-18 ]                  [ Avgift  ]
                                     [ 8-18    ]

  - max 2 hours, at any time       - between 8 and 18: max 2 hours, and you pay
  - pay between 8 and 18           - outside those hours: no limit from the sign
  ```

- **The way digits are printed says which days.** `8-18` means weekdays, `(8-15)` in
  brackets means Saturdays and days before a holiday, and red digits mean Sundays and
  holidays.
- **What the sign leaves out still matters.** When a ban's hours are over and the sign
  says nothing more, the general traffic rules apply — for example the 24-hour limit.

A mistake costs a parking fine or a towed car. ParkRead Sweden reads the whole stack, applies
the rules, and shows the result as a timeline.

---

## How to use it

ParkRead Sweden is a web page — no app store, no account. *(It is not published yet; the plan
is to host it on Cloudflare Pages.)*

1. **Open the page** in your phone's browser. You can add it to your home screen to use it
   like an app.
2. **Enter your AI key once** in **Settings** — see [Your key and your photo](#your-key-and-your-photo).
3. **Take a photo** of the sign, or choose one from your gallery.
4. **Pick the sign** in the photo. Only that part is sent to be read.
5. **Choose when you want to park** — now, or another day and time — and read the answer.

---

## What you see

- **Your parking window** — a timeline from the time you chose: when parking is free,
  paid or forbidden, and when your stay ends. A solid line means open to everyone and read
  in full; a dashed one means forbidden, not certain, or for some people only. Where
  arrows split the sign, each side gets its own timeline.
- **Who can park here** — everyone, residents, permit holders, rented spaces, and so on.
- **What we read** — your photo next to a copy of the sign, plate by plate, each with its
  Swedish text and a plain explanation. Plates that are not parking rules — an operator's
  name, a payment board — are labelled so, and nothing is silently left out.
- **How sure** — green: the whole sign was read; amber: an answer with a caveat; red: no
  answer.

Every sentence describes **the sign**, never you: "the sign allows 2 hours", not "you may
stay 2 hours".

### It refuses on purpose

When the photo does not support an answer, ParkRead Sweden says so instead of guessing: a plate
it cannot read, a main sign it cannot make out, a photo too small for the text on it, or
something that is not a parking sign at all. It still shows what it could read, says
what went wrong, and asks for another photo. A refusal is safer than a wrong answer that
looks right.

---

## How it works

1. **A quick check.** One cheap AI call answers a single question: is this a Swedish
   parking sign, another road sign, or not a sign at all? If it is not a parking sign, the
   app stops there and says what it sees.
2. **The AI reads the sign.** A second call writes down what is on it — the main sign,
   every plate from top to bottom, its exact words, its colour, whether it could be read —
   in a fixed format. The AI only describes; it decides nothing.
3. **The app's own code works out the rules.** It combines the plates, applies the
   Swedish calendar and public holidays, splits the sign by its arrows, and computes what
   applies at the time you chose. It also decides how sure the answer is, and whether to
   refuse.
4. **The app explains it** with a built-in dictionary of Swedish signs (56 sign entries).
   Wording the dictionary does not know is shown exactly as printed, marked "not
   interpreted", and never guessed at.

**General rules.** Some rules apply without being on the sign — the 24-hour limit, no
parking near a junction or a crossing, and the like. ParkRead Sweden keeps
12 short notes about rules like these, shown behind a "show" link and clearly marked
"not on this sign". They never change the answer, with one exception: when a ban's hours
end and the sign says nothing more, the timeline follows the 24-hour limit, and says that
this part comes from the general rules, not from the sign.

---

## Your key and your photo

**You bring your own key.** ParkRead Sweden has no server and no account. In **Settings** you
enter your AI provider's address, the model name and your key. Without them the app opens
and explains itself, but cannot read a sign. Each sign costs two AI calls, billed to you
by your provider. The key is kept only while the tab is open, unless you tick **Remember
on this device**; **Forget key** erases it at once.

**Your photo goes to your provider and nowhere else.** Only the part around the sign is
sent. There is no server of ours and no history: nothing is stored except the app itself
and your saved key.

**Offline**, the app opens, but reading a sign needs the internet — and it says so rather
than failing quietly. Updates arrive the next time you open it online.

**Uninstalling:** remove the icon *and* clear the site data for the address — on Android
in the browser's site settings, on iPhone with **Remove App**, which takes its data with it.

**The parking decision is yours.** ParkRead Sweden reads a sign and tells you what it states. It
is a reading aid, not permission and not advice. Check the sign yourself before relying
on it.

---

## How well it works

We keep a set of 139 test photos, 127 of them real parking signs with answers checked by
hand. On the latest run, **the app's answer matched the checked answer on 116 of the 127**.
Of the 11 it got wrong, 9 were marked as uncertain, so the reader was warned. Signs that
nobody could read were refused, as they should be, and no real sign was mistaken for
something else.

The photos themselves are not published — some are Street View images, and some show
number plates. The checked answers and the AI's saved readings are in `testset/`.

---

## Known limits

- **Sweden only.** A foreign sign would still be read by Swedish rules.
- **One sign per photo.** If two sign posts are in the photo, only one is read.
- **Dates 2026–2030.** The holiday calendar covers these years; other dates cannot be
  chosen.
- **Date parking** (no parking on odd or even dates) — the app cannot yet tell which dates,
  so it treats the ban as applying every day: stricter than the sign.
- **Residents' parking** is shown but not computed: residents' terms are agreed locally
  and differ from building to building.
- **Local wording.** Municipalities write their own plate texts. Unknown wording is shown
  as printed and lowers how sure the app is.
- **No conversation.** One photo, one answer — no chat, no follow-up questions.
- **iPhone is untested.** Installing and the camera should work in Safari; that is not a
  claim that they do.

---

## Running it yourself

You need Node 20 or newer. There is no server: the whole app runs in the browser.

```powershell
cd web
npm ci                 # install
npm run dev            # start it locally (https, so the camera works)
npm run dev:lan        # the same, reachable from a phone on your Wi-Fi
npm run build          # build it into web/dist
npm run preview        # see the built version
```

With `npm run dev:lan`, open the "Network" address it prints on a phone on the same
Wi-Fi. The browser warns once about the certificate; the camera needs https. Avoid this
on public Wi-Fi: the page is visible to the whole network while it runs.

To publish, copy `web/dist` to any static host, such as Cloudflare Pages. It works from
the root of a domain or from a subfolder.

### Commands for development

| Command | What it does | When to use it |
|---|---|---|
| `npm test` | runs all the automated tests | after any change |
| `npm run test:build` | builds the app and checks the result | before publishing |
| `npm run emit` | copies the sign dictionary, the data format and the AI instructions into the app | after editing anything in `reference/`, `schema/` or `prompts/` |
| `npm run goldens` | checks the saved snapshots of the app's output (in `parity/`) | after a code change; `npm run goldens:write` updates them when a change is intended — then review the difference |
| `npm run measure` | scores the app on the test photos | after changing how signs are read or judged |
| `npm run ask` | asks the AI again about test photos, and saves its answers | when the AI instructions change — costs money, needs your key in `.env` and the photos |
| `npm run photos` | updates the list of test photos | after adding or renaming a test photo |

`npm run ask` is the only command that uses `.env` — see `.env.example` for its three
fields. Any provider that speaks the OpenAI-compatible format works (Google, Mistral,
OpenRouter); ParkRead Sweden was developed with Google's `gemini-3.5-flash-lite`.

---

## Stack and layout

TypeScript · React 19 · Vite · Tailwind · Vitest · JSON Schema · an external AI model
reached with the reader's own key. No backend, no database, no secrets in the build.

```
web/
  src/
    App.tsx          the screen and its state
    components/      one component per part of the screen
    lib/
      pipeline.ts      the steps above, in order
      vision.ts        the two AI calls
      validation.ts    checks and fixes the AI's answer
      engine.ts        the rules: works out what applies when — no AI, no clock
      calendar.ts      weekdays, Saturdays, Sundays and public holidays
      completeness.ts  how complete the reading is, and how sure the answer
      present.ts       the answer in the words the reader sees
      reference.ts     the sign dictionary
      settings.ts      your key and provider, kept in the browser
    sw.ts            works offline
  tools/           the development commands above
reference/       the sign dictionary and the general-rules notes, one plain-text file each
schema/          the exact format the AI must answer in
prompts/         the instructions given to the AI
testset/         the test photos' checked answers and the AI's saved readings
parity/          saved snapshots of the app's output, for the tests
images/          the pictures in this README
```

The rules never depend on the screen, and the screen never depends on the AI provider.
`AGENT_SPEC.md` describes what the AI is allowed to do inside the app, and `design.md`
how the screens are built.

---

## License

MIT License

Copyright (c) 2026 Petr Agulin

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

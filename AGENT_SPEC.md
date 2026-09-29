# AGENT_SPEC — the AI assistant that reads a parking sign

## Role

A consulting assistant that reads a Swedish parking sign and explains what it states.

## Goal

Give the user an understandable reading of the sign with an honest measure of confidence —
or say plainly that there is not enough to go on.

**The assistant does not rule on whether parking is allowed.** It extracts data; the code
explains it. Evaluating the rules against a moment in time is done by a deterministic
function outside the model. The product offers no legal or financial guarantee.

---

## The tools the model is given

**None.** The list is empty, and that is a decision rather than an omission.

The assistant is a **fixed pipeline**. The stages run in a set order, and that order is
written in code the model cannot influence. The model is called **twice** — once to triage,
once to extract — and on each call it can read nothing, write nothing, and request nothing:
an image goes in, a label or JSON comes out.

There is one exception to "twice", and it is also decided by code: if the extraction comes
back saying too little — the main sign unknown or unreadable, a plate unreadable, or fewer
than half the plates read — the same question is asked **once more**, and never in a loop. The second answer is
kept only if it is better. So a single photograph costs two calls, or three at most.

Those are questions, not attempts. When the provider is busy or does not answer, the same
request is repeated by code within a budget of one minute per call; a call that still fails
ends the reading with a plain message about what went wrong — never with a guessed answer.

**Two calls do not create a branch the model controls.** Triage returns the **value of a
field**, not a decision; whether the pipeline continues is decided by an `if` written by the
developer.

| Stage | What happens | Who does it |
|---|---|---|
| 0. `classifyImage` | One cheap model call. Returns a label: Swedish parking sign / another road sign / not a sign. It also reports how many panels it sees below the main sign, which is used later as an independent check. The threshold leans towards letting things through: discarding a real sign costs more than admitting rubbish | Model, no tools |
| 1. `extractSignData` | One vision call. Returns JSON: the main sign — with its background colour and kind — and an ordered top-to-bottom list of **the panels below it, which never includes the main sign itself**, with the boundaries between them. For each panel: its kind — `sign_plate` (a plate that states a rule; only these reach the engine), `operator_plate` (an operator's name and telephone), `info_board` (a payment board, not a road sign at all) or `other_sign` (another road sign on the same post) — its text line by line, its legibility, and the parsed fields: time windows, fee windows, maximum duration, permit requirements, day class, arrows | Model, no tools |
| 2. `validation.ts` | Checks the JSON against the schema and corrects the model's known slips, recording each correction (see below). A reading that still fails the schema goes no further | Code |
| 3. `recognise` | Checks every plate against the reference whitelist. What the reference does not know stays verbatim, marked uninterpreted, and does not enter the computation | Code |
| 4. `evaluateParkingRules` | A pure function. Assembles the result: the base regime from the main sign, composition by "var för sig / gemensamt", division into stretches by arrows, conditions of eligibility and place, completion by the weekly calendar, day class. Returns a **list of regimes**, each with its own periods | Code |
| 5. `grade` → `applyAsymmetry` → `toJson` | Decides how complete the reading is (full / partial / insufficient / not a parking sign), computes the final confidence, applies the asymmetry rule, and assembles the explanation from the reference by key — or a refusal | Code |

**Why no tool-calling.** A tool the model may invoke at its own discretion is a branch the
model controls. Here there are no branches at all: the pipeline is the same on every
request. Having no tools makes "the model performs no actions" checkable in the code rather
than declared in an instruction. The reference is read by code after extraction, never by
the model while it reasons.

Neither the model nor any stage has arbitrary access to the file system, the network, a
shell, or SQL.

---

## The schema — the contract with the code

Two JSON Schemas (draft 2020-12), one per model call: `schema/triage.schema.json` (the
triage label: parking sign, another sign, or not a sign) and `schema/sign.schema.json`
(the main sign and the panels below it). The reference reading of every photograph in
`testset/expected/` follows the same schema and must pass validation.

**The list is closed.** Every object carries `additionalProperties: false`: the model fills
in only the listed fields, and anything else is rejected by validation instead of seeping
into the engine. The one outlet is `notes` — free text that enters neither the computation
nor the confidence, so that an observation with no field of its own stays visible when
errors are examined.

**Two layers per panel.** `lines` is the verbatim Swedish text, line by line, with brackets
and hyphens as on the sign; `parsed` is what the model assigned to known categories.
Meaning is assigned by code from `reference/signs/`, never by the model; each reference
entry's `schema:` field names the schema field it corresponds to.

**Fields that came from the model's first run** rather than from the design — the model
knew these things and wrote them into prose because no field existed:

| Field | Why |
|---|---|
| `panels[].kind` | the model took an operator's payment board for a plate |
| `main_sign.background_color` | colour was extracted for panels but not for the main sign |
| `main_sign.form` | a zone sign reads like an ordinary one, but its type differs |
| `legibility` | the confidence formula needs stickers and cropping as data, not prose |

**Fields the code does not trust.** `boundaries.certain` and `model_confidence` are the
model's own estimate: kept for the measurement, grounds for no decision (see the refusal
policy below). `panel_count` is the model's own count of its panels, and code brings it
into line with the list it wrote. The independent count comes from the other call:
triage reports how many panels it sees below the main sign, and a disagreement with the
extraction is a sign that a boundary was lost.

**Deliberately left out:** the type of land (an owner cannot set a rule against the law, so
the sign means the same either way); a default vehicle class (a lone `P` narrows nothing,
and "car" must not be assumed); any conclusion about the user (`eligibility` names who the
spaces are for, never whether the reader is one of them).

**Checking.** Validation is the project's own code, `web/src/lib/schema.ts`. So that it is
not measured against itself, the tests judge it with an independent validator, `ajv`, on
deliberately broken readings; `ajv` is a development dependency and never reaches the
built page.

### Code corrects the model's known slips

A model repeats some mistakes. Where the right answer is unambiguous, code corrects it
before anything else sees the reading. Every correction is recorded, and a reading that
needed one scores lower (`no_repairs_needed`). Each was found on a real photograph:

- a panel that only repeats the main sign is removed (`010`);
- a plate nobody could read cannot be known to be an operator's plate: it goes back to
  being an unread sign plate, which withholds the answer (`085`);
- a yellow plate with hours under a blue `P` is a ban window, even when the model does
  not say so (`116`);
- a limit printed in days that arrived as the same number of hours is converted (`094`);
- a colour outside the schema's list becomes `other`, and a field the schema does not
  know is dropped rather than trusted.

## Forbidden actions

- Extending permission when the reading is incomplete. An unread panel may be a
  prohibition, so incomplete data may only **narrow** what the sign says. The claim
  "at other times there are no restrictions" is forbidden while a panel is unread
- Filling in rules that are not on the photograph
- Citing regulations that are not in the project's reference
- Claiming a legal or financial guarantee
- Wording addressed to the user rather than to the sign: "parking allowed", "free parking",
  "you may park", "you need to move the car", "prohibited". Every line states something
  about the **sign** ("the sign requires a parking disc, max 2 h"), never about what a
  person may do. The forbidden wordings are listed and checked in
  `web/src/lib/present.test.ts`
- Silently choosing the most likely reading where the data does not settle it: uncertainty
  is shown to the user, not collapsed into a guess
- Mixing wording across plates when **forming** an instruction: by Transportstyrelsen's
  rule the words of a neighbouring plate are not part of an instruction ("var för sig"),
  and only lines within one plate form a single instruction ("gemensamt")
- Answering from one plate alone: the result derives from **all** plates, read top to
  bottom. Neither the first nor the last gives the answer by itself
- Presenting Sweden's general traffic rules as part of the sign's reading: they are shown
  in a separate block, marked "not on this sign"
- Claiming completeness of the subject: the list of Swedish plates is not exhaustive
- Storing the user's photographs
- Answering anything other than the sign in the photograph sent
- Holding a conversation, asking clarifying questions, or accepting text input
- Working out by itself what applies at a given time: that is `evaluateParkingRules`,
  not the model
- Carrying conditions from inside a declared window to the time outside it: outside the
  window the base regime applies, or whatever a scope-shift token named, and code decides
- Concluding whether the user belongs to a category named on the sign ("residents only",
  "permit holders only", "motorcycles only"). The category is named, its regime is shown in
  full, and no conclusion about the person is ever drawn. Answering "you cannot park here"
  for a sign that designates motorcycle spaces substitutes a car for the user, and is
  forbidden like any other verdict

---

## Permitted sources

| Source | Who reads it | Role |
|---|---|---|
| The sign and plate reference (Markdown) | Code, after extraction | Explanations, and the whitelist of what may be interpreted |
| Swedish public holidays — computed in code, window 2026–2030 | Code, in the rules engine | Determining the day class |
| Notes on general rules (Markdown) | Code, when assembling the answer | Reference marked "not from this sign". Never enters the computation |
| The image in the current request | Model, twice at most | The only input to stages 0 and 1 |

**The assistant has no memory between requests:** every photograph is read from scratch.
The product keeps no history of readings — not on the device, not anywhere. Nothing is
written to disk at all. The browser keeps the provider's address and the model's name,
and the key only if the person ticks "Remember on this device".

Everything else is out of bounds. The model's general knowledge of parking in Sweden does
not count as a source and does not reach the answer: the text of the explanation is
assembled by code from the reference.

---

## Refusal policy

**Triage and refusal are different things.** A photograph with no parking sign in it never
reaches the refusal policy: stage 0 stops it, and the answer says not "this could not be
read" but "there is no parking sign in this photograph". What follows is about photographs
that triage let through.

**What withholds an answer is the category, not the confidence number.** The category is
set by *what is missing*:

- **insufficient** — the main sign is unknown or unreadable, a plate that may carry a rule
  is unreadable, fewer than half the plates were read, or the frame was too small to hold
  the text claimed. No reading is offered; the plates that were read are still shown,
  except when the frame was too small, where no word on them is evidence.
- **partial** — a plate came back empty, or was read but not found in the reference, or no
  plate states a parking rule at all. A reading is offered, narrowed by the asymmetry rule.
- **full** — every plate was read and understood.

An answer is produced for **full** and **partial**, and withheld for **insufficient** and
**not a parking sign**.

**What the confidence threshold actually does.** `GOOD_ENOUGH` (0.9, in `present.ts`,
chosen by measurement and not by eye) decides the **tone** of the result on screen: a full
reading at or above it reads as settled, and anything else carries a note of caution. It
does not gate whether an answer appears. The number works inside the category, not instead
of it.

**The category is the only gate.** Three things that could look like reasons to withhold
an answer are handled otherwise, by measurement and by design:

- **The boundary between plates.** Whether this is one plate or two decides whether
  instructions apply jointly or separately — the same words yield different rules — so the
  boundary is checked. It is not taken from the model's say-so: on photograph `013` two
  plates were merged into one while the model reported the boundaries as certain. The
  independent signal is the panel count from the triage call. A disagreement lowers the
  confidence and is named among the reasons, but does not withhold the answer: measured
  over 22 answers it fired five times, and all five were false alarms.
- **A plate read but not understood** — an unrecognised scope-shift token like `Övrig tid`,
  say. The plate is shown verbatim as uninterpreted, the reading is partial, and the
  asymmetry rule narrows the rest.
- **A reading that contradicts itself in a known way.** Code corrects it (see "Code
  corrects the model's known slips" above) and records the correction.

Where an answer is withheld, the assistant returns what it did recognise, says what is
missing, and makes a specific request — come closer, photograph the whole stack, try better
light. A refusal is a normal outcome of reading, and must not look like a fault in the
application.

### Confidence is computed by code

The estimate a vision model returns is poorly calibrated: it is confidently wrong, and its
number cannot carry a safeguard. The final confidence is assembled from eleven signals the
code owns, with weights calibrated by measurement (`npm run measure`):

| Signal | Weight | What it asks |
|---|---|---|
| `panels_read_share` | 0.20 | what fraction of the plates was read |
| `main_sign_identified` | 0.15 | is the sign at the top of the pole known |
| `main_sign_readable` | 0.10 | was it legible |
| `plates_interpreted` | 0.10 | was every plate found in the reference |
| `panel_count_agreement` | 0.10 | does the extraction agree with the count triage saw |
| `main_sign_corroborated` | 0.10 | does any plate state a parking rule, or does the whole reading rest on the symbol alone |
| `text_fits_the_pixels` | 0.10 | could a frame this size hold the text claimed |
| `no_repairs_needed` | 0.05 | did the answer need repairing to fit the schema |
| `day_class_known` | 0.05 | is the date inside the holiday calendar |
| `model_confidence` | 0.05 | the model's own estimate — one input among eleven |
| `schema_valid` | 0.00 | carries no weight by design: a reading that fails the schema never reaches the formula |

`text_fits_the_pixels` is the product measuring rather than asking: how many pixels a
photograph has is a fact, not an opinion. The area is taken by the pipeline from the
photograph it was handed, so the running application scores it exactly as the measurement
that calibrated the threshold does.

---

## Behaviour when data is missing

**The assistant asks no clarifying questions.** The exchange is one step: one photograph,
one answer. When something is missing there are exactly two outcomes:

1. **A partial reading** — if what is missing is a secondary detail. The part that was read
   is shown, what is missing is named plainly, confidence is lower.
2. **A refusal** — if what is missing bears on the main rule. What was recognised is shown,
   with a specific request to retake the photograph.

An unreadable plate is not a secondary detail. It names no rule, so nothing says it does not
matter — a red line on a time plate turns a Sunday round — and the reading is refused. A
payment board or another road sign is known by its look, and an unreadable one refuses
nothing.

**The asymmetry rule governs a partial reading: narrowing is allowed, widening is not.** If
a panel that came back empty could be a prohibition — its background yellow, or its colour unreadable,
since prohibition signs in Sweden are yellow — then no period is presented as permitting.
Otherwise a period with no conditions is marked, because "at other times there are no
restrictions" would be a claim founded on absent data.

A separate case is an **unknown day class** (a date outside the holiday calendar, which
covers 2026–2030). A stretch that would otherwise be allowed is marked uncertain, and the
reason is named; it is never presented as allowed. A prohibition stays a prohibition.

Dialogue is deliberately outside the MVP: it adds session state and a second turn without
improving the reading.

---

## How it is checked that the assistant stays within bounds

| Boundary | How it is secured |
|---|---|
| Actions by the model | The model has no tools at all; an image goes in, a label or JSON comes out. Checked in the code, not in an instruction |
| Branching | The pipeline is fixed: its stages run in an unchanging order, and the model does not affect the order. The one repeat of extraction is triggered by code, capped at one, and recorded in the flags |
| Arithmetic over time | Moved into `evaluateParkingRules`, a pure function; the result is reproducible and covered by tests |
| Composition | Transportstyrelsen's own rule is implemented: several plates are each a separate instruction to the sign, several lines on one plate are a single joint instruction. Covered by tests on both official examples — identical words, different grouping |
| Plate boundaries | Extracted as data alongside the text; a doubtful boundary lowers the confidence and is named, never assumed away. Redrawing the sign on screen makes the grouping visible to the user |
| Checking the boundary itself | Not taken from the model's own claim: on `013` two merged plates came with `boundaries.certain: true`. The panel count is asked for in the other call and compared; a disagreement lowers the confidence and is named |
| The main sign inside the panel list | The model once duplicated it as a first, textless panel. The prompt forbids it, and code enforces it: such a panel is removed, and the correction recorded |
| Known slips of the model | Corrected in code where the right answer is unambiguous, each correction recorded; a corrected reading scores lower. Each rule was found on a real photograph |
| A failing provider | Repeats are decided by code, within a minute per call; a call that still fails ends in a plain message, never a guessed answer |
| The 24-hour rule | The default for a sign with no duration plate is computed by code: the driver is owed 24 hours in a row on working days, and if a weekend or holiday cuts them short, the 24 hours start afresh on the next working day. A duration plate overrides the default — a separate conflict rule with its own test |
| Computing `Övrig tid` | Completion by the weekly calendar, accounting for day classes and holidays, is done in code: subtracting a set of intervals from a week is not something the model can do reliably |
| Priority of prohibition | A prohibition plate (a street-cleaning day, say) overrides permitting instructions on its window. The conflict rule is code and has its own test: suggesting parking on a cleaning day is the product's most expensive mistake |
| The source of facts | The explanation is assembled by code from the reference; the model's free text never reaches the answer |
| The boundary of knowledge | The whitelist: what is not in the reference is shown verbatim as uninterpreted and does not enter the computation |
| The wording of the answer | Text is assembled by code from the reference, so a caption such as "parking allowed" cannot physically arrive from the model. The vocabulary is checked by a test for forbidden patterns |
| Ambiguity | "Uncertain" is a state of the result, not a reason to pick a variant. It arises for reasons code can check: an unknown day class or a date outside the calendar, an unknown main sign, a 24-hour limit that runs past the calendar |
| General rules | Kept separately, marked in the answer, and never part of the computation |
| Withholding an answer | Decided by category before the answer is formed; the confidence number sets the tone, not the gate |
| Bad photographs | A set of test scenarios with deliberately unusable photographs: darkness, cropping, no sign, glare |
| Reproducibility | Saved model answers in `testset/answers/`: the same input gives the same output, so behaviour is checked by regression rather than by a single impression. The measurement runs on them without a key |
| The user's photographs | Never saved anywhere |

**The principle all of this follows from:** a rule left as a request in the model's
instructions is followed some of the time. A rule moved into code is followed always. So
the instructions keep tone and wording, while everything with a consequence — the
confidence threshold, the arithmetic over time, the composition of plates, the boundary of
the reference — lives in code.

# The schema — the contract between the model and the code

Two schemas, one per model call. Both are JSON Schema (draft 2020-12).

| File | Stage | What it describes |
|---|---|---|
| `triage.schema.json` | 0 — triage | the label: parking sign / another sign / not a sign |
| `sign.schema.json` | 1 — extraction | the structure of the sign: the main sign and the panels below it |
| `testset/expected/` | — | the reference reading of every photograph in the set |

## The essential property: the list is closed

`additionalProperties: false` stands on every object. The model fills in **only** the
fields listed; anything with no place in the schema is rejected by validation rather than
seeping into the engine.

The one outlet is `notes`: free text that does **not** enter the computation or the
confidence formula. It exists so that an observation with no field of its own is visible
when errors are examined instead of being lost silently. A probe showed that without such a
field the model writes what matters into prose, where it disappears.

## Two layers for each panel

- `lines` — the **verbatim** Swedish text, line by line, with brackets and hyphens as on
  the sign;
- `parsed` — what the model assigned to known categories.

Meaning is assigned by **code**: whether something is a gate, a note or a rule is decided
from the reference in `reference/signs/`, not by the model. The `schema:` field in each
reference entry records which schema field that entry corresponds to.

## Fields that came out of probing the model

Four fields were added from the result of a run (`testset/PROBE_LOG.md`) rather than from
the design: the model knew these things and was writing them into free text because no
field existed.

| Field | Why |
|---|---|
| `panels[].kind` | the model took an operator's payment board for a plate |
| `main_sign.background_color` | colour was extracted for panels but not for the main sign |
| `main_sign.form` | a zone sign reads like an ordinary one, but its type differs |
| `legibility` | stickers and cropping are needed by the confidence formula, and prose is not |

## Fields the code does not trust

`boundaries.certain` and `model_confidence` are the **model's own estimate**. They are kept
for the measurement and are grounds for no decision at all: on photograph `013` the model
merged two plates into one while reporting full certainty.

Separately, `panel_count` deliberately duplicates the length of `panels`: a disagreement
between them is an independent signal that a boundary was lost, and it cannot be obtained
from the list itself.

## What the schema deliberately leaves out

- **the type of land** — an owner cannot introduce a rule against the law, so the sign means
  the same thing either way;
- **a default vehicle class** — a lone `P` narrows nothing, and "car" must not be
  substituted. The `vehicle_class` field appears only where the sign genuinely narrows;
- **any conclusion about the user** — `eligibility` names who the spaces are designated for,
  and never answers whether the reader is one of them.

## Checking

Validation is done by the project's own code, `web/src/lib/schema.ts`: pulling a library
into the page for one check costs more than writing it. So that the check is not measured
against itself, the tests judge it with an independent validator, `ajv`, on deliberately
broken readings. `ajv` is a development dependency and never reaches the built page.

Every reference reading in `testset/expected/` must pass validation. Those files are also
the single source of the reference markings: the same data once lived in `schema/examples/`
as well, and two copies of one thing would inevitably have drifted apart.

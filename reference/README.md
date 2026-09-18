# Reference — and the boundary of competence

Three folders, and they do not mix.

| Folder | What is inside | Enters the computation |
|---|---|---|
| `signs/` | meanings of signs and plates, 50 entries | yes — this is the **whitelist** |
| `general_rules/` | rules that are not written on the sign, 11 notes | **never** |
| `sources/` | working notes on the source material | no |

## `signs/` — the whitelist

One file per entry; the file name is the key. Whatever is not in this folder the
product **does not interpret**: it shows the wording verbatim and lowers the
confidence. That is not a gap but a declared boundary — no exhaustive list of Swedish
plates exists, and their wording is set by each municipality.

### File format

```
---
key: avgift
tokens: Avgift
category: rule
label: Fee
code: T16
schema: parsed.fee=true
en: The sign requires payment for parking during this period
short: Parking is not free
source: Transportstyrelsen, «Stanna och parkera»
---

A human explanation.
```

The header between `---` is plain `key: value` pairs, parsed by ten lines of code with
no external dependency. The body is Markdown for a person to read — it is written in
Russian, for the developer, and never reaches the interface. What the reader sees is
the `en` field.

| Field | Why it exists |
|---|---|
| `key` | how the entry is looked up; must match the file name |
| `tokens` | what is written on the sign |
| `category` | `main_sign` · `rule` · `info` · `not_interpreted` |
| `schema` | which field of `schema/sign.schema.json` this corresponds to |
| `en` | **the interface text itself**: the interface is in English |
| `short` | the same meaning in a few words, for tight places |
| `label` | the name shown on screen |
| `code` | the official sign code, shown in brackets after the label |
| `source` | where the meaning was taken from |

### The `en` field is not decoration

The answer is assembled by code **out of these strings**, which is why a forbidden
phrasing cannot physically arrive from the model's response. Every line states
something about the **sign**, never about the reader: "The sign designates these
spaces for motorcycles", but never "you cannot park here". A test checks the
forbidden patterns.

### Categories

- **`main_sign`** — the top panel, 7 entries. Two of them are wayfinding signs that
  permit no parking at all: they are easy to mistake for `P`.
- **`rule`** — sets a rule and reaches the engine. 35 entries, the bulk of the folder.
- **`info`** — recognised and explained, but sets no rule and does **not** lower the
  confidence: an operator's board, `Boende`, a payment terminal.
- **`not_interpreted`** — read and shown verbatim, but the product assigns it no
  meaning: a tariff number, a zone code.

## `general_rules/` — reference, not engine rules

Distances from a junction, where stopping is forbidden, what counts as parking, who
may not park under a plain `P`. Every file carries the note "**this is not on the
sign** — check it yourself", and that note is required: mixing these rules into the
reading of a sign would mean going back to issuing a verdict.

## `sources/`

`SIGNS_CATALOGUE.md` — sign meanings from the Transportstyrelsen brochure "Stanna och
parkera", the main source for `signs/`. `RULES_SOURCE.md` — general rules from the
`Körkortsboken` textbook, the main source for `general_rules/`. `SIGNS_FROM_RULES.md`
holds the working notes taken from that second reading. Where the first two disagree,
the catalogue wins: it rests on the regulator's own publication.

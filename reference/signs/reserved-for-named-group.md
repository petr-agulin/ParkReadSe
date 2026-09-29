---
key: reserved-for-named-group
tokens: Vaktmästare, Verksamhet, Personal, Regionservice, Blodbil
category: rule
label: Text panel
code: T22
schema: —
en: The sign designates these spaces for a named group
short: For a named group
source: Transportstyrelsen, «Stanna och parkera»
---

The spaces are set aside for a named group: the caretaker (`Vaktmästare`, photograph
`066`), the tenant of the premises (`Verksamhet`, `067`), staff (`Personal`, `069`), a
regional service (`Regionservice`, `070`), a blood transport vehicle (`Blodbil`, `072`).

**One entry for the whole pattern, not a file per word.** The rule is the same for all:
the group is narrowed, the permission follows the written word, and otherwise the sign's
ordinary rules apply. A new word costs a line in `tokens`, not a new file and a new rule.
§8 of `AGENTS.md` promises that no exhaustive catalogue of Swedish plates is being
collected, and a file per word would be exactly that (decision 159).

**It is a caption to the regime, not a check** — like `besokande`. The product names the
group and shows the regime in full; whether the reader belongs to it is for the reader to
decide. The word itself stays on screen verbatim: the product does not translate
`Blodbil` and does not claim to know who `Verksamhet` are in this building.

**There is no schema field** — hence `schema: —`. In the schema such a plate arrives as
`eligibility: custom`, that is, "nothing on the list fitted", and by the value of the
field it cannot be told from any other plate that did not fit. So the entry is
recognised **by its text**, like `privat-parkering`: the list of words lives in `BY_TEXT`
in `web/src/lib/reference.ts`, and a test keeps it in agreement with the `tokens:` header
of this entry.

The permit (`Tillstånd erfordras`, `Giltigt P-tillstånd erfordras`) is a separate plate
with its own field, `permit_required`; on `066`, `067` and `069` it stands alongside, but
it has nothing to do with the group: this plate names the group, and that one says how
membership is proved.

---
key: operator-plate
tokens: the operator's name and phone number
category: no_rule
label: Operator plate
schema: parsed.operator
en: The sign names the parking operator
short: Names the parking operator
source: Transportstyrelsen, «Stanna och parkera»
---

**It never reaches the answer the user sees.** In form it is a proper additional plate,
but it sets no rules: an operator's name and phone number answer none of the questions a
person photographs a sign for — may I park here, is there a fee, for how long, for whom.

It is extracted and marked by its panel kind (`operator_plate`), so that it does not
silently drop out of the panel count. After that it is discarded: it does not enter the
engine, does not lower the confidence and is not shown on screen.

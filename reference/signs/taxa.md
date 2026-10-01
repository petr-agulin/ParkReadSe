---
key: taxa
tokens: Taxa 3, Taxa 13, Röd taxa
category: info
label: Fee
code: T16
schema: parsed.tariff_code
en: The sign states a municipal tariff number
short: Municipal tariff number
source: the developer's own reading of the test photographs
---

The tariff number. It is set by the municipality and means different things in different
towns, so the product **does not interpret** it: it shows it verbatim and does not lower
the confidence.

A tariff may be named by its colour instead of a number - `Röd taxa` (`088`). The model
does not always put that in `tariff_code`, so the word `taxa` is also matched on the
plate's own text.

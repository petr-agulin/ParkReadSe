---
key: datumintervall
tokens: Augusti-Juni, 1 nov-15 maj, Gäller ej 1 juli - 31 juli, 15/6 15/8
category: rule
label: Dates
code: T6
schema: parsed.time_windows[].dates
en: The stated hours apply only on the dates given
short: Only on the dates stated
source: Transportstyrelsen, «Stanna och parkera»
---

# Date ranges

Dates that limit a window. Plates write them in two ways, and both mean the same limit,
seen from opposite sides:

- **a season** — `1 nov-15 maj`, `Augusti-Juni`: the window applies only on those days;
- **an exception** — `Gäller ej 1 juli - 31 juli`, `Gäller ej 15/6 15/8`: the window
  applies always, except on those days.

**A range is given as a day and a month, with no year.** A plate is put up once and
applies every year, so there is no year in the record, and there must not be.

**A range can run over the end of the year.** `1 nov-15 maj` is winter, and the first
number being larger than the second is no mistake. There is no other way to express a
winter season.

**A single day is a range whose start equals its end.** Photograph `036` reads
`Gäller ej 15/6 15/8` with no dash, and the developer read it as two separate days, not as
the summer. The form of the record is the same, and it can hold either reading.

## Why not month numbers

The first version kept the numbers of whole months. Photograph `034` showed the limit of
that form: `1 nov-15 maj` was rounded out to the whole of November and May, and added
**two weeks of prohibition that are not on the sign**. A mistake on the strict side, but a
mistake all the same: the product would report a prohibition where parking is allowed.

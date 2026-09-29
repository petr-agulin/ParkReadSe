---
key: twenty-four-hours
category: general_rule
en: On weekdays, park for at most 24 hours in a row in the same place
source: Transportstyrelsen, «Stanna och parkera»
---

# The 24-hour rule

> A general traffic rule. **It is not on the sign.** Unlike the other notes, the engine does compute this rule itself — in code, not from this note: this is only an explanation of where the end of a stay on the screen comes from.

"På vardagar (utom vardag före sön- och helgdag) får du parkera högst 24 timmar i en
följd" — on weekdays, except the day before a Sunday or a public holiday, you may park in
one place for at most 24 hours in a row. Weekends and holidays do not count, and the
counter starts afresh on the nearest working day (decision 82):

| Parked | Collect by |
|---|---|
| Monday 13:00 | Tuesday 13:00 |
| Friday 13:00 | Tuesday 00:00 — only 11 hours were left before Saturday, not 24 |
| Saturday or Sunday, any time | Tuesday 00:00 |

**Where it applies.** The rule is a general one, so it applies wherever the sign says
nothing of its own — including a street with no signs and no markings at all (the
developer's word, 2026-09-23). A post without an `E19` does not mean a prohibition.

**How the engine applies it.** It limits any parking that is allowed at that moment, not
only parking under a blue `P` (decision 166). Time a prohibition sign says nothing about
is handed over to the general rules, and the window on screen says it does not come
from the sign (decision 155). A limit on the sign itself (`2 tim`, `30 min`) takes
precedence: the 24-hour rule is what remains when the sign has said nothing.

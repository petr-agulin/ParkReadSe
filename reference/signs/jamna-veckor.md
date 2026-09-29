---
key: jamna-veckor
tokens: Jämna veckor
category: rule
label: Even weeks
code: T6
schema: parsed.time_windows[].week_parity=even
en: The stated hours apply only in even-numbered weeks
short: Even weeks only — every second week
source: Transportstyrelsen, «Stanna och parkera»
---

# Even weeks

`Jämna veckor` — the window applies only in weeks with an even ISO number. This is how
Sweden marks street cleaning: the prohibition stands all year round, but comes round
every other week.

**Why it must not be missed.** Without the parity the product counts the prohibition as
in force every week. On a prohibition that mistake makes the answer stricter than the
real one — unpleasant, but safe. On a permitting window the same loss works the other
way and promises parking where there is none.

The week number is the ISO one (`isoWeek` in the engine, the same number as Python's
`date.isocalendar()`), not "the first week of January".

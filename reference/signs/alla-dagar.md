---
key: alla-dagar
tokens: alla dagar, Gäller alla dagar
category: rule
label: Time indication
code: T6
schema: time_windows[].day_class=all_days
en: The stated hours apply on every day of the week
short: Hours apply every day
source: Transportstyrelsen, «Stanna och parkera»
---

An explicit "all days" token. It is kept **separate** from "no days given": the first is a
direct statement, the second a default. The two must not be collapsed into one: the
computation of the remaining time rests on the difference between them.

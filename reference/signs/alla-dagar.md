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

Явный токен «все дни». Хранится **отдельно** от «дни не указаны»: первое — прямое
указание, второе — умолчание. Схлопывать одно в другое нельзя, на их различии стоит
вычисление дополнения.

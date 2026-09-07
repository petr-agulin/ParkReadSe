---
key: named-weekday
tokens: Torsdag, Tisdag, Månd
category: rule
label: Time indication
code: T6
schema: time_windows[].day_class=named_weekday
en: The stated hours apply on the named weekday
short: Hours apply on the named weekday
source: Transportstyrelsen, «Stanna och parkera»
---

Названный день недели — **литерал, а не класс дня**. Календарь праздников к нему
не применяется: запрет `Tisdag 18-24` действует, «även om tisdag är en helgdag,
eller dag före helgdag».

Схлопнуть литерал в класс дня — значит снять запрет в праздничную неделю, то есть
подсказать парковку под эвакуацию.

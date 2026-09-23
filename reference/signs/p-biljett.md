---
key: p-biljett
tokens: P-biljett
category: rule
label: Parking ticket
code: T20
schema: parsed.payment_method=ticket
en: The sign requires a parking ticket to be displayed
short: Parking ticket required
source: Transportstyrelsen, «Stanna och parkera»
---

Стоянка бесплатна, но нужен парковочный билет. Не путать с `Avgift`: там платят,
здесь оформляют.

**Про плату здесь не говорится ни слова — и не должно.** Плата живёт в своём поле
(`parsed.fee`), и движок знает о ней сам. Прежняя формулировка плату ОТРИЦАЛА
(«no fee is stated») и на снимке `097` столкнулась с табличкой, где плата названа
прямо: `Avgift`, `Taxa A`. Справочник говорит только то, что написано на табличке;
остальное — дело кода (§9 `AGENTS.md`).

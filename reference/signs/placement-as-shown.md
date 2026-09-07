---
key: placement-as-shown
tokens: пиктограмма расстановки
category: rule
label: Positioning of vehicles
code: T21
schema: parsed.placement=as_shown
en: The sign requires the vehicle to be positioned as drawn on the plate — for example at an angle to the kerb
short: Position the vehicle at the angle drawn on the plate
source: Transportstyrelsen, «Stanna och parkera»
---

Машину ставить только показанным способом — например, под углом к бордюру.

## Варианты по правилам

Официальный текст `T21` называет три исполнения, и все три встречаются в наборе:

- `T21` — поперёк края дороги (снимок `033`);
- `T21-2` — вдоль края дороги;
- `T21-3` — под углом к краю дороги (снимки `031`, `036`).

Схема их не различает: поле `placement=as_shown` одно на все три, а как именно
ставить машину, сказано рисунком на самой табличке. Различать их значило бы заводить
значения под каждое исполнение, а пользы от этого нет — водитель смотрит на рисунок,
не на код.

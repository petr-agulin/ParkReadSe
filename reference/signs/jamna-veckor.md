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

# Чётные недели

`Jämna veckor` — окно действует только в недели с чётным номером ISO. Так в Швеции
размечают уборку улиц: запрет висит круглый год, но приходит через неделю.

**Почему это нельзя пропустить.** Без чётности продукт считает запрет действующим
каждую неделю. На запрете такая ошибка делает ответ строже настоящего — неприятно,
но безопасно. На разрешающем окне та же потеря работает наоборот и обещает стоянку
там, где её нет.

Номер недели считается по ISO (`date.isocalendar()`), а не «первая неделя января».

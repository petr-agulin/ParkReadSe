---
key: ovrig-tid
tokens: Övrig tid
category: rule
label: Text panel
code: T22
schema: parsed.scope_shift=remaining_time
en: The sign states what applies outside the hours given above
short: Applies outside the hours above
source: Transportstyrelsen, «Stanna och parkera»
---

Токен сдвига охвата: дальнейшее относится к **дополнению** объявленного окна.

Без него вне окна возвращается базовый режим; с ним вне окна действует то, что названо
при токене. Неопознанный токен сдвига — причина отказа: неизвестно, к какому времени
относятся следующие строки.

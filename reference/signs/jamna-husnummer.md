---
key: jamna-husnummer
tokens: Jämna nummer, Jämna husnummer
category: info
label: Street side
schema: parsed.street_side=even_numbers
en: The rule holds only on the side of the street with even house numbers
short: Even house numbers only
source: the developer's own reading of the test photographs
---

Правило действует только на стороне улицы с чётными номерами домов (`132`, `134`).
Это про **улицу**, не про недели: чётные недели — `jamna-veckor`, и подмена одного
другим превратила бы правило одной стороны улицы в правило раз в две недели.

Продукт не знает, на какой стороне стоит машина, поэтому запрет применяет (осторожная
сторона) и говорит, к какой стороне он относится.

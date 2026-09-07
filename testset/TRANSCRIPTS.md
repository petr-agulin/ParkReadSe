# Разбор тестового набора: текст знака и его смысл

54 снимка из `photos/`, по каждому два слоя:

1. **Что написано** — стопка за стопкой, сверху вниз, дословно. Первый проход сделала
   vision-модель, и он требует проверки: мерить модель по модели нельзя.
2. **Что это значит** — раздел «My explanation…», написанный разработчиком. Это эталон
   смысла, и именно из него выведена модель сборки итога в `PROJECT_BRIEF.md`, раздел
   «Как из табличек получается итог».

Формальная разметка `expected/NNN.json` появится на этапе 5, когда будет утверждена
схема: записывать её в JSON сейчас значило бы зафиксировать схему раньше, чем она
спроектирована.

Обозначения: **[О]** — основной знак, **[Т]** — табличка, **[И]** — информационное
табло (не дорожный знак).

---

## 001 · P + 30 min
`001-p-30min.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `30 min` — синяя

Максимальная длительность без указания дней и часов. Окно не объявлено — значит,
дополнение здесь пустое, и это отдельный случай для движка.

Особенность: на основном знаке круглая наклейка.

My explanation of what the sign with plates means: 
Парковка разрешена только на 30 минут и это бесплатно. Больше 30 минут вообще парковаться нельзя. Относится к любому дню и любому периоду в течение дня. Включая выходные и праздники. 

---

## 002 · Avgift + запрет вне размеченного места
`002-avgift-forbud-utanfor-markerad-plats.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` — синяя
3. **[Т]** `Utanför [mar]kerad plats` — жёлтая с красной рамкой, слева символ запрета
   стоянки. Часть слова закрыта наклейкой
4. **[Т]** `Mölndals Parkerings AB` / `031-87 54 79` — синяя, оператор
5. **[И]** `Områdeskod 31370`, Mölndals Parkering, реклама easyPark / Parkster /
   Parkering Göteborg, SMS-parkera

Ценность: **запрет внутри стопки** — не отдельный знак, а третья табличка. Плюс
наклейка поверх текста: разбор обязан либо прочитать, либо снизить уверенность,
но не додумать.

My explanation of what the sign with plates means: 
Parking is allowed by the same rule as the regular "P" without plates (24 hours on weekdays, and all weekend days and holiday days), with the only difference that it is paid here (avgift). Forbidden to park outside marked spots on the pavement. 
---

## 003 · P + 2 tim
`003-p-2tim.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `2 tim` — синяя

Особенность: небольшая наклейка на нижней кромке таблички.

My explanation of what the sign with plates means: 
Парковка разрешена только на 2 часа и это бесплатно. Больше 2 часов вообще парковаться нельзя. Относится к любому дню и любому периоду в течение дня. Включая выходные и праздники. 

---

## 004 · Только для посетителей церкви
`004-endast-besokande-pingstkyrkan.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Endast` / `för` / `besökande` / `till` / `Pingstkyrkan` — синяя
3. **[Т]** `Västia Parkering` / `0771-501550` — синяя, оператор

Ценность: **текст вне справочника**. «Только для посетителей Пятидесятнической церкви» —
условие о том, кто вы, а не о времени. Движок его не вычисляет; такой текст показывается
дословно как неинтерпретируемый и снижает уверенность.

My explanation of what the sign with plates means: 
Parking is allowed by the same rule as the regular "P" without plates (24 hours on weekdays, and all weekend days and holiday days), with the only difference that it applies to visitors of the churh. If you are not a visitor to a church - no parking here for you at all. 
---

## 005 · Три строки на ОДНОЙ табличке + двойная стрелка
`005-2tim-8-18-parentes-8-15-dubbelpil.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `2 tim` / `8-18` / `(8-15)` — синяя, **все три строки на одной табличке**
3. **[Т]** `←  →` — белая, две стрелки в разные стороны

Самый ценный снимок набора. Это живой случай **«gemensamt»** из официального правила:
три строки внутри одной таблички образуют одно совместное указание. Здесь же оба
письменных класса дня — `8-18` без скобок (vardagar) и `(8-15)` в скобках
(vardag före sön- och helgdag).

Особенность: знак выцветший, с мхом и потёками — реальное состояние, а не студийное.

My explanation of what the sign with plates means: 
On weekdays between 8-18 and on saturdays between 8-15 you can only park for 2 hours and it is free. if it it another time, the sign becomes a regular "P" without plates (24 hours on weekdays, and all weekend days and holiday days). Importantly: it becomes a regular P sign only in times different to weekdays between 8-18 and on saturdays between 8-15. Parking to the left and right of the sign. 

---

## 006 · Разрешение 07-17, остальное время платно
`006-tillstand-07-17-ovrig-tid-avgift.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Särskilt` / `P-tillstånd` / `erfordras` / `07-17` — синяя
3. **[Т]** `Övrig tid` / `avgift` — синяя
4. **[Т]** `←  →` — белая
5. **[Т]** `Mölndals Parkerings AB` / `031-875479` — синяя, оператор

Ценность: **токен сдвига охвата `Övrig tid` на отдельной табличке**. Дополнение к окну
07-17 здесь не пустое и не «по умолчанию», а прямо названо: платно. Ровно тот случай,
ради которого дополнение считает код.

My explanation of what the sign with plates means: 
On week days (mon-fri) between 07-17 you need to have a special permission to park. Any other time - it is a P-sign with avgift plate. P-sign with avgift means regular P sign but paid. It acts so only in times that are not week days (mon-fri) between 07-17. Parking to the left and right of the sign. 

---

## 007 · Жёлтый запрет + арендованные места
`007-gul-forbud-forhyrda-platser.jpg`

1. **[О]** Запрет стоянки — жёлтый щит с красной рамкой, синий круг с красной
   окантовкой и красной чертой
2. **[Т]** `P Förhyrda platser` — синяя
3. **[Т]** `P-tjänst V.` / `031-51 88 10` — жёлтая с красной рамкой, оператор

Ценность: **основной знак — не P, а запрет**. Табличка не уточняет разрешение,
а вводит исключение из запрета. Обратная логика по сравнению со всеми синими стопками.

My explanation of what the sign with plates means: 
Zone of no parking, but there are some reserved parking spots of those who booked them and "hold" them. 
---

## 008 · Инвалидное место платно
`008-rorelsehindrad-avgift.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма кресла-коляски — синяя, **без текста**
3. **[Т]** `Avgift` — синяя
4. **[И]** `Områdeskod 17813`, `P-tjänst`, реклама Parkster / easyPark

Ценность: **табличка без текста вообще**. Дословный текст пуст, а указание есть —
схема обязана нести пиктограмму как значение поля, иначе табличка исчезнет из разбора.

My explanation of what the sign with plates means: 
It's a regular P-sign but only for disabled people with special permit, and parking is paid. If you are a disabled person with a permit - you read it as "P-sign + Avgift". If you are not a disabled person with a permit - it's no parking here for you. 
---

## 009 · Посетители, платно
`009-besokande-avgift.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Besökande` — синяя
3. **[Т]** `Avgift` — синяя
4. **[И]** `Områdeskod 17813`, `P-tjänst`, реклама easyPark / Parkster

Особенность: резкий солнечный свет, стопка снята под углом.
My explanation of what the sign with plates means: 
Same as in 008 but instead of a disabled with a permit, you must be a visitor to the building. If you are not a visitor, no parking here. 
---

## 010 · Две стрелки делят стопку на два направления
`010-forhyrda-platser-tva-pilar.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Förhyrda` / `platser` — синяя
3. **[Т]** `←` — белая, стрелка влево
4. **[Т]** `Förhyrd` / `plats` / `Särskilt` / `P-tillstånd` / `erfordras` — синяя
5. **[Т]** `→` — белая, стрелка вправо

Второй по ценности снимок. Стрелки стоят **в середине** стопки, и порядок здесь несёт
смысл: похоже, что таблички 2-3 описывают участок слева, а 4-5 — участок справа.
То есть одна стопка задаёт **два разных режима для двух направлений**.

Подтверждено разработчиком: слева — просто арендованные места, справа — арендованные,
где вдобавок нужно особое разрешение. Кто не относится ни к одной из двух категорий,
места здесь не имеет. Отсюда решение 21: выход движка — список режимов с участком.

My explanation of what the sign with plates means: 
No regular parking here, only reserved spots for those who booked them before. To the left of the sign are simple "reserved spots" (only people who reserved them can park there, each on a specific spot). To the right are "special reserved spots, where holder must also have a special permit". If you are neither of the two categories - no parking here. 

---

## 011 · Жёлтый щит, заклеен наклейками
`011-gul-p-avgift-klistermarken.jpg`

1. **[О]** P + `Avgift` — **один жёлтый щит с красной рамкой**, на нём синий символ P
   и синяя полоса `Avgift`

Ценность: **композиция на одном щите**, а не стопка. Плюс худшее состояние в наборе:
наклейки поверх символа P, наклейка поверх `Avgift`, выбитая краска в углу.
Кандидат на отказ или на заметно сниженную уверенность — и хорошо, что он есть.

My explanation of what the sign with plates means: 
Zone of paid parking: It's a zone of regular P-sign + Avgift. 
---

## 012 · Разрешение 7-17, остальное время платно
`012-tillstand-7-17-ovrig-tid-avgift.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Särskilt` / `P-tillstånd` / `erfordras` / `7-17` — синяя
3. **[Т]** `Övrig tid` / `avgift` — синяя
4. **[Т]** `MPAB` / `031-87 54 79` — синяя, оператор
5. **[Т]** `←  →` — белая

Почти повтор 006, и это полезно: то же правило при **другом порядке табличек**
(оператор выше стрелки, а не ниже) и при записи часа как `7-17` вместо `07-17`.
Пара 006/012 — готовый тест на то, что нормализация часа и перестановка
второстепенных табличек не меняют вывод.

My explanation of what the sign with plates means: 
Exactly as in 006, only the time "7 o'clock" is written as simple "7", while in image 006 it is written as "07". On week days (mon-fri) between 07-17 you need to have a special permission to park. Any other time - it is a P-sign with avgift plate. P-sign with avgift means regular P sign but paid. It acts so only in times that are not week days (mon-fri) between 07-17. Parking to the left and right of the sign. 

---

## 013 · Инвалидное место, 2 места
`013-rorelsehindrad-2-platser.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма кресла-коляски — синяя
3. **[Т]** `2 platser` — синяя
4. **[Т]** `Mölndals Parkerings AB` / `031-87 54 79` — синяя, оператор
5. **[Т]** `←` — белая

Ценность: **`2 platser` — это количество мест, а не два часа.** Ближайший сосед
по написанию — `2 tim` из 003 и 005. Ошибка здесь даёт правдоподобный неверный ответ
(«2 часа»), внешне неотличимый от верного. Обязателен в тестах.

My explanation of what the sign with plates means: 
It's a regular P-sign but only for disabled people with special permit, free parking. If you are a disabled person with a permit - you read it as regular "P-sign". If you are not a disabled person with a permit - it's no parking here for you. Only 2 spots for disabled parking are available, to the left of the sign. 

---

## 014 · Мотоцикл, стрелка, сумерки
`014-motorcykel-pil-skymning.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма мотоцикла — синяя
3. **[Т]** `←` — белая

Ниже на той же опоре — глухой серый щит (обратная сторона другого знака),
к стопке не относится. Полезно: разбор не должен считать его табличкой.

Особенность: самый тёмный кадр набора, пасмурные сумерки.

My explanation of what the sign with plates means: 
It's a regular P-sign of free parking but for motorcycles. Acts to the left of the sign. if you are not a motorcycle, no parking here. 
---

## 015 · Мотоцикл
`015-motorcykel.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма мотоцикла — синяя

Особенность: контровой свет сквозь листву, тени на щите.
My explanation of what the sign with plates means: 
Same as 014, but no arrow, meaning the spot is right here, under the sign. 
---

## 016 · Разрешение, остальное время платно, 5 мест
`016-tillstand-ovrig-tid-5-platser.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Särskilt` / `P-tillstånd` / `erfordras` / `7-17` — синяя
3. **[Т]** `Övrig tid` / `avgift` — синяя
4. **[Т]** `5 platser` — синяя
5. **[Т]** `←  →` — белая

Ценность: `Övrig tid` и счётчик мест в одной стопке. Проверяет, что количество мест
не попадает во временную арифметику.

My explanation of what the sign with plates means: 
Same as 006 and 012 with only difference that it also specifies how many spots (5) and that they are to the left and right of the sign (one must look and find them on the pavement)

---

## 017 · Инвалидное место
`017-rorelsehindrad.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма кресла-коляски — синяя

Минимальная стопка с пиктограммой и без единого слова.

My explanation of what the sign with plates means: 
Regular p-sign of free parking, but for disabled with a special permit. If you are not one, no parking here at all. 
---

## 018 · Разрешение без указания времени
`018-tillstand-utan-tidsangivelse.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Särskilt` / `P-tillstånd` / `erfordras` — синяя, **без часов**
3. **[Т]** `→` — белая

Ценность: пара к 006/012/016. Там то же указание, но с окном `07-17`; здесь окна нет,
значит требование действует всегда и дополнение пустое. Отличная проверка того, что
отсутствие часов не достраивается до «07-17, как на соседнем знаке».

My explanation of what the sign with plates means: 
Parking here (to the righ of the sign) is only allowed for those who hold a special parking permit. If you don't hold it - no parking here. 

---

## 019 · Запрет 7-18, остальное время платно
`019-forbud-7-18-avgift-ovrig-tid.jpg`

1. **[О]** Запрет стоянки — круглый, синий с красной окантовкой и красной чертой
2. **[Т]** `7-18` — **жёлтая**
3. **[Т]** `P Avgift` / `övrig tid` — синяя
4. **[И]** `Områdeskod 31108`, реклама easyPark / Parkster / Parkering Göteborg

Ценность: `Övrig tid` при **запрещающем** основном знаке. Дополнение к 7-18 здесь
означает не «свободно», а «стоянка платная». Плюс жёлтая табличка времени —
третий цвет фона в наборе.

My explanation of what the sign with plates means: 
No parking on weekdays (mon-fri) between 7 and 18. Any other time it is regular P-sign + avgift. 
---

---

## 020 · Арендованные места 13 и 14, снято издалека
`020-forhyrda-platser-13-och-14-avstand.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Förhyrda platser` / `Gäller plats 13 och 14` — синяя
3. **[Т]** `→` — белая

Ценность двойная. Во-первых, **снято с расстояния**: знак занимает малую часть кадра,
текст на пределе читаемости. Такого в наборе не было, а именно так люди и фотографируют,
не подходя вплотную. Проверяет поле `legibility` с причиной `distance`.

Во-вторых, `Gäller plats 13 och 14` — **номера конкретных мест**, а не их количество.
Сосед по смыслу — `2 platser` со снимка `013`, но там сказано «сколько», а здесь
«какие именно».

My explanation of what the sign with plates means:
The sign tells us that to the right of the sign are two reserved parking spots, and only who rented them can park there, those are spots 13 and 14. Those who rented them have special parking conditions that only they know (subject to individual agreement with the place operator or living organization, other drivers don't know the terms). Those without such permits cannot park there. What the sign does not tell us, is whether there are more places than 13 and 14, and both are possible: if there are more spots, those could be regular "p-sign" spots, but this is unlikely. More likely, there are no other spots. 

---

## 021 · Частная парковка жилищного товарищества
`021-privat-parkering-brf.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Privat parkering` / `Brf Ängslyckan` — синяя
3. **[Т]** `→` — белая, с логотипом оператора внутри таблички

Ценность: **частная территория с указанием владельца**. `Brf` — жилищное товарищество
(*bostadsrättsförening*). Это тот самый штатный случай, из-за которого запись 19a
заменила обоснование: частные парковочные знаки существуют, просто тип земли на разбор
не влияет.

Особенности: контровой свет, знак снят снизу с сильным наклоном, на белой стрелке
вклеен логотип — то есть панель со стрелкой несёт ещё и графику.

My explanation of what the sign with plates means:
This sign means anyone is allowed to park here for up to 24 hours, but the lot is managed and enforced by a private company rather than the local city council.Because a standard blue 'P' sign always defaults to the national 24-hour weekday rule (and unlimited parking on weekends), you can legally park here without being a customer or resident. If the owner wanted to restrict this lot to specific people or require a fee, the law would require them to add an extra plate underneath stating those exact conditions (such as Kunder for customers, Avgift for a fee, or a time limit).

---

## 022 · Только для заряжающихся электромобилей, шесть панелей
`022-avgift-4tim-laddande-elbilar-2-platser.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` — синяя
3. **[Т]** `4 tim` — синяя
4. **[Т]** `Endast laddande elbilar` — синяя
5. **[Т]** `2 platser` — синяя
6. **[Т]** `→` — белая
7. **[И]** `Områdeskod 31308`, Mölndals Parkering, реклама Parkster / easyPark /
   Parkering Göteborg

**Самая длинная стопка набора** — шесть панелей плюс табло. Закрывает сразу два пробела:

- **электромобили**: `Endast laddande elbilar` — «только заряжающиеся электромобили».
  Обратите внимание на `laddande`: условие не «быть электромобилем», а «стоять
  на зарядке». Это сужение круга **и** требование к состоянию машины;
- **`4 tim`** — третье значение длительности в наборе после `30 min` и `2 tim`.

⚠️ В стекле здания отражение, в котором различима фигура — проверьте перед коммитом,
не попал ли в кадр человек.

My explanation of what the sign with plates means:
To the right of the sign, there are 2 parking spots meant only for charging electrical or plugged hybrid vehicles. Parking is always paid. Maximum time of parking is 4 hours. 

---

## 023 · То же условие, короткая стопка
`023-avgift-4tim-laddande-elbilar.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` — синяя
3. **[Т]** `4 tim` — синяя
4. **[Т]** `Endast laddande elbilar` — синяя

Пара к `022`: то же правило без счётчика мест, стрелки и табло. Полезно тем же, чем
пара `006`/`012` — одно и то же условие в разном окружении, и вывод не должен от этого
меняться.

My explanation of what the sign with plates means:
Same as number 22, except that we don't know how many places and where they are respective of the sign (one must see the pavement markings of the spots near the sign.)

---

## 024 · Плата только через приложение
`024-avgift-erlaggs-med-mobil.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift erläggs med` + пиктограмма телефона — синяя
3. **[Т]** `←  →` — белая, двойная стрелка
4. **[Т]** `Västia Parkering` / `0771-501550` — синяя, оператор
5. **[И]** `9464`, easyPark, SMS-PARKERA

Ценность: **способ оплаты как отдельное указание**. До сих пор в наборе `Avgift`
означал «платно» и молчал о том, чем платить. Здесь сказано прямо: только телефоном.
Это не «сколько» и не «когда», а «чем» — четвёртая ось после времени, круга и места.

Отдельно: пиктограмма телефона стоит **внутри строки текста**, а не отдельной панелью.
Раньше пиктограммы в наборе занимали панель целиком.

My explanation of what the sign with plates means:
To the left and right of the sign are paid parking spots. It's a regular p-sign but parking is always paid. You must pay with your phone - either in a special app like EasyPark or by sending and sms. 

---

## 025 · Тридцать минут и только гостям закусочной, на одной табличке
`025-30min-endast-gaster-gatukok.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `0-30 m` — синяя
3. **[Т]** `30 min` / `Endast gäster till Franks Gatukök` — синяя, **обе строки
   на одной табличке**
4. **[Т]** `←` — белая

Ценность: **условие допуска и длительность на одной табличке**. По правилу
«gemensamt» строки одной таблички образуют одно совместное указание — значит, тридцать
минут относятся именно к гостям закусочной, а не ко всем подряд. Такой формы в наборе
ещё не было: раньше условие допуска всегда занимало отдельную панель.

Сосед по смыслу — `004` («только посетителям церкви»), но там условие стояло само
по себе, без длительности.

⚠️ **Приватность:** в левой части кадра автомобили, у ближнего номер читается.
Правило набора — номеров в кадре нет. Нужно решение: перекадрировать, закрасить
или оставить как `019`.

My explanation of what the sign with plates means:
To the left of the sign, in the distance of up to 30 meters, there is parking for visitors of a kiosk Fransk Gatukök, and maximum time of parking is 30 minutes (free for visitors of Fransk Gatukök). If you are not a visitor of Fransk Gatukök you cannot park there. 

---

## 026 · Жёлтая зона, а ниже на том же столбе — чужой знак
`026-gul-zon-avgift-plus-hastighetsskylt.jpg`

1. **[О]** жёлтый щит с красной рамкой: синий `P` и синяя полоса `Avgift`
2. **[Т]** `Utanför markerad plats` — жёлтая, с символом запрета
3. **[Т]** `Mölndals Parkerings AB` / `031-87 54 79` — жёлтая, оператор
4. **не относится к стопке:** круглый знак ограничения скорости `30`, ниже на том же
   столбе, поверх него граффити
5. **не относится к стопке:** за ним частично закрытая синяя табличка об области
   (`…OMRÅDE`, `…gäster till`, `…Travbana och`, `…Fritidsanläggning`)

Самый ценный снимок из трёх. **На одном столбе висит парковочная стопка и посторонний
дорожный знак.** Разбор обязан остановиться там, где кончается парковочная стопка,
и не втянуть ограничение скорости внутрь как ещё одну табличку. Такой ловушки
в наборе не было ни разу: до сих пор всё на столбе относилось к знаку.

Плюс третий случай вандализма после `002` и `011` — граффити поверх знака `30`.

Родня по содержанию: `011` (жёлтый зональный щит `P` + `Avgift`) и `002`
(`Utanför markerad plats`). То есть содержание знакомое, а окружение новое.

My explanation of what the sign with plates means:
It is a regular "p-sign + avgift" but in a zone mode (it's an entire zone or area where this sign is active; on the exit, there will be end zone sign). Park according to regular p-sign rules and pay the fee, but only park on marked spots on the pavement (prohibition to park outside of marked spots)

# Что из этого следует

## Приватность: разобрано

`004` и `013` перекадрированы — автомобиль с читаемым номером и человек на газоне
из кадра убраны. **`025` перекадрирован разработчиком:** номер ближнего автомобиля закрыт. `019` оставлен как есть: номер в кадре есть, но на исходном разрешении
около 20 пикселей шириной и не читается, а кадрированием его не убрать — машина стоит
на той же высоте, что и знак. Обоснование исключения — в `README.md` этой папки.

## Чего в наборе нет

Из обязательного состава этапа 5 не покрыто:

- **красные цифры** (sön- och helgdag) — ни одного. Третий класс дня проверять не на чем
- **скобки** — ровно один случай, на 005. Для замера точности по классу дня этого мало
- **жёлтая табличка дня уборки** (`Torsdag 8-16` и подобные) — нет. Именно она стоит
  в `PLAN.md` как самая дорогая ошибка продукта, и тест на приоритет запрета
  сейчас не на чем построить
- **заведомо плохие кадры** — нет. 011 (наклейки) и 014 (сумерки) близко, но это
  ещё читаемые знаки. Нет: кадра без знака вовсе, обрезанной нижней таблички,
  бликов, сильного наклона, темноты
- **P-skiva** (парковочный диск) — нет
- **`Avgift` с явным окном** (`Avgift 8-18`) — нет; во всех платных случаях окно
  либо отсутствует, либо задано через `Övrig tid`

**Закрыто снимками 020-023:** электромобили (`Endast laddande elbilar`), кадр
с расстояния на пределе читаемости, частная парковка с указанием владельца,
стопка из шести панелей, номера конкретных мест вместо их количества.

**Закрыто снимками 024-026:** способ оплаты как отдельное указание; условие допуска
и длительность **на одной табличке**; посторонний дорожный знак на том же столбе;
пиктограмма внутри строки текста, а не отдельной панелью.

**Осталось не покрытым:** красные цифры (третий класс дня), парковочный диск,
`Avgift` с явным окном, заведомо плохие кадры (темнота, блики, обрезка, кадр без знака)
и кадры не о парковке для замера отсева.

Первые три пункта закрываются только съёмкой в нужном месте. Плохие кадры — нет:
их можно доснять где угодно и когда угодно, включая кадр без знака вовсе.

## Цвет фона: что он значит

Разобрано с разработчиком. Моё первоначальное предположение — «жёлтый = частная
территория» — **неверно** и снято.

В Швеции жёлтый фон несут предупреждающие и запрещающие знаки: так они читаются
на фоне снега. Табличка наследует этот фон, и жёлтая табличка означает **запрет
или ограничение, привязанное к запрету**. Синяя и белая таблички стоят под
информационными и предписывающими знаками: парковка разрешена на указанных
условиях. Зелёный фон — только автомагистрали, в область продукта не входит.

Это ложится ровно на правило приоритета запрета, которое уже есть в документах:
у запрета теперь есть **видимый признак**, а не только смысл текста.

Отдельный случай — **жёлтый квадрат с круглым знаком внутри**: это зональный знак,
начало зоны. Так устроены 007 (начинается зона запрета стоянки) и 011 (зона платной
парковки). Жёлтая табличка под таким знаком относится к зоне. На 019 жёлтая
табличка `7-18` относится к запрещающему знаку.

**Тип земли не извлекается вовсе.** Не потому, что частных парковочных знаков
не бывает — они есть, со штатной табличкой землевладельца, — а потому, что владелец
земли не может ввести правило против закона: он может лишь добавить условия табличками.
Знак `P` на частной земле означает ровно то же, что на муниципальной.

---

## 027 · Инвалидное место, 0-6 м, Taxa 2
`027-rorelsehindrad-0-6m-avgift-taxa-2.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма кресла-коляски — синяя
3. **[Т]** `0-6 m` — синяя
4. **[Т]** `Avgift` / `Taxa 2` — синяя
5. **[И]** `Betala digitalt`, `parkering.stockholm/betala` — белая, с пиктограммой телефона

Ценность: **короткий участок в метрах вместе с условием допуска**. `0-6 m` — самый
короткий отрезок в наборе, и он же проверяет, что метраж читается как участок,
а не как время. Плюс `Taxa 2` рядом с `Avgift` — тариф отдельной строкой той же таблички.

My explanation of what the sign with plates means:
Parking on for disabled permit holders, parking is always with a fee, otherwise regular p-sign (referring to times it allows), parking allowed in the stretch of 0 to 6 meters from the sign pole. 
---

## 028 · Taxa 2, пятничный запрет, жильцы Ci
`028-avgift-taxa-2-fred-0-6-boende-ci.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `Taxa 2` — синяя
3. **[Т]** `Fred` / `0-6` — **оранжево-жёлтая** с круглым запрещающим знаком
4. **[Т]** `Boende` / `Ci` — белая
5. **[И]** `Betala digitalt`, `parkering.stockholm/betala` — белая

Ценность: **сокращённое название дня** — `Fred` вместо `Fredag`. Проверяет, что
названный день недели читается и в сокращении. Плюс код зоны жильцов (`Ci`) без слова
`Zon`.

My explanation of what the sign with plates means:
Regular p-sign with fee, the prohibition to park on every Friday all year round from 00:00 to 06:00, residents might have special terms of parking. 
---

## 029 · Beskickningsfordon
`029-beskickningsfordon-0-12m.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Beskicknings-` / `fordon` — синяя, слово перенесено с дефисом
3. **[Т]** `0-12 m` — синяя

Ценность: **табличка, которой нет и не будет в справочнике**. `Beskickningsfordon` —
машины дипломатических представительств. Разработчик отказался заводить под такие
надписи значения в схеме: в жизни их бесконечно много. Снимок — постоянная проверка
родового поведения: текст показан дословно, смысл не выдуман, уверенность снижена,
круг стоящих получает оговорку (решение 86).

Отдельно проверяет **перенос слова по дефису**: `Beskicknings-` + `fordon` — одно слово.

My explanation of what the sign with plates means:
Parking only for holders of special status (diplomatic mission or similar), otherwise, regular p-sign, parking allowed in the stretch of 0 to 12 meters from the sign pole. 
---

## 030 · Avgift 8-21 (10-17), пятница 0-6 кроме июля, Zon A
`030-avgift-8-21-fredag-0-6-galler-ej-juli-zon-a.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `8-21` / `(10-17)` — синяя
3. **[Т]** `Fredag` / `0-6` / `Gäller ej` / `1 juli - 31 juli` — **оранжево-жёлтая**
   с круглым запрещающим знаком
4. **[Т]** `Zon A` — белая
5. **[И]** `Kod: 8411`, `Betala digitalt`, `sundbyberg.se/betalaparkering` — белая

Ценность: **исключение по датам** — `Gäller ej 1 juli - 31 juli`. Запрет действует
круглый год, кроме июля. Первый в наборе случай, где табличка задаёт не диапазон
действия, а **вырезанный из него кусок**.

My explanation of what the sign with plates means:
Mixed free and fee-based parking based on times: 
- Fee on regular week days between 08:00 and 21:00 and on saturdays and days before holiday between 10:00 and 17:00, other times free of charge
- On top of that, a prohibition to park on fridays between 00:00 and 06:00 in the period from January first to June 30 and from August first to december 31. 
---

## 031 · Косая постановка, чётные недели, жильцы Solna
`031-snedstallning-torsdag-jamna-veckor-boende-solna.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма косой постановки — синяя, четыре наклонных прямоугольника
3. **[Т]** `Avgift` / `Taxa A` — синяя
4. **[Т]** `Torsdag` / `10-14` / `Jämna veckor` / `Augusti-Juni` — **оранжево-жёлтая**
   с круглым запрещающим знаком
5. **[Т]** `Boende` / `Solna` — белая
6. **[Т]** двойная горизонтальная стрелка — белая
7. **[И]** `Områdeskod 8010`, MOBILL, Parkster, EASYPARK — белая

Ценность двойная. **Чётность недели** (`Jämna veckor`) — запрет приходит через неделю,
и без этого поля продукт считал бы его действующим каждый четверг. **Косая постановка** —
пиктограмма, показывающая, как ставить машину, а не где.

My explanation of what the sign with plates means:
Parking always with a fee, on top the prohibition to park on Thursdays of even weeks in the period of from agust 1 to june 30 at times between 10:00 and 14:00, parking position diagonal as depicted on the plate, residents might have special parking terms
---

## 032 · Инвалидное место со стрелкой вправо
`032-rorelsehindrad-pil-hoger.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма кресла-коляски — синяя
3. **[Т]** стрелка вправо — белая

Ценность: **самый короткий знак набора** и мелкий кадр. Три панели, ничего лишнего —
годится как проверка того, что простое остаётся простым.

My explanation of what the sign with plates means:
Free parking for holders of disabled permit to the right of the sign
---

## 033 · Avgift 8-21, поперечная постановка, Zon E
`033-avgift-8-21-uppstallning-zon-e-boende-storskogen.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `8-21` — синяя
3. **[Т]** пиктограмма поперечной постановки — синяя, три вертикальных прямоугольника
4. **[Т]** стрелка влево — белая
5. **[Т]** `Zon E` — белая
6. **[Т]** `Boende` / `Storskogen` — белая
7. **[И]** `Kod: 8415`, `Betala digitalt` — белая

Ценность: **вторая пиктограмма постановки**, отличная от косой на `031`. Пара к ней:
одно и то же поле схемы, разные рисунки. Плюс стрелка стоит **между** табличками,
а не в конце стопки.

My explanation of what the sign with plates means:
Parking with a fee on weekdays from 08:00 to 21:00, other times free parking, parking position "vertical" as depicted on the plate, parking to the left of the sign pole
---

## 034 · Avgift, вторник 12-15 с 1 ноября по 15 мая, Zon C
`034-avgift-tisdag-12-15-nov-maj-zon-c-boende.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` — синяя
3. **[Т]** `Tisdag` / `12-15` / `1 nov-15 maj` — **оранжево-жёлтая** с круглым
   запрещающим знаком
4. **[Т]** `Zon C` — белая
5. **[Т]** `Boende` / `Storskogen` — белая
6. **[И]** `8401`, оператор — белая

Ценность: **сезон, заданный числами месяцев, а не названиями** — `1 nov-15 maj`.
Диапазон перехлёстывает конец года и вдобавок начинается и кончается в середине месяца.
Это строго сложнее, чем `Augusti-Juni` на `031`, и текущая схема хранит только целые
месяцы: снимок показывает предел нынешнего представления.

My explanation of what the sign with plates means:
Parking with a fee only, on top the prohibition to park on Tuesdays between 12:00 and 15:00 in the period of November 1 to May 15 inclusive
---

## 035 · Zon C, снято издалека
`035-zon-c-pa-avstand.png`

1. **[О]** P — синий квадрат, различим
2. **[Т]** синяя табличка — текст не читается
3. **[Т]** `Zon C` — белая, на пределе читаемости
4. **[Т]** ещё одна табличка — текст не читается

Ценность: **заведомо трудный кадр**. Знак занимает малую часть кадра, большая часть
текста не читается. Ровно тот класс снимков, которого набору не хватало: проверка
не разбора, а **отказа** — сервис должен сказать, что прочитать не удалось, а не
достроить правдоподобное.

My explanation of what the sign with plates means:
Parking always with a fee, I can't read visually the second plate. 
---

## 036 · Avgift 7-19 (11-17) Taxa 3, пятница 0-6 кроме лета
`036-avgift-7-19-taxa-3-fred-0-6-galler-ej-sommar-boende-so.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `7-19` / `(11-17)` / `Taxa 3` — синяя
3. **[Т]** пиктограмма косой постановки — синяя
4. **[Т]** `Fred` / `0-6` / `Gäller ej` / `15/6  15/8` — **оранжево-жёлтая** с круглым
   запрещающим знаком
5. **[Т]** стрелка вправо — белая
6. **[Т]** `Boende` / `Sö` — белая
7. **[И]** `Betala digitalt`, `parkering.stockholm/betala` — белая

Ценность: **исключение, заданное датами в формате `15/6 15/8`**. Пара к `030`, где
исключение написано словами (`1 juli - 31 juli`).

⚠️ **Прочтение выбрано, но не доказано.** Тире между датами на снимке не видно, и это
меняет смысл в тридцать раз: `15/6-15/8` — это два месяца лета, `15/6 15/8` — два
отдельных дня в году. Разработчик поставил на **два отдельных дня** именно потому,
что тире нет. Решение принято сознательно и записано здесь, чтобы не выглядеть потом
опечаткой: если знак попадётся снова и тире окажется, эталон правится.

My explanation of what the sign with plates means:
Mixed free and fee-based parking based on times: 
- Fee on regular week days between 07:00 and 19:00 and on saturdays and days before holiday between 11:00 and 17:00, other times free of charge
- On top of that, a prohibition to park on fridays between 00:00 and 06:00 in the period of all year exluding two dates: June 15 and August 15
-  parking position diagonal as depicted on the plate, residents might have special parking terms
- parking to the right of the sign pole
---

## 037 · Указатель к парковке со стрелкой
`037-hanvisning-p-med-pil.png`

1. **[О]** P со стрелкой над буквой — синий квадрат
2. **[Т]** стрелка поворота направо — синий квадрат

Ценность: **это не место стоянки, а указание направления**. Знак не разрешает стоять
здесь, он показывает, куда ехать. В наборе уже есть правило «указатель не разрешает
ничего», и до сих пор оно проверялось только выдуманными данными — теперь есть
настоящий снимок.

Разработчик назвал знак точно: **F28 «Parking facility»**, серия указательных
(*lokaliseringsmärken*), а не `E19`. Правила времени у крытой стоянки свои и знаком
не задаются — обычно шлагбаум и билет с отметкой времени. Второй знак на столбе —
предписывающий **D1-5** «направление движения», к стоянке отношения не имеющий.

Схема этот случай уже держит: `main_sign.type` знает `wayfinding_parking_house`.
Ошибка здесь не в схеме, а в том, что модель приняла знак за обычный `P`.

My explanation of what the sign with plates means:
This sign is not regular Parking (E19) which is an Instruction sign type; this one is a Direction sign, number F28, it is called "Parking facility" and usally means roofed parking area or a garage. The rules of parking in terms of time reference are not necessarily the same as with E19: usually, the garage establishes its own parking time rule. Met at malls, shops, museums, and so on. Usually entry through the barrier, with a ticket that is time-stamped. The picture also shows that to get there, you need to turn riht (Mandatory sign "Direction to be followed (D1-5)")
---

## 038 · Scandic, автобусы, посетители
`038-scandic-buss-besokande-pil.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Scandic` — синяя
3. **[Т]** пиктограмма автобуса — синяя
4. **[Т]** `Besökande` — синяя
5. **[Т]** стрелка вправо — белая

Ценность: **два сужения круга в одной стопке** — название заведения (`Scandic`)
и условие допуска (`Besökande`) на разных табличках, и оба надо удержать.

Поправка к первой редакции этой записи: я написал, что автобуса в схеме нет. Это
неверно — `vehicle_class` содержит `bus` с самого начала. Проверять надо не наличие
значения, а то, доходит ли до него модель.

My explanation of what the sign with plates means:
Parking (seemingly free) only to busses who are visitors of Scandic hotel, to the right of the sign. 
---

## 039 · Зарядка электромобилей, 4 места
`039-laddning-avgift-4-platser-pil.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма зарядки — синяя, автомобиль со шнуром и молнией
3. **[Т]** `Avgift` — синяя
4. **[Т]** `4 platser` — синяя
5. **[Т]** стрелка влево — белая
6. **[И]** `7527`, оператор — белая

Ценность: **зарядка показана пиктограммой, а не словами**. Пара к `022` и `023`, где
то же условие написано текстом (`Endast laddande elbilar`). Одно правило, две записи.

My explanation of what the sign with plates means:
Parking only for pluggable cars, always with a fee, 4 spots to the left of the sign
---

## 040 · Servicefordon, будни 7-17, остальное время платно
`040-servicefordon-vardagar-7-17-ovrig-tid-avgift.jpg`

1. **[О]** P — синий квадрат
2. **[Т]** `Service-` / `fordon` — синяя, слово перенесено с дефисом
3. **[Т]** `Vardagar` / `7-17` — синяя
4. **[Т]** `Övrig tid` / `avgift` — синяя
5. **[Т]** стрелка влево — белая

Ценность: **`Vardagar` написано словом**. До сих пор будни в наборе задавались только
оформлением цифр, а здесь день назван прямо. Плюс второй перенос слова по дефису
(`Service-` / `fordon`) и знакомая связка `Övrig tid avgift` — но с условием допуска
вместо разрешения.

My explanation of what the sign with plates means:
Parking only to service vehicles (status), allowed free parking on regular weekdays between 07:00 and 17:00, other times parking with a fee (but also only to service vehicles), parking to the left of the sign. 

---

## 041 · Lastplats: погрузка, запрет 7-17, остальное время платно
`041-lastplats-forbud-7-17-ovrig-tid-avgift.png`

1. **[О]** `Last-` / `plats` — **жёлтая** табличка с круглым знаком запрета остановки
   (`C39`, синий круг с красной каймой и красным крестом)
2. **[Т]** `7-17` — жёлтая
3. **[Т]** `0-15  m` — жёлтая
4. **[Т]** `Fred` / `0-6` — жёлтая с круглым запрещающим знаком
5. **[Т]** `P` / `Övrig tid` / `Avgift` / `Taxa 2` — синяя

Ценность: **погрузочная площадка**. Основной знак запрещает остановку, а нижняя синяя
табличка возвращает стоянку в остальное время — то есть стопка меняет род посреди себя.
Такого в наборе не было: `019` устроен похоже, но там запрет один, а здесь их два
(`7-17` и `Fred 0-6`) и они разной природы.

My explanation of what the sign with plates means:
Place for loading-unloading where regular stopping and parking is prohibited on weekdays from 07:00 to 17:00 and parking is prohibited on fridays from 00:00 to 06:00. This aplies to a stretch of 0-15 meters from the sign. In other times, paid parking is allowed. 
---

## 042 · Стоянка для велосипедов и мопедов
`042-cykel-moped-parkering.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма велосипеда — синяя
3. **[Т]** пиктограмма мопеда (жёлтая) и `m` — синяя

Ценность: **класс транспорта, которого в схеме нет** — велосипед. `vehicle_class`
знает мотоцикл, легковой, электро, грузовик и автобус; велосипеда и мопеда в нём нет.
Снимок показывает границу перечисления на живом знаке.

My explanation of what the sign with plates means:
Free parking only for bycicles and class 2 mopeds, some stratch from the sign (not visible, covered with a sticker). No parking for any other vehicles here. 
---

## 043 · Пешеходная зона, запрет моторного транспорта
`043-gangfartsomrade-motorfordon-forbjuden.png`

1. **[О]** пешеходная зона (`E9`, синий квадрат со взрослым и ребёнком)
2. **[Т]** `Motorfordons-` / `trafik` / `förbjuden` / `11-06` / `(11-06)` — синяя
3. **[Т]** `Transport av` / `rörelsehindrad` / `tillåten` / `hela dygnet` — синяя

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

Ценность: **самый трудный из отказных кадров**. Знак синий, квадратный, с табличками
и с временными окнами — по форме неотличим от парковочной стопки. Отличает его только
смысл, и ошибиться здесь легче всего.

My explanation of what the sign with plates means:
Main sign is not a parking sign. It is a sign "pedestrians". So the road is 
for pedestrians. But the next plates probably establishes when vehicles can drive there. In any case, this is not a parking sign at all. 
---

## 044 · Мотоциклы, Taxa 12, пятничный запрет, жильцы
`044-motorcykel-avgift-taxa-12-fred-boende.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма мотоцикла — синяя
3. **[Т]** `0-5  m` — синяя
4. **[Т]** `Avgift` / `Taxa 12` — синяя
5. **[Т]** `Fred` / `0-6` — оранжево-жёлтая с круглым запрещающим знаком
6. **[Т]** `Boende` и две пиктограммы — белая

Ценность: **двузначный номер тарифа** (`Taxa 12`) — раньше в наборе были только
однозначные. Плюс `Boende` с пиктограммами вместо названия района.

My explanation of what the sign with plates means:
Parking only for motorcycles. Always with a fee. Stretch 0-5 meters from the sign. Parking prohibited on fridays from 00:00 to 06:00. Residents may have special terms for parking here. 
---

## 045 · Вывеска гостиницы
`045-hotellskylt-inte-vagmarke.png`

На снимке тканевая вывеска `GRAD` / `Hotel & Hostel` на фасаде. Дорожных знаков нет.

**Не дорожный знак вовсе.** Ожидаемый ответ отсева — `not_a_sign`.

Ценность: **единственный кадр набора, на котором знака нет совсем**. До сих пор отсев
не мог ошибиться в эту сторону просто потому, что такого снимка ему не показывали.

My explanation of what the sign with plates means:
Not a road sign. 
---

## 046 · Пешеходный переход и предписанное направление
`046-overgangsstalle-pabjuden-korriktning.png`

1. **[О]** пешеходный переход (`B3`, синий квадрат)
2. **[О]** предписанное направление движения (`D1`, синий круг со стрелкой вниз-вправо)

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

My explanation of what the sign with plates means:
Not a parking sign. 
---

## 047 · Предупреждение о встречном движении
`047-varning-motesplats.png`

1. **[О]** предупреждающий знак — жёлтый треугольник с красной каймой, две встречные
   стрелки

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

Ценность: **жёлтый треугольник**. Жёлтый в проекте прочно связан с запретом стоянки,
и здесь он означает совсем другое.

My explanation of what the sign with plates means:
Not a parking sign. 
---

## 048 · Въезд запрещён, кроме велосипедов
`048-forbud-infart-galler-ej-cykel.png`

1. **[О]** въезд запрещён (`C1`, красный круг с белой полосой)
2. **[Т]** `Gäller ej` и пиктограмма велосипеда — жёлтая

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

Ценность: **`Gäller ej` на не-парковочном знаке**. Тот же оборот стоит на парковочных
табличках `030` и `036`, и здесь он не про стоянку вовсе.

My explanation of what the sign with plates means:
Not a parking sign. 
---

## 049 · Мопеды, сезон 1/4-30/9, два тарифа
`049-moped-sasong-avgift-tva-taxor.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма мопеда — синяя
3. **[Т]** `1/4-30/9` / `Avgift` / `Taxa 12` — синяя
4. **[Т]** `Övrig tid` / `Avgift` / `Taxa 2` — синяя
5. **[Т]** `0-5  m` — синяя
6. **[Т]** `Fred` / `0-6` — оранжево-жёлтая с круглым запрещающим знаком

Ценность: **сезон у РАЗРЕШАЮЩЕГО указания, а не у запрета**. До сих пор даты в наборе
стояли только на жёлтых табличках запрета; здесь `1/4-30/9` задаёт, когда действует
один тариф, а `Övrig tid` — другой. Это первый случай, где потеря дат завысила бы
не строгость, а **разрешение**.

My explanation of what the sign with plates means:
Parking only for motorcycles. In the period of 1/4 - 30/9 parking is with a fee by taxa 12, and in other periods - with a fee by taxa 2. Stretch of 0-5 meters from the sign. No parking on fridays from 00:00 to 06:00. 
---

## 050 · Aimo Park: частный указатель к стоянке
`050-aimo-park-privat-hanvisning.png`

1. **[О]** тёмно-синий щит `P` со стрелкой-крышей, логотип `aimo park`, стрелка
   поворота, `Torsgatan 12`

**Не государственный знак, а вывеска оператора.** По форме близок к `F28`, но цвет
и логотип не соответствуют регламенту: `F28` синий по образцу, отступление от цвета
не допускается.

Ценность: **граница между дорожным знаком и рекламой оператора**. Стоять у этого щита
он не разрешает — он показывает дорогу к платной стоянке.

My explanation of what the sign with plates means:
This may not look like a road sign (officially it isn't because of a different format) but in fact this has the same meaning as direction sign parking facility (F28)
---

## 051 · Ограничение скорости 40
`051-hastighet-40.png`

1. **[О]** ограничение скорости `40` — круглый, белый с красной каймой

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

My explanation of what the sign with plates means:
Not a parking sign. 

---

## 052 · Taxa 2, вторник, жильцы Ci с красными цифрами
`052-avgift-taxa-2-tisd-boende-roda-siffror.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `Taxa 2` — синяя
3. **[Т]** `Tisd` / `0-6` — оранжево-жёлтая с круглым запрещающим знаком
4. **[Т]** `Boende` / `Ci` / `22-7` / `(22-10)` / `22-10` — белая, **последняя строка
   красными цифрами**

Ценность: **красные цифры** — тот самый пробел набора, который числился открытым
с этапа 5. Все три класса дня на одной табличке разом: `22-7` чёрными (будни),
`(22-10)` в скобках (канун), `22-10` красными (воскресенья и праздники).

My explanation of what the sign with plates means:
Parking with a fee. No parking on tuesdays from 00:00 till 06:00. Special terms for residents (residents terms contain some specification per days but it does not matter in the sense of the parking sign)
---

## 053 · Предписанное направление и скорость 30
`053-pabjuden-korriktning-hastighet-30.png`

1. **[О]** предписанное направление направо (`D1`, синий круг)
2. **[О]** ограничение скорости `30` — круглый, жёлтый с красной каймой

**Не парковочный знак.** Ожидаемый ответ отсева — `other_road_sign`.

Ценность: **два знака на одном столбе, и ни один не о стоянке**. Отсев должен ответить
одинаково независимо от их числа.

My explanation of what the sign with plates means:
Not a parking sign. 

---

## 054 · Автобусы, 15 минут, четверговый запрет
`054-buss-15min-avgift-torsd.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма автобуса — синяя
3. **[Т]** `15 min` / `Avgift` / `Taxa 2` — синяя
4. **[Т]** `Torsd` / `0-6` — оранжево-жёлтая с круглым запрещающим знаком
5. **[И]** `Betala via` / `Betala P eller` / `p-automat` — белая

Ценность: **автобус на живом знаке**. Значение `vehicle_class: bus` в схеме было
с самого начала, а записи справочника под него не было до решения 88 — этот снимок
проверяет, что теперь оно доходит. Плюс `15 min` — самая короткая длительность набора.

My explanation of what the sign with plates means:
Parking only for busses, only for 15 minutes and with a fee, no parking on Thursdays fromm 00:00 to 06:00. 

---

## 055 · Запрет остановки под инеем, стрелка
`055-forbud-stannande-snotackt-pil.jpg`

1. **[О]** запрет остановки (`C39`, синий круг с красной каймой и красным крестом) —
   **залеплен снегом и инеем**, кайма читается, поле мутное
2. **[Т]** жёлтая табличка, текст различим лишь местами: похоже на `Gäller ... 9-9.30`
   и телефон/код внизу — **достоверно не читается**
3. **[Т]** белая табличка со стрелкой вправо

Кадр снят зимой, издали, справа треть кадра перекрыта белым пятном (палец или
запотевший объектив). **Это первый в наборе заведомо плохой кадр.**

Ценность: до сих пор `insufficient` не сработал ни разу на 54 снимках. Здесь у продукта
есть законный повод сказать «прочитано слишком мало»: основной знак опознаваем
по форме, а таблички — нет.

My explanation of what the sign with plates means:
No parking or stopping, probably to the right of the sign. There is a text panel which I cannot read (poor quality of image). 
---

## 056 · Ночь: Avgift 7-19 (11-17) Taxa 3, четверг, и запрет остановки ниже
`056-natt-avgift-7-19-taxa-3-torsd-plus-forbud.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` / `7-19` / `(11-17)` / `Taxa 3` — синяя
3. **[Т]** `Torsd` / `0-6` — оранжево-жёлтая с круглым запрещающим знаком
4. **[О]** ниже на том же столбе — **отдельный знак** запрета остановки (`C39`),
   крупный, повёрнут к другому направлению

Ночная съёмка, знак освещён фонарём.

Ценность: **два основных знака на одном столбе**, и второй противоречит первому,
если счесть его частью стопки. Схема места под второй основной знак не имеет.

My explanation of what the sign with plates means:
Parking with a fee on weekdays between 07:00 and 19:00 and Saturdays (days before holidays) between 11:00 and 17:00, other times - free regular P-sign parking. On top, no parking on every Thirsday between 00:00 and 06:00. Also, something weird - No parking or stopping sign on the same pole at the bottom - I personally can't interpret the whole pole of signs with this. I am confused and wouldn't know how to park. 
---

## 057 · Парковочный диск или бесплатный билет, 2 часа
`057-p-skiva-2tim-eller-gratis-biljett.png`

1. **[О]** `Avgift` — синяя (верх стопки виден не полностью)
2. **[Т]** пиктограмма парковочного диска и `P`, затем `2tim` / `eller` / `gratis`
   / `biljett` / `alla dagar` / `07-23` — синяя
3. **[Т]** белая табличка со стрелкой вправо

Ценность: **парковочный диск** — запись справочника `p-skiva` числилась пробелом
набора с этапа 5 и не встречалась ни разу. Плюс `p-biljett` и `alla dagar`.
Формулировка «диск ИЛИ бесплатный билет» — выбор, которого схема не выражает.

My explanation of what the sign with plates means:
Hard to interpret for me. No main parking sign on top, sign stack starts with the plate "Avgift", and it is first condition. If it is parking, I would say it is with the fee. The next plate says that you can only park 2 hours. I interpret it that 2 hour is max, and if you don't have a biljett, then you should use a parking disk and park with fee. If you have biljett - park free. 2 Hours max. 
---

## 058 · Ночь: Klass I, 22-06 тремя классами дня, вне размеченного места
`058-natt-klass-i-22-06-roda-siffror-utanfor-markerad.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Avgift` — синяя
3. **[Т]** пиктограмма легкового автомобиля, `Klass I`, затем `22-06` чёрными,
   `(22-06)` в скобках, `22-06` **красными** — синяя
4. **[Т]** `Utanför` / `markerad` / `plats` — жёлтая с круглым знаком
5. **[Т]** `SECURITAS` / `0771-767000` — синяя, табличка оператора
6. **[И]** `MOBILL` / `801` / QR-код — белое табло
7. **[И]** второе табло: `epark` / `801` / `Parkster`

Ценность: **`Klass I` — легковой автомобиль словами**, чего в наборе не было
(`bil-personbil` ни разу не встречалась). Плюс все три класса дня на одной табличке
и `Utanför markerad plats` ночью.

My explanation of what the sign with plates means:
parking is always with a fee. parking time is limited - can park only between 22:00 and 06:00 every day of any week. Parking for class 1 cars only. No parking beyound marked spots. 
---

## 059 · Издали: 07-20 (08-17), диск на 2 часа, дальше плата
`059-avstand-p-skiva-2tim-darefter-avgift.png`

1. **[О]** P — синий квадрат
2. **[Т]** `07-20` / `(08-17)` и ниже пиктограмма диска, `2 tim` / `därefter` /
   `avgift` — синяя
3. **[Т]** `Svensk Säkerhet` / `010-207 85 85` — синяя, табличка оператора
4. **[И]** табло с кодом `6000`

Снимок мелкий: знак занимает малую часть кадра, мелкий текст на грани читаемости.

Ценность: **диск и плата вместе** — два часа по диску, потом платно. Плюс проверка
на мелком кадре: продукт должен либо прочесть, либо честно сказать, что не прочёл.

My explanation of what the sign with plates means:
Parking allowed here only with use of park disk and at certain times: 
you can park between: 
- 07:00 and 20:00 on weekdays
- 08:00 and 17:00 on saturdays / days before holiday
- 09:00 and 16:00 on sundays and holidays
First two hours are free, then it becomes a fee
---

## 060 · Ночь, издали: Lastplats 7-19, 0-15 m, в остальное время платно
`060-natt-lastplats-ovrig-tid-avgift.png`

1. **[О]** жёлтая `Last-` / `plats` с круглым знаком запрета остановки
2. **[Т]** `7-19` — жёлтая
3. **[Т]** `0-15 m` — жёлтая
4. **[Т]** `P` / `Övrig tid` / `avgift` / `Taxa 2` — синяя

Ночь, знак снят издали и наискось, свет фонарей.

Ценность: **тот же тип, что `041`, но в плохих условиях**. Есть с чем сравнить:
на хорошем кадре разбор верен, и видно, что теряется на плохом.

My explanation of what the sign with plates means:
Place for loading-unloading where regular stopping and parking is prohibited on weekdays from 07:00 to 19:00 and parking is prohibited on (cannot read when, poor quality). This aplies to a stretch of (cannot read, poor quality) meters from the sign. In other times, paid parking is allowed.
---

## 061 · Тот же знак с очень большого расстояния
`061-lastplats-langt-avstand.png`

Знак занимает узкую полоску в центре кадра. Различимы жёлтый верх, синий низ
и общая форма стопки; **текст не читается ни на одной табличке**.

Ценность: **предельный случай расстояния**. Здесь единственный правильный ответ —
отказ или сильно неполный разбор. Если продукт выдаст уверенные строки, это
и будет та самая выдумка, которую ловили на `035`.

My explanation of what the sign with plates means:
Poor quality, cannot read, but looks similar to 60
---

## 062 · Klass I, 14 суток, запрет стоянки прицепов
`062-klass-i-14-dygn-slapfordon-forbud.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма легкового автомобиля — синяя
3. **[Т]** `14 dygn` — синяя
4. **[Т]** `Uppställning` / `av släpfordon` / `förbjuden` / `Tanums kommun` —
   оранжевая
5. **[Т]** пиктограммы «палатка, автодом, прицеп перечёркнуты» и
   `Camping förbjuden` / `Camping verboten` / `No camping` — оранжевая

Ценность: **длительность в СУТКАХ** — `14 dygn`, единица, которой в наборе не было
(схема знает `minutes` и `hours`). Плюс два запрета, которых нет в справочнике:
стоянка прицепов и кемпинг. Проверка белого списка на честность.

My explanation of what the sign with plates means:
Not 100% sure but I think it is a free parking for 14 continuous days max for class 1 cars. 
---

## 063 · Ночь: разрешение 06-16, диск на 3 часа, три класса дня
`063-natt-p-tillstand-06-16-p-skiva-3tim.png`

1. **[О]** P — синий квадрат
2. **[Т]** `Giltigt` / `P-tillstånd` / `erfordras` / `06-16` — синяя
3. **[Т]** пиктограмма диска и `3 tim`, затем `16-06` чёрными, `(00-24)` в скобках,
   `00-24` **красными** — синяя

Ночная съёмка крупным планом, на знаке иней и блики.

Ценность: **разрешение и диск на одном знаке** — днём по разрешению, ночью по диску.
Плюс третий случай красных цифр и `p-skiva` во второй раз.

My explanation of what the sign with plates means:
On weekdays between 06:00 and 16:00 you can only park if you have a special permit. If you do - you can park for free within that time. You can park without a permit on: 
- weekdays betwen 16:00 and 06:00
- saturdays/days before holiday and sundays/holiday between 00:00 and 24:00
- and only for 3 hours, using a parking disc (free)
---

## 064 · Мотоциклы, вторник 9-17, сезон 1/4-30/11 — кадр обрезан
`064-motorcykel-tisd-9-17-beskuren.png`

1. **[О]** P — синий квадрат
2. **[Т]** пиктограмма мотоцикла — синяя
3. **[Т]** `Tisd` / `9-17` — жёлтая с круглым знаком
4. **[Т]** `1/4-30/11` — синяя
5. **[Т]** `0-10 m` — синяя, **обрезана нижней границей кадра**

Ценность: **обрезанная нижняя табличка** — случай, названный в плане с этапа 5
и до сих пор не собранный. Нижний край знака физически не попал в кадр, и правильный
ответ — сказать об этом, а не додумать.

My explanation of what the sign with plates means:
Parking only for motorcycles, only in the period between april 1 and november 30 (other times no parking). On top, parking prohibited on every Tuesday between 09:00 and 17:00. Stretch of 0-10 meters from the sign (can still read it although cropped)
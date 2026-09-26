# The test set: what each sign says and what it means

139 photos from `photos/`, each described in two layers:

1. **What is written** — plate by plate, top to bottom, word for word. The first pass
   was made by the vision model and then checked by hand: the model cannot be measured
   against itself.
2. **What it means** — the developer's explanation. This is the ground truth of
   meaning; the order in which the engine assembles an answer (`web/src/lib/engine.ts`)
   was derived from it.

The formal ground truth for each sign photo is in `expected/NNN.json`.

Legend: **[M]** main sign, **[P]** plate, **[I]** information board (not a road sign).
Text in backticks is copied from the sign exactly.

---

## 001 · P + 30 min
`001-p-30min.jpg`

1. **[M]** P — blue square
2. **[P]** `30 min` — blue

A maximum stay with no days or hours. No window is declared, so there is no "rest of the
time" — a separate case for the engine.

Note: a round sticker on the main sign.

**Meaning (developer):** Parking is allowed for 30 minutes only, and it is free. Longer
than 30 minutes is not allowed at all. This applies on any day and at any time of day,
weekends and holidays included.

---

## 002 · Avgift + no parking outside marked bays
`002-avgift-forbud-utanfor-markerad-plats.jpg`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** `Utanför [mar]kerad plats` — yellow with a red border, a no-parking symbol on
   the left. Part of a word is covered by a sticker
4. **[P]** `Mölndals Parkerings AB` / `031-87 54 79` — blue, operator
5. **[I]** `Områdeskod 31370`, Mölndals Parkering, ads for easyPark / Parkster /
   Parkering Göteborg, SMS-parkera

Why it matters: **a prohibition inside the stack** — not a separate sign but the third
plate. Also a sticker over the text: the reading must either read it or lower its
confidence, never guess.

**Meaning (developer):** Parking is allowed by the same rule as a plain "P" with no
plates (24 hours on weekdays, and all weekend days and holidays), except that it is paid
(avgift). Parking outside the marked bays on the pavement is forbidden.

---

## 003 · P + 2 tim
`003-p-2tim.jpg`

1. **[M]** P — blue square
2. **[P]** `2 tim` — blue

Note: a small sticker on the plate's lower edge.

**Meaning (developer):** Parking is allowed for 2 hours only, and it is free. Longer than
2 hours is not allowed at all. This applies on any day and at any time of day, weekends
and holidays included.

---

## 004 · Church visitors only
`004-endast-besokande-pingstkyrkan.jpg`

1. **[M]** P — blue square
2. **[P]** `Endast` / `för` / `besökande` / `till` / `Pingstkyrkan` — blue
3. **[P]** `Västia Parkering` / `0771-501550` — blue, operator

Why it matters: **text outside the reference.** "Only for visitors to the Pentecostal
church" is a condition about who you are, not about time. The engine does not compute
it; such text is shown word for word as not interpreted, and it lowers the confidence.

**Meaning (developer):** Parking is allowed by the same rule as a plain "P" (24 hours on
weekdays, and all weekend days and holidays), except that it applies to visitors of the
church. If you are not visiting the church, you may not park here at all.

---

## 005 · Three lines on ONE plate + a double arrow
`005-2tim-8-18-parentes-8-15-dubbelpil.jpg`

1. **[M]** P — blue square
2. **[P]** `2 tim` / `8-18` / `(8-15)` — blue, **all three lines on one plate**
3. **[P]** `←  →` — white, two arrows pointing apart

The most valuable photo in the set. It is a live case of **"gemensamt"** from the
official rule: three lines on one plate form one joint instruction. It also has both
written day classes — `8-18` without brackets (vardagar) and `(8-15)` in brackets
(vardag före sön- och helgdag).

Note: the sign is faded, with moss and streaks — real condition, not a studio shot.

**Meaning (developer):** On weekdays 8–18 and on Saturdays 8–15 you may park for 2 hours
only, and it is free. At any other time the sign acts as a plain "P" (24 hours on
weekdays, and all weekend days and holidays). Importantly, it becomes a plain P only
outside weekdays 8–18 and Saturdays 8–15. Parking is to the left and right of the sign.

---

## 006 · Permit 07-17, fee at other times
`006-tillstand-07-17-ovrig-tid-avgift.jpg`

1. **[M]** P — blue square
2. **[P]** `Särskilt` / `P-tillstånd` / `erfordras` / `07-17` — blue
3. **[P]** `Övrig tid` / `avgift` — blue
4. **[P]** `←  →` — white
5. **[P]** `Mölndals Parkerings AB` / `031-875479` — blue, operator

Why it matters: **the scope-shift token `Övrig tid` on its own plate.** The time outside
07–17 is not empty and not a default: it is named — a fee. Exactly the case the code
computes "the rest of the time" for.

**Meaning (developer):** On weekdays (Mon–Fri) 07–17 you need a special permit to park.
At any other time it is a P sign with an Avgift plate — a plain P, but paid. Parking is
to the left and right of the sign.

---

## 007 · Yellow prohibition + rented spaces
`007-gul-forbud-forhyrda-platser.jpg`

1. **[M]** No parking — yellow shield with a red border, a blue circle with a red rim and
   a red bar
2. **[P]** `P Förhyrda platser` — blue
3. **[P]** `P-tjänst V.` / `031-51 88 10` — yellow with a red border, operator

Why it matters: **the main sign is a prohibition, not P.** The plate does not narrow a
permission; it makes an exception to a prohibition — the reverse of every blue stack.

**Meaning (developer):** A no-parking zone, but with some reserved spaces for those who
rented ("hold") them.

---

## 008 · Disabled space, paid
`008-rorelsehindrad-avgift.jpg`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue, **no text**
3. **[P]** `Avgift` — blue
4. **[I]** `Områdeskod 17813`, `P-tjänst`, ads for Parkster / easyPark

Why it matters: **a plate with no text at all.** The verbatim text is empty, yet there is
an instruction — the schema must carry the pictogram as a field value, or the plate
vanishes from the reading.

**Meaning (developer):** A plain P sign, but only for disabled people with a permit, and
parking is paid. With a disabled permit, read it as "P + Avgift". Without one, you may
not park here.

---

## 009 · Visitors, paid
`009-besokande-avgift.jpg`

1. **[M]** P — blue square
2. **[P]** `Besökande` — blue
3. **[P]** `Avgift` — blue
4. **[I]** `Områdeskod 17813`, `P-tjänst`, ads for easyPark / Parkster

Note: harsh sunlight, the stack shot at an angle.

**Meaning (developer):** As 008, but instead of a disabled permit you must be a visitor to
the building. If you are not a visitor, you may not park here.

---

## 010 · Two arrows split the stack into two directions
`010-forhyrda-platser-tva-pilar.jpg`

1. **[M]** P — blue square
2. **[P]** `Förhyrda` / `platser` — blue
3. **[P]** `←` — white, arrow left
4. **[P]** `Förhyrd` / `plats` / `Särskilt` / `P-tillstånd` / `erfordras` — blue
5. **[P]** `→` — white, arrow right

The second most valuable photo. The arrows stand **in the middle** of the stack, and the
order carries meaning: plates 2–3 describe the stretch to the left, plates 4–5 the
stretch to the right. One stack sets **two different regimes for two directions**.

Confirmed by the developer: on the left, plain rented spaces; on the right, rented spaces
that also need a special permit. Anyone in neither group has no place here. Hence
decision 21: the engine's output is a list of regimes, each with its stretch.

**Meaning (developer):** No ordinary parking here, only spaces reserved in advance. To the
left of the sign are plain reserved spaces (only those who reserved them may park, each
in a specific space). To the right are reserved spaces whose holder must also have a
special permit. If you are in neither group, you may not park here.

---

## 011 · Yellow shield covered in stickers
`011-gul-p-avgift-klistermarken.jpg`

1. **[M]** P + `Avgift` — **one yellow shield with a red border**, with a blue P symbol and
   a blue `Avgift` strip on it

Why it matters: **a composition on one shield**, not a stack. Also the worst condition in
the set: stickers over the P, a sticker over `Avgift`, paint knocked off a corner. A
candidate for a refusal or a clearly lower confidence — which is why it is here.

**Meaning (developer):** A paid parking zone: a zone of plain P + Avgift.

---

## 012 · Permit 7-17, fee at other times
`012-tillstand-7-17-ovrig-tid-avgift.jpg`

1. **[M]** P — blue square
2. **[P]** `Särskilt` / `P-tillstånd` / `erfordras` / `7-17` — blue
3. **[P]** `Övrig tid` / `avgift` — blue
4. **[P]** `MPAB` / `031-87 54 79` — blue, operator
5. **[P]** `←  →` — white

Almost a repeat of 006, and usefully so: the same rule with **a different plate order**
(the operator above the arrow, not below) and the hour written `7-17` instead of
`07-17`. The pair 006/012 tests that normalising the hour and reordering minor plates do
not change the answer.

**Meaning (developer):** Exactly as 006; only 7 o'clock is written "7" here and "07" in
006. On weekdays (Mon–Fri) 07–17 you need a special permit to park. At any other time it
is a P sign with an Avgift plate — a plain P, but paid. Parking is to the left and right
of the sign.

---

## 013 · Disabled space, 2 spaces
`013-rorelsehindrad-2-platser.jpg`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue
3. **[P]** `2 platser` — blue
4. **[P]** `Mölndals Parkerings AB` / `031-87 54 79` — blue, operator
5. **[P]** `←` — white

Why it matters: **`2 platser` is a number of spaces, not two hours.** Its nearest
look-alike is `2 tim` from 003 and 005. A mistake here gives a plausible wrong answer ("2
hours") that looks just like a right one. Required in the tests.

**Meaning (developer):** A plain P sign, but only for disabled people with a permit, and
free. With a disabled permit, read it as a plain P. Without one, you may not park here.
Only 2 disabled spaces, to the left of the sign.

---

## 014 · Motorcycle, arrow, dusk
`014-motorcykel-pil-skymning.jpg`

1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue
3. **[P]** `←` — white

Lower on the same post is a blank grey shield (the back of another sign). It is not part
of the stack, and the reading must not count it as a plate.

Note: the darkest photo in the set, overcast dusk.

**Meaning (developer):** A plain free P, but for motorcycles, to the left of the sign. If
you are not on a motorcycle, you may not park here.

---

## 015 · Motorcycle
`015-motorcykel.jpg`

1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue

Note: backlight through foliage, shadows on the shield.

**Meaning (developer):** As 014, but with no arrow: the space is right here, under the
sign.

---

## 016 · Permit, fee at other times, 5 spaces
`016-tillstand-ovrig-tid-5-platser.jpg`

1. **[M]** P — blue square
2. **[P]** `Särskilt` / `P-tillstånd` / `erfordras` / `7-17` — blue
3. **[P]** `Övrig tid` / `avgift` — blue
4. **[P]** `5 platser` — blue
5. **[P]** `←  →` — white

Why it matters: `Övrig tid` and a space count in one stack. It checks that the number of
spaces does not leak into the time arithmetic.

**Meaning (developer):** As 006 and 012, except that it also says how many spaces there
are (5) and that they are to the left and right of the sign (look for them on the
pavement).

---

## 017 · Disabled space
`017-rorelsehindrad.jpg`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue

The smallest stack with a pictogram and not a single word.

**Meaning (developer):** A plain free P, but for disabled people with a permit. If you are
not one, you may not park here at all.

---

## 018 · Permit with no hours
`018-tillstand-utan-tidsangivelse.jpg`

1. **[M]** P — blue square
2. **[P]** `Särskilt` / `P-tillstånd` / `erfordras` — blue, **no hours**
3. **[P]** `→` — white

Why it matters: the pair to 006/012/016. There the same instruction has a `07-17`
window; here there is none, so the requirement always applies and there is no "rest of
the time". A good check that missing hours are not filled in as "07-17, like the sign
next door".

**Meaning (developer):** Parking here (to the right of the sign) is only for holders of a
special parking permit. Without one, you may not park here.

---

## 019 · No parking 7-18, fee at other times
`019-forbud-7-18-avgift-ovrig-tid.jpg`

1. **[M]** No parking — round, blue with a red rim and a red bar
2. **[P]** `7-18` — **yellow**
3. **[P]** `P Avgift` / `övrig tid` — blue
4. **[I]** `Områdeskod 31108`, ads for easyPark / Parkster / Parkering Göteborg

Why it matters: `Övrig tid` under a **prohibiting** main sign. The time outside 7–18
means not "free" but "paid parking". Also a yellow time plate — the third background
colour in the set.

**Meaning (developer):** No parking on weekdays (Mon–Fri) 7–18. At any other time it is a
plain P + Avgift.

---

## 020 · Rented spaces 13 and 14, shot from afar
`020-forhyrda-platser-13-och-14-avstand.jpg`

1. **[M]** P — blue square
2. **[P]** `Förhyrda platser` / `Gäller plats 13 och 14` — blue
3. **[P]** `→` — white

Why it matters, twice over. First, it is **shot from a distance**: the sign fills a small
part of the frame, and the text is at the edge of legibility — which is how people really
take photos. It checks the `legibility` field with the reason `distance`.

Second, `Gäller plats 13 och 14` gives **the numbers of specific spaces**, not a count. Its
neighbour in meaning is `2 platser` on `013`, but that one says "how many" and this one
says "which ones".

**Meaning (developer):** To the right of the sign are two reserved spaces, numbers 13 and
14, and only those who rented them may park there. They have their own parking terms,
known only to them (an individual agreement with the operator or the housing
association; other drivers do not know the terms). Anyone without such a permit may not
park there. The sign does not say whether there are more spaces than 13 and 14. Both are
possible: extra spaces could be plain P spaces, but that is unlikely — most likely there
are no other spaces.

---

## 021 · A housing association's private parking
`021-privat-parkering-brf.jpg`

1. **[M]** P — blue square
2. **[P]** `Privat parkering` / `Brf Ängslyckan` — blue
3. **[P]** `→` — white, with the operator's logo inside the plate

Why it matters: **private land with the owner named.** `Brf` is a housing association
(*bostadsrättsförening*). Private parking signs are a normal case: the type of land does
not change the reading.

Notes: backlight; the sign is shot from below at a steep angle; a logo is set into the
white arrow — the arrow panel carries graphics too.

**Meaning (developer):** Anyone may park here for up to 24 hours, but the lot is managed
and enforced by a private company rather than the city. A plain blue P always falls back
on the national rule (24 hours on weekdays, unlimited at weekends), so you may legally
park here without being a customer or a resident. If the owner wanted to limit the lot to
certain people or charge a fee, the law would require an extra plate below stating those
exact conditions (such as Kunder for customers, Avgift for a fee, or a time limit).

---

## 022 · Charging electric cars only, six panels
`022-avgift-4tim-laddande-elbilar-2-platser.jpg`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** `4 tim` — blue
4. **[P]** `Endast laddande elbilar` — blue
5. **[P]** `2 platser` — blue
6. **[P]** `→` — white
7. **[I]** `Områdeskod 31308`, Mölndals Parkering, ads for Parkster / easyPark /
   Parkering Göteborg

**The longest stack in the set** — six panels plus a board. It covers two things:

- **electric cars**: `Endast laddande elbilar` — "only electric cars that are charging".
  Note `laddande`: the condition is not "be an electric car" but "be on charge". It
  narrows who may park **and** sets a requirement on the car's state;
- **`4 tim`** — a third stay length in the set, after `30 min` and `2 tim`.

**Meaning (developer):** To the right of the sign are 2 spaces only for charging electric
or plug-in hybrid vehicles. Parking is always paid. The maximum stay is 4 hours.

---

## 023 · The same condition, a short stack
`023-avgift-4tim-laddande-elbilar.jpg`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** `4 tim` — blue
4. **[P]** `Endast laddande elbilar` — blue

The pair to `022`: the same rule without the space count, the arrow and the board. Useful
in the same way as `006`/`012` — one condition in different surroundings, and the answer
must not change.

**Meaning (developer):** As 022, except that we do not know how many spaces there are or
where they are relative to the sign (look for the bay markings near the sign).

---

## 024 · Pay by phone only
`024-avgift-erlaggs-med-mobil.jpg`

1. **[M]** P — blue square
2. **[P]** `Avgift erläggs med` + a phone pictogram — blue
3. **[P]** `←  →` — white, a double arrow
4. **[P]** `Västia Parkering` / `0771-501550` — blue, operator
5. **[I]** `9464`, easyPark, SMS-PARKERA

Why it matters: **the payment method as an instruction of its own.** Elsewhere in the set
`Avgift` means "paid" and says nothing about how to pay. Here it says: by phone only. Not
"how much" or "when" but "how" — a fourth axis after time, who and where.

Also: the phone pictogram sits **inside a line of text**, not on a panel of its own.

**Meaning (developer):** Paid parking to the left and right of the sign. It is a plain P,
but parking is always paid, and you must pay by phone — in an app such as EasyPark or by
SMS.

---

## 025 · Thirty minutes, for the snack bar's guests only, on one plate
`025-30min-endast-gaster-gatukok.jpg`

1. **[M]** P — blue square
2. **[P]** `0-30 m` — blue
3. **[P]** `30 min` / `Endast gäster till Franks Gatukök` — blue, **both lines on one
   plate**
4. **[P]** `←` — white

Why it matters: **an eligibility condition and a stay length on one plate.** Under the
"gemensamt" rule the lines of one plate form one joint instruction, so the thirty minutes
apply to the snack bar's guests, not to everyone. Its neighbour in meaning is `004`
("church visitors only"), where the condition stood alone, with no stay length.

Privacy: the developer covered the near car's number plate.

**Meaning (developer):** To the left of the sign, within 30 metres, there is parking for
guests of the Franks Gatukök kiosk, for 30 minutes at most (free for its guests). If you
are not a guest of Franks Gatukök, you may not park there.

---

## 026 · Yellow zone, and another sign lower on the same post
`026-gul-zon-avgift-plus-hastighetsskylt.jpg`

1. **[M]** yellow shield with a red border: a blue `P` and a blue `Avgift` strip
2. **[P]** `Utanför markerad plats` — yellow, with a prohibition symbol
3. **[P]** `Mölndals Parkerings AB` / `031-87 54 79` — yellow, operator
4. **not part of the stack:** a round `30` speed limit sign lower on the same post, with
   graffiti over it
5. **not part of the stack:** behind it, a partly hidden blue area plate (`…OMRÅDE`,
   `…gäster till`, `…Travbana och`, `…Fritidsanläggning`)

Why it matters: **a parking stack and an unrelated road sign on one post.** The reading
must stop where the parking stack ends and not pull the speed limit in as one more
plate. Also graffiti over the `30` sign.

Related in content: `011` (a yellow zone shield `P` + `Avgift`) and `002` (`Utanför
markerad plats`) — familiar content in new surroundings.

**Meaning (developer):** A plain "P + Avgift", but as a zone (it covers a whole area; at
the exit there will be an end-of-zone sign). Park by the plain P rules and pay the fee,
but only in the marked bays (parking outside them is prohibited).

---

## 027 · Disabled space, 0-6 m, Taxa 2
`027-rorelsehindrad-0-6m-avgift-taxa-2.png`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue
3. **[P]** `0-6 m` — blue
4. **[P]** `Avgift` / `Taxa 2` — blue
5. **[I]** `Betala digitalt`, `parkering.stockholm/betala` — white, with a phone
   pictogram

Why it matters: **a short stretch in metres together with an eligibility condition.**
`0-6 m` is the shortest stretch in the set, and it checks that metres are read as a
stretch, not as time. Also `Taxa 2` beside `Avgift` — a tariff as a separate line of the
same plate.

**Meaning (developer):** Parking only for holders of a disabled permit, always paid;
otherwise a plain P (for the times it allows). Parking is allowed 0 to 6 metres from the
sign's post.

---

## 028 · Taxa 2, Friday prohibition, residents Ci
`028-avgift-taxa-2-fred-0-6-boende-ci.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa 2` — blue
3. **[P]** `Fred` / `0-6` — **orange-yellow**, with a round prohibition sign
4. **[P]** `Boende` / `Ci` — white
5. **[I]** `Betala digitalt`, `parkering.stockholm/betala` — white

Why it matters: **a shortened day name** — `Fred` for `Fredag`. It checks that a named
weekday is read when shortened. Also a residents' zone code (`Ci`) without the word
`Zon`.

**Meaning (developer):** A plain P with a fee; no parking every Friday, all year round,
00:00–06:00; residents may have special parking terms.

---

## 029 · Beskickningsfordon
`029-beskickningsfordon-0-12m.png`

1. **[M]** P — blue square
2. **[P]** `Beskicknings-` / `fordon` — blue, the word hyphenated across two lines
3. **[P]** `0-12 m` — blue

Why it matters: **a plate that is not and will not be in the reference.**
`Beskickningsfordon` means vehicles of diplomatic missions. The developer decided not to
add schema values for such wording: in real life there are endless variants. The photo is
a standing check of the general behaviour: the text is shown word for word, no meaning is
invented, confidence goes down, and "who may park" gets a caveat (decision 86).

It also checks **a word hyphenated across lines**: `Beskicknings-` + `fordon` is one
word.

**Meaning (developer):** Parking only for holders of a special status (a diplomatic
mission or similar); otherwise a plain P. Parking is allowed 0 to 12 metres from the
sign's post.

---

## 030 · Avgift 8-21 (10-17), Friday 0-6 except July, Zon A
`030-avgift-8-21-fredag-0-6-galler-ej-juli-zon-a.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `8-21` / `(10-17)` — blue
3. **[P]** `Fredag` / `0-6` / `Gäller ej` / `1 juli - 31 juli` — **orange-yellow**, with a
   round prohibition sign
4. **[P]** `Zon A` — white
5. **[I]** `Kod: 8411`, `Betala digitalt`, `sundbyberg.se/betalaparkering` — white

Why it matters: **an exception by dates** — `Gäller ej 1 juli - 31 juli`. The prohibition
applies all year except July: the plate gives not a range but **a piece cut out of one**.

**Meaning (developer):** Free and paid parking depending on the time:
- a fee on weekdays 08:00–21:00 and on Saturdays and days before a holiday 10:00–17:00;
  free at other times;
- on top of that, no parking on Fridays 00:00–06:00 from 1 January to 30 June and from
  1 August to 31 December.

---

## 031 · Angled parking, even weeks, residents Solna
`031-snedstallning-torsdag-jamna-veckor-boende-solna.png`

1. **[M]** P — blue square
2. **[P]** angled-parking pictogram — blue, four slanted rectangles
3. **[P]** `Avgift` / `Taxa A` — blue
4. **[P]** `Torsdag` / `10-14` / `Jämna veckor` / `Augusti-Juni` — **orange-yellow**, with
   a round prohibition sign
5. **[P]** `Boende` / `Solna` — white
6. **[P]** a double horizontal arrow — white
7. **[I]** `Områdeskod 8010`, MOBILL, Parkster, EASYPARK — white

Why it matters, twice over. **Week parity** (`Jämna veckor`): the prohibition comes every
other week, and without this field the product would apply it every Thursday. **Angled
parking**: a pictogram showing how to park, not where.

**Meaning (developer):** Parking is always paid. On top of that, no parking on Thursdays
of even weeks, 10:00–14:00, from 1 August to 30 June. Park at an angle, as shown on the
plate. Residents may have special parking terms.

---

## 032 · Disabled space with an arrow to the right
`032-rorelsehindrad-pil-hoger.png`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue
3. **[P]** arrow right — white

Why it matters: **the shortest sign in the set**, in a small frame. Three panels and
nothing else — a check that something simple stays simple.

**Meaning (developer):** Free parking for holders of a disabled permit, to the right of
the sign.

---

## 033 · Avgift 8-21, perpendicular parking, Zon E
`033-avgift-8-21-uppstallning-zon-e-boende-storskogen.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `8-21` — blue
3. **[P]** perpendicular-parking pictogram — blue, three upright rectangles
4. **[P]** arrow left — white
5. **[P]** `Zon E` — white
6. **[P]** `Boende` / `Storskogen` — white
7. **[I]** `Kod: 8415`, `Betala digitalt` — white

Why it matters: **a second parking-position pictogram**, different from the angled one on
`031` — one schema field, two drawings. Also the arrow sits **between** plates, not at
the end of the stack.

**Meaning (developer):** A fee on weekdays 08:00–21:00, free at other times. Park
perpendicular, as shown on the plate, to the left of the sign's post.

---

## 034 · Avgift, Tuesday 12-15 from 1 November to 15 May, Zon C
`034-avgift-tisdag-12-15-nov-maj-zon-c-boende.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** `Tisdag` / `12-15` / `1 nov-15 maj` — **orange-yellow**, with a round
   prohibition sign
4. **[P]** `Zon C` — white
5. **[P]** `Boende` / `Storskogen` — white
6. **[I]** `8401`, operator — white

Why it matters: **a season given by dates, not month names** — `1 nov-15 maj`. The range
crosses the end of the year and starts and ends mid-month, which is harder than
`Augusti-Juni` on `031`. The schema stores dates as `MM-DD`, so it fits.

**Meaning (developer):** Parking is always paid. On top of that, no parking on Tuesdays
12:00–15:00 from 1 November to 15 May, inclusive.

---

## 035 · Zon C, shot from afar
`035-zon-c-pa-avstand.png`

1. **[M]** P — blue square, recognisable
2. **[P]** blue plate — text unreadable
3. **[P]** `Zon C` — white, barely readable
4. **[P]** one more plate — text unreadable

Why it matters: **a deliberately hard frame.** The sign fills a small part of the frame,
and most of the text cannot be read. It checks not the reading but **the refusal**: the
service must say it could not read the sign, not build a plausible answer.

**Meaning (developer):** Parking is always paid; I cannot read the second plate.

---

## 036 · Avgift 7-19 (11-17) Taxa 3, Friday 0-6 except summer
`036-avgift-7-19-taxa-3-fred-0-6-galler-ej-sommar-boende-so.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 3` — blue
3. **[P]** angled-parking pictogram — blue
4. **[P]** `Fred` / `0-6` / `Gäller ej` / `15/6  15/8` — **orange-yellow**, with a round
   prohibition sign
5. **[P]** arrow right — white
6. **[P]** `Boende` / `Sö` — white
7. **[I]** `Betala digitalt`, `parkering.stockholm/betala` — white

Why it matters: **an exception given as dates in the form `15/6 15/8`** — the pair to
`030`, where the exception is written in words (`1 juli - 31 juli`).

⚠️ **The reading is chosen, not proven.** No dash between the dates is visible, and that
changes the meaning thirtyfold: `15/6-15/8` is two months of summer, `15/6 15/8` is two
separate days a year. The developer chose **two separate days** precisely because there
is no dash. The choice is deliberate and recorded here so that it does not later look
like a typo: if the sign turns up again with a dash, the ground truth is corrected.

**Meaning (developer):** Free and paid parking depending on the time:
- a fee on weekdays 07:00–19:00 and on Saturdays and days before a holiday 11:00–17:00;
  free at other times;
- on top of that, no parking on Fridays 00:00–06:00 all year, except two dates: 15 June
  and 15 August;
- park at an angle, as shown on the plate; residents may have special parking terms;
- parking is to the right of the sign's post.

---

## 037 · Direction sign to a car park, with an arrow
`037-hanvisning-p-med-pil.png`

1. **[M]** P with an arrow above the letter — blue square
2. **[P]** turn-right arrow — blue square

Why it matters: **this is not a place to park but a direction.** The sign does not allow
parking here; it shows where to drive. The rule "a direction sign permits nothing" is
checked on this real photo.

The developer identified the sign exactly: **F28 "Parking facility"**, one of the
direction signs (*lokaliseringsmärken*), not `E19`. A covered car park sets its own time
rules, not the sign — usually a barrier and a time-stamped ticket. The second sign on the
post is the mandatory **D1-5** "direction to be followed", unrelated to parking.

The schema handles this: `main_sign.type` has `wayfinding_parking_house`. When the model
errs here, it is not the schema's fault: it takes the sign for an ordinary `P`.

**Meaning (developer):** This is not an ordinary Parking sign (E19, an instruction sign).
It is a direction sign, F28, "Parking facility", and usually means a covered car park or
a garage. Its time rules are not necessarily those of E19: a garage usually sets its
own. Found at malls, shops, museums and so on. Entry is usually through a barrier with a
time-stamped ticket. The photo also shows that to get there you turn right (the
mandatory sign "Direction to be followed", D1-5).

---

## 038 · Scandic, buses, visitors
`038-scandic-buss-besokande-pil.png`

1. **[M]** P — blue square
2. **[P]** `Scandic` — blue
3. **[P]** bus pictogram — blue
4. **[P]** `Besökande` — blue
5. **[P]** arrow right — white

Why it matters: **two narrowings of who may park in one stack** — the name of the
establishment (`Scandic`) and an eligibility condition (`Besökande`) on separate plates,
and both must be kept. `vehicle_class` has had `bus` from the start; the photo checks
whether the model gets to it.

**Meaning (developer):** Parking (apparently free) only for buses visiting the Scandic
hotel, to the right of the sign.

---

## 039 · Electric-car charging, 4 spaces
`039-laddning-avgift-4-platser-pil.jpg`

1. **[M]** P — blue square
2. **[P]** charging pictogram — blue, a car with a cable and a lightning bolt
3. **[P]** `Avgift` — blue
4. **[P]** `4 platser` — blue
5. **[P]** arrow left — white
6. **[I]** `7527`, operator — white

Why it matters: **charging shown as a pictogram, not in words.** The pair to `022` and
`023`, where the same condition is written as text (`Endast laddande elbilar`). One rule,
two notations.

**Meaning (developer):** Parking only for plug-in cars, always paid, 4 spaces to the left
of the sign.

---

## 040 · Servicefordon, weekdays 7-17, fee at other times
`040-servicefordon-vardagar-7-17-ovrig-tid-avgift.jpg`

1. **[M]** P — blue square
2. **[P]** `Service-` / `fordon` — blue, the word hyphenated across two lines
3. **[P]** `Vardagar` / `7-17` — blue
4. **[P]** `Övrig tid` / `avgift` — blue
5. **[P]** arrow left — white

Why it matters: **`Vardagar` written as a word.** Elsewhere in the set weekdays are set
only by how the digits are printed; here the day is named. Also a second hyphenated word
(`Service-` / `fordon`) and the familiar `Övrig tid avgift` — but with an eligibility
condition instead of a permit.

**Meaning (developer):** Parking only for service vehicles (a status). Free on weekdays
07:00–17:00; at other times paid (still only for service vehicles). Parking is to the
left of the sign.

---

## 041 · Lastplats: loading, no stopping 7-17, fee at other times
`041-lastplats-forbud-7-17-ovrig-tid-avgift.png`

1. **[M]** `Last-` / `plats` — **yellow** plate with a round no-stopping sign (`C39`, a
   blue circle with a red rim and a red cross)
2. **[P]** `7-17` — yellow
3. **[P]** `0-15  m` — yellow
4. **[P]** `Fred` / `0-6` — yellow, with a round prohibition sign
5. **[P]** `P` / `Övrig tid` / `Avgift` / `Taxa 2` — blue

Why it matters: **a loading bay.** The main sign forbids stopping, and the lower blue
plate brings parking back at other times — the stack changes kind halfway down. `019` is
built similarly, but it has one prohibition; here there are two (`7-17` and `Fred 0-6`),
of different kinds.

**Meaning (developer):** A loading bay where stopping and parking are prohibited on
weekdays 07:00–17:00, and parking is prohibited on Fridays 00:00–06:00. This applies to a
stretch 0–15 metres from the sign. At other times, paid parking is allowed.

---

## 042 · Parking for bicycles and mopeds
`042-cykel-moped-parkering.png`

1. **[M]** P — blue square
2. **[P]** bicycle pictogram — blue
3. **[P]** moped pictogram (yellow) and `m` — blue

Why it matters: **a vehicle class at the edge of the list.** `vehicle_class` has
`bicycle`, and the bicycle pictogram also covers class II mopeds; a class I moped goes
with motorcycles.

**Meaning (developer):** Free parking only for bicycles and class II mopeds, for some
stretch from the sign (not visible, covered by a sticker). No parking for any other
vehicle.

---

## 043 · Pedestrian zone, no motor traffic
`043-gangfartsomrade-motorfordon-forbjuden.png`

1. **[M]** pedestrian zone (`E9`, a blue square with an adult and a child)
2. **[P]** `Motorfordons-` / `trafik` / `förbjuden` / `11-06` / `(11-06)` — blue
3. **[P]** `Transport av` / `rörelsehindrad` / `tillåten` / `hela dygnet` — blue

**Not a parking sign.** Expected triage answer: `other_road_sign`.

Why it matters: **the hardest of the non-parking frames.** The sign is blue and square,
with plates and time windows — in form, just like a parking stack. Only the meaning tells
it apart, and a mistake is easiest here.

**Meaning (developer):** The main sign is not a parking sign but a pedestrian sign: the
road is for pedestrians. The plates below probably say when vehicles may drive there.
Either way, this is not a parking sign at all.

---

## 044 · Motorcycles, Taxa 12, Friday prohibition, residents
`044-motorcykel-avgift-taxa-12-fred-boende.png`

1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue
3. **[P]** `0-5  m` — blue
4. **[P]** `Avgift` / `Taxa 12` — blue
5. **[P]** `Fred` / `0-6` — orange-yellow, with a round prohibition sign
6. **[P]** `Boende` and two pictograms — white

Why it matters: **a two-digit tariff number** (`Taxa 12`). Also `Boende` with pictograms
instead of a district name.

**Meaning (developer):** Parking only for motorcycles, always paid, 0–5 metres from the
sign. No parking on Fridays 00:00–06:00. Residents may have special parking terms.

---

## 045 · A hotel sign
`045-hotellskylt-inte-vagmarke.png`

The photo shows a fabric sign `GRAD` / `Hotel & Hostel` on a façade. No road signs.

**Not a road sign at all.** Expected triage answer: `not_a_sign`.

Why it matters: **the only frame in the set with no sign at all** — the one case where
triage can err in this direction.

**Meaning (developer):** Not a road sign.

---

## 046 · Pedestrian crossing and a mandatory direction
`046-overgangsstalle-pabjuden-korriktning.png`

1. **[M]** pedestrian crossing (`B3`, blue square)
2. **[M]** mandatory direction (`D1`, a blue circle with an arrow down and to the right)

**Not a parking sign.** Expected triage answer: `other_road_sign`.

**Meaning (developer):** Not a parking sign.

---

## 047 · Warning of oncoming traffic
`047-varning-motesplats.png`

1. **[M]** warning sign — a yellow triangle with a red rim, two opposing arrows

**Not a parking sign.** Expected triage answer: `other_road_sign`.

Why it matters: **a yellow triangle.** In this project yellow is firmly tied to parking
prohibitions; here it means something else entirely.

**Meaning (developer):** Not a parking sign.

---

## 048 · No entry, except bicycles
`048-forbud-infart-galler-ej-cykel.png`

1. **[M]** no entry (`C1`, a red circle with a white bar)
2. **[P]** `Gäller ej` and a bicycle pictogram — yellow

**Not a parking sign.** Expected triage answer: `other_road_sign`.

Why it matters: **`Gäller ej` on a non-parking sign.** The same phrase stands on the
parking plates of `030` and `036`; here it has nothing to do with parking.

**Meaning (developer):** Not a parking sign.

---

## 049 · Mopeds, season 1/4-30/9, two tariffs
`049-moped-sasong-avgift-tva-taxor.png`

1. **[M]** P — blue square
2. **[P]** moped pictogram — blue
3. **[P]** `1/4-30/9` / `Avgift` / `Taxa 12` — blue
4. **[P]** `Övrig tid` / `Avgift` / `Taxa 2` — blue
5. **[P]** `0-5  m` — blue
6. **[P]** `Fred` / `0-6` — orange-yellow, with a round prohibition sign

Why it matters: **a season on a PERMITTING instruction, not on a prohibition.** Elsewhere,
dates stand only on yellow prohibition plates; here `1/4-30/9` sets when one tariff
applies, and `Övrig tid` the other. Losing the dates here would overstate not the
strictness but **the permission**.

**Meaning (developer):** Parking only for motorcycles. From 1/4 to 30/9 parking is paid at
Taxa 12; at other times, at Taxa 2. A stretch 0–5 metres from the sign. No parking on
Fridays 00:00–06:00.

---

## 050 · Aimo Park: a private direction sign to a car park
`050-aimo-park-privat-hanvisning.png`

1. **[M]** a dark blue `P` shield with a roof-shaped arrow, the `aimo park` logo, a turn
   arrow, `Torsgatan 12`

**Not a state road sign but an operator's sign.** In form it is close to `F28`, but its
colour and logo do not follow the regulations: `F28` is blue to the standard, and no
deviation in colour is allowed.

Why it matters: **the line between a road sign and an operator's advertising.** It does
not allow parking at this shield; it shows the way to a paid car park.

**Meaning (developer):** It may not look like a road sign (officially it is not one,
because of its different format), but in fact it means the same as the direction sign
"Parking facility" (F28).

---

## 051 · Speed limit 40
`051-hastighet-40.png`

1. **[M]** speed limit `40` — round, white with a red rim

**Not a parking sign.** Expected triage answer: `other_road_sign`.

**Meaning (developer):** Not a parking sign.

---

## 052 · Taxa 2, Tuesday, residents Ci with red digits
`052-avgift-taxa-2-tisd-boende-roda-siffror.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa 2` — blue
3. **[P]** `Tisd` / `0-6` — orange-yellow, with a round prohibition sign
4. **[P]** `Boende` / `Ci` / `22-7` / `(22-10)` / `22-10` — white, **the last line in red
   digits**

Why it matters: **red digits** — all three day classes on one plate: `22-7` in black
(weekdays), `(22-10)` in brackets (the day before a Sunday or holiday), `22-10` in red
(Sundays and holidays).

**Meaning (developer):** Parking is paid. No parking on Tuesdays 00:00–06:00. Special
terms for residents (their terms vary by day, but that does not matter for reading the
parking sign).

---

## 053 · Mandatory direction and speed 30
`053-pabjuden-korriktning-hastighet-30.png`

1. **[M]** mandatory direction, right (`D1`, blue circle)
2. **[M]** speed limit `30` — round, yellow with a red rim

**Not a parking sign.** Expected triage answer: `other_road_sign`.

Why it matters: **two signs on one post, and neither is about parking.** Triage must
answer the same whatever their number.

**Meaning (developer):** Not a parking sign.

---

## 054 · Buses, 15 minutes, Thursday prohibition
`054-buss-15min-avgift-torsd.png`

1. **[M]** P — blue square
2. **[P]** bus pictogram — blue
3. **[P]** `15 min` / `Avgift` / `Taxa 2` — blue
4. **[P]** `Torsd` / `0-6` — orange-yellow, with a round prohibition sign
5. **[I]** `Betala via` / `Betala P eller` / `p-automat` — white

Why it matters: **a bus on a real sign.** The schema has had `vehicle_class: bus` from the
start, and the reference has had an entry for it since decision 88; this photo checks
that the value gets through. Also `15 min` — the shortest stay in the set.

**Meaning (developer):** Parking only for buses, for 15 minutes only, and paid. No parking
on Thursdays 00:00–06:00.

---

## 055 · No stopping under frost, arrow
`055-forbud-stannande-snotackt-pil.jpg`

1. **[M]** no stopping (`C39`, a blue circle with a red rim and a red cross) — **caked
   with snow and frost**; the rim is readable, the field is blurred
2. **[P]** a yellow plate, text visible only in places: something like
   `Gäller ... 9-9.30` and a phone number or code below — **not reliably readable**
3. **[P]** a white plate with an arrow to the right

Taken in winter, from a distance; a white blur (a finger or a fogged lens) covers the
right third of the frame. **A deliberately poor frame.**

Why it matters: here the product has a legitimate reason to say "too little was read":
the main sign is recognisable by its shape, the plates are not.

**Meaning (developer):** No parking or stopping, probably to the right of the sign. There
is a text plate I cannot read (poor image quality).

---

## 056 · Night: Avgift 7-19 (11-17) Taxa 3, Thursday, and a no-stopping sign below
`056-natt-avgift-7-19-taxa-3-torsd-plus-forbud.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 3` — blue
3. **[P]** `Torsd` / `0-6` — orange-yellow, with a round prohibition sign
4. **[M]** lower on the same post — **a separate** no-stopping sign (`C39`), large,
   facing another direction

Taken at night, the sign lit by a street lamp.

Why it matters: **two main signs on one post**, and the second contradicts the first if it
is taken as part of the stack. The schema has no place for a second main sign.

**Meaning (developer):** A fee on weekdays 07:00–19:00 and on Saturdays (days before a
holiday) 11:00–17:00; at other times, a free plain P. On top of that, no parking every
Thursday 00:00–06:00. There is also something odd: a no-stopping sign at the bottom of
the same post. I cannot interpret the whole post with it; I am confused and would not
know how to park.

---

## 057 · Parking disc or a free ticket, 2 hours
`057-p-skiva-2tim-eller-gratis-biljett.png`

1. **[M]** `Avgift` — blue (the top of the stack is not fully visible)
2. **[P]** a parking disc pictogram and `P`, then `2tim` / `eller` / `gratis` / `biljett`
   / `alla dagar` / `07-23` — blue
3. **[P]** a white plate with an arrow to the right

Why it matters: **a parking disc** (reference entry `p-skiva`), plus `p-biljett` and
`alla dagar`. "A disc OR a free ticket" is a choice the schema cannot express.

**Meaning (developer):** Hard for me to interpret. There is no main parking sign on top;
the stack starts with the plate "Avgift", which is the first condition. If this is
parking, I would say it is paid. The next plate says you may park for 2 hours only. I
read it as: 2 hours at most; without a ticket (biljett), use a parking disc and pay; with
a ticket, park free. 2 hours at most.

---

## 058 · Night: Klass I, 22-06 in three day classes, outside marked bays
`058-natt-klass-i-22-06-roda-siffror-utanfor-markerad.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** a car pictogram, `Klass I`, then `22-06` in black, `(22-06)` in brackets,
   `22-06` **in red** — blue
4. **[P]** `Utanför` / `markerad` / `plats` — yellow, with a round sign
5. **[P]** `SECURITAS` / `0771-767000` — blue, operator plate
6. **[I]** `MOBILL` / `801` / a QR code — white board
7. **[I]** a second board: `epark` / `801` / `Parkster`

Why it matters: **`Klass I` names the passenger car in words.** Also all three day classes
on one plate, and `Utanför markerad plats` at night.

**Meaning (developer):** Parking is always paid. The time is limited: you may park only
22:00–06:00, every day of the week. Only for class I cars. No parking outside the marked
bays.

---

## 059 · From afar: 07-20 (08-17), disc for 2 hours, then a fee
`059-avstand-p-skiva-2tim-darefter-avgift.png`

1. **[M]** P — blue square
2. **[P]** `07-20` / `(08-17)` and below a disc pictogram, `2 tim` / `därefter` /
   `avgift` — blue
3. **[P]** `Svensk Säkerhet` / `010-207 85 85` — blue, operator plate
4. **[I]** a board with the code `6000`

A small photo: the sign fills a small part of the frame, and the small text is at the
edge of legibility.

Why it matters: **a disc and a fee together** — two hours by disc, then paid. Also a test
on a small frame: the product must either read it or say honestly that it did not.

**Meaning (developer):** Parking here only with a parking disc, and only at certain
times. You may park:
- 07:00–20:00 on weekdays
- 08:00–17:00 on Saturdays and days before a holiday
- 09:00–16:00 on Sundays and holidays

The first two hours are free, then there is a fee.

---

## 060 · Night, from afar: Lastplats 7-19, 0-15 m, fee at other times
`060-natt-lastplats-ovrig-tid-avgift.png`

1. **[M]** yellow `Last-` / `plats` with a round no-stopping sign
2. **[P]** `7-19` — yellow
3. **[P]** `0-15 m` — yellow
4. **[P]** `P` / `Övrig tid` / `avgift` / `Taxa 2` — blue

Night; the sign shot from afar and at an angle, under street lights.

Why it matters: **the same type as `041`, in poor conditions.** There is something to
compare with: on the good frame the reading is right, and here one sees what is lost.

**Meaning (developer):** A loading bay where stopping and parking are prohibited on
weekdays 07:00–19:00, and parking is prohibited on (cannot read when — poor quality).
This applies to a stretch of (cannot read — poor quality) metres from the sign. At other
times, paid parking is allowed.

---

## 061 · The same sign from very far away
`061-lastplats-langt-avstand.png`

The sign is a narrow strip in the middle of the frame. The yellow top, the blue bottom and
the shape of the stack can be made out; **no plate's text can be read.**

Why it matters: **the extreme case of distance.** The only right answer is a refusal or a
clearly incomplete reading. Confident lines here would be exactly the invention caught on
`035`.

**Meaning (developer):** Poor quality, cannot read, but looks similar to 060.

---

## 062 · Klass I, 14 days, no parking for trailers
`062-klass-i-14-dygn-slapfordon-forbud.png`

1. **[M]** P — blue square
2. **[P]** car pictogram — blue
3. **[P]** `14 dygn` — blue
4. **[P]** `Uppställning` / `av släpfordon` / `förbjuden` / `Tanums kommun` — orange
5. **[P]** pictograms "tent, motorhome, trailer, crossed out" and `Camping förbjuden` /
   `Camping verboten` / `No camping` — orange

Why it matters: **a stay in DAYS** — `14 dygn`, a unit the schema does not have (it knows
`minutes` and `hours`). Also two prohibitions that are not in the reference: parking
trailers and camping. An honest test of the whitelist.

**Meaning (developer):** Not 100% sure, but I think it is free parking for at most 14
days in a row, for class I cars.

---

## 063 · Night: permit 06-16, disc for 3 hours, three day classes
`063-natt-p-tillstand-06-16-p-skiva-3tim.png`

1. **[M]** P — blue square
2. **[P]** `Giltigt` / `P-tillstånd` / `erfordras` / `06-16` — blue
3. **[P]** a disc pictogram and `3 tim`, then `16-06` in black, `(00-24)` in brackets,
   `00-24` **in red** — blue

A night close-up, with frost and glare on the sign.

Why it matters: **a permit and a disc on one sign** — by permit during the day, by disc at
night. Also a third case of red digits, and `p-skiva` a second time.

**Meaning (developer):** On weekdays 06:00–16:00 you may park only with a special permit,
and then for free within that time. Without a permit you may park:
- on weekdays 16:00–06:00;
- on Saturdays / days before a holiday and on Sundays / holidays, 00:00–24:00;
- for 3 hours only, with a parking disc (free).

---

## 064 · Motorcycles, Tuesday 9-17, season 1/4-30/11 — frame cropped
`064-motorcykel-tisd-9-17-beskuren.png`

1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue
3. **[P]** `Tisd` / `9-17` — yellow, with a round sign
4. **[P]** `1/4-30/11` — blue
5. **[P]** `0-10 m` — blue, **cut off by the bottom edge of the frame**

Why it matters: **a cropped bottom plate.** The bottom of the sign physically did not make
it into the frame, and the right answer is to say so, not to fill it in.

**Meaning (developer):** Parking only for motorcycles, only from 1 April to 30 November
(no parking at other times). On top of that, no parking every Tuesday 09:00–17:00. A
stretch 0–10 metres from the sign (still readable, although cropped).

---

## 065 · Charging, fee, 4 spaces — the whole post
`065-laddning-avgift-4-platser-med-automat.jpg`

1. **[M]** P — blue square
2. **[P]** charging pictogram — blue, a car with a cable and a lightning bolt
3. **[P]** `Avgift` — blue
4. **[P]** `4 platser` — blue
5. **[P]** arrow left — white
6. **[I]** a payment machine marked `7527` beside the post

Note: the same sign as `039`, which is a crop of this frame. Here the whole post and the
car park around it are in view.

**Meaning (developer):** _to be filled in_
Yes, same as 039. See that. 
---

## 066 · Reserved for the caretaker, permit required
`066-reserverad-vaktmastare-tillstand-pil.jpg`

1. **[M]** P — blue square
2. **[P]** `Reserverad` / `Vaktmästare` — blue
3. **[P]** `Tillstånd` / `erfordras` — blue
4. **[P]** arrow left — white

**Meaning (developer):** _to be filled in_
"Reserverad Vaktmästare" is limiting plate "for whom the place is" - for a caretaker. That caretaker must has valid permit. Only with these conditions parking is allowed (standard 24 h rule then). Dashed green line indicating parking window is correct. 
---

## 067 · Permit required, reserved for a business, 2 spaces
`067-tillstand-reserverad-verksamhet-2-platser.jpg`

1. **[M]** P — blue square
2. **[P]** `Tillstånd` / `erfordras` — blue
3. **[P]** `Reserverad` / `Verksamhet` — blue
4. **[P]** `2 platser` — blue

**Meaning (developer):** _to be filled in_
"Reserverad Verksamhet" is limiting plate "for whom the place is" - for someone doing "activities" (probably visiting a local business place or a worker, or gym). That visitor must has valid permit. Only with these conditions parking is allowed (standard 24 h rule then). Dashed green line indicating parking window is correct. 
---

## 068 · Private parking, parking forbidden
`068-parkering-forbjuden-privat-parkering.jpg`

1. **[M]** `Parkering` / `förbjuden` — yellow with a red border, a no-parking symbol on
   the left
2. **[P]** `Privat parkering` — blue with a white border

Why it matters: **an operator's board shaped like a road sign.** The prohibition is
spelled out in words beside the symbol, and the plate below names the owner, not a rule.

**Meaning (developer):** _to be filled in_
Essentially, no parking here. "Privat parkering" allows some parking to some people, but unlikely for general public and no other explanations given. It could be a private land, or standard street parking rules do not apply here. 
---

## 069 · Staff, a valid permit required
`069-personal-giltigt-tillstand-securitas.jpg`

1. **[M]** P — blue square
2. **[P]** `Personal` — blue
3. **[P]** `Giltigt` / `P-tillstånd` / `erfordras` — blue
4. **[P]** `Securitas` / `0771767000` — orange, operator

**Meaning (developer):** _to be filled in_
"Personal" is limiting plate "for whom the place is" - the parking spaces are reserved exclusively for staff/employees who work at that specific facility or company. That visitor must has valid permit. Only with these conditions parking is allowed (standard 24 h rule then). Dashed green line indicating parking window is correct. 
---

## 070 · Regionservice, one space
`070-regionservice-1-plats.jpg`

1. **[M]** P — blue square
2. **[P]** `REGIONSERVICE` — blue, small capitals
3. **[P]** `1 plats` — blue

Note: the sign stands some way off; the text is legible but small.

**Meaning (developer):** _to be filled in_
"REGIONSERVICE" is limiting plate "for whom the place is" - the parking area is reserved exclusively for vehicles or staff belonging to the regional public services. Only with these conditions parking is allowed (standard 24 h rule then). Dashed green line indicating parking window is correct. One parking place. 
---

## 071 · Taxi, 3 spaces
`071-taxi-3-platser.jpg`

1. **[M]** P — blue square
2. **[P]** `TAXI` — blue
3. **[P]** `3 platser` — blue

**Meaning (developer):** _to be filled in_
Parking for taxis only. 3 places. The app shows solid green line. I think it should be dashed green line (like in other cases of plates that limit it to certain types of visitors like service cars, care takers, activities. it should be in out engine - if general public - solid, if some special thing like taxi, activities - dashed line)
---

## 072 · Blood-donor car, one space
`072-blodbil-1-plats.jpg`

1. **[M]** P — blue square
2. **[P]** `BLODBIL` — blue
3. **[P]** `1 plats` — blue

Why it matters: **an eligibility no reference entry knows.** A vehicle named by its
errand, not by its type.

**Meaning (developer):** _to be filled in_
"BLODBIL" is limiting plate "for whom the place is" - the parking area is reserved exclusively for vehicles for transporting blood (to hospitals). Only with these conditions parking is allowed (standard 24 h rule then). Dashed green line indicating parking window is correct. One parking place. 
---

## 073 · 30 min, and a fee for buses with red digits
`073-30min-00-24-buss-avgift-roda-siffror.jpg`

1. **[M]** P — blue square
2. **[P]** `30 min` / `00-24` / `(00-14)` — blue
3. **[P]** bus pictogram, `Avgift` / `(14-24)` / `00-24` — blue, the last line in red
   digits

Why it matters: **two plates, each with its own day classes**, and red digits on the
second. The second plate speaks of buses only.

**Meaning (developer):** _to be filled in_
Parking limit 30 minutes in the periods between 00:00 and 24:00 (whole day and night) on weekdays and 00:00 - 14:00 on Saturdays and days before holidays - this 30 minutes is free of charge. Other periods - no such 30 minute limit, and then it is a standard single P-sign. There's also special condition for busses regarding payment which acts on top of the first plate that sets 30 minutes limit (they must also respect that first plate): busses have to pay for parking in the periods between 14:00 and 24:00 on Saturdays and days before holidays and  00:00 and 24:00 (whole day and night) on Sundays and holidays. Additional consideration: we must show parking windows for general public, not for busses, because info for bussess is only about their payment; if car arrives in the period when it is paid parking for busses, we should show as free parking (as if we read cars); otherwise, we would have to show separate sections one for general public and one for busses, and we don't do it in any other cases. It's a bit tricky, so if you have objections, let me know. 
---

## 074 · Signs at a long distance
`074-skyltar-pa-langt-avstand.jpg`

1. Two blue P signs on the far side of a car park. Nothing written on them can be read.

Why it matters: **the frame where the honest answer is a refusal.** A sign is in view;
none of it is legible.

**Meaning (developer):** _to be filled in_
I scanned the sign that is nearest to the viewer and still, as a human, I cannot read the sign at all - too far, too poor quality. The app seems to not be able to read it too ("Too little of the sign was read to say what it states | confidence 48%"). However, the app draws a dashed green line for 24h free parking. Moreover, the app wrongly claims the parking sign E19 (I can't read the sign but I do see that there is no such main sign on the pole). I would say this is the questionable solutions: in such a case with too low confidence the app should boldly claim it cannot read the sign and should not provide any parking window. 
---

## 075 · A P sign whose plates are too far away to read
`075-p-med-olasliga-plattor-pa-avstand.jpg`

1. **[M]** P — blue square
2. **[P]** `Förhyrda platser` — blue, legible only when magnified
3. **[P]** an operator's plate — blue, text not legible

Note: cars stand along the street between the camera and the sign.

**Meaning (developer):** _to be filled in_
Same as 074, I scanned the nearest sign pole in view, and similarly - it is too blurry to claim anything. The main sign is visible - standard p-sign, but the plates cannot be read. The app identified the first plate as "P-tillstånd erfordras" and I would guess that in fact it is "Förhyrda platser" (it looks more so, although it's too blurry to be certain). the confidence level is 92% by the app, and I would argue it should be lower. The app again draws the dashed green line, which could be correct if it was "special permit required", but incorrect if it is "reserved parking spots". I would say the app should have decrease the confidence and refuse providing the parking window. Moreover, a fresh idea, if the vision model returns lowered confidence for what it read (like that first plate) - we should provide a general statement "plate could not be read reliably" instead of providing a real plate text which could be completely wrong (as I said, I would say the first plate reads "reserved spots" and not "special permit required"). 
---

## 076 · Several posts across a car park
`076-flera-skyltar-pa-avstand-kontorshus.jpg`

1. Three or four posts by an office building: a P with a disabled pictogram, a P with
   `Avgift` / `4 tim` and further plates, a P with `1 tim`. None of the text is legible
   from here.

Why it matters: **more than one sign in the frame**, and the question of which post the
bay in front belongs to.

**Meaning (developer):** _to be filled in_
Again, I scanned the nearest sign pole in view, and again I think the app wrongly provides the plates text. It gave the first plate as "P-tillstånd", while what I would see is either "1 tim" or "1 plats". Since I can't tell, but sure the app is wrong, the better solution would be to admit we can't read the plate! And do not draw any parking window, and lower the cofidence. 
---

## 077 · No parking, rented spaces, at dusk
`077-gul-forbud-forhyrda-platser-skymning.jpg`

1. **[M]** no-parking symbol — yellow with a red border
2. **[P]** `Förhyrda platser` — blue, cut off by the right edge of the sign
3. **[P]** `P-tjänst V.` / `031-51 88 10` — yellow, operator, partly hidden by the post

Why it matters: **low sun behind the sign**, and part of a plate outside the frame. The
same sign as `007`, in worse light.

**Meaning (developer):** _to be filled in_
No parking zone, parking is only on "rented spots", so not for general public. Correctly drawing "no parking here" red dashed line. All OK. 
---

## 078 · A P sign papered over with stickers
`078-p-skylt-overklistrad.jpg`

1. **[M]** P — blue square, almost covered by football stickers (`1904`, `BLÅVITT`)
2. **[P]** a blue plate, its text unreadable under the stickers

Why it matters: **the sign is there and cannot be read.** The pair to `011`, where
stickers cover part of the text; here they cover nearly all of it.

**Meaning (developer):** _to be filled in_
Parking with Förhyrda platser. Correct outcome by the app (statement "The sign sets no parking window here: these spaces are rented, and how long a rented space may be used follows from its rental, not from this sign.")
---

## 079 · A P sign behind a tree
`079-p-skylt-bakom-trad.jpg`

1. **[M]** P — blue square, seen almost edge-on and partly hidden by foliage
2. **[P]** two blue plates, text not legible

**Meaning (developer):** _to be filled in_
Parking with Förhyrda platser. Correct outcome by the app (statement "The sign sets no parking window here: these spaces are rented, and how long a rented space may be used follows from its rental, not from this sign."). However, the app wrote the first plate as "Förhyrda park" and I would say it's "Förhyrda platser" altught it's blurry to be certain.
---

## 080 · A P sign on the far side of a car park
`080-p-skylt-pa-avstand-parkeringsyta.jpg`

1. A blue P with plates by a building across the car park, too far away to read.

**Meaning (developer):** _to be filled in_
The sign is at distance and blurry: I can see the main P-sign and the two arrows - to the left and to the right, but I can't read two plates. The app admits it cannot read the plates, provides confidence level "Too little of the sign was read to say what it states | confidence 57%" but still draws dashed green line of free parking in parking window section, moreover it ignores two arrows pointing at opposit directions (usually, with such arrows, the app should provide two separate parking window sections, and we have only one by the app here). I would say, the app should refuse providing the parking window. 
---

## 081 · A P sign through foliage
`081-p-skylt-pa-avstand-genom-lov.jpg`

1. A blue P with plates across a car park, seen through the branches of a tree. Not
   legible.

**Meaning (developer):** _to be filled in_
Same blurry as 080 - I would say the app should refuse providing parking window claim. 
---

## 082 · A P sign on a residential street
`082-p-skylt-pa-avstand-bostadsgata.jpg`

1. A blue P with plates on the far side of the bays. Not legible.

**Meaning (developer):** _to be filled in_
Same blurry as 081 - I would say the app should refuse providing parking window claim. 
---

## 083 · No parking, rented spaces, from across the lawn
`083-gul-forbud-forhyrda-platser-pa-avstand.jpg`

1. **[M]** no-parking symbol — yellow with a red border
2. **[P]** `P` `Förhyrda platser` — blue
3. **[P]** `P-Tjänst V.` / `031-51 88 10` — yellow, operator

Note: legible when magnified. The same sign as `007` and `077`, from a third distance.

**Meaning (developer):** _to be filled in_
No parking, only Förhyrda platser. Correct outcome by the app, all OK. 
---

## 084 · No parking, the operator, and a speed-bump sign below
`084-gul-forbud-p-tjanst-vast-farthinder.jpg`

1. **[M]** no-parking symbol — yellow with a red border, no words
2. **[P]** `P-tjänst Väst AB` / `031-51 88 10` — yellow, operator
3. **not part of the stack:** a round advertising sticker (`GAIS TIPO`) on the post
   between the plates
4. **not part of the stack:** `Farthinder` — yellow, lower on the same post

Why it matters: **an unrelated sign on the same post**, as on `026`, and a sticker stuck
between the plates.

**Meaning (developer):** _to be filled in_
No parking. Additional plate - Farthinder - means road bump (but doesn't relate to any parking rules)
---

## 085 · A P sign with plates behind a barrier
`085-p-med-plattor-bakom-bom.jpg`

1. **[M]** P — blue square
2. **[P]** several blue plates and one yellow one; the text is small and only partly
   legible

Note: a road barrier crosses the foreground.

**Meaning (developer):** _to be filled in_
Parking with "Särskilt P-tillstånd erfordrasText panel (T22). A special parking permit is required" (panel 1 read correctly). But second panel reads by app: "Gäller ej måndag kl 00-24" - that cannot be verified (too blurry), the app or vision model might have made a mistake there. It's better to claim the panel could not be read. 
---

## 086 · P, 1 hour, arrow left
`086-p-1tim-pil-europark.jpg`

1. **[M]** P — blue square
2. **[P]** `1 tim` — blue
3. **[P]** arrow left — white
4. **[P]** `Europark` and a telephone number — blue, operator

**Meaning (developer):** _to be filled in_
Parking for 1 hour to the left of the sign. 
---

## 087 · A car park against the sun
`087-motljus-parkering-pa-avstand.jpg`

1. A post with signs across the car park, in strong backlight. Nothing on it is legible.

**Meaning (developer):** _to be filled in_
I can see a p-sign, arrow to the left and two plates that I can't read. The vision model returned some text which I am not sure is correct. We need some engine system which would differentiate between vision model text that we are sure of from the one we are not sure of, and for the latter - claim in the app the plate could not be read reliably. 
---

## 088 · Fee 8-20 (8-15), red rate, residents C-NV, Monday 8-11
`088-avgift-8-20-rod-taxa-boende-c-nv-mandag-8-11.jpg`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `8-20` / `(8-15)` — blue
3. **[P]** `Röd taxa` — blue
4. **[P]** `Boende` / `C-NV` — white with a black border
5. **[P]** `Måndag` / `8-11` — yellow with a red border, a no-parking symbol on the left

Why it matters: **all three day classes on one post**, a residents' permit area, and a
cleaning prohibition on Monday morning.

Note: this file did not come from the developer's phone. Its source is to be confirmed
before the set is published.

**Meaning (developer):** _to be filled in_
Parking fee for periods between 08:00 and 20:00 on weekdays and between 08:00 and 15:00 on saturdays and days before holidays. Other time free. Payment by red taxa. Residents have special conditions for parking. No parking on Mondays between 08:00 and 11:00. Important note: the app wrongly drew the parking window when I scanned the sign on 2026-09-23 at 13:08. It drew a window of 24 hours with solid red line from 13:08 Wednesday to 13:08 Thursday. Why it is wrong: according to the avgift plate, if you start at 13:08, your fee is untill 20:00. Then, from 20:00 to 08:00 next day is free parking. Then from 08:00 to 13:08 it is again a fee. 
---

## 089 · Loading bay and a paid zone on one post
`089-lastplats-zon-c-boende-centrala.png`

1. **[P]** `Last-` / `plats` — yellow, ABOVE the main sign
2. **[M]** no stopping — yellow, two crossed bars
3. **[P]** `6-16` — yellow
4. **[P]** `P` `Avgift` / `16-21` — blue
5. **[P]** `Zon C` — white
6. **[P]** `Boende` / `Centrala` — white
7. **[I]** a small white board of fine print — not legible

**Meaning (developer):** _to be filled in_
Place for goods loading and unloading where parking is prohibited in the following periods: on weekdays between 06:00 and 16:00. Other times parking is allowed according to standard parking rules. on weekdays between 16:00 and 21:00 - paid parking. Residents may have separate terms.
---

## 090 · Fee, angled bays, zone E, arrow
`090-avgift-uppstallning-zon-e-pil.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `8-21` — blue
3. **[P]** cars drawn side by side (how to stand) — blue
4. **[P]** arrow right — white
5. **[P]** `Zon E` — white
6. **[P]** the top of one more blue plate, hidden behind a parked car

**Meaning (developer):** _to be filled in_
Parking fee in the periods between 08:00 and 21:00 on weekdays, other times free. To the right of the sign. Parking within marked bay placing vehicles as shown on the plate (perpendicular to the road edge). Zone E must relate to payment taxa. 
---

## 091 · Fee, a Thursday prohibition, residents
`091-avgift-7-19-torsd-boende.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `Taxa 5` — blue
3. **[P]** `Torsd` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol on the left
4. **[P]** `Boende` / `Bl` — white
5. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
Parking fee in the periods between 07:00 and 19:00 on weekdays by taxa 5, other periods parking is free. No parking on Thursdays between 08:00 and 16:00 in the period of 1st of november to 15th of may inclusive. Residents might have a special parking condition. 
---

## 092 · Fee and residents, against a dark wall
`092-avgift-boende-mork-vagg.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `Taxa 5` — blue
3. **[P]** `Månd` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol on the left
4. **[P]** `Boende` / `Bl` — white
5. **[I]** `Betala digitalt` — white, with the city’s crest

Note: the prohibition plate reads Monday, not Thursday as on `091`.

**Meaning (developer):** _to be filled in_
Same as 091
---

## 093 · No parking, Wednesday, with arrows
`093-forbud-onsdag-pilar.png`

1. **[M]** no parking — round
2. **[P]** `Onsdag` / `8-16` / `1/11-15/5` — yellow
3. **[P]** arrows up and down — yellow

**Meaning (developer):** _to be filled in_
No parking between November 1 and May 15. Stretches before and after the sign. The sign pole does not contain any parking allowance signs, such as e19, and our app says "The sign restricts parking only at the times written on its plate. About parking here at other times the sign states nothing: the general rules of the road apply, and they are not on this sign." (not drawing a parking window diagram). I think we need to fix our engine and correct what is written in main readme: I will explain by the example of this image: 
- the prohibitory sign prohibits parking for certain period only; for other period - no prohibition, but no parking allowed sign either. However, that means that general parking rules apply. Those are bassically what we show in "general parking rules" (which must be edited to also include 24 hours limit, by the way). The general parking rules in Sweden say that you may park for 24 hours on a street with no signs (with all other rules, such as in the direction of travel, not obscuring traffic, and so on). I thik our app in cases like this should show a green solid line for 24 hours parking (if outside prohibitary period). 
---

## 094 · 7 days, a Thursday prohibition for the winter months
`094-p-7-dygn-torsd-vintersasong.png`

1. **[M]** P — blue square
2. **[P]** `7 dygn` — blue
3. **[P]** `Torsd` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol on the left
4. **[P]** arrow left — white

Note: the round sign behind the post shows its back; it serves the other direction.

**Meaning (developer):** _to be filled in_
Free parking for 7 consequtive days allowed (7 dygn), to the left of the sign. No parking on Thursdays from November 1 to May 15. Important note: the app incorrectly considered 7 dygn as 7 hours. I scanned it on 2026-09-23 at 14:24, and the app said the parking window is untill Wednesday 23rd at 21:24. That's 7 hours, not 7 days. Must be fixed. 
---

## 095 · A short stay above a paid stay
`095-30min-plus-avgift-taxa.png`

1. **[M]** P — blue square
2. **[P]** `30 min` / `7-20` / `(9-18)` and a line of red digits too blurred to read — blue
3. **[P]** `Avgift` / `7-19` / `Taxa 5` — blue
4. **[P]** `Övrig` / `tid` — yellow with a red border, a no-parking symbol on the left
5. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
Parking only for 30 minutes in the periods betweein 07:00 and 20:00 on weekdays, and between 09:00 and 18:00 on saturdays and days before holidays, and - also some period on sundays and holidays that can't be read (blurry).  Other times - no parking. Paid parking between 07:00 and 19:00 on weekdays by taxa 5. Other times - no parking. Note: the app read the red days as 09:00 and 18:00 but that is unverified - I can't read the red from the picture. I think this plate must indicate that the reds could not be read or entire plate could not be read entirely. If so, we can as well say we can't produce the parking window, or if possible, provide the dashed green line with an honest verdict that reds are unclear. 
---

## 096 · Several posts at one kerb, Solna residents
`096-flera-stolpar-boende-solna.png`

Two branches on one pole.

Left, lower:
1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa A` — blue
3. **[P]** `Boende` / `Solna` — white
4. **[P]** `Tisdag` / `10-14` / `Udda veckor` / `Augusti-Juni` — yellow with a red border, a no-parking symbol
5. **[I]** an area-code board with app adverts — too blurred to read
6. **[P]** arrow left — white

Right, higher:
1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue
3. **[P]** `Avgift` / `Taxa D` — blue
4. **[P]** `Boende` / `Solna` — white
5. **[P]** arrow right — white

Why it matters: **more than one post in the frame**, with the question of which one rules
the bay in front.

**Meaning (developer):** _to be filled in_
Interesting case - the picture has two separate sets of signs mounted on one pole (left branch and right branch). I scanned the entire picture, and the model seemed to return only the left branch. The app analyzed the left branch correctly: 
- Paid parking only by taxa A, to the left of the sign, no parking  on Tuesdays between 10:00 and 14:00, in odd weeks, from August to June inclusive, residents have special permit. 
But the right sign was not scanned and analyzed at all, although it was as well sent to the model. 
We should probably have two readings and two windows at the same screen. Otherwise, if that's difficult, the current behavior is correct. Then I scanned separately the right branch, the app read it correctly: 
- parking for motorcycles only, always a fee by taxa D, to the right of the sign, residents have special conditions. 
---

## 097 · Fee, rate A, Solna residents, Wednesday
`097-avgift-taxa-a-boende-solna-onsdag.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa A` — blue
3. **[P]** `Boende` / `Solna` — white
4. **[P]** `Onsdag` / `10-14` / `Udda veckor` / `Augusti-Juni` — yellow with a red border, a no-parking symbol
5. **[P]** `Biljett-` / `automat` — blue
6. **[I]** an area-code board with app adverts — too blurred to read

**Meaning (developer):** _to be filled in_
Parking is always paid by taxa A, No parking (C35) on Wednesdays between 10:00 and 14:00, in odd weeks, from August to June inclusive, residents have special conditions. The app could not interpret "Boende Solna" because of the "Solna" which is a district in Stockholm. Expected - it interprets "boende" as residents, and that's it. The app drew a dashed red line - no reason for dashed, it should be solid red (paid paring). It wrongly claimed "The sign requires a parking ticket; no fee is stated" - it does not require a parking ticket, the plate just says "Avgift", and fee is also stated as taxa A. 
---

## 098 · Fee, a rate, a Thursday prohibition, residents
`098-avgift-7-19-tors-boende-tr.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
3. **[P]** `Tors` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol
4. **[P]** `Boende` / `Tr` — white
5. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
Parking with a Fee on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00, by taxa 4. No parking on Thursdays between 08:00 and 16:00, from 1 November to 15 May inclusive.Residents may have separate terms.The app / vision model read everything correctly - all OK. 
---

## 099 · A P sign with a yellow plate, at a distance
`099-p-med-gul-skylt-pa-avstand.png`

1. **[M]** P — blue square
2. **[P]** `Onsd` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol

**Meaning (developer):** _to be filled in_
Free parking and No parking (C35) on Wednesdays between 08:00 and 16:00, from 1 November to 15 May inclusive. App result correct - OK. 
---

## 100 · Fee and residents, by a hedge
`100-avgift-7-19-boende-so.png`

1. **[M]** P — blue square, the post leaning
2. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
3. **[P]** `Tisd` / `9-14` — yellow with a red border, a no-parking symbol
4. **[P]** `Boende` / `StE` — white
5. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
Parking with a Fee on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00, No parking  on Tuesdays between 09:00 and 14:00, Residents may have separate terms. App result is red correctly. 
---

## 101 · Motorcycles, a stretch in metres, a Tuesday prohibition
`101-motorcykel-0-10m-avgift-tisd.png`

1. **[M]** P — blue square
2. **[P]** motorcycle pictogram — blue
3. **[P]** `0-10m` — blue
4. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 14` — blue
5. **[P]** `Tisd` / `9-14` — yellow with a red border, a no-parking symbol
6. **[P]** `Boende` / motorcycle pictogram / `StE` — white

**Meaning (developer):** _to be filled in_
Parking for motorcycles only, stretch of 0-10 meters from the sign (or at the sign), Fee (T16) on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00, No parking (C35) on Tuesdays between 09:00 and 14:00, Residents may have separate terms. The app read the sign correctly - OK. 
---

## 102 · A P sign beside motorway direction signs
`102-p-bredvid-vagvisare-centrum-e4.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
3. **[P]** `Fred` / `9-14` — yellow with a red border, a no-parking symbol
4. **[P]** `Boende` / `StE` — white
5. **[I]** `Betala digitalt` — white, with the city’s crest

**not part of the stack:** `CENTRUM`, `E4`, `E20` and a blue arrow, on a post of their own.

Why it matters: **unrelated signs in the same frame.**

**Meaning (developer):** _to be filled in_
Parking with a Fee on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00, No parking (C35) on Fridays between 09:00 and 14:00, Residents may have separate terms. The app read the sign correctly - OK. 
---

## 103 · No parking and a 10 km/h limit
`103-forbud-plus-hastighet-10.png`

1. **[M]** no parking — E20 zone board, a yellow square with a red border; a sticker on the symbol
2. **[P]** `P` `Förhyrda` / `platser` — blue
3. **[P]** `Europark` / `0771-401020` — yellow, operator
4. **[P]** `Vid utebliven betalning av eventuell debiterad kontrollavgift utgår en avgift om 60 SEK för skriftlig betalningspåminnelse om betalansvar.` — yellow, the operator's terms
5. **not part of the stack:** `Grannsamverkan` — white
6. **not part of the stack:** `10` — round speed limit, a sticker on it

**Meaning (developer):** _to be filled in_
No parking, Förhyrda platser only. Sign reading correct. 
---

## 104 · 2 hours, fee, a Friday prohibition
`104-2tim-avgift-fred-vid-blomsterbutik.png`

1. **[M]** P — blue square, the post leaning
2. **[P]** `2 tim` / `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
3. **[P]** `Fred` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol
4. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
In the period between 07:00 and 19:00 on weekdays and on Saturdays and days before a holiday between 11:00 and 17:00 - parking is with a fee by taxa 4 and is limited by 2 hours; other times, no such limit and no fee. No parking (C35) on Fridays between 08:00 and 16:00, from 1 November to 15 May inclusive. The app read correctly - OK. 
---

## 105 · A P sign with plates at a street corner
`105-p-med-plattor-gathorn.png`

1. **[M]** P — blue square
2. **[P]** electric car with a plug — blue
3. **[P]** `3 tim` / `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
4. **[P]** `Fred` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol
5. **[P]** `Boende` / `Mi` / `3 tim` / `7-19` / `(11-17)` — white, with a charging-cable pictogram

**Meaning (developer):** _to be filled in_
Parking for Electric and plug-in hybrids only. In the period between 07:00 and 19:00 on weekdays and on Saturdays and days before a holiday between 11:00 and 17:00 - parking is with a fee by taxa 4 and is limited by 3 hours; other times, no such limit and no fee. No parking (C35) on Fridays between 08:00 and 16:00, from 1 November to 15 May inclusive. Residents may have separate terms. The app read the sign correctly - OK. 
---

## 106 · A P sign with a blue and a yellow plate, by a rock
`106-p-blaa-och-gul-skylt-vid-berg.png`

1. **not part of the stack:** a blue sign with a white `T`, ABOVE the P
2. **[M]** P — blue square
3. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
4. **[P]** `Månd` / `8-16` / `1/11-15/5` — yellow with a red border, a no-parking symbol
5. **[P]** `Boende` / `Mi` — white
6. **[I]** `Betala digitalt` — white, with the city’s crest

**Meaning (developer):** _to be filled in_
Parking with a fee on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00, with taxa 4. No parking (C35) on Mondays between 08:00 and 16:00, from 1 November to 15 May inclusive. Residents may have separate terms. Sign read correctly by the app. 
---

## 107 · Disabled parking with plates
`107-rorelsehindrad-med-plattor.png`

1. **[M]** P — blue square
2. **[P]** wheelchair pictogram — blue
3. **[P]** `0-6 m` — blue
4. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 4` — blue
5. **[I]** `Betala digitalt` — white, with the city’s crest

Note: no arrow on the pole.

**Meaning (developer):** _to be filled in_
parking for disabled with disabled permit only, stretch 0-10 meters, paid parking on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 by taxa 4. The app read the sign correctly. Note: I scanned twice because from the first crop scan, the app saw an arrow up to the sign (it's absent). The second scan correctly didn't find it. 
---

## 108 · A P sign under a two-way cycle sign
`108-p-under-cykelskylt.png`

1. **not part of the stack:** a bicycle with arrows up and down — white, cycling both ways
2. **[M]** P — blue square
3. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 3` — blue
4. **[P]** `Torsd` / `0-6` — yellow with a red border, a no-parking symbol
5. **[P]** `Boende` / `Sö` — white

**Meaning (developer):** _to be filled in_
Parking with a Fee on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 by taxa 3. No parking on Thursdays between 00:00 and 06:00. Residents may have separate terms.
---

## 109 · A loading bay outside a shop
`109-lastplats-vid-butik.png`

1. **[M]** `Last-` / `plats` and a no-stopping symbol — ONE yellow board
2. **[P]** `7-19` / `(7-19)` / `7-19` in red — yellow
3. **[P]** `0-15 m` — yellow
4. **[P]** `Torsd` / `0-6` — yellow with a red border, a no-parking symbol

Note: no arrow on the pole.

**Meaning (developer):** _to be filled in_
The sign prohibits parking only in certain periods. Reason - in these periods this place is for goods loading and unloading (lastplats). These periods are on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 07:00 and 19:00; on Sundays and public holidays between 07:00 and 19:00. Also no parking on Thursdays between 00:00 and 06:00. Other times outside of those periods - general parking rules apply - there is no explicit parking sign, but then it's generic (24 hours max, in the direction of travel, and so on). Important - this must be in the app's engine. There's also a stretch of 0-15 meters. Additional: I scanned the crop twice and both times the parking window has an indication "Up to the sign", although there is no an upword arrow on the pole. 
---

## 110 · Fee, 30 minutes, in a narrow street
`110-avgift-30min-smal-gata.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` — blue
3. **[P]** `30 min` / `8-22` / `(8-22)` — blue
4. **[P]** `Boende C4n` — blue, a sticker over the middle

**Meaning (developer):** _to be filled in_
Parking is always with a fee. In certain periods, there is a limit of 30 minutes for parking - outside those periods, standard duration. Those periods for a 30 min limit are: on weekdays between 08:00 and 22:00; on Saturdays and days before a holiday between 08:00 and 22:00. Residents may have separate terms.The app read the sign correctly. 
---

## 111 · 2 hours with a yellow plate, by a rock path
`111-2tim-gul-skylt-vid-klippa.png`

1. **[M]** P — blue square
2. **[P]** `2 tim` — blue
3. **[P]** `Boende VS` — blue
4. **[P]** `Fred` / `9-12` / `Jämn vecka` — yellow with a red border, a no-parking symbol on the left

**Meaning (developer):** _to be filled in_
Parking limit is 2 hours always but No parking on Fridays between 09:00 and 12:00, in even weeks free parking. Residents may have separate terms. App read correctly. 
---

## 112 · One hour on a car park
`112-p-1tim-parkeringsyta.png`

1. **[M]** P — blue square
2. **[P]** `1 tim` — blue
3. **[P]** arrows up and down — white

**Meaning (developer):** _to be filled in_
Free parking only for 1 hour max, before and after the sign. Read correctly. 
---

## 113 · Fee around the clock, a permit, rented spaces
`113-avgift-alla-dagar-tillstand-forhyrda.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `alla dagar` / `0-24` — blue
3. **[P]** `Tillstånd` / `461` — blue
4. **[P]** `Förhyrda` / `platser` — blue
5. **[P]** `Parkering` / `Malmö` / `040-6056944` — blue, operator

**Meaning (developer):** _to be filled in_
Reserved spots parking. All days a fee from 00:00 to 24:00. A special parking permit is required. 
---

## 114 · Fee and residents, by a painted wall
`114-avgift-taxa-boende-vid-vaggmalning.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa B` — blue
3. **[P]** `Boende` / `GK-J` — blue
4. **[P]** `8-12` / `Gäller` / `den 1:a` / `varje månad` — yellow with a red border, a no-parking symbol on the left

**Meaning (developer):** _to be filled in_
Paid parking by taxa B. No parking between 08:00 and 12:00 on the first of every month. Residents may have separate terms. Important: the app wrote "No parking (C35) on weekdays between 08:00 and 12:00" while in fact it is "the 1st of every month". Probably a vision model's fault. We need to do something with wrong text from vision model. Also one plate was reported as not interpreted because of "Boende GK-J". The Boende should mean residents - regadless of which boende. 
---

## 115 · Fee with a downward arrow
`115-avgift-taxa-pil-ned.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa B` — blue
3. **[P]** `Boende` / `GK-J` — blue
4. **[P]** `8-12` / `Gäller` / `den 1:a` / `varje månad` — yellow with a red border, a no-parking symbol on the left
5. **[P]** arrow down — white

Why it matters: **a downward arrow** — the rule applies up to the sign and ends there.

**Meaning (developer):** _to be filled in_
Same as 114 only with "up to the sign" arrow. 
---

## 116 · A P sign with a yellow plate outside a restaurant
`116-p-gul-skylt-vid-restaurang.png`

1. **[M]** P — blue square
2. **[P]** `Avgift` / `Taxa B` — blue
3. **[P]** `Boende` / `GK-D` — blue
4. **[P]** `18-22` / `Gäller` / `den 16:e` / `varje månad` — yellow with a red border, a no-parking symbol on the left

Note: the prohibition is on the 16th of every month, not on weekdays.

**Meaning (developer):** _to be filled in_
Same as 114 only No parking on weekdays between 18:00 and 22:00. 
---

## 117 · Evening and night hours, and a priority-road sign below
`117-p-18-8-plus-huvudled.png`

1. **[M]** P — blue square
2. **[P]** `18-8` / `(14-8)` / `0-24`, the last line in red — blue
3. **not part of the stack:** priority road — a yellow diamond

**Meaning (developer):** _to be filled in_
Free parking, allowed only from 18:00 to 08:00 on weekdays, between 14:00 and 08:00 on Saturdays and days before a holiday, and  between 00:00 and 24:00 on Sundays and public holidays. Other times no parking. Important: i scanned the sign on 2026-09-23 at 18:49 and the app wrongly suggested parking window of 24 hours untill Thursday at 18:49. But the plate states 18:00 to 08:00 on weekdays, so the window end should be on 08:00 on Thursday, then no parking untill 18:00.  
---

## 118 · A P sign and a priority-road sign, at a distance
`118-p-plus-huvudled-pa-avstand.png`

1. **[M]** P — blue square
2. **[P]** `30 min` / `9-18` / `(9-15)` — blue
3. **not part of the stack:** priority road — a yellow diamond

**Meaning (developer):** _to be filled in_
Parking for a max of 30 mins in the period of on weekdays between 09:00 and 18:00; on Saturdays and days before a holiday between 09:00 and 15:00 - parking is free. Othertimes - standard parking limits. The service could not interpret "main road" sign, which made the overall result look ugly (where must be certainty now is uncertainty). Main road is not a parking sign or plate, but it has some effect: Parking on main roads in sweden are forbidden if no other park signs are present. 
---

## 119 · A small P sign above a hedge
`119-p-liten-skylt-vid-hack.png`

1. **[M]** P — blue square
2. **[P]** `30 min` / `9-18` / `(9-14)` — blue
3. **[P]** arrows up and down — white

**Meaning (developer):** _to be filled in_
Free parking, in certain period the limit is 30 minutes, the periods are: on weekdays between 09:00 and 18:00; on Saturdays and days before a holiday between 09:00 and 14:00. Before and after the sign. App read it correctly. 
---

## 120 · 7 days, with a priority-road sign below
`120-p-7-dygn-plus-huvudled.png`

1. **[M]** P — blue square
2. **[P]** `7 dygn` — blue
3. **[P]** `8-12` / `3:e tisd` / `i månaden` — yellow with a red border, a no-parking symbol on the left
4. **not part of the stack:** priority road — a yellow diamond

**Meaning (developer):** _to be filled in_
Free parking for 7 consequtive days in a row. No parking between 08:00 and 12:00 on each month's 3rd Tuesday. Important: The app (or vision model) made a mistake interpreting the prohibition plate. It wrote: No parking (C35) on weekdays between 08:00 and 12:00, while in fact the prohibition acts on each 3rd Tuesday of a month. Our engine must be able to calculate such cases. Additionally, same problem as in 118 - could not interpret the main road sign. Parking on main roads in sweden are forbidden if no other park signs are present. 
---

## 121 · A P sign with an arrow, at the roadside
`121-p-med-pil-vid-vag.png`

1. **[M]** P — blue square
2. **[P]** cars drawn at an angle (how to stand) — blue
3. **[P]** electric car with a plug — blue
4. **[P]** `12 tim` — blue
5. **[P]** arrow left — white

**Meaning (developer):** _to be filled in_
parking only for 12 hours max, only for Electric and plug-in hybrids, only at the angle drawn on the plate, to the left of the sign. App read correctly. 

---

## 122 · 3 hours, arrow right
`122-p-3tim-pil-hoger.png`

1. **[M]** P — blue square
2. **[P]** parking-disc symbol / `3 tim` — blue
3. **[P]** cars drawn side by side (how to stand) — blue
4. **[P]** arrow right — white

**Meaning (developer):** _to be filled in_
Parking for 3 hours max, free but with a parking disc, to the right of the sign and perpedicular to the road edge. Read correctly. 
---

## 123 · A P sign with plates by a square
`123-p-med-plattor-vid-torg.png`

1. **[M]** P — blue square
2. **[P]** electric car with a plug — blue
3. **[P]** cars drawn side by side (how to stand) — blue
4. **[P]** `12 tim` — blue
5. **[P]** `Avgift` / `7-19` / `(11-17)` / `Taxa 1` — blue
6. **[P]** arrow right — white
7. **[I]** `Betala digitalt` — white

**Meaning (developer):** _to be filled in_
Parking only for Electric and plug-in hybrids, Only within a marked bay perpendicular to the road edge, max parking of 12 hours, and free outside selected Avgift periods, which are: Fee (T16) on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00. To the right of the sign. App read it all correctly. 
---

## 124 · A P sign with a yellow plate in greenery
`124-p-gul-skylt-i-gronska.png`

1. **[M]** P — blue square
2. **[P]** `1 tim` / `Avgift` / `7-19` / `(11-17)` / `Taxa 1` — blue
3. **[P]** `Måndag` / `7-17` / `30/9-30/5` — yellow with a red border, a no-parking symbol on the left

**Meaning (developer):** _to be filled in_
on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 - parking is limited only by 1 hour and with a fee by taxa 1. No parking on Mondays between 07:00 and 17:00, from 30 September to 30 May inclusive. Other times outside of those periods - standard p-sign. 
---

## 125 · A P sign with yellow plates by a doorway
`125-p-gula-plattor-vid-port.png`

_Verbatim reading not yet written._ A blue `P` with two yellow plates and a blue one,
outside a building entrance.

**Meaning (developer):** _to be filled in_
No parking because of the loading/unloading spot on weekdays between 07:00 and 19:00 and No parking on Tuesdays between 00:00 and 06:00. Other times outside of those periods - parking with a fee by taxa 3. I can't personally interpret (11-17) on the same plate as "övrig tid avgift". It looks like "övrig tid avgift" builds up on top of the prohibition, but then what is (11-17) on the same plate? 
---

## 126 · Fee, a rate, a Friday prohibition
`126-avgift-7-19-fred-0-6.png`

_Verbatim reading not yet written._ A blue `P` with `Avgift`, hours in two classes and a
rate, and a yellow Friday plate.

**Meaning (developer):** _to be filled in_
In the period of weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 - parking with a fee by taxa 3. No parking (C35) on Tuesdays between 00:00 and 06:00. Other periods outside of those - standard p-sign. 
---

## 127 · Bicycle parking, a stretch in metres
`127-cykel-0-12m.png`

_Verbatim reading not yet written._ A blue `P` with a bicycle pictogram and a metre
plate.

**Meaning (developer):** _to be filled in_
Free parking for bycicles and class 2 mopeds only. Stretch 0-12 m. 
---

## 128 · Disabled parking, a stretch in metres, a fee
`128-rorelsehindrad-0-6m-avgift.png`

_Verbatim reading not yet written._ A blue `P` with a wheelchair pictogram, a metre plate
and `Avgift` with hours.

Note: close in content to `027`. Worth checking whether it is the same sign before it is
marked up.

**Meaning (developer):** _to be filled in_
Parking for disabled with disabled permit only, stretch 0-6m, on weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 - paid parking with taxa 4. 
---

## 129 · Charging, a crossing sign and a speed limit on one post
`129-laddning-plus-overgangsstalle-30.png`

_Verbatim reading not yet written._ A blue `P` with a charging pictogram and plates;
lower on the post a pedestrian-crossing sign and a round `30`, neither part of the
parking stack.

Why it matters: **three unrelated signs on one post.**

**Meaning (developer):** _to be filled in_
Parking for Electric and plug-in hybrids only. On weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 11:00 and 17:00 - parking is free and limited by 3 hours. on weekdays between 07:00 and 19:00 - paid parking by taxa 5. No parking on Thursdays between 02:00 and 08:00, from 1 November to 15 May inclusive. Outside of these windows - standard p-sign. 
---

## 130 · 2 hours, fee, a Thursday prohibition, outside a shop
`130-2tim-avgift-torsd-vid-butik.png`

_Verbatim reading not yet written._ A blue `P` with `2 tim`, `Avgift` and a rate, and a
yellow Thursday plate.

**Meaning (developer):** _to be filled in_
On weekdays between 07:00 and 19:00; on Saturdays and days before a holiday between 09:00 and 16:00 - parking is free and limited by 2 hours. on weekdays between 07:00 and 19:00 - paid parking by taxa 5. No parking on Thursdays between 02:00 and 06:00, from 1 November to 15 May inclusiveOutside of these windows - standard p-sign. 
---

## 131 · Angled bays and an arrow, in snow
`131-p-uppstallning-pil-i-sno.png`

_Verbatim reading not yet written._ A blue `P` with a plate showing how the cars stand
and an arrow. Snow on the ground.

**Meaning (developer):** _to be filled in_
on weekdays between 07:00 and 19:00 - paid parking by taxa 5. Parking only within a marked bay perpendicular to the road edge. No parking on Mondays between 08:00 and 16:00, from 1 November to 15 May inclusive.  Residents may have separate terms. Applies to the left of the sign.
---

## 132 · Fee and residents, in snow
`132-avgift-boende-i-sno.png`

_Verbatim reading not yet written._ A blue `P` with `Avgift` and hours, an orange
prohibition plate and a residents' plate. Banks of snow below.

**Meaning (developer):** _to be filled in_
on weekdays between 09:00 and 19:00; on Saturdays and days before a holiday between 09:00 and 17:00 - paid parking. No parking on weekdays between 00:00 and 08:00; on Saturdays and days before a holiday between 00:00 and 08:00; on Sundays and public holidays between 00:00 and 08:00 on the side of the road with even house numbers. Outside of these periods - standard p-sign. Important note - our app does not make a difference (at least in this scan) between no parking on even house numbers side of the street and odd. We need to fix that somehow to at least says so in the UI. 
---

## 133 · 24 hours for visitors, permit required, one space
`133-24tim-besokande-tillstand-1-plats.png`

_Verbatim reading not yet written._ A blue `P` with `24 tim`, `Besökande`, `Giltigt
P-tillstånd erfordras`, `1 plats`, and an operator's plate at the bottom.

**Meaning (developer):** _to be filled in_
Parking for 24 hours max (standard rule written explicitly on the plate). Only for visitors. A special parking permit is required. 1 spot. 
---

## 134 · A P stack and a no-stopping sign on one post
`134-p-plattor-plus-forbud-stannande.png`

_Verbatim reading not yet written._ A blue `P` with plates and a downward arrow, and
below it a no-stopping sign.

Why it matters: **a prohibition below a permission on the same post.**

**Meaning (developer):** _to be filled in_
on weekdays between 09:00 and 19:00; on Saturdays and days before a holiday between 09:00 and 17:00 - paid parking. No parking (C35) on weekdays between 00:00 and 08:00; on Saturdays and days before a holiday between 00:00 and 08:00; on Sundays and public holidays between 00:00 and 08:00 on the side of the street with even house numbers. Outside of these periods - standard p-sign. Applies up to the sign, not past it.
---

## 135 · Fee and residents, by a brick wall
`135-avgift-boende-rott-tegelhus.png`

_Verbatim reading not yet written._ A blue `P` with `Avgift`, hours, an orange plate and
a residents' plate.

**Meaning (developer):** _to be filled in_
Standard p-sign, parking only within a marked bay.
---

## 136 · Rented spaces, arrows, one space
`136-forhyrda-platser-pilar-1-plats.png`

_Verbatim reading not yet written._ A blue `P` with `Förhyrda platser`, an arrow, a
further plate and `1 plats`. Winter light.

**Meaning (developer):** _to be filled in_
To the right - only reserved spots, no other parking. To the left - only visitors. 1 spot. 
---

## 137 · Rented spaces, the operator Securitas
`137-forhyrda-platser-securitas.png`

_Verbatim reading not yet written._ A blue `P` with `Förhyrda platser` and an operator's
plate (`SECURITAS`) on a corrugated wall.

**Meaning (developer):** _to be filled in_
Paid parking only. To the right of the sign. 
---

## 138 · Rented spaces, 2 spaces, arrows both ways
`138-forhyrda-platser-2-platser.png`

_Verbatim reading not yet written._ A blue `P` with `Förhyrda platser`, `2 platser` and a
plate with arrows both ways.

**Meaning (developer):** _to be filled in_
Reserved parking spots only. No other parking. To the left and right from the sign. 2 spots. 
---

## 139 · One hour every day 8-19, fee, a Thursday prohibition
`139-p-1tim-alla-dagar-avgift-torsdag.png`

1. **[M]** P — blue square
2. **[P]** `1 tim` / `alla dagar` / `8-19` — blue
3. **[P]** `Avgift` — blue
4. **[P]** `Torsdag` / `8-16` — yellow with a red border, a no-parking symbol on the left

Why it matters: **`alla dagar` written as a word.** The days are named instead of being
set by how the digits are printed.

**Meaning (developer):** _to be filled in_
Only paid parking. every day between 08:00 and 19:00 only 1 hour max of parking. No parking on Thursdays between 08:00 and 16:00. Outside of these periods standard p-sign (with a fee).
---

# Notes on the set

## Privacy

`004` and `013` were re-cropped: a car with a readable number plate and a person on a
lawn were removed from the frame. On `025` the developer covered the near car's plate.
`019` is kept as it is: a plate is in the frame, but at full resolution it is about 20 px
wide and unreadable, and no crop can remove it — the car stands at the same height as the
sign. The exception is explained in the main `README.md`.

## What the set covers

The hard cases the set was built to include, and where they are:

- **all three day classes:** brackets on `005`, `030`, `036`, `052`, `056`, `058`, `059`,
  `063`; red digits on `052`, `058`, `063`;
- **prohibition plates with a day** (street cleaning and similar): `028`, `030`, `031`,
  `034`, `036`, `044`, `049`, `052`, `054`, `056`, `064`;
- **`Avgift` with an explicit window:** `030`, `033`, `036`, `056`;
- **a parking disc:** `057`, `059`, `063`;
- **poor frames:** distance (`020`, `035`, `059`, `060`, `061`), snow and a finger
  (`055`), night (`056`, `058`, `060`, `063`), a cropped plate (`064`), stickers (`011`);
- **frames that are not parking signs**, for measuring triage: `043`, `045`, `046`,
  `047`, `048`, `051`, `053` — including one with no sign at all (`045`).

## Background colour: what it means

Yellow does **not** mean private land.

In Sweden, warning and prohibition signs have a yellow background, which reads well
against snow. A plate inherits that background, so a yellow plate means **a prohibition,
or a limit tied to one**. Blue and white plates stand under information and instruction
signs: parking is allowed on the stated terms. A green background is used only on
motorways, which are outside the product's scope.

This fits the rule that a prohibition takes priority: a prohibition has **a visible
mark**, not only the meaning of its text.

A separate case is **a yellow square with a round sign inside**: a zone sign, the start of
a zone. That is how `007` (a no-parking zone begins) and `011` (a paid parking zone) are
built. A yellow plate under such a sign belongs to the zone. On `019` the yellow `7-18`
plate belongs to the prohibition sign.

**The type of land is not extracted at all.** Not because private parking signs do not
exist — they do, with a standard landowner plate — but because a landowner cannot set a
rule against the law; they can only add conditions with plates. A `P` sign on private
land means exactly what it means on municipal land.

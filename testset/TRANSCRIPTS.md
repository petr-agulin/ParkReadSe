# The test set: what each sign says and what it means

64 photos from `photos/`, each described in two layers:

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

⚠️ A figure can be made out in a reflection in the building's glass — check that it is not
an identifiable person.

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

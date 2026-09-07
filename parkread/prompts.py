"""Промпты для двух вызовов модели.

Здесь остаётся только то, что кодом не проверяется: тон, границы темы, формулировки
задачи. Всё, у чего есть последствие — порог, арифметика, отбраковка лишних полей —
живёт в коде и в схеме (`AGENTS.md`, §9). Промпт отправляется провайдеру при каждом
запросе и занимает место в лимите токенов, поэтому его объём — тоже ресурс.

**Английский текст ниже — не перевод и не документация, а САМ ВОПРОС к модели.**
Переписать его — значит задать другой вопрос: отпечаток промпта сменится, и все
сохранённые ответы разом перестанут отвечать на него (`fixtures.fingerprint`).
Цена такой правки — полный прогон набора, около пятидесяти вызовов.

Поэтому при переводе проекта на английский **строки промптов не трогают**: они уже
на языке продукта. Переводят комментарии и документы вокруг них. Забывчивость здесь
не молчит: отпечаток сверяется тестами по обеим стадиям, и они краснеют сразу.

**Форма ответа не переписывается руками.** На OpenAI-совместимом диалекте провайдер
схему не принимает, поэтому список полей приходится объяснять словами. Если объяснять
их вручную, они разойдутся со схемой — не сегодня, так через три правки. Поэтому
скелет ответа **генерируется из самой схемы** функцией `shape_hint`: разойтись
он не может.
"""
from __future__ import annotations

import json


# --- скелет ответа из схемы ------------------------------------------------

def shape_hint(schema: dict, *, indent: int = 0) -> str:
    """Компактный скелет JSON по JSON Schema: имена полей, типы, перечисления.

    Описания полей не переносятся: они длинные и на русском, а модель ведёт
    англоязычная инструкция выше. Здесь нужна только форма."""
    defs = schema.get("$defs", {})

    def resolve(node: dict) -> dict:
        seen = 0
        while "$ref" in node and seen < 10:
            node = defs.get(node["$ref"].rsplit("/", 1)[-1], {})
            seen += 1
        return node

    def render(node: dict, pad: int) -> str:
        node = resolve(node)
        if "enum" in node:
            return " | ".join(json.dumps(v, ensure_ascii=False) for v in node["enum"])
        if "const" in node:
            return json.dumps(node["const"])
        t = node.get("type")
        if isinstance(t, list):
            t = next((x for x in t if x != "null"), "string")
        if t == "object":
            props = node.get("properties") or {}
            if not props:
                return "{}"
            req = set(node.get("required") or [])
            sp, sp_in = " " * pad, " " * (pad + 2)
            items = list(props.items())
            lines = []
            for n, (k, v) in enumerate(items):
                comma = "," if n < len(items) - 1 else ""
                tail = "" if k in req else "   // optional"
                lines.append(f'{sp_in}"{k}": {render(v, pad + 2)}{comma}{tail}')
            return "{\n" + "\n".join(lines) + "\n" + sp + "}"
        if t == "array":
            return "[ " + render(node.get("items") or {}, pad + 2) + " ]"
        if t == "integer":
            return "<integer>"
        if t == "number":
            return "<number>"
        if t == "boolean":
            return "true | false"
        return "<string>"

    return render(schema, indent)


# --- Стадия 0: отсев -------------------------------------------------------
#
# Порог смещён в сторону ПРОПУСКА. Отсечь настоящий знак дороже, чем потратить лишний
# вызов на мусор: во втором случае теряется вызов, в первом человек остаётся без ответа,
# стоя перед знаком.
#
# Число панелей спрашивается здесь намеренно. Это независимый от извлечения взгляд
# на ту же фотографию: другой вызов, другой промпт, общего контекста нет. На снимке 013
# модель слила две таблички в одну и сообщила, что уверена, — поэтому счёт панелей нужен
# оттуда, где о панелях больше ничего не спрашивают.

TRIAGE_INSTRUCTIONS = """Look at this photograph and answer two questions. Nothing else.

1. What is in the photograph?
   - "parking_sign" — a Swedish parking sign: a blue square with a white P, or a round
     no-parking sign, with or without plates below it.
   - "other_road_sign" — a road sign that is not about parking.
   - "not_a_sign" — anything else: a building, an object, a landscape, a person.

   When unsure between "parking_sign" and something else, answer "parking_sign".
   Letting a doubtful photo through costs one wasted call; wrongly rejecting a real
   sign leaves a driver standing in front of a sign with no answer at all.

2. How many plates BELOW the main sign state a rule?
   A rule is: hours, a duration, a fee, who may park, an arrow, a count of places.
   Count plates, not lines: a plate with four lines on it is one plate.

   Do NOT count, and do not include in the number:
   - the main sign itself;
   - a plate that only names a company and a phone number ("Mölndals Parkerings AB
     031-87 54 79", "Privat parkering / Brf ...");
   - a payment board: area code, app logos, QR codes, adverts for EasyPark or Parkster.
     These are often a stack of stickers with no clear edges between them.

   If the photo is not a parking sign, answer 0.
"""


# --- Стадия 1: извлечение --------------------------------------------------
#
# Три правила в начале — не украшение промпта, а прямые следствия ошибок, найденных
# на проверке модели (testset/PROBE_LOG.md). Каждое продублировано проверкой в коде:
# промпт просит, валидация гарантирует.

EXTRACT_INSTRUCTIONS = """You are reading a Swedish parking sign from a photograph.

FOUR RULES THAT ARE EASY TO GET WRONG:

1. The MAIN SIGN IS NOT A PANEL. The topmost element — a blue square with a white P,
   or a round no-parking sign — goes in "main_sign" ONLY. It must never appear in
   "panels", and "panel_count" counts only the panels below it.

2. WHICH SIGN IS AT THE TOP DECIDES WHETHER PARKING IS HERE AT ALL:
   - "parking" (E19) — a blue square with a white P. It permits parking AT THIS POLE.
   - "wayfinding_parking_house" (F28) — a blue sign that POINTS to a car park
     somewhere else. Its marks: a roof or a house drawn above or around the P, an
     arrow paired with a street name or address ("Torsgatan 12"), a company logo,
     or a board with no rule plates beneath it at all. It permits NOTHING where it
     stands — it names a destination.
   - "wayfinding_park_and_ride" — the same, for "Infartsparkering".
   - "prohibition_parking" (C35) — a round blue sign with ONE diagonal bar across it.
   - "prohibition_stopping" (C39) — the same round sign with TWO bars, crossed.
     One bar forbids parking, two forbid stopping as well. Count the bars.
   Reading a sign that points the way as "parking" turns a direction into permission
   to stand at the pole, and that is the most expensive mistake on this list. Where
   the choice is genuinely unclear, answer "unknown" rather than the likelier one.

3. A PANEL IS ONE PHYSICAL PLATE. Several lines printed on ONE plate belong to that
   one panel together. Never merge two plates into one panel, and never split one
   plate into two. This is the single most important thing on the sign: the same words
   grouped differently mean different rules.

4. THREE KINDS OF PANEL, and only the first one carries rules:
   - "sign_plate" — states a rule: hours, duration, fee, who may park, arrows, places.
   - "operator_plate" — a plate whose content is just a company name and a phone
     number ("Mölndals Parkerings AB 031-87 54 79", "P-tjänst V.", "Västia Parkering",
     "Privat parkering / Brf ..."). It looks like a proper plate and it is one, but it
     states no rule.
   - "info_board" — a payment machine board: area code, app logos, QR codes, adverts
     for EasyPark, Parkster and the like. Not a road sign at all.
   Report all three so nothing is silently dropped, but never mark an operator plate
   or a payment board as "sign_plate".

HOW TO FILL THE FIELDS:

- List panels top to bottom. Order carries meaning.
- "lines": verbatim Swedish text, line by line, keeping brackets and hyphens exactly
  as printed. "(8-15)" is not the same as "8-15". Empty list if the panel has no text.
  Put ONLY text there: a pictogram printed inside a line — a phone, a P, a wheelchair —
  is not text. Name it in "parsed" and leave it out of "lines". Never write an emoji.
- "parsed": only what you actually see. Every field is optional; a panel usually fills
  one or two. Do not guess a field to make the object look complete.
- "eligibility" says WHO the driver must be, and takes the closest listed value:
  "visitors" for "Besökande" and for "Endast gäster till ..." (a named place does not
  make it "custom"), "rented" for "Förhyrda platser", "permit_holders" when a permit
  is the only thing named. When a plate says both — "Förhyrd plats" AND "Särskilt
  P-tillstånd erfordras" — the renting is the circle and the permit is merely how it
  is proved, so answer "rented". Use "custom" only when nothing listed fits.
  A restriction on the VEHICLE ("Endast laddande elbilar") is not eligibility:
  that goes to "vehicle_class", and "eligibility" stays out.
- "vehicle_class": set it ONLY when the sign narrows the circle — a motorcycle
  pictogram, "Bil", an electric-car pictogram. A plain P sign narrows nothing, so leave
  the field out. Never infer "car" from the absence of a pictogram.
  A bicycle drawn on a plate is "bicycle" — in Sweden that symbol (T8-8) covers
  bicycles and class II mopeds together. A class I moped belongs with "motorcycle".
  If the pictogram shows a vehicle that is in NEITHER list — a horse, a tractor —
  leave "vehicle_class" out entirely and put "other" in "pictogram". Do not answer
  with the nearest listed vehicle: a tractor recorded as a truck turns one rule into
  another, and nothing downstream can tell that the answer was a substitution rather
  than a reading.
- "prohibition": true whenever the plate carries a round no-parking symbol. A yellow
  plate reading "Fred 0-6" or "Torsd 0-6" beneath a blue P says parking is FORBIDDEN
  in those hours. This is NOT an alternative to "scope_shift": that field says "for
  the rest of the time", a prohibition says "not then". Answering "scope_shift" where
  the plate forbids turns a ban into permission for exactly the hours it covers.
- "permit_required": whether something must be held or displayed in order to park.
  It answers a different question from "eligibility" and NEVER replaces it — a plate
  about permits still names a circle of drivers, and that circle goes in "eligibility"
  as before. "Särskilt P-tillstånd erfordras" on its own is eligibility
  "permit_holders" AND "permit_required": true. Where renting is also named —
  "Förhyrd plats / Särskilt P-tillstånd erfordras" — the renting is the circle, so
  eligibility is "rented", and "permit_required" stays true beside it. Filling one
  of the two fields in is not a reason to leave the other empty.
- "scope_shift": "remaining_time" ONLY when the plate says so IN WRITING — "Övrig tid",
  "Annan tid". It says the rest of that plate applies to the time NOT covered by the
  hours above it. Easy to miss and important: without it the engine cannot tell what
  applies outside the window.
  Never infer it from where the plate sits in the stack. A plate that states no hours
  of its own — "Boende", a bare symbol — is not "the remaining time"; it is a plate
  about WHO may park, and it says nothing whatever about when. Adding the field there
  makes the product tell the reader "applies outside the hours above", which is not
  written on the sign and not implied by it.
- "day_class" of a time window is decided by HOW THE DIGITS ARE PRINTED, and every
  window has one. Plain black digits mean "weekday" — that is what plain digits mean
  in Sweden, so do NOT answer "unspecified" just because no day is named. A named day
  ("Torsdag") means "named_weekday", and "alla dagar" written out means "all_days".
  Use "unspecified" only where there is no time window at all.
  BRACKETS AND RED INK ARE DIFFERENT SIGNALS, and mixing them up moves the rule to
  the wrong days of the week:
    · digits in brackets, "(10-17)", are "eve" — SATURDAYS and days before a holiday;
    · digits printed in red ink are "red" — SUNDAYS and public holidays.
  Brackets are never about Sundays. The colour of the ink is what makes a window
  "red", not the punctuation around it, and one plate may carry both kinds.
- "background_color" of a panel is the colour of THAT PLATE, not of the board it is
  mounted on. A blue plate screwed onto a yellow zone board is still blue. Colour
  carries rules here — yellow warns, red digits mean holidays — so borrowing it from
  the surroundings invents a rule that is not on the plate.
- "week_parity" and "dates" inside a time window narrow WHEN it applies, and both are
  easy to miss because they sit on a separate line of the same plate.
  "Jämna veckor" means even ISO week numbers, "Udda veckor" odd ones — the restriction
  comes round every second week, not every week.
  "dates" carries days and months without a year, as "MM-DD". Two forms appear on
  plates and both go here: a season, "1 nov-15 maj" or "Augusti-Juni", is
  {"mode": "only", ...}; an exception, "Gäller ej 1 juli - 31 juli", is
  {"mode": "except", ...}. A range may wrap the year end, so a first number larger
  than the second is correct. A single day is a range whose from equals its to:
  "Gäller ej 15/6 15/8" is two one-day ranges, not one range from June to August —
  read the plate, and do not assume a dash that is not printed.
  Miss any of this and the sign is read as applying far more often than it does.
- "placement": "as_shown" when the plate is a PICTURE of how to stand — cars drawn at
  an angle, nose-in, or up on the pavement. "marked_bay_only" only for the written
  rule about parking outside a marked bay. A drawing of slanted cars is "as_shown",
  never "marked_bay_only": they are different plates saying different things.
- "legibility": report stickers, dirt, glare, cropping. This is a field, not something
  to mention in "notes".
- "permits_parking": true when the plate itself shows a parking P and thereby allows
  parking again — for example "P Avgift" or "P Förhyrda platser" under a no-parking
  sign. It matters only when the main sign prohibits.
- "payment_method": only "ticket" or "parking_disc" — something you must display in
  the car. How the fee is paid (app, SMS, coin machine) is out of scope: leave it out.
- times are "HH:MM" on a 24-hour clock: write "7-17" as "07:00" and "17:00".
- "boundaries.certain": false if you cannot tell where one plate ends and the next
  begins. Saying so is useful; guessing is not.
- WHEN THE SIGN IS FAR AWAY OR SMALL IN THE FRAME, report LESS, not more. Give the
  panels you can actually make out, mark the others with "legibility.readable": false,
  and set "boundaries.certain": false. A plate you cannot read is not an invitation to
  write down what such plates usually say. An invented "Endast boendeparkering" is
  worse than an empty panel: the empty one is visibly missing and can be reported as
  missing, while the invented one looks exactly like something that was read.
- "notes": anything you noticed that has no field. Do not put field data here.
"""


_SHAPE_HEADER = """
Return ONLY JSON in exactly this shape. Use no other field names, and omit any
optional field you have nothing to put in:

"""


def build(instructions: str, schema: dict) -> str:
    return instructions + _SHAPE_HEADER + shape_hint(schema) + "\n"


def triage(schema: dict) -> str:
    return build(TRIAGE_INSTRUCTIONS, schema)


def extract(schema: dict) -> str:
    return build(EXTRACT_INSTRUCTIONS, schema)

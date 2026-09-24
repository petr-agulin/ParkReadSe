# design.md — how ParkRead looks and behaves

A document for building from: what is decided, not what inspires. Changes are made
here, not along the way in the markup.

---

## 1. What sets the look

**The product is calm and restrained.** It is about certainty: a person stands at a
sign and wants to know what it means. Anything bright, moving or "selling" gets in the
way.

**Scandinavian minimalism, not emptiness.** Plenty of air, few lines, large legible
text, one accent colour. Empty space is not "unfilled"; it is how the main thing is
shown.

**A refusal is a normal outcome.** When the service could not read a sign, the screen
must not look broken: the same calm colours, the same tone, a clear request to take
the photograph again. Red is for a prohibition on the sign, not for our failure.

**The phone screen comes first.** One task per screen, actions under the thumb, touch
targets no smaller than 44 px. The desktop gets the same layout, limited in width.

---

## 2. Tokens

The one source of values is `web/src/index.css`, the `@theme` section. The markup
holds only names; no colour may bypass the tokens there, and a test checks it.

Values are in `oklch`: in that space lightness looks the same to the eye across hues,
so "half a tone quieter" is a shift of one number rather than a search.

### Colour

| Role | Value | Where |
|---|---|---|
| `ink` | `oklch(0.24 0.01 250)` | body text |
| `ink-strong` | `oklch(0.22 0.01 250)` | large headings |
| `ink-2` | `oklch(0.45 0.01 250)` | secondary text |
| `ink-3` | `oklch(0.525 0.01 250)` | captions, hints |
| `ink-off` | `oklch(0.42 0.01 250)` | disabled row |
| `ground` | `oklch(0.99 0.002 250)` | card, raised plane |
| `ground-2` | `oklch(0.97 0.003 250)` | screen background |
| `inset` | `oklch(0.965 0.003 250)` | input field, quiet row |
| `chip` | `oklch(0.94 0.004 250)` | neutral chip, round button |
| `line` | `oklch(0.94 0.004 250)` | hairline divider |
| `field` | `oklch(0.9 0.005 250)` | input field border |
| `hero` | `oklch(0.32 0.03 250)` | dark band on the home screen |
| `stage` | `oklch(0.2 0.01 250)` | background under the photograph, dimming outside the frame |
| `on-dark` | `oklch(0.99 0.002 250)` | text on dark |
| `on-dark-2` | `oklch(0.82 0.01 250)` | secondary text on dark |
| `accent` | `oklch(0.52 0.11 250)` | the main action, active |
| `accent-press` | `oklch(0.46 0.105 250)` | pressed |
| `link` | `oklch(0.45 0.09 250)` | link-style action |
| `tint` / `tint-ink` | `oklch(0.94 0.02 250)` / `oklch(0.4 0.09 250)` | blue chip |
| `plate` | `oklch(0.45 0.13 255)` | the drawn sign plate |
| `ok` / `ok-bg` | `oklch(0.42 0.1 150)` / `oklch(0.94 0.03 160)` | the "All set" mark in the settings — not a colour of meaning |

The accent is **the blue of the Swedish sign**. The product is about signs, and the
colour comes from there rather than from a palette "like everyone's".

**Disabled is not done with transparency.** A semi-transparent subtree dims everything
at once, including what must stay legible. A disabled row is `chip` beneath and
`ink-off` on top.

### Colours of meaning

For the states of a reading only. Nowhere else.

| State | Colour | Meaning |
|---|---|---|
| `free` | `oklch(0.42 0.1 150)` | no conditions |
| `fee` | `oklch(0.46 0.11 70)` | a fee applies |
| `unsure` | `oklch(0.46 0.11 70)` | uncertainty |
| `deny` | `oklch(0.48 0.16 25)` | the sign prohibits |
| `slash` | `oklch(0.58 0.2 27)` | the strike-through on the end-of-window icon |
| `note` / `note-ink` | `oklch(0.96 0.02 70)` / `oklch(0.38 0.05 70)` | yellow note |
| `danger-bg` / `danger-line` | `oklch(0.965 0.02 25)` / `oklch(0.9 0.03 25)` | dangerous action |

**Uncertainty wears the tone of caution, not one of its own.** The scale already has
red meaning "you may not stand", and a third tone beside it would read as one more
degree of prohibition. Uncertainty is told apart by **words**, not by paint.

### Typography

The system typeface: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, …`.
No web font is loaded — it would be one more server in the list of what the page
pulls, and an empty first screen where there is no network. A test on the built page
checks it.

The look rests on the scale, not on a typeface.

| Role | Size / line height / tracking | Weight |
|---|---|---|
| First-launch heading (`display`) | 38 / 1.1 / −0.035em | 800 |
| Screen heading (`screen`) | 30 / 1.14 / −0.03em | 800 |
| Card heading (`card`) | 24 / 1.15 / −0.025em | 800 |
| Small card heading (`card-sm`) | 19 / −0.015em | 700 |
| Header title (`nav`) | 17 / −0.015em | 700 |
| Value row (`row`) | 17 / 1.45 | 500 |
| Body (`body`) | 16 / 1.5 | 400–500 |
| Field label (`label`) | 15 | 400–600 |
| Footnote (`caption`) | 14 | 400 |
| Section caption (`section`) | 13 / 0.1em, capitals | 700 |
| Monospace caption (`mono`) | 11 / 0.1em | 400 |

**A size name may not match a colour name.** The bundler's `text-*` utilities serve
both size and paint, so a size named like a colour silently becomes paint. A test
checks it.

Monospace is only for a quotation from a sign, the key and the provider's address:
that is someone else's text, and it should not read as ours.

Below 14 px there are four sizes, each with its own place: the section caption at 13;
the reading screen's small text — the completeness line, the general rules, the error
box, the "Not a parking rule" tag — at 12 (the bundler's `text-xs`); the monospace caption at 11; and the text strips
of the drawn sign at 10, sized to the plate as an object rather than as reading text
(the hero-size sign uses the 14 caption).

### Sizes

Screen margins 20–24, card padding 20–26. Rhythm: 10 inside a group, 14 between cards,
20–26 between blocks. Layout is `flex`/`grid` with `gap` only.

Radii: card 30, small card 24, main button 26, secondary 22, field 16, tile 14,
pill 100, the drawn plate 3 — signs are rectangular.

Shadows: card `0 2px 10px`, raised card `0 4px 18px`, main button `0 12px 28px` in the
accent colour, chip `0 1px 6px`, frame handle `0 2px 6px`, frame mask
`0 0 0 9999px` in `stage`.

Touch targets from 44 px. The camera shutter 92, the switch 46×28, the round button 40.

---

## 3. Components

| Component | How it looks |
|---|---|
| Main action | a card in `accent`, white text 21/700, a 15 caption beneath, a chevron on the right |
| Secondary button | `ground`, radius 22, text 16/600 `ink` |
| Text action | 16/600 `link`, centred, no underline |
| List row | padding 16×18, label 16/600, value 15 `ink-3`, action on the right in `link` |
| "Remember" checkbox | an ordinary checkbox in `accent`; with an empty key it is ticked but disabled |
| Settings field | a label, beneath it a box with the value (a long one is cut), `Add`/`Edit` on the right; while editing — `Save`, `Cancel`, `Clear`, and `Show` for the key |
| Readiness mark | a thin pill: "All set" — `ok` on `ok-bg`; "Configure" — `note-ink` on `note`. Lower and softer than the `Add`/`Edit` buttons, so as not to argue with them |
| Dangerous action | the same button as `Add`/`Edit`: `chip`, `ink-2`, the same radius. Its words and the line beside it set it apart, not paint; it appears only when there is something to delete |
| Notice | background `note`, text `note-ink`, small-card radius — for a line about what is missing |
| "Label → value" row | label 88–116 px `ink-3`, value 17/500, on the baseline |
| Period timeline | a 30 px column, a sign icon of 36 (20 at a join), a 4 px segment in the colour of meaning. Solid where the stretch is open to anyone and fully read; dashed where it is a prohibition, was not read in full, or is meant for a named group only. With no periods at all — a refused reading — the timeline gives way to a line of text asking for a closer photograph |
| Drawn sign | a blue `plate` shield with a white border, white text strips beneath it |
| "Not a parking rule" tag | on a plate that sets no rule, under its meaning: `chip` background, `ink-2` text 12, radius 4, as wide as its words |
| Home screen dark band | the full width of the column, no rounding; the sign, a heading and two quiet lines in a column |
| Moment row | label on the left, never wrapping; value and chevron on the right; a hairline beneath. Day and month shortened ("Thu. 17 Sep. at 02:01"), the time never separated from "at". The system date picker opens from the value; the label is not pressable |
| Interface icons | drawn in-house (decision 152): six inline SVGs in `Icon.tsx`, taking their colour from the text via `currentColor` |

**A compound value is a list, not a paragraph.** When a value has several lines, the
label moves onto its own line and the lines follow with a 2 px left border and a 12
indent. No bullet points.

What never appears: nested cards, emoji instead of icons, dimming a subtree with
transparency, gradients.

**A tile is not a card, and it belongs inside one.** A card is RAISED: white, rounded,
with a shadow, lying above the page background. A tile is PRESSED IN: a grey fill, a
hairline border, no shadow. The prohibition above is about two stacked shadows: they
make a screen look quilted, and it stops being clear what belongs to what. Tiles
inside a card do not do that, and they are needed: the reading's plates in "What we
read", the fields in the settings.

---

## 4. Screens

Seven. Each is a state, not an address: there is no router, and `lib/view` chooses the
screen. The height of the window is measured by the shell alone, in `svh`; screens
take it but do not count it.

### `2f` — first launch, no key yet

The header: a `P` mark, "ParkRead", a settings icon on the right. In the middle of the
screen the drawn sign, beneath it a large heading and three quiet lines. Lower down a
section caption, a blue button with a key, and three small assurances with icons.

It fits whole, with no scrolling: the screen asks for one thing only. There is no
camera and no gallery on it at all (decision 147) — a photograph taken without a key
would end in a request for a key.

### `3a` — home, with a key

The same header. A dark band across the full width of the column, no rounding: the
sign on the left, a heading and two lines. Beneath it the moment row. At the bottom one
main action with a camera icon, and a quiet link to choose a photograph.

`2f` and `3a` are two states of one place: the sign and the lines come from shared
constants, and a test checks it.

### `3e` — settings

A header with "back", the title and a thin readiness mark. Three fields — the key, the
provider address, the model: label, value box, `Add` or `Edit` on the right; while
editing, `Save`, `Cancel`, `Clear`, and `Show` for the key. Under the key, the
"remember" checkbox and two lines about where the key goes. At the bottom a quiet
"Forget key" button with a line beside it, and a help link beneath.

No section headings: each field's label says the same thing.

### `2h` — where to get a key

Three cards: what a provider must be, who answers that way, and four steps. At the
bottom a yellow note about the key. About other people's models only what can be
checked (decision 150): no price is promised, and no provider is called cheaper or
better; the screen only names the size of a request so the person can weigh it
against their provider's own terms. The one link out of the application is an example
address of a key page.

### `3d` — camera

A header with "back", the title and a torch pill; the pill is absent where the camera
has no torch. Under the header a hint as ordinary text, not on the frame. The
viewfinder fits the stream's size (decision 148), with a guide frame in it — exactly
the frame that will stand on the next screen. At the bottom edge: a "Pick photo" tile,
the 92 px shutter in the centre, and an empty space of the same width on the right,
which keeps the shutter in the middle.

### `3b` — cropping

A header with "back", the title and "Replace". A live hint above the photograph: once
zoomed in, it speaks of the corner handles. Its height is fixed at two lines —
otherwise a wrap would re-lay the stage and reset the zoom. The photograph fits whole,
with a dark field around it; the frame has a mask and four corner handles. At the
bottom edge a line about the share of the frame, and the send button.

### `3c` — reading

A header with "back": it leads to the camera, as the button at the bottom does — from
a reading one goes to photograph the next sign. Then: the caveat about an unread
panel, if there is one; the engine's note on the sign, if there is one; the window
card (there may be several), with the moment the answer was computed for under its
heading; "who may park"; "what was read", with the photograph and the plates as tiles.
At the bottom, "Scan another sign".

The order: window → who may park → plates. The evidence comes after the answer
(decision 149).

---

## 5. Motion

There is no animation in the product: screens change at once, and nothing flies in or
bounces. If motion is ever added, it goes only where things would otherwise be
unclear — a screen change about 180 ms, a layer appearing about 200 ms, a press shrinking
to 0.98 — and none at all under `prefers-reduced-motion`.

---

## 6. Accessibility

- Text contrast is no lower than 4.5:1 against what actually lies behind it. It is
  computed from the tokens and checked by a test: every text colour against every
  light surface, white against every dark one. The exception is named in the test:
  `on-dark-2` lives only on the card and the stage; on the blue button it does not
  pass.
- Colour is never the only carrier of meaning: a word always stands beside a mark.
- Touch targets from 44 px.
- Heights are not fixed where text lives. The size scale is in `px`: text keeps its
  designed size and does not follow the system's larger font setting, so every screen
  is laid out to fit at that one scale.
- Every field and button has a label for a screen reader.

---

## 7. Open questions

| Question | Recommendation |
|---|---|
| Dark theme | Later. The tokens are set up so it can be added by changing values |
| App icon | Still in the previous blue: a job of its own, not a recolouring |
| A typeface of our own | The system one is enough. It could come back, but only as a self-hosted file, with no outside server |

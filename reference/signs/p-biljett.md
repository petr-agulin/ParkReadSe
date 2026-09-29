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

Parking is free, but a parking ticket is needed. Not to be confused with `Avgift`: there
one pays, here one gets a ticket.

**Nothing is said here about a fee — and nothing should be.** The fee lives in its own
field (`parsed.fee`), and the engine knows about it by itself. An earlier wording DENIED
the fee ("no fee is stated") and on photograph `097` clashed with a plate where the fee is
named outright: `Avgift`, `Taxa A`. The reference says only what is written on the plate;
the rest is the code's business (§9 of `AGENTS.md`).

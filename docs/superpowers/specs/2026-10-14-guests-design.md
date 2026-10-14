# Gast met een einddatum

Datum: 2026-10-14 · Status: gebouwd (2026-10-14) · Bouwt op: huisgenoten
(`2026-10-07-household-design.md`), alleen bedienen
(`2026-10-14-member-rights-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (D2)

## Doel

Een oppas of logee krijgt toegang tot en met een dag en verdwijnt daarna
vanzelf uit het huis. Niemand hoeft eraan te denken iemand weg te halen.

## Besloten (2026-10-14, zelf gekozen bij "ga automatisch door")

1. **Een uitnodiging met Tot en met**: een schakelaar "Als gast, met een
   einddatum" in de uitnodig-sheet; vanaf vandaag tot een jaar vooruit.
2. **Een gast is huisgenoot op alleen bedienen** (D1), nooit beheerder. Een
   beheerder kan daarna wijzigen aanzetten, of hem beheerder maken: dan
   vervalt de einddatum.
3. **Tot en met = tot middernacht** van die dag in de tijdzone van de telefoon
   van de beheerder. De app rekent het tijdstip uit (`ends`); de server
   vergelijkt alleen met nu.
4. **Weghalen** gebeurt door een cron-hook elke minuut, met dezelfde opruiming
   als vertrekken (`membership.js`: leden, beheerders, alleen bedienen,
   favorieten, thuis/weg, de einddatum).

## Datamodel

- `invitations.until` ("JJJJ-MM-DD", voor de tekst) en `invitations.ends`
  (tijdstip). De create-hook weigert een gast als beheerder, een einde in het
  verleden of verder dan een jaar (`invalid_until`). De mail zegt "Als gast,
  tot en met 20 oktober 2026".
- `guests`: `house`, `user`, `until`, `ends`; uniek op (house, user). Leden
  lezen, niemand schrijft via de API (alleen de hooks).
- De ledenlijst geeft `until` per lid.

## App

Uitnodig-sheet met de schakelaar en een datumveld (in plaats van de rol); in
de ledenlijst "Gast tot en met 20 oktober, alleen bedienen"; in de ledensheet
dezelfde regel.

## Testen

Integratie: de weigeringen, de mail, accepteren (lid, alleen bedienen,
einddatum in de ledenlijst), niemand schrijft in `guests`, beheerder maken
haalt de einddatum weg, en de cron haalt een verlopen gast weg met zijn
favorieten. `lib/`: einde van de dag, bereik, tekst in beide talen.
Doorgeklikt: uitnodigen, accepteren, ledenlijst.

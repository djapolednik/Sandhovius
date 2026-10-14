# Rechten als één schakelaar

Datum: 2026-10-14 · Status: gebouwd (2026-10-14) · Bouwt op: huisgenoten
(`2026-10-07-household-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (D1)

## Doel

Een beheerder kan een huisgenoot laten bedienen zonder dat die het huis
anders inricht (een kind, een oppas die langer blijft). Geen derde rol, maar
onder de rol één schakelaar: **Mag automatiseringen en apparaten wijzigen**.

## Besloten (2026-10-14, zelf gekozen bij "ga automatisch door")

1. **Standaard aan.** Niemand verliest rechten die hij had; een beheerder zet
   het per huisgenoot uit.
2. **Uit = alleen bedienen.** Wel: apparaten en scènes bedienen, Laat
   knipperen, en de eigen dingen (favorieten, thuis/weg, Meld dit,
   meldingen). Niet: scènes, schema's, routines, bewegingslicht, kamers en
   apparaten wijzigen of verwijderen, en koppelen.
3. **Een beheerder mag altijd alles.** Beheerder maken haalt de beperking weg;
   een beheerder op alleen bedienen zetten weigert het endpoint
   (`admin_can_edit`).
4. **PocketBase dwingt het af**, de app laat de knoppen weg.

## Datamodel

`houses.operate_only`: relatie naar `users`, de leden die alleen mogen
bedienen. Alleen het endpoint `PATCH /api/sandhovius/houses/{id}/members/{user}`
zet het (body `role` en/of `can_edit`); de `updateRule` van `houses` weigert
het veld voor iedereen. Vertrekken of verwijderd worden haalt je eraf. De
ledenlijst (`GET …/members`) geeft `can_edit` per lid.

De wijzigregels voor bewoners op `rooms`, `devices`, `scenes`, `schedules`,
`automations`, `motion_lights`, `pairing_sessions` en `pairing_candidates`
krijgen `<huis>.operate_only.id != @request.auth.id` erachter (zonder `?`:
voor álle leden van de lijst; een lege lijst laat iedereen door, getest).

## App

- Ledensheet (beheerder, voor een huisgenoot): de schakelaar met in zinnen wat
  iemand altijd kan en wat (niet) met wijzigen; bij een beheerder één zin dat
  die alles mag. In de lijst "Huisgenoot, alleen bedienen".
- Wie alleen bedient: geen "+" (koppelen), geen Nieuwe scène, Wijzigen,
  Routine toevoegen of Bewegingslicht toevoegen; schakelaars van schema's,
  routines en bewegingslicht vast; kaarten niet aantikbaar; op Scènes één regel
  "Je kunt scènes uitvoeren…"; in de detail-sheet naam en kamer vast, geen
  weergave, kleur volgt de dag of verwijderen, wel "Wijzigen kan een beheerder
  voor je aanzetten."; kamers in Opties als lijst.

## Testen

Integratie: elke geblokkeerde wijziging, wat blijft (schakelen, scène
uitvoeren, favoriet, thuis/weg, Meld dit), beheerder en box merken niets, de
lege lijst, beheerder maken, vertrekken. Doorgeklikt als beheerder en als
huisgenoot op alleen bedienen.

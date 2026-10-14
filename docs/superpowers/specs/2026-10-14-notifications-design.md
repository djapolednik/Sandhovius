# Meldingen

Datum: 2026-10-14 · Status: besloten, in aanbouw · Bouwt op: routines
(`2026-10-14-routines-design.md`), thuis of weg
(`2026-10-14-presence-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (B2)

## Doel

Het huis kan je iets laten weten als je niet naar de app kijkt: lekkage,
rook, de voordeur die opengaat terwijl niemand thuis is, of wat een routine
meldt. Als pushmelding op de telefoon (Web Push), ook als de app dicht is.

## Besloten (2026-10-14)

1. **De box verstuurt.** De agent beslist lokaal of iets een melding waard is
   én verstuurt hem zelf naar de pushdienst van de browser (Web Push,
   `webpush-go`, MIT). Alleen uitgaand verkeer; werkt al vóór fase 3 zolang de
   box internet heeft. PocketBase bewaart alleen wie wat wil ontvangen.
2. **Een VAPID-sleutel per box.** De box maakt bij de eerste start zelf een
   sleutelpaar; het privédeel blijft op de box (`/data/push.json`, nooit in
   git of in een log), het publieke deel staat op het huis (`houses.push_key`).
   Een vervangen box heeft een nieuwe sleutel: de app ziet dat en meldt zich
   opnieuw aan.
3. **In v1:** lekkage en rook altijd (aan iedereen in het huis die meldingen
   aanzette, niet uit te zetten per sensor); **Meld dit** per sensor en per
   huisgenoot met *alleen als niemand thuis is* en *alleen tussen…*; en de
   routine-actie **Stuur een melding** aan gekozen huisgenoten.
4. **Box offline** kan de box zelf niet melden: dat komt met fase 3 (de
   cloud). Tot dan zegt de app het, zoals nu.

## Privacy

De pushdienst (van de browsermaker) ziet alleen versleutelde inhoud, maar wel
wanneer er iets gestuurd wordt. Inhoud kort en zonder meetwaarden: "Lekkage bij
Gootsteenkastje", "Voordeur open", of de tekst van de routine. Geen
temperaturen, geen tijden van beweging in de tekst.

## Datamodel

- `houses.push_key`: het publieke VAPID-deel (base64url); alleen de box schrijft
  het.
- `push_subscriptions`: één per apparaat waarop iemand meldingen aanzette.
  `house`, `user` (alleen jezelf), `endpoint`, `p256dh`, `auth`, `key` (de
  `push_key` waarmee aangemeld; past hij niet meer, dan meldt de app opnieuw
  aan), `language` (`nl`/`en`, de taal van de tekst). Uniek op (`house`,
  `endpoint`). Lezen en verwijderen: jezelf en de box van het huis (een
  verlopen aanmelding, 404/410 van de pushdienst, ruimt de box op).
- `notification_rules` (Meld dit): `house`, `user` (alleen jezelf), `device`
  (een sensor van het huis), `event` (`open` bij `contact`, `motion` bij
  `occupancy`), `nobody_home` (bool), `from`/`to` ("HH:MM", allebei leeg =
  altijd), `enabled`. Uniek op (`user`, `device`, `event`). Een hook
  (`notification_rules.js`) controleert apparaat, gebeurtenis en tijden
  (`invalid_notification_rule`).
- Routine-actie `{kind:"notify", text, users:[...]}`: `text` 1–80 tekens,
  `users` leden van het huis (leeg = iedereen). `automation_rules.js`.

## Agent

- Sleutel: `/data/push.json` naast het bestand van de bewegingslichten; bij
  verbinden zet de agent `houses.push_key` als die anders is.
- Aanmeldingen en Meld dit-regels reizen mee in het snapshot.
- Gebeurtenissen komen uit dezelfde overgangen als routines (lek en rook alleen
  bij het begin, open, beweging). Lek en rook: aan iedereen. Meld dit: aan wie
  de regel heeft, als de voorwaarden kloppen (niemand thuis uit de
  thuis/weg-stand; tussen, ook over middernacht). Hooguit één melding per regel
  per 10 minuten, zodat een gang met beweging geen reeks meldingen geeft.
- Een routine met **Stuur een melding** stuurt aan de gekozen leden (of
  iedereen). Uitgevoerd zoals de andere stappen; een mislukte melding maakt de
  routine "gedeeltelijk gelukt".
- Tekst in de taal van de aanmelding; titel "Sandhovius". TTL 1 uur bij Meld
  dit en routines, 24 uur bij lek en rook; urgentie hoog bij lek en rook.

## App

- Een service worker (`public/sw.js`) toont de melding en opent de app bij
  een tik.
- Opties → **Meldingen**: "Meldingen aanzetten op dit apparaat" (vraagt
  toestemming, meldt aan), daarna "Aan op dit apparaat" met uitzetten. Kan het
  niet, dan zegt het waarom: op een iPhone eerst op het beginscherm zetten;
  toestemming geweigerd (via de browserinstellingen); de box heeft nog geen
  sleutel.
- Detail-sheet van een sensor met `contact` of `occupancy`: **Meld dit**
  (alleen voor jou), met *alleen als niemand thuis is* en *alleen tussen*. Bij
  lek of rook één regel: "Lekkage en rook meldt Sandhovius altijd."
- Routine-sheet: bij Doe een stap **Stuur een melding** met een tekst en aan
  wie (iedereen of gekozen huisgenoten).

## Testen

- Integratie: rechten (eigen aanmelding en regel, box leest en verwijdert
  aanmeldingen, box schrijft `push_key`, bewoner niet), de hooks.
- Go: versleutelen en versturen tegen een nep-pushdienst (`httptest`), 410
  ruimt op, lek/rook altijd, Meld dit met voorwaarden en de 10 minuten, de
  routine-actie, de sleutel op schijf.
- `lib/`: teksten in beide talen. Met de hand: Chromium op `localhost`.

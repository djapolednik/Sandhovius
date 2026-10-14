# Thuis of weg

Datum: 2026-10-14 · Status: besloten, in aanbouw · Bouwt op: routines
(`2026-10-14-routines-design.md`), huisgenoten
(`2026-10-07-household-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (B3)

## Doel

Het huis weet wie er thuis is, zodat routines kunnen reageren op "iedereen
weg" of "Sanne komt thuis". Een PWA kan de telefoonlocatie niet op de
achtergrond volgen, dus v1 is handmatig: elke bewoner zet zichzelf op
**Thuis** of **Weg**. Wifi-detectie via HA kan later dezelfde rij vullen.

## Besloten (2026-10-14)

1. **Bouwstenen voor het huis én per persoon.** Starters: *iedereen weg*,
   *de eerste komt thuis*, *[lid] komt thuis*, *[lid] gaat weg*. Voorwaarden:
   *iemand thuis*, *niemand thuis*, *[lid] thuis*, *[lid] weg*.
2. **Standaard thuis.** Wie nooit iets koos, telt als thuis: "iedereen weg"
   gaat pas af als iedereen het echt zette, en een nieuw lid zet niets in gang.
3. **Alleen jezelf.** Je zet alleen je eigen stand; iedereen in het huis ziet
   hem.
4. **Op Home, onder de groet.** Eén knop Thuis/Weg met wie er thuis is; ook
   zichtbaar bij Huisgenoten.

## Datamodel

`presence`: één rij per lid per huis (uniek op `house`, `user`).

| veld | type | wie |
|---|---|---|
| `house` | relation (cascade) | het lid zelf |
| `user` | relation (cascade) | het lid zelf, alleen `@request.auth.id` |
| `home` | bool | het lid zelf |
| `created`, `updated` | autodate | |

Lezen: leden van het huis en de box van het huis. Schrijven: alleen je eigen
rij, en `house`/`user` liggen vast na het maken. Verwijderen: niemand via de
API; verlaten of verwijderd worden ruimt de rij op (`household.pb.js`), een
account weg = cascade. Geen rij = thuis.

Routines (`automations`):

- starter `{kind:"presence", event:"all_away"|"first_home"}` of
  `{kind:"presence", event:"arrives"|"leaves", user}`
- voorwaarde `{kind:"presence", state:"someone_home"|"nobody_home"}` of
  `{kind:"presence", state:"home"|"away", user}`

`automation_rules.js` controleert de soorten en dat `user` lid van het huis
is.

## Agent

- Leest de leden (`houses.members`) en de `presence`-rijen mee in het
  snapshot, en volgt `presence` realtime zodat thuiskomen binnen een seconde
  telt; het snapshot is het vangnet.
- De routinemotor houdt per lid thuis/weg bij. De eerste stand na een start is
  de uitgangssituatie: die start niets. Daarna starten **overgangen**: een lid
  van weg naar thuis (*komt thuis*), het aantal thuis van nul naar meer (*de
  eerste komt thuis*) of naar nul (*iedereen weg*). Een lid dat erbij komt of
  weggaat start geen huis-gebeurtenis.
- Voorwaarden lezen de huidige stand; zonder stand telt iedereen als thuis.

## App

- Home, onder de groet: een knop met je eigen stand ("Je bent thuis" / "Je
  bent weg"), één tik wisselt, en wie er verder thuis is ("Tom is ook thuis",
  "Niemand anders thuis"). Ook in een huis met één bewoner: routines kunnen
  op jou reageren.
- Huisgenoten in Opties: achter elke naam Thuis of Weg.
- Routine-sheet: bij **Als** een vierde soort **Thuis/weg** (iedereen weg, de
  eerste thuis, of een persoon die thuiskomt of weggaat); bij **Alleen als**
  een schakelaar met iemand thuis / niemand thuis / een persoon.

## Testen

- Integratie: rechten (eigen rij, uniek, huisgenoot leest, box leest maar
  schrijft niet, andere box niet), opruimen bij verlaten, de hook (soorten,
  lid van het huis).
- Go: overgangen per lid en voor het huis, uitgangssituatie, nieuw lid,
  voorwaarden met en zonder stand.
- `lib/`: zinnen in beide talen.

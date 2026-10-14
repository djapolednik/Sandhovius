# Zon in schema's

Datum: 2026-10-14 · Status: gebouwd (2026-10-14) · Bouwt op: schema's
(`2026-09-28-schedules-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (A1)

## Doel

Een scène vanzelf laten lopen **bij zonsopkomst of zonsondergang**, met een
verschuiving ervoor of erna: "Bij zonsondergang", "30 minuten voor
zonsopkomst". Nu kan een schema alleen op een vaste tijd ("23:00"), en een
vaste tijd voor "licht aan als het donker wordt" klopt maar een paar weken
per jaar.

## Reikwijdte

- Een schema krijgt naast **Tijd** de keuze **Zonsopkomst** en
  **Zonsondergang**, met **Voor / Bij / Na** en een verschuiving.
- Dagen blijven zoals nu (ma … zo).
- Niet in scope: zon als voorwaarde ("alleen als het donker is", dat hoort bij
  de routines, B1), schemering-varianten (burgerlijk, nautisch), een lichtsensor.

## Beslissingen

| Vraag | Keuze | Waarom |
|---|---|---|
| Waar komen de tijden vandaan? | **De agent rekent ze zelf uit** (een pure functie, zonsopkomst en -ondergang uit datum, breedte- en lengtegraad). De thuislocatie haalt de agent één keer uit HA (`/api/config`) en bewaart hem in de snapshot op schijf | Werkt ook als HA herstart of even weg is, en zonder internet. Deterministisch en goed te testen. HA's `sun.sun` geeft alleen de *volgende* opkomst/ondergang: na zonsondergang wijst `next_setting` al naar morgen, dus "1 uur na zonsondergang" valt dan weg |
| Hoeveel verschuiving? | Voor of na, in stappen: 15, 30, 45, 60, 90, 120 minuten | Genoeg voor "half uur voor het donker"; een vaste lijst is makkelijker te kiezen dan een getal intikken. Opgeslagen als minuten, dus de lijst kan later groeien |
| Datamodel | `schedules.trigger` (`time` / `sunrise` / `sunset`) en `schedules.offset_min` (−120 … 120, negatief = voor). `time` blijft verplicht voor `trigger = time` en is leeg bij zon | Kleinste wijziging; bestaande schema's blijven werken (migratie zet `trigger = time`) |
| Welke minuut? | De berekende tijd + verschuiving, afgerond op de minuut, in lokale tijd | De klok tikt per minuut, net als nu |
| Een dag zonder opkomst of ondergang | Dat schema loopt die dag niet | Komt in Nederland niet voor; alleen een vangnet |
| Geen thuislocatie in HA | Zon-schema's lopen niet; `last_error` = `no_location` en de app zegt "Je box weet niet waar je huis staat" | Liever eerlijk niets dan op een verkeerde tijd |

## Datamodel

`schedules` (gewijzigd):

| veld | type | opmerkingen |
|---|---|---|
| `trigger` | select `time` / `sunrise` / `sunset`, verplicht | migratie: bestaande rijen `time` |
| `time` | text `HH:MM` | verplicht als `trigger = time`, anders leeg |
| `offset_min` | number, geheel, −120 … 120 | 0 bij `time` |

De regel voor `time` gaat van het veld naar een hook (`schedules.pb.js`):
verplicht en geldig bij `trigger = time`, leeg bij zon (foutcode
`invalid_schedule_time`), en `offset_min = 0` bij `time`.

## Agent

- `sun.go`: `sunTimes(date, lat, lon) (rise, set time.Time, ok bool)`, de
  NOAA-benadering (nauwkeurig op ongeveer een minuut). Puur, met testvectoren
  voor een paar Nederlandse data (zomer- en wintertijd, de langste en kortste
  dag), vergeleken met een betrouwbare tabel.
- `dueSchedules` krijgt de locatie mee: per schema de bedoelde minuut
  (`trigger = time` → `time`; zon → de berekende tijd van die dag + verschuiving)
  en vergelijkt die met de minuut van de tik. Wintertijd en zomertijd via
  `time.Local`, zoals nu.
- Thuislocatie: bij de start en na elke HA-herverbinding `GET /api/config`
  (`latitude`, `longitude`), opgeslagen in de snapshot (`/data/schedules.json`),
  zodat zon-schema's ook draaien als HA even weg is.

## PWA

- In de scène-sheet (**Vanzelf uitvoeren**) krijgt elke rij een keuze
  **Tijd / Zonsopkomst / Zonsondergang** (dezelfde pill bar als Weergave).
  Bij zon: **Voor / Bij / Na** en, bij Voor of Na, de minuten als segmenten
  (15, 30, 45, 60, 90, 120). De keuze voluit in het label: "30 minuten voor
  zonsondergang".
- De tegel en de schema-kaart zeggen het in woorden: "Werkdagen bij
  zonsondergang", "Elke dag 30 minuten voor zonsopkomst". Een helper in
  `lib/schedules.js`, in beide talen getest.
- Sorteren in **Vanzelf uitvoeren**: zon-schema's op de tijd van vandaag (de
  app rekent niet zelf; de agent schrijft de eerstvolgende tijd mee als
  `next_run`, zodat de kaart ook "vandaag om 18:42" kan zeggen). Open: zie
  onder.

## Testen

- Go: `sunTimes` tegen testvectoren; `dueSchedules` met zon, verschuiving
  over middernacht heen, zomertijdwissel, geen locatie.
- Integratie: `trigger`/`time`/`offset_min`-regels en de foutcode.
- `lib/`: de zin per schema in beide talen.
- Met de hand: een zon-schema op een paar minuten van nu door de locatie in HA
  of de testklok te verzetten.

## Besloten na het ontwerp

- **De tijd van vandaag: ja** (2026-10-14). De agent schrijft `next_run` als die
  verandert (`nextRunUpdates`, één keer, niet elke minuut). De kaart in
  Vanzelf uitvoeren toont die tijd als grootste woord en sorteert erop; de rij
  in de scène-sheet zegt "Bij zonsondergang, vandaag om 18:47".
- **Zelf rekenen: ja.** `sunTimes` zit binnen 2 minuten van de bibliotheek
  astral voor Amsterdam (getest op zes data, ook de dagen van de zomer- en
  wintertijd). De thuislocatie vraagt de agent eens per uur aan HA (na een
  fout na 5 minuten) en bewaart hem in `/data/schedules.json`.
- Een tijd-schema zonder `trigger` (oudere app) telt als `time`.

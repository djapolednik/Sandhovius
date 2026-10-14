# Routines: als dit gebeurt, doe dat

Datum: 2026-10-14 · Status: gebouwd (2026-10-14; nog niet met echte sensoren) · Bouwt op: schema's,
zon in schema's, bewegingslicht, kleur volgt de dag · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (B1)

## Doel

Eén manier om het huis iets vanzelf te laten doen: **als** dit gebeurt
(starter), **alleen als** (voorwaarden), **doe** dat (acties), en eventueel
**daarna uit**. Nu zijn er twee losse soorten (schema's op een scène,
bewegingslicht); elke nieuwe soort zou een eigen collectie, sheet en motor
worden. Routines maken daar één model van, met een gesloten lijst bouwstenen
zodat een bewoner niets kan bouwen wat hij niet snapt.

## Al besloten (roadmap, 2026-10-13)

- **Generiek:** één collectie `automations` met starter, voorwaarden en acties
  als JSON, niet een collectie per soort.
- **Gesloten lijst** starter-, voorwaarde- en actiesoorten; geen vrije
  HA-services.
- **Validatie dubbel:** de PB-regels kunnen niet in de JSON kijken, dus een
  hook én de agent controleren soorten, apparaten uit het eigen huis en
  grenzen.
- **Schema's en bewegingslicht blijven voorlopig** wat ze zijn; omzetten pas als
  de nieuwe motor zich bewezen heeft.

## Voorstel v1

### Bouwstenen

| Deel | Soorten in v1 | Later |
|---|---|---|
| **Starter** (precies één) | *Tijd* (vaste tijd of zon met verschuiving, dagen; hergebruikt A1). *Apparaat* gaat aan of uit (lamp, stopcontact). *Sensor* meldt beweging, geen beweging, open, dicht, lek, rook, of temperatuur boven/onder een waarde | Thuiskomen/weggaan (B3), knop ingedrukt |
| **Voorwaarden** (nul of meer, allemaal waar) | *Alleen tussen* twee tijden. *Alleen als het donker is* (zon). *Alleen op* bepaalde dagen | Iemand thuis / niemand thuis (B3) |
| **Acties** (een of meer, op volgorde) | Apparaat *aan* (eventueel met helderheid of wittint) of *uit*. *Scène* uitvoeren | Melding (B2), wachten tussen stappen |
| **Daarna uit** | Nooit, of na 1, 5, 15, 30 of 60 minuten: wat deze routine aanzette gaat weer uit | |

Geen EN/OF-groepen en geen meerdere starters: dat is waar het voor een
niet-technische bewoner onduidelijk wordt.

### Datamodel

`automations`:

| veld | type | wie | opmerkingen |
|---|---|---|---|
| `house` | relation | bewoner | |
| `name` | text | bewoner | leeg = de app maakt een zin ("Als de voordeur opengaat") |
| `enabled` | bool | bewoner | |
| `starter` | json | bewoner | één object, bijv. `{"kind":"sensor","device":"…","event":"open"}` |
| `conditions` | json | bewoner | lijst, bijv. `[{"kind":"dark"}]` |
| `actions` | json | bewoner | lijst, bijv. `[{"kind":"device","device":"…","action":"turn_on"}]` |
| `off_after` | number | bewoner | 0 = nooit, anders minuten |
| `last_run`, `last_error`, `next_run` | | box | zoals bij schema's |

Een hook (`automation_rules.js`) controleert de JSON: alleen bekende soorten,
apparaten en scènes uit hetzelfde huis, grenzen (max 10 acties, temperatuur
tussen 0 en 40°). Foutcode `invalid_automation` met een `params.part`.

### Motor (agent)

- `automation.go`: puur, net als `motion.go`. Invoer: de routines (snapshot),
  gebeurtenissen (apparaat aan/uit, sensorstand, de klok), de zon. Uitvoer:
  acties. Eigenaarschap en "daarna uit" zoals bewegingslicht: een routine doet
  alleen uit wat hij zelf aanzette; uit-tijden op schijf
  (`/data/automations.json`), zodat een herstart ze niet vergeet.
- Een sensor "meldt open" is een **overgang**, geen stand: de routine loopt
  bij dicht → open, niet bij elke melding dat hij nog open is.
- **Lussen voorkomen:** acties van een routine starten in dezelfde ronde geen
  andere routine (de ketting stopt na één stap), en één routine loopt hooguit
  één keer per minuut.
- Uitvoeren via `executeScene`/`runSceneStep`, dus dezelfde controles als nu
  (eigen huis, klaargezet). "Gedeeltelijk gelukt" als `last_error` zegt welke
  stap niet lukte.

### App

- Scènes-tab: een sectie **Routines** boven Vanzelf uitvoeren en Bij beweging,
  met een kaart per routine (de zin, aan/uit) en **Routine toevoegen**.
- Een sheet die de zin opbouwt: **Als** (kies starter) → **Alleen als**
  (optioneel) → **Doe** (acties) → **Daarna uit**. Bovenaan de hele routine
  als zin: "Als de voordeur opengaat, alleen als het donker is: gang aan,
  na 5 minuten uit."
- `describeAutomation(intl, automation, names)` in `lib/`, in beide talen
  getest; dezelfde zin voor kaart, sheet en schermlezer.
- **Nu uitproberen** in de sheet: de acties één keer uitvoeren (zonder
  starter), met "Klaar" of "Gedeeltelijk gelukt".
- Een onvolledige stap zegt wat er mist ("Kies een sensor"); geen grijze
  Opslaan-knop zonder uitleg.

## Besloten (2026-10-14)

1. **Eén starter per routine.** "Als de deur opengaat óf er beweging is"
   worden twee routines.
2. **Schema's en bewegingslicht blijven in v1** wat ze zijn; een tweede stap
   zet ze met een migratie om naar routines.
3. **Daarna uit** doet alleen uit wat de routine zelf aanzette (eigenaarschap
   zoals bewegingslicht).
4. **Nu uitproberen** zit in v1.

## Testen

- Go: elke starter (ook overgangen en herhaalde meldingen), voorwaarden,
  acties op volgorde, daarna uit met eigenaarschap, lussen, herstart met
  uit-tijden op schijf.
- Integratie: de hook (soorten, ander huis, grenzen), rechten (lid, box).
- `lib/`: `describeAutomation` in beide talen, het ontbrekende per stap.
- Met de hand: nep-sensor (`mosquitto_pub`) en een nep-lamp.

## Maat

Ruw 4–6 weken bij 10–15 uur per week: motor ~1,5 week, hook en tests ~1 week,
de sheet ~2 weken, afronden en testen ~1 week.

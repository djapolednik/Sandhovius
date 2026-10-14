# Kleur volgt de dag

Datum: 2026-10-14 · Status: ontwerp · Bouwt op: zon in schema's
(`2026-10-14-sun-schedules-design.md`, `sun.go`), lampbediening
(`2026-10-07-light-control-design.md`) · Roadmap:
`docs/superpowers/plans/2026-10-14-feature-roadmap.md` (F1)

## Doel

Een lamp met wit licht kan **de kleur van de dag volgen**: warm in de avond
en de nacht, koeler en frisser overdag. De bewoner zet het per lamp aan met één
schakelaar en hoeft er daarna niets meer voor te doen.

## Reikwijdte

- Alleen lampen die kleurtemperatuur kennen (`capabilities` bevat
  `color_temp`), Zigbee en Hue.
- Alleen de wittint, nooit de helderheid.
- Niet in scope: helderheid laten meelopen, een eigen curve per lamp, een
  slaapstand.

## Beslissingen

| Vraag | Keuze | Waarom |
|---|---|---|
| Wie rekent? | De agent, met `sunTimes` en de thuislocatie die er al zijn | Lokaal, ook zonder internet; geen extra HA-integratie (die staat niet in de gesloten lijst) |
| De curve | Nacht 2200 K. Vanaf 1 uur voor zonsopkomst oplopend naar 2700 K bij zonsopkomst; overdag een boog naar 4000 K midden op de dag en terug naar 2700 K bij zonsondergang; binnen een uur na zonsondergang terug naar 2200 K. Afgerond op 50 K en begrensd door wat de lamp kan | Warm wit 's avonds is wat mensen kennen; 4000 K is fris zonder kantoorlicht te worden |
| Hoe vaak | Elke minuut rekenen, alleen sturen als het verschil 50 K of meer is (in de praktijk eens per 10 à 20 minuten) | Geen zichtbare sprongen, weinig verkeer |
| Bij aanzetten | Meteen de juiste wittint, zodra de lamp aangaat (ook door bewegingslicht, een scène of een schakelaar aan de muur) | Anders eerst een flits van de vorige kleur |
| Een lamp die uit staat | Nooit sturen: `light.turn_on` zou hem aanzetten | Real Light Rule: de app zet geen licht aan dat niemand vroeg |
| Zelf een kleur kiezen | Kiest de bewoner zelf een wittint of kleur (in de app, een scène met "Zoals nu", of met een afstandsbediening), dan pauzeert het voor die lamp tot hij weer uit gaat | Een lamp die je net zelf instelde mag niet terugspringen. Uit en weer aan = weer volgen |
| Een kleur van buiten herkennen | De lamp meldt een andere kleurmodus dan wit, of een wittint die meer dan 150 K afwijkt van wat de agent zette (na 1 minuut, zodat de echo van het eigen commando niet telt) | Werkt ook voor een afstandsbediening of de Hue-app, zonder dat de agent die kent |
| Standaard | **Uit** voor nieuwe lampen; de bewoner zet het aan in de detail-sheet | Niemand schrikt van een lamp die vanzelf van kleur verandert; makkelijk later om te draaien |
| Zonder thuislocatie | Niet volgen (de lamp blijft zoals hij is) | Liever niets dan verkeerde tijden |

## Datamodel

`devices.adaptive` (bool, standaard uit), alleen door bewoners te zetten. Een
hook (`device_rules.js`) staat het alleen toe als `capabilities` `color_temp`
bevat (foutcode `invalid_adaptive`).

## Agent

- `adaptive.go`: een pure motor, zoals `motion.go`. Invoer: welke lampen
  meedoen (uit de snapshot), hun stand (HA-events), de klok en de zon. Uitvoer:
  "zet lamp X op N K". `kelvinFor(now, rise, set)` is de curve.
- `adaptive_agent.go`: koppelt de motor aan de event-stroom (naast het
  bewegingslicht), een klok van 1 minuut, en stuurt via
  `light.turn_on` met alleen `color_temp_kelvin`.
- Zelf gekozen kleuren: elk commando of elke scène-stap met
  `color_temp_kelvin` of `rgb_color` op een lamp markeert die lamp als "met de
  hand" tot hij uit gaat. Het pauzeren is alleen in het geheugen: na een
  herstart volgt de lamp weer (de bewoner merkt dat hooguit één keer).

## PWA

In de detail-sheet van een lamp met wit, onder de lampbediening, een
schakelaar **Kleur volgt de dag** met één regel uitleg: "Warm 's avonds,
frisser overdag. Kies je zelf een kleur, dan stopt het tot de lamp uit gaat."
Zichzelf opslaand met "Opgeslagen", zoals de rest van de sheet.

## Testen

- Go: de curve (nacht, ochtend, middag, avond), de grenzen van de lamp,
  aanzetten, uit nooit sturen, pauzeren bij een eigen kleur en bij een kleur
  van buiten, weer volgen na uit en aan.
- Integratie: `adaptive` alleen bij `color_temp`, de box mag het niet zetten.
- Met de hand: een echte lamp aan, de zon via de testklok verzetten.

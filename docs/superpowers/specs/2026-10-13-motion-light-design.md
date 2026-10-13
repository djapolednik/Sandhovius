# Bewegingslicht: lampen aan bij beweging, op de box

Datum: 2026-10-13 · Status: ontwerp, nog niet gebouwd · Bouwt op: schema's
(`2026-09-28-schedules-design.md`), agent zonder PocketBase
(`2026-10-06-agent-offline-start-design.md`)

## Doel

De eerste automatisering die op het huis reageert in plaats van op de klok:
beweging in de gang, dan gaat het licht aan, en een paar minuten na de laatste
beweging weer uit. Lokaal op de box, ook zonder internet en zonder
PocketBase. Dat is de belofte uit CLAUDE.md: de box automatiseert lokaal.

## Reikwijdte

- Een bewegingslicht = **één bewegingssensor + één of meer lampen of
  stopcontacten + "alleen als het donker is" (aan/uit) + uit na N minuten
  zonder beweging + aan/uit**.
- Meer sensoren voor dezelfde lampen = meer bewegingslichten. Twee regels die
  dezelfde lamp aanzetten zijn toegestaan (zie Eigenaarschap).
- Niet in scope: andere soorten regels (zon onder → scène, deur open →
  melding), voorwaarden op tijd of aanwezigheid, een lichtsensor (lux) als
  "donker", dimmen in plaats van uit, regels in "Let op" op Home, een scène als
  actie.

## Beslissingen

| Vraag | Keuze | Waarom |
|---|---|---|
| Wie beslist? | De Go-agent, uit dezelfde stroom die nu device_state voedt (`forwardZigbeeEvent`, `forwardHAEvent`) | Eén plek met logica, testbaar in Go, zoals de schema's. HA-automations zouden een tweede bron van waarheid zijn. |
| Waar in die stroom? | Direct na het lokale `history.Record`, vóór alles met PocketBase | Werkt dan ook als PocketBase weg is; een tik op de gang mag niet wachten op het internet. |
| Datamodel | Een getypte collectie `motion_lights`, geen generiek trigger/voorwaarde/actie-JSON | Velden en regels in PocketBase valideren alles; de sheet is eenvoudig. Een volgende soort regel krijgt een eigen collectie of een `kind`; dat is een migratie, geen herschrijving. Generiek JSON nu bouwen is een motor voor regels die nog niet bestaan. |
| Sync | Het schema-snapshot uitbreiden: elke minuut verversen, op schijf (`/data/schedules.json`) | Hetzelfde mechanisme als de schema's: offline uitvoeren, één ophaal-ronde, geen extra SSE-stromen. Een wijziging in de app geldt dus binnen een minuut. |
| Wat is beweging? | `occupancy` of `motion` is `true` (Zigbee2MQTT), of de HA-state is `on` (een `binary_sensor` of de dev-helper `input_boolean`) | Dezelfde velden die de app nu al als "Beweging" toont (`state.occupancy ?? state.motion`). Geen beweging: `false` / `off`. |
| Wanneer gaat het uit? | N minuten na het laatste "geen beweging" (1–60, standaard 3); nieuwe beweging zet de klok stil | Zigbee-sensoren melden zelf "geen beweging" na hun eigen timeout (vaak 60–90 s); daarbovenop onze minuten. Een sensor die nooit "geen beweging" meldt, laat het licht aan: veilig, en zichtbaar. |
| Donker? | HA's `sun.sun` is `below_horizon` | Zit in HA's standaardconfig en gebruikt de thuislocatie die het weer al gebruikt. Onbekend (geen `sun.sun`, HA weg bij het opstarten): als donker behandelen, want liever licht dat aangaat dan een gang die donker blijft. |
| Eigenaarschap | De regel doet alleen een lamp uit die hij zelf aanzette en die toen uit stond | Wie 's avonds zelf het ganglicht aandoet, wil niet dat het na drie minuten uitgaat omdat iemand voorbijliep. Een lamp die tussendoor uit gaat (app, schema, schakelaar) is niet meer van de regel. |
| Timers na een herstart | De eigenaren en hun uit-tijd staan op schijf, naast het snapshot | Anders blijft na een update of stroomstoring het licht eeuwig aan. Na het opstarten: verlopen = nu uit, nog lopend = verder wachten. |
| Twee regels, één lamp | De lamp gaat pas uit als geen enkele regel hem nog bezit | Twee sensoren in een lange gang: de lamp blijft aan zolang er ergens beweging is. |
| Resultaat terug | `last_run` / `last_error` op het bewegingslicht, best effort, zoals bij schema's | Een fout (lamp onbereikbaar) blijft zo zichtbaar op de kaart. `last_error` is diagnose, de app toont alleen óf er een fout is. |
| Box onbereikbaar in de app? | Dan zie je de regels, maar wijzigen werkt alleen via PocketBase | Zoals schema's. De regel zelf blijft draaien op de box. |

## Datamodel: collectie `motion_lights`

Migratie `backend/pb_migrations/<ts>_add_motion_lights.js`.

| veld | type | opmerkingen |
|---|---|---|
| `house` | relation → houses, cascadeDelete, verplicht | |
| `sensor` | relation → devices, cascadeDelete, verplicht | sensor weg → regel weg |
| `devices` | relation → devices (meervoud, 1–10), verplicht | lampen en stopcontacten; een verwijderd apparaat valt uit de lijst |
| `only_dark` | bool | standaard aan |
| `off_after` | number, verplicht, 1–60, geheel | minuten na de laatste beweging |
| `enabled` | bool | |
| `last_run` | date | alleen door de box geschreven |
| `last_error` | text | alleen door de box; leeg = gelukt |

Geen naam: de kaart heet naar de sensor ("Bewegingssensor gang") en dat is
ook wat de bewoner zoekt.

Regels (zelfde patroon als `schedules` na `1790760000_house_members.js`):

- `list` / `view` / `delete`: `house.members.id ?= @request.auth.id`
- `create`: lid van `@request.body.house`, `@request.body.sensor.gateway =
  @request.body.house`, elk van `@request.body.devices` in hetzelfde huis
  (`@request.body.devices.gateway ?!= …` uitsluiten), en `last_run` /
  `last_error` niet gezet.
- `update`: lid, `house` niet wijzigen, sensor en apparaten in hetzelfde huis
  als ze meekomen, `last_run` / `last_error` niet gezet.
- Box-tak (zoals `1790710000_box_rules.js`): `list` / `view` op het eigen
  huis, `update` alleen `last_run` en `last_error`.

De precieze filter voor "alle apparaten in dit huis" (een relatie met
meerdere waarden) leggen we vast in de integratietest, niet in de spec.

## Agent

**Snapshot.** `fetchScheduleSnapshot` haalt ook `motion_lights` van het eigen
huis op; het bestand krijgt een veld `motion_lights` (oudere bestanden
zonder dat veld blijven leesbaar). De devices zitten er al in, met
`entity_id`: zo vindt de agent bij een sensor-event zijn regels zonder
PocketBase.

**De motor** (`app/motion.go`, puur en getest met een nep-klok):

```go
type motionEngine struct {
    rules  []pocketbase.MotionLight     // uit het snapshot, alleen enabled
    owners map[string]map[string]time.Time // lamp-id → regel-id → uit-tijd (nul = beweging loopt)
    lamps  map[string]bool               // laatst bekende aan/uit per lamp-id
    dark   *bool                         // nil = onbekend
}

// onSensor: beweging of niet, voor de sensor met dit device-id.
func (m *motionEngine) onSensor(deviceID string, motion bool, now time.Time) []action
// onLamp: een lamp ging aan of uit (ook door iets anders dan de regel).
func (m *motionEngine) onLamp(deviceID string, on bool)
// due: lampen waarvan de uit-tijd verstreken is en die niemand meer bezit.
func (m *motionEngine) due(now time.Time) []action
```

- Beweging, regel aan, donker (of onbekend): elke lamp van de regel die
  **uit** staat → `turn_on`, en de regel wordt eigenaar (uit-tijd nul). Een
  lamp die al van de regel was, blijft van de regel (uit-tijd weer nul).
  Een lamp die al aan stond en niet van een regel was: niet aanraken.
- Geen beweging: voor elke lamp die de regel bezit, uit-tijd = nu +
  `off_after`.
- Een lamp gaat uit (`onLamp(false)`): alle eigenaren vervallen.
- `due` draait elke 15 s en bij het opstarten: `turn_off` voor lampen
  waarvan elke eigenaar verlopen is.
- `sun.sun` komt binnen als gewoon HA-event; de motor onthoudt alleen
  `dark`.

De acties gaan door dezelfde `callHA` als scènes (een stap `turn_on` /
`turn_off`, gecontroleerd op "hoort bij dit huis" en "klaargezet"), en daarna
`last_run` / `last_error` best effort naar PocketBase.

**Op schijf.** `owners` met uit-tijden in `/data/motion.json` (env
`MOTION_FILE`), weggeschreven bij elke wijziging, geladen bij het opstarten.
Een eigenaar van een regel die niet meer in het snapshot staat, vervalt.

## App

**Waar:** het tabblad Scènes, onder "Vanzelf uitvoeren", een sectie **Bij
beweging**: per regel een kaart in de stijl van de schema-kaarten (icoon,
de sensor als titel, "Ganglamp en Plafondlamp, uit na 3 minuten", "Alleen
als het donker is", schakelaar aan/uit; "De laatste keer niet gelukt" bij een
fout; "Sensor offline" als de sensor offline is). Een tik opent de sheet.
Daaronder "Bewegingslicht toevoegen".

**De sheet:** Sensor (keuze uit de sensoren die ooit beweging meldden;
zonder: "Je bewegingssensor verschijnt hier zodra hij voor het eerst iets
meldt."), Lampen en stopcontacten (vinkjes, per kamer), Alleen als het donker
is (schakelaar), Uit na (1, 2, 3, 5, 10, 15, 30 minuten, als stappen),
Opslaan, Verwijderen. Copy in `nl.json` en `en.json`, volgens de Named
Rules; een instelling, dus Electric Blue, niets gloeit.

**Lege stand:** zolang er geen bewegingslichten zijn, een rustige regel met
een voorbeeld, zoals bij de schema's: "Laat het licht aangaan als je
binnenkomt: kies een bewegingssensor en de lampen erbij."

## Testen

- **Go, de motor** (tabel-tests, nep-klok): aan bij beweging in het donker;
  niet aan overdag; donker onbekend = aan; uit na `off_after` na "geen
  beweging"; nieuwe beweging stopt de klok; een lamp die al aan stond blijft
  aan; zelf uitgezet = niet meer van de regel; twee regels, één lamp; een
  uitgeschakelde regel doet niets.
- **Go, opslag**: `motion.json` heen en terug; na het laden gaat een
  verlopen lamp meteen uit.
- **Go, agent**: een Zigbee- en een HA-event komen bij de motor, ook als
  PocketBase weg is (nep-`callService`, zoals de scène-tests).
- **Integratie** (`backend/tests`): de regels: lid wel, buitenstaander niet,
  sensor of lamp uit een ander huis geweigerd, de box leest zijn eigen huis
  en schrijft alleen `last_run` / `last_error`.
- **PWA**: helpers (`describeMotionLight`) in beide talen; screenshots van
  de sectie en de sheet, licht en donker, Nederlands en Engels.
- **Met de hand, lokaal**: `mosquitto_pub -t zigbee2mqtt/<sensor> -m
  '{"occupancy":true}'` met `scripts/fake-lights.py`; lamp gaat aan, na
  `{"occupancy":false}` en de minuten uit. Agent herstarten tijdens het
  wachten: de lamp gaat alsnog op tijd uit. Geen echte apparaten schakelen
  zonder het te zeggen.

## Volgorde (kleine commits op een feature-branch)

1. Migratie + regels + integratietests.
2. De motor + tests (zonder agent-koppeling).
3. Snapshot, opslag op schijf en de koppeling in de agent.
4. De app: sectie, sheet, copy in beide talen.
5. Docs: `backend_explained.md`, `docs/status.md`, `docs/codebase.md`,
   DESIGN.md (Bij beweging).

## Buiten scope / later

- Andere soorten regels; een lichtsensor als "donker"; dimmen voor uit.
- Een regel als oorzaak zien in de app ("Aan door beweging").
- Bewegingslichten in "Let op" op Home (een sensor die offline is staat daar
  al).

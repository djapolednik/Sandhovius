# Agent start en herstelt zonder PocketBase — ontwerp

Datum: 2026-10-06 · Status: ter review

## Doel

De box blijft een slim huis, ook als PocketBase onbereikbaar is: bij het
opstarten en tijdens het draaien. Alles wat lokaal kan (MQTT, Home
Assistant, lokale geschiedenis, schema's) draait meteen; alles wat
PocketBase nodig heeft sluit vanzelf aan zodra het er weer is. Voorwaarde
voor fase 3, waarin PocketBase op Scaleway staat en een internetstoring
gewoon voorkomt.

Nu zijn twee dingen fataal: inloggen bij PocketBase (`main.go`) en
`registerGateway()` in `Start()`. Daarna worden openstaande commando's
alleen bij het opstarten opgehaald; een commando dat binnenkomt terwijl de
realtime-stroom weg is, blijft liggen tot de volgende herstart.

## Succescriteria

- Agent start terwijl PocketBase uit staat → HA-events komen in de lokale
  geschiedenis, een schema loopt op tijd (uit `/data/schedules.json`).
- PocketBase komt terug → binnen ~30 s: gateway online, stand van alle
  devices afgestemd, openstaande commando's verwerkt.
- PocketBase valt weg terwijl de agent draait en komt terug → hetzelfde
  herstel, zonder herstart.
- Een commando dat te lang heeft liggen wachten wordt niet alsnog
  uitgevoerd maar als `failed` ("verlopen") gemarkeerd.

## Buiten scope

- Home Assistant onbereikbaar bij het opstarten blijft fataal (HA is
  lokaal; Docker herstart de container).
- Claim-flow / nieuw huis zonder internet: bij de allereerste start (geen
  ID-bestand) én geen PocketBase is er geen huis; de agent draait lokaal en
  blijft proberen. Er wordt nooit een huis aangemaakt op basis van "even
  onbereikbaar".
- Gemiste schema-runs inhalen (blijft: niet inhalen, zie schedules-spec).

## Keuzes

| Vraag | Keuze | Waarom |
|---|---|---|
| Opstartvolgorde | Lokaal eerst, PocketBase in een eigen lus | Wachten op PocketBase (blokkerend of via een crashlus met `restart: always`) houdt juist de lokale automatisering tegen. |
| Herverbinden | Exponentiële backoff 1 s → 30 s | Zelfde patroon als de HA-lus; geen tight loop tegen een dode server. |
| Gateway-ID offline | ID uit `/data/gateway_id` vertrouwen; verifiëren zodra PocketBase er is | Zonder ID geen huis-filter voor de snapshot. De bestaande regels van `registerGateway` blijven gelden bij de verificatie. |
| Herstelstap | Eén functie `onPocketBaseConnected`, ook na elke herverbinding van de command-stroom | Eén plek die bepaalt wat "aansluiten" betekent; opstarten en herstel zijn hetzelfde pad. |
| Oude commando's | Verlopen na 2 minuten (`commandMaxAge`), behalve `provision` | De PWA blokkeert schakelen al na 90 s zonder hartslag; een tik van een uur geleden mag geen lamp meer aanzetten. Klaarzetten is niet tijdgevoelig. |
| Leeftijd bepalen | Nieuw `autodate`-veld `created` op `commands` | Bestaat nu niet (ook nuttig voor debuggen). Oude records zonder `created` gelden als verlopen. |

## Ontwerp

### Opstarten (`main.go`, `Agent.Start`)

`main.go` roept `Authenticate` niet meer fataal aan; het geeft de
inloggegevens aan de client (`SetCredentials`) en het inloggen gebeurt in
de verbindingslus. `doAuthed` logt al opnieuw in bij een 401, dus een
client zonder token herstelt zichzelf bij de eerste call.

`Start()`:

1. MQTT verbinden + subscriben (zoals nu).
2. Geschiedenis-opruiming starten.
3. Gateway-ID uit het bestand lezen (`a.setHouse(storedID)`, mag leeg).
4. Schema-snapshot uit het bestand laden (zie hieronder) en de scheduler
   starten.
5. HA verbinden (fataal zoals nu) en `listenToHAEvents` starten.
6. `go a.runPocketBase()`, `go a.listenForCommands()`,
   `go a.listenForDeviceChanges()`, `go a.runHeartbeat()`,
   `go a.runWeather()`.

De realtime-listeners proberen het al elke 5 s opnieuw; zonder PocketBase
falen ze gewoon en loggen ze, zoals nu bij een verbroken stroom.

### Verbindingslus (`runPocketBase`, nieuw bestand `connection.go`)

```
backoff := 1s
loop tot ctx klaar:
  err := login → registerGateway (verifiëren / migreren / aanmaken)
  fout → log, wacht backoff, backoff = min(2×, 30s), opnieuw
  ok   → onPocketBaseConnected(); klaar
```

De lus draait tot de eerste geslaagde registratie. Daarna is het herstel
na uitval de taak van de command-listener (hieronder): die merkt als eerste
dat de stroom terug is.

`registerGateway` blijft inhoudelijk gelijk, maar schrijft het ID via
`a.setHouse`. Verandert het ID (opgeslagen record verwijderd → nieuw
record), dan klopt de snapshot in geheugen niet meer bij het huis; de
eerstvolgende scheduler-fetch vervangt hem, en het bestand wordt bij
inladen al op `house` gecontroleerd.

### Gateway-ID (`a.house()`)

`a.gatewayID` wordt alleen nog gelezen en geschreven via `house()` /
`setHouse()` (mutex), omdat scheduler, hartslag en weer al draaien vóór de
verificatie klaar is. Hartslag, weer en `Stop()` slaan hun PocketBase-call
over zolang `house()` leeg is; de scheduler-fetch geeft dan een fout (de
snapshot uit het bestand blijft gelden).

### Herstelstap (`onPocketBaseConnected`)

Een keer na de registratie en daarna na elke geslaagde (her)subscribe van
de command-stroom:

1. Gateway op "online" zetten (directe hartslag).
2. Device-cache verversen + `warmDeviceNames`.
3. `reconcileDeviceStates()` — stand van elk device uit HA.
4. `catchUpPendingCommands()` — met de verloop-check.

Bij de command-stroom gebeurt dit pas als de verbindingslus de gateway
heeft geverifieerd (vlag `registered`, gezet door `runPocketBase`); een
ID uit het bestand alleen is niet genoeg, want dat record kan verwijderd
zijn. Vóór die tijd doet de verbindingslus de herstelstap zelf. Een mutex zorgt dat
twee herstelstappen niet tegelijk lopen (bv. lus en listener op hetzelfde
moment); een tweede aanroep wacht.

Daarvoor krijgt `subscribeCollection` een `onSubscribed func()`-parameter
die wordt aangeroepen direct na een geslaagde subscribe-POST.
`SubscribeCommands` geeft hem door; `SubscribeDevices` geeft `nil`.

### Verlopen commando's

- Migratie: `autodate`-veld `created` (onCreate) op `commands`.
- `Command` krijgt `Created string`.
- Pure functie `commandExpired(cmd, now) bool`: `false` voor `provision`;
  anders `true` als `created` leeg/onleesbaar is of ouder dan
  `commandMaxAge` (2 min).
- `catchUpPendingCommands`: verlopen → `failCommand(id, "verlopen: de box
  was te lang niet bereikbaar")`, anders `handleCommand`. Realtime
  "create"-events zijn per definitie vers en gaan niet door de check.
- Klokverschil box ↔ server: beide gebruiken NTP; 2 minuten is ruim
  genoeg om kleine afwijkingen op te vangen.

### Schema-snapshot op schijf (`schedule_store.go`)

Bestand `SCHEDULES_FILE` (standaard `/data/schedules.json`):

```json
{ "house": "abc123", "saved_at": "2026-10-06T21:00:00+02:00",
  "schedules": [...], "scenes": [...], "devices": [...] }
```

- `saveSnapshot(path, house, snap)` — atomisch (tmp + rename, zoals
  `writeGatewayID`), na elke geslaagde fetch in de scheduler-tick.
- `loadSnapshot(path, house) (*scheduleSnapshot, error)` — ontbrekend
  bestand → `nil, nil`; ander huis → `nil, nil` met een logregel; kapot
  bestand → fout (gelogd, de agent start gewoon zonder snapshot).
- De `scheduler` krijgt een `save`-functie naast `fetch` en `run`, en
  begint met `snap` uit het bestand.

## Foutafhandeling (samengevat)

| Situatie | Gedrag |
|---|---|
| PocketBase weg bij start, ID-bestand aanwezig | Lokaal draait; schema's uit bestand; lus probeert met backoff |
| PocketBase weg bij start, geen ID-bestand | Lokaal draait; geen schema's; lus probeert met backoff |
| PocketBase valt weg tijdens draaien | Listeners herverbinden elke 5 s; scheduler gebruikt laatste snapshot; hartslag/weer loggen fouten |
| PocketBase terug | Command-stroom subscribet → herstelstap |
| Snapshot-bestand kapot of van ander huis | Genegeerd (gelogd); eerste geslaagde fetch schrijft een nieuw |

## Testen

Unit (`go test ./...`):
- `saveSnapshot`/`loadSnapshot`: round-trip, ontbrekend bestand, ander
  huis, kapot bestand.
- `commandExpired`: vers, oud, leeg `created`, `provision` oud.
- Scheduler-tick: snapshot uit bestand wordt gebruikt als fetch faalt;
  `save` alleen na geslaagde fetch.

Handmatig (Docker):
1. `docker compose stop pocketbase`, agent herstarten, schema op de
   volgende minuut → scène draait; log toont backoff.
2. PocketBase starten → binnen ~30 s gateway online in de PWA, stand klopt.
3. Tijdens draaien PocketBase 1 min stoppen, in de tussentijd een command
   aanmaken in de admin-UI (status pending) — na herstart van PocketBase
   wordt het uitgevoerd.
4. Zelfde, maar het command 3 min laten liggen → `failed`, "verlopen".
5. Bij testen echte apparaten: vooraf zeggen welke; daarna terugzetten.

## Volgorde van bouwen

1. Migratie `commands.created` + `Command.Created` + `commandExpired` (test).
2. `house()`/`setHouse()`; hartslag/weer/Stop/fetch daarop.
3. `schedule_store.go` + scheduler laadt/schrijft (tests).
4. `onSubscribed` in `subscribeCollection`; `onPocketBaseConnected`.
5. `runPocketBase` + `main.go` niet meer fataal; `Start()` herordenen.
6. Handmatige scenario's, CLAUDE.md (status + volgende stappen) bijwerken.

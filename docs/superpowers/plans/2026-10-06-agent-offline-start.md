# Agent start en herstelt zonder PocketBase — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De Go-agent start en blijft werken zonder PocketBase, en sluit zichzelf weer aan (gateway, stand, openstaande commando's) zodra PocketBase terug is — bij het opstarten en na een uitval tijdens het draaien.

**Architecture:** `Start()` start eerst het lokale deel (MQTT, HA, geschiedenis, scheduler met snapshot uit `/data/schedules.json`). Een lus `runPocketBase` logt in en registreert de gateway met exponentiële backoff; daarna en na elke herverbinding van de command-stroom draait één herstelstap `onPocketBaseConnected`. Commando's ouder dan 2 minuten worden bij het inhalen als verlopen gemarkeerd.

**Tech Stack:** Go (agent, `go test`), PocketBase 0.40 JS-migraties.

**Spec:** `docs/superpowers/specs/2026-10-06-agent-offline-start-design.md`

## Global Constraints

- Logregels en foutteksten in het Nederlands, in de stijl van de bestaande `[APP]`/`[SCHEMA]`-prefixen.
- Commentaar in de code: Nederlands, zelfde dichtheid als de omliggende code (het "waarom", niet het "wat").
- Backoff verbindingslus: start 1 s, verdubbelt, maximaal 30 s.
- `commandMaxAge = 2 * time.Minute`; `provision` verloopt nooit.
- Foutmelding verlopen commando: `verlopen: de box was te lang niet bereikbaar`.
- Snapshot-bestand: env `SCHEDULES_FILE`, standaard `/data/schedules.json`, JSON `{house, saved_at, schedules, scenes, devices}`, atomisch geschreven (tmp + rename).
- Er wordt nooit een houses-record aangemaakt omdat PocketBase onbereikbaar is (bestaande regel in `registerGateway`).
- Home Assistant onbereikbaar bij start blijft fataal.
- Na elke taak: `cd agent && go vet ./... && go test ./...` groen. Commits klein, op branch `agent-offline-start`, eindigend met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **PocketBase-tijdformaat:** `created` komt als `"2026-10-06 19:00:00.123Z"` (spatie, geen `T`) — `time.Parse(time.RFC3339, …)` faalt daarop en zou álle commando's als verlopen markeren. Test in Taak 1.
2. **Klokverschil:** een `created` een paar seconden in de toekomst (serverklok loopt voor) is vers, niet verlopen of kapot. Test in Taak 1.
3. **Opslaan mislukt (schijf vol / read-only):** de scène moet toch draaien; opslaan is bijzaak. Test in Taak 3.
4. **Huis zonder schema's:** een lege snapshot is geldig en moet ook geschreven en weer ingeladen worden (anders draait na een herstart een oud, inmiddels verwijderd schema). Test in Taak 3.
5. **Twee herstelstappen tegelijk** (verbindingslus en command-listener op hetzelfde moment): mag geen dubbel uitgevoerde commando's geven. Afgedekt door de mutex in Taak 4 plus het feit dat `handleCommand` alleen `pending` uitvoert; handmatig gecontroleerd in Taak 6, scenario 2.

---

### Task 1: Verlopen commando's

**Files:**
- Create: `backend/pb_migrations/1790600000_add_command_created.js`
- Create: `agent/internal/app/commands.go`
- Create: `agent/internal/app/commands_test.go`
- Modify: `agent/internal/pocketbase/commands.go` (struct `Command`)
- Modify: `agent/internal/app/agent.go` (`catchUpPendingCommands`, ~r.122)

**Interfaces:**
- Produces: `const commandMaxAge = 2 * time.Minute`; `func commandExpired(cmd pocketbase.Command, now time.Time) bool`; `pocketbase.Command.Created string` (`json:"created"`).

- [ ] **Step 1: Migratie schrijven.** Zelfde stijl als `1790500000_add_house_weather.js` (kop-commentaar met het waarom). Up: `commands.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }))`. Down: `removeByName("created")`.

- [ ] **Step 2: Failing test schrijven** in `commands_test.go`:

```go
func TestCommandExpired(t *testing.T) {
	now := time.Date(2026, 10, 6, 19, 10, 0, 0, time.UTC)
	cases := []struct {
		name    string
		cmd     pocketbase.Command
		expired bool
	}{
		{"vers (PocketBase-formaat)", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:09:30.123Z"}, false},
		{"precies op de grens", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:08:00.000Z"}, false},
		{"te oud", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:07:59.000Z"}, true},
		{"serverklok loopt voor", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:10:05.000Z"}, false},
		{"zonder created (van vóór de migratie)", pocketbase.Command{Action: "turn_on"}, true},
		{"onleesbaar", pocketbase.Command{Action: "turn_on", Created: "gisteren"}, true},
		{"provision verloopt nooit", pocketbase.Command{Action: "provision", Created: "2026-10-01 08:00:00.000Z"}, false},
		{"scène verloopt ook", pocketbase.Command{Action: "run_scene", Created: "2026-10-06 18:00:00.000Z"}, true},
	}
	for _, c := range cases {
		if got := commandExpired(c.cmd, now); got != c.expired {
			t.Errorf("%s: expired = %v, want %v", c.name, got, c.expired)
		}
	}
}
```

- [ ] **Step 3: Draaien, moet falen.** `cd agent && go test ./internal/app -run TestCommandExpired` → FAIL (undefined: `commandExpired` / `Created`).

- [ ] **Step 4: Implementeren.** `Created` op `Command`. `commandExpired` in `commands.go`: parse met layout `"2006-01-02 15:04:05.000Z"` in UTC (val terug op `time.RFC3339` voor de zekerheid); verlopen als `now.Sub(created) > commandMaxAge`.

- [ ] **Step 5: Inhalen met verloop-check.** In `catchUpPendingCommands`: per commando `commandExpired(cmd, time.Now())` → log + `a.failCommand(cmd.ID, errors.New("verlopen: de box was te lang niet bereikbaar"))`, anders `a.handleCommand(cmd)`. Realtime-events (`handleCommandEvent`) blijven ongemoeid.

- [ ] **Step 6: Tests draaien.** `cd agent && go vet ./... && go test ./...` → PASS.

- [ ] **Step 7: Migratie checken.** `docker compose restart pocketbase`; in de admin-UI (http://localhost:8090/_/) heeft `commands` een veld `created`; een nieuw record krijgt een waarde.

- [ ] **Step 8: Commit.** `Agent: expire pending commands older than two minutes`

---

### Task 2: Gateway-ID achter een accessor

**Files:**
- Modify: `agent/internal/app/agent.go` (struct, `runScene` r.369, `registerGateway` r.483-484, `runHeartbeat` r.532, `Stop` r.717)
- Modify: `agent/internal/app/scheduler.go` (`fetchScheduleSnapshot`)
- Modify: `agent/internal/app/weather.go` (r.127)

**Interfaces:**
- Produces: `func (a *Agent) house() string`; `func (a *Agent) setHouse(id string)` (veld `gatewayID` + `houseMu sync.RWMutex`). Na deze taak leest of schrijft niets meer `a.gatewayID` direct, behalve deze twee methodes.

- [ ] **Step 1: Accessor toevoegen** en alle directe uses vervangen (`grep -n "gatewayID" agent/internal/app/*.go` mag daarna alleen de struct, `house`, `setHouse` en `gatewayIDFile` tonen).

- [ ] **Step 2: Lege ID afhandelen.** `runHeartbeat` en `runWeather` (de PocketBase-schrijfactie) slaan over als `house() == ""`; `fetchScheduleSnapshot` geeft dan `errors.New("nog geen huis bekend")`; `Stop` had de check al.

- [ ] **Step 3: Verifiëren.** `cd agent && go vet ./... && go test -race ./...` → PASS.

- [ ] **Step 4: Commit.** `Agent: read the house id through a lock`

---

### Task 3: Schema-snapshot op schijf

**Files:**
- Create: `agent/internal/app/schedule_store.go`
- Create: `agent/internal/app/schedule_store_test.go`
- Modify: `agent/internal/app/scheduler.go` (struct `scheduler`, `tick`, `runScheduler`)
- Modify: `agent/internal/app/scheduler_test.go`
- Modify: `agent/internal/config/config.go` (`c.Schedules.File = env("SCHEDULES_FILE", "/data/schedules.json")`)
- Modify: `agent/internal/app/agent.go` (`New` krijgt `schedulesFile string` als laatste parameter; veld `schedulesFile`)
- Modify: `agent/main/main.go` (doorgeven)

**Interfaces:**
- Consumes: `a.house()` (Task 2).
- Produces:
  - `func saveSnapshot(path, house string, snap *scheduleSnapshot, now time.Time) error`
  - `func loadSnapshot(path, house string) (*scheduleSnapshot, error)` — ontbrekend bestand of ander huis → `nil, nil`; kapot → `nil, err`.
  - `scheduler.save func(*scheduleSnapshot) error` (mag `nil` zijn: bestaande tests blijven zo werken).
  - `func (a *Agent) loadScheduleSnapshot() *scheduleSnapshot` — logt fouten/ander huis, geeft `nil` bij niets bruikbaars.

- [ ] **Step 1: Failing tests** in `schedule_store_test.go` (gebruik `t.TempDir()`):
  - `TestSnapshotRoundTrip`: snapshot met 1 schema, 1 scène (`ID "s1"`), 1 device (`ID "d1"`) → `saveSnapshot(p, "huis1", …)` → `loadSnapshot(p, "huis1")` geeft dezelfde `schedules`, `scenes["s1"]`, `devices["d1"]`.
  - `TestSnapshotEmptyHouse`: snapshot zonder schema's/scènes/devices → opslaan en laden geeft een niet-nil snapshot met lege `schedules` (Review Focus 4).
  - `TestSnapshotMissingFile`: `loadSnapshot(niet-bestaand, "huis1")` → `nil, nil`.
  - `TestSnapshotOtherHouse`: opgeslagen voor `"huis1"`, laden voor `"huis2"` → `nil, nil`.
  - `TestSnapshotCorrupt`: bestand met `{kapot` → `nil`, `err != nil`.
  - `TestSnapshotNoTempFileLeft`: na `saveSnapshot` bestaat `p+".tmp"` niet.

- [ ] **Step 2: Failing tests** in `scheduler_test.go`:
  - `TestTickSavesOnlyAfterSuccessfulFetch`: `save` telt aanroepen; tick met geslaagde fetch → 1; volgende minuut met falende fetch → nog steeds 1.
  - `TestTickRunsWhenSaveFails` (Review Focus 3): `save` geeft een fout, schema om 23:00 → `runs == 1`.
  - `TestTickUsesSnapshotFromFile`: `scheduler{snap: snapUitBestand, fetch: altijd fout}` → schema draait.

- [ ] **Step 3: Draaien, moet falen.** `cd agent && go test ./internal/app` → FAIL (undefined).

- [ ] **Step 4: Implementeren.** Bestandsformaat met een eigen struct (lijsten, geen maps; `saved_at` als RFC3339); atomisch schrijven zoals `writeGatewayID`. In `tick`: na een geslaagde fetch `s.save` aanroepen als die niet `nil` is en een fout alleen loggen (`[SCHEMA] Schema's opslaan mislukt: …`). `runScheduler` begint met `snap: a.loadScheduleSnapshot()` en `save` die `saveSnapshot(a.schedulesFile, a.house(), snap, time.Now())` aanroept.

- [ ] **Step 5: Tests draaien.** `cd agent && go vet ./... && go test ./...` → PASS.

- [ ] **Step 6: Commit.** `Agent: keep the schedule snapshot in /data/schedules.json`

---

### Task 4: Herstelstap na (her)verbinden

**Files:**
- Create: `agent/internal/app/connection.go`
- Modify: `agent/internal/pocketbase/realtime.go` (`subscribeCollection`, `SubscribeCommands`, `SubscribeDevices`)
- Modify: `agent/internal/app/agent.go` (`listenForCommands`, verplaatst opwarm/afstem-code uit `Start`)

**Interfaces:**
- Consumes: `a.house()`, `catchUpPendingCommands` met verloop-check (Task 1).
- Produces:
  - `subscribeCollection(ctx, collectionName string, onSubscribed func(), handler func(data []byte)) error` — `onSubscribed` (mag `nil`) direct na een geslaagde `subscribeRealtime`.
  - `SubscribeCommands(ctx, onSubscribed func(), handler func(CommandEvent)) error`; `SubscribeDevices` ongewijzigd naar buiten (geeft `nil` door).
  - `func (a *Agent) onPocketBaseConnected()` — houdt `recoverMu sync.Mutex` vast; stappen: `SetGatewayStatus(a.house(), "online")`, `a.devices.refresh()` + `warmDeviceNames`, `reconcileDeviceStates()`, `catchUpPendingCommands()`. Een fout in een stap logt en gaat door met de volgende.
  - `registered atomic.Bool` op `Agent`.

- [ ] **Step 1: `onSubscribed` in de realtime-client** en de aanroepen aanpassen.

- [ ] **Step 2: `onPocketBaseConnected` in `connection.go`;** `listenForCommands` geeft als `onSubscribed` een functie die alleen bij `a.registered.Load()` `go a.onPocketBaseConnected()` start (in een goroutine: de SSE-lezer mag niet blokkeren op HA-calls).

- [ ] **Step 3: `Start()` gebruikt de herstelstap** in plaats van de losse opwarm-, afstem- en inhaal-aanroepen na `registerGateway` (registratie blijft hier nog fataal; dat verandert in Task 5). Zet `a.registered.Store(true)` na een geslaagde registratie.

- [ ] **Step 4: Verifiëren.** `cd agent && go vet ./... && go test -race ./...` → PASS; `docker compose up -d --build agent`, log toont "Stand van N devices afgestemd" één keer bij de start; `docker compose restart pocketbase` → na de herverbinding van de command-stroom opnieuw "Stand van N devices afgestemd".

- [ ] **Step 5: Commit.** `Agent: catch up after the command stream reconnects`

---

### Task 5: Opstarten zonder PocketBase

**Files:**
- Modify: `agent/internal/pocketbase/auth.go` (`SetCredentials`, `Login`)
- Modify: `agent/main/main.go` (stap 5)
- Modify: `agent/internal/app/connection.go`
- Create: `agent/internal/app/connection_test.go`
- Modify: `agent/internal/app/agent.go` (`Start`, `registerGateway`)

**Interfaces:**
- Consumes: `onPocketBaseConnected`, `registered` (Task 4); `setHouse` (Task 2).
- Produces:
  - `func (c *Client) SetCredentials(email, password string)` en `func (c *Client) Login() error` (exporteert het bestaande `login`); `Authenticate` blijft bestaan als `SetCredentials` + `Login`.
  - `func retryWithBackoff(ctx context.Context, minWait, maxWait time.Duration, attempt func() error) bool` — `true` na een geslaagde poging, `false` als `ctx` eerder klaar is.
  - `func (a *Agent) runPocketBase()` — `retryWithBackoff(a.ctx, time.Second, 30*time.Second, func() error { Login; registerGateway })`, daarna `registered.Store(true)` en `onPocketBaseConnected()`.

- [ ] **Step 1: Failing tests** in `connection_test.go`:
  - `TestRetryWithBackoffSucceedsAfterFailures`: poging faalt 2× en lukt de 3e (`minWait` 1 ms, `maxWait` 4 ms) → `true`, 3 pogingen.
  - `TestRetryWithBackoffStopsOnCancel`: poging faalt altijd, `ctx` na 20 ms geannuleerd → `false` binnen 200 ms.
  - `TestRetryWithBackoffCapsWait`: meet de wachttijden via een geïnjecteerde of gemeten klok; geen wachttijd groter dan `maxWait` (tolerantie 10 ms).

- [ ] **Step 2: Draaien, moet falen.** `cd agent && go test ./internal/app -run TestRetryWithBackoff` → FAIL.

- [ ] **Step 3: `retryWithBackoff` en `runPocketBase` implementeren.** Log per mislukte poging: `[APP] PocketBase niet bereikbaar: <fout> — opnieuw over <wacht>`.

- [ ] **Step 4: `main.go` en `Start()` omzetten.** `main.go`: `pbClient.SetCredentials(...)`, geen `log.Fatalf` meer. `Start()` in de volgorde van de spec: MQTT → opruiming → `setHouse(readGatewayID)` (fout bij lezen blijft fataal: onleesbaar bestand is een echt defect) → `go runScheduler()` → HA verbinden + `go listenToHAEvents()` → `go runPocketBase()`, listeners, hartslag, weer. `registerGateway` doet geen `SetGatewayStatus` meer (zit in de herstelstap) en schrijft via `setHouse`.

- [ ] **Step 5: Tests draaien.** `cd agent && go vet ./... && go test -race ./...` → PASS.

- [ ] **Step 6: Commit.** `Agent: start and run without PocketBase, connect with backoff`

---

### Task 6: Handmatige scenario's en docs

**Files:**
- Modify: `CLAUDE.md` (Huidige Status + Volgende Stappen punt 1 en 7)

- [ ] **Step 1: Build.** `docker compose up -d --build agent`; geen fouten in `docker compose logs agent`.

- [ ] **Step 2: Scenario's uit de spec draaien** (echte apparaten: vooraf melden welke; daarna terugzetten; testschema's daarna verwijderen):
  1. `docker compose stop pocketbase`, `docker compose restart agent`, schema (gemaakt vóór het stoppen) op de volgende minuut → scène draait; log toont backoff-regels.
  2. `docker compose start pocketbase` → binnen ~30 s gateway online in de PWA, stand klopt; log toont de herstelstap; geen commando dubbel uitgevoerd.
  3. Uitval tijdens draaien, zoals straks met internet: `docker network disconnect <netwerk> sandhovius-agent` (netwerknaam via `docker network ls`; HA en MQTT zijn dan ook weg, dat hoort bij deze test), in de admin-UI een pending command aanmaken, na ~1 min `docker network connect` → na de herverbinding van de stroom wordt het command uitgevoerd.
  4. Zelfde, maar 3 min wachten vóór `connect` → `failed` met `verlopen: de box was te lang niet bereikbaar`.

- [ ] **Step 3: CLAUDE.md bijwerken.** Statusregel onder Fase 2 (agent start/herstelt zonder PocketBase, `/data/schedules.json`, commando's verlopen na 2 min); Volgende Stappen punt 1 weghalen, punt 7: `commands` heeft nu `created`.

- [ ] **Step 4: Commit.** `Docs: agent runs without PocketBase in CLAUDE.md`

---

### Task 7: Alleen commando's van het eigen huis

Toegevoegd na de plan-review (gebruiker: "het bestaande gat ook oplossen"). De agent ziet als superuser de commando's van álle huizen: `ListPendingCommands` filtert niet op huis, en de realtime-stroom levert alles. Met meerdere boxen op één PocketBase (fase 3) voert box A dan andermans device-commando's uit, en markeert hij andermans scène-commando's als `failed`.

**Files:**
- Create: `agent/internal/pocketbase/commands_test.go`
- Modify: `agent/internal/pocketbase/commands.go` (`ListPendingCommands(house string)`, filter-helper)
- Modify: `agent/internal/app/agent.go` (`handleCommand`, `runScene`, `catchUpPendingCommands`)

**Interfaces:**
- Consumes: `a.house()` (Task 2).
- Produces: `func pendingCommandsFilter(house string) string` — PocketBase-filter `status='pending' && (device.gateway='<house>' || scene.house='<house>')`; `ListPendingCommands(house string) ([]Command, error)`.

- [ ] **Step 1: Failing test** `TestPendingCommandsFilter`: filter voor `"abc123"` is precies `status='pending' && (device.gateway='abc123' || scene.house='abc123')`; een huis-ID met een `'` erin wordt geweigerd (lege string + fout, of een escaped quote — kies: PocketBase-record-ID's zijn `[a-z0-9]{15}`, dus alles daarbuiten → fout).
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** + `catchUpPendingCommands` geeft `a.house()` mee.
- [ ] **Step 4: Realtime-pad.** `handleCommand`: device-commando waarvan `device.Gateway != a.house()` → stil negeren (geen `failed`: dat commando is van een andere box). `runScene`: scène van een ander huis → ook stil negeren in plaats van `failCommand`.
- [ ] **Step 5: Verifiëren.** `go vet ./... && go test ./...` PASS; handmatig: `ListPendingCommands` tegen de lokale PocketBase geeft alleen eigen commando's (log bij opstarten).
- [ ] **Step 6: Commit.** `Agent: only handle commands for this house`

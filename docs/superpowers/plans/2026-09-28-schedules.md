# Schema's Implementation Plan

> **Status:** uitgevoerd en in `main`. Dit plan is een historisch werkdocument; waar de uitvoering afweek, staat dat in de spec en in de git-geschiedenis.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scènes vanzelf laten uitvoeren op een tijdstip en weekdagen, door de agent op de box, ook als PocketBase even onbereikbaar is.

**Architecture:** Nieuwe PocketBase-collectie `schedules` (scène + `HH:MM` + dagen + aan/uit). De Go-agent haalt elke minuut een snapshot op (schedules, scenes, devices van dit huis), houdt de laatste in geheugen, en voert due schema's uit via een gedeelde `executeScene`. De PWA bewerkt schema's in de bestaande scène-sheet en toont ze op de scène-tegel.

**Tech Stack:** Go 1.26 (stdlib `testing`, `time/tzdata`), PocketBase 0.40 JS-migraties, Next.js 16 (JS, geen TS), `node:test` voor één pure helper.

**Spec:** `docs/superpowers/specs/2026-09-28-schedules-design.md`

## Global Constraints

- Geen commits: de gebruiker commit zelf; werk op `main`.
- UI-copy Nederlands, zinsletters, geen hoofdletter-labels, geen meta-strings met middenpunten (DESIGN.md).
- Schema-knoppen en -switch zijn instellingen: Electric Blue (`switch-accent`, `--accent`), nooit Signal Green. Niets gloeit.
- Touch targets ≥ 44px.
- Tijden in `Europe/Amsterdam`; veld `time` is `HH:MM` (regex `^([01]\d|2[0-3]):[0-5]\d$`); `days` ⊆ `mon tue wed thu fri sat sun`.
- Gemiste runs worden niet ingehaald; een dubbele run is toegestaan (scènes zetten een stand, geen `toggle`).
- De agent schakelt nooit apparaten van een ander huis: snapshot gefilterd op `gatewayID`, en `device.Gateway == scene.House` blijft in de gedeelde stap-code.
- `cd agent && go vet ./... && go test ./...` en `cd frontend && npx next build` moeten slagen.
- Geen echte apparaten schakelen tijdens het testen zonder het te melden; testdata na afloop opruimen.

## Review Focus

1. **PocketBase onbereikbaar op het moment van afgaan** → scène draait toch, uit de vorige snapshot. (Task 3: `TestTickUsesLastSnapshotWhenFetchFails`)
2. **Dezelfde minuut twee keer geëvalueerd** (trage lus, klok-hik) → schema draait één keer. (Task 3: `TestTickRunsEachMinuteOnce`)
3. **Zomertijd-nacht** → een schema op 02:30 draait niet in de nacht dat 02:xx niet bestaat; 03:30 draait precies één keer. (Task 3: `TestDueSchedulesSpringForward`)
4. **PocketBase hangt (in plaats van te weigeren)** → de schema-lus blijft niet eindeloos wachten; REST-calls hebben een timeout van 15 s. (Task 2: handmatige check in Task 6)
5. **Dagen in willekeurige volgorde uit PocketBase / werkdagen** → tekst altijd in weekvolgorde, "Werkdagen"/"Weekend"/"Elke dag" herkend. Nieuwe scène opgeslagen maar schema faalde, opnieuw "Opslaan" → geen dubbele scène. (Task 4: `schedules.test.js`; Task 5: handmatig)

## Afwijkingen van de spec (bij het plannen gevonden)

- **Snapshot naar `/data/schedules.json` vervalt in dit plan.** De agent kan nu niet starten zonder PocketBase (`Authenticate` in `main.go` en `registerGateway()` zijn fataal), dus een bestand dat bij opstart wordt ingelezen zou nooit gebruikt worden. Dat hoort bij een aparte stap "agent start zonder PocketBase" (samen met de claim-flow/fase 3). De snapshot in geheugen dekt: PocketBase valt weg terwijl de agent draait.
- **`import _ "time/tzdata"` in `scheduler.go`** in plaats van `main.go`, zodat ook de tests de Amsterdamse zone hebben.
- **Tegeltekst:** één formulering voor tegel en sheet: "Werkdagen om 07:00", "Elke dag om 23:00", "Om 07:00 en 22:00" (in plaats van "Ma t/m vr").
- **Foutmelding in de sheet** toont geen ruwe Go-fout (die bevat record-ID's), maar: "Niet gelukt op zondag 23:00. Kijk bij Let op of al je apparaten bereikbaar zijn."
- **REST-timeout 15 s** in de PocketBase-client (nieuw, zie Review Focus 4).

---

### Task 1: Migratie `schedules`

**Files:**
- Create: `backend/pb_migrations/1790400000_add_schedules.js`

**Interfaces:**
- Produces: collectie `schedules` met velden `house, scene, time, days, enabled, last_run, last_error` (namen exact zo; de agent en PWA gebruiken ze).

- [ ] **Step 1: Schrijf de migratie**

```js
/// <reference path="../pb_data/types.d.ts" />
// Schema's: een scène vanzelf laten uitvoeren op een tijdstip en weekdagen
// ("Naar bed" om 23:00 op werkdagen). De agent op de box klokt en voert de
// scène uit; de app bewerkt alleen deze records.
//
// time is "HH:MM" in lokale tijd (Europe/Amsterdam). last_run/last_error
// schrijft alleen de agent; de regels houden de gebruiker daar weg.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const scenes = app.findCollectionByNameOrId("scenes")

  const agentOnly = "@request.body.last_run:isset = false && @request.body.last_error:isset = false"

  const schedules = new Collection({
    type: "base",
    name: "schedules",
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule:
      "@request.body.house.user = @request.auth.id && @request.body.scene.house = @request.body.house && " + agentOnly,
    updateRule:
      "house.user = @request.auth.id && @request.body.house:isset = false && " +
      "(@request.body.scene:isset = false || @request.body.scene.house = house) && " + agentOnly,
    deleteRule: "house.user = @request.auth.id",
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "scene", required: true, collectionId: scenes.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "time", required: true, pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      {
        type: "select",
        name: "days",
        required: true,
        maxSelect: 7,
        values: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      },
      { type: "bool", name: "enabled" },
      { type: "date", name: "last_run" },
      { type: "text", name: "last_error", max: 2000 },
    ],
  })
  return app.save(schedules)
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("schedules"))
})
```

- [ ] **Step 2: Herstart PocketBase en controleer**

Run: `docker compose restart pocketbase; docker compose logs --tail 30 pocketbase`
Expected: geen migratiefout; in http://localhost:8090/_/ staat collectie `schedules` met de zeven velden en de regels hierboven.

- [ ] **Step 3: Regels checken met een gewone gebruiker** (PocketBase-UI → API preview, of `curl` met een user-token)

- Create met een scène van een ander huis → 400/403.
- Create met `last_run` in de body → 400/403.
- Create met `days: []` → 400 (required).
- Create met `time: "24:00"` → 400 (pattern).
- Een geldige create → 200; daarna het record weer verwijderen.

---

### Task 2: Agent — PocketBase-client voor schema's + REST-timeout

**Files:**
- Create: `agent/internal/pocketbase/schedules.go`
- Modify: `agent/internal/pocketbase/scenes.go` (lijst-functie erbij)
- Modify: `agent/internal/pocketbase/devices.go` (lijst per huis erbij)
- Modify: `agent/internal/pocketbase/client.go` (REST-client met timeout)

**Interfaces:**
- Produces:
  - `type Schedule struct { ID, House, Scene, Time string; Days []string; Enabled bool }`
  - `func (c *Client) ListSchedules(houseID string) ([]Schedule, error)`
  - `func (c *Client) ListScenes(houseID string) ([]Scene, error)`
  - `func (c *Client) ListHouseDevices(houseID string) ([]Device, error)`
  - `func (c *Client) MarkScheduleRun(scheduleID string, at time.Time, runErr error) error`

- [ ] **Step 1: REST-timeout in `client.go`**

Voeg een tweede `http.Client` toe; de SSE-streams in `realtime.go` blijven `httpClient` (zonder timeout) gebruiken.

```go
type Client struct {
	baseURL    string
	httpClient *http.Client // realtime (SSE): lange verbinding, geen timeout
	restClient *http.Client // gewone REST-calls: nooit eindeloos wachten
	// ... rest ongewijzigd
}

// restTimeout begrenst elke REST-call. Zonder timeout blijft een call naar
// een hangende PocketBase (straks op Scaleway, internet half weg) minutenlang
// staan, en daarmee de schema-lus en de hartslag.
const restTimeout = 15 * time.Second

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{},
		restClient: &http.Client{Timeout: restTimeout},
	}
}
```

In `do`: `resp, err := c.restClient.Do(req)` in plaats van `c.httpClient.Do(req)`. Import `"time"` toevoegen.

- [ ] **Step 2: `ListScenes` in `scenes.go`**

```go
type sceneListResponse struct {
	Items []Scene `json:"items"`
}

// ListScenes geeft alle scènes van één huis.
func (c *Client) ListScenes(houseID string) ([]Scene, error) {
	var resp sceneListResponse
	path := "/api/collections/scenes/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list scenes: %w", err)
	}
	return resp.Items, nil
}
```

Import `"net/url"`.

- [ ] **Step 3: `ListHouseDevices` in `devices.go`**

```go
// ListHouseDevices geeft de devices van één huis.
func (c *Client) ListHouseDevices(houseID string) ([]Device, error) {
	var resp deviceListResponse
	path := "/api/collections/devices/records?perPage=500&filter=" + url.QueryEscape("gateway='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list house devices: %w", err)
	}
	return resp.Items, nil
}
```

Import `"net/url"`.

- [ ] **Step 4: `schedules.go`**

```go
package pocketbase

import (
	"fmt"
	"net/url"
	"time"
)

// Schedule voert een scène uit op een tijdstip ("23:00", lokale tijd) op de
// gekozen weekdagen ("mon" … "sun").
type Schedule struct {
	ID      string   `json:"id"`
	House   string   `json:"house"`
	Scene   string   `json:"scene"`
	Time    string   `json:"time"`
	Days    []string `json:"days"`
	Enabled bool     `json:"enabled"`
}

type scheduleListResponse struct {
	Items []Schedule `json:"items"`
}

// ListSchedules geeft alle schema's van één huis, ook de uitgeschakelde.
func (c *Client) ListSchedules(houseID string) ([]Schedule, error) {
	var resp scheduleListResponse
	path := "/api/collections/schedules/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list schedules: %w", err)
	}
	return resp.Items, nil
}

// pbDateLayout is het datumformaat dat PocketBase zelf gebruikt (UTC).
const pbDateLayout = "2006-01-02 15:04:05.000Z"

// MarkScheduleRun legt vast wanneer een schema liep en of dat lukte (runErr
// nil = gelukt, last_error wordt dan leeggemaakt).
func (c *Client) MarkScheduleRun(scheduleID string, at time.Time, runErr error) error {
	lastError := ""
	if runErr != nil {
		lastError = runErr.Error()
	}
	err := c.doAuthed(
		"PATCH",
		"/api/collections/schedules/records/"+scheduleID,
		map[string]any{"last_run": at.UTC().Format(pbDateLayout), "last_error": lastError},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark schedule %s run: %w", scheduleID, err)
	}
	return nil
}
```

- [ ] **Step 5: Build**

Run: `cd agent && go vet ./... && go build ./...`
Expected: geen output, exit 0.

---

### Task 3: Agent — scheduler (TDD) en gedeelde `executeScene`

**Files:**
- Create: `agent/internal/app/scheduler.go`
- Create: `agent/internal/app/scheduler_test.go`
- Modify: `agent/internal/app/agent.go` (`runScene`/`runSceneStep` → `executeScene`; `go a.runScheduler()` in `Start`)
- Modify: `docker-compose.yml` (`TZ` bij agent)

**Interfaces:**
- Consumes: alles uit Task 2.
- Produces:
  - `func dueSchedules(schedules []pocketbase.Schedule, now time.Time) []pocketbase.Schedule`
  - `type scheduleSnapshot struct { schedules []pocketbase.Schedule; scenes map[string]pocketbase.Scene; devices map[string]pocketbase.Device }`
  - `type scheduler struct { fetch func() (*scheduleSnapshot, error); run func(*scheduleSnapshot, pocketbase.Schedule, time.Time); snap *scheduleSnapshot; lastMinute string }` met `func (s *scheduler) tick(now time.Time)`
  - `func (a *Agent) executeScene(scene pocketbase.Scene, lookup func(id string) (*pocketbase.Device, error)) error`

- [ ] **Step 1: Schrijf de falende tests** — `agent/internal/app/scheduler_test.go`

```go
package app

import (
	"errors"
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

func amsterdam(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Amsterdam")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func schedule(id, at string, days ...string) pocketbase.Schedule {
	return pocketbase.Schedule{ID: id, Time: at, Days: days, Enabled: true}
}

func TestDueSchedules(t *testing.T) {
	loc := amsterdam(t)
	// Maandag 4 oktober 2027, 23:00.
	now := time.Date(2027, 10, 4, 23, 0, 30, 0, loc)

	cases := []struct {
		name string
		s    pocketbase.Schedule
		due  bool
	}{
		{"juiste dag en tijd", schedule("a", "23:00", "mon", "tue"), true},
		{"andere dag", schedule("b", "23:00", "tue"), false},
		{"andere minuut", schedule("c", "23:01", "mon"), false},
		{"uitgeschakeld", pocketbase.Schedule{ID: "d", Time: "23:00", Days: []string{"mon"}, Enabled: false}, false},
	}
	for _, c := range cases {
		got := len(dueSchedules([]pocketbase.Schedule{c.s}, now)) == 1
		if got != c.due {
			t.Errorf("%s: due = %v, want %v", c.name, got, c.due)
		}
	}
}

// In de nacht van 28 maart 2027 springt de klok van 02:00 naar 03:00: een
// schema op 02:30 bestaat die nacht niet, 03:30 loopt precies één keer.
func TestDueSchedulesSpringForward(t *testing.T) {
	loc := amsterdam(t)
	count := map[string]int{}
	s := []pocketbase.Schedule{schedule("half3", "02:30", "sun"), schedule("halfvier", "03:30", "sun")}
	start := time.Date(2027, 3, 28, 0, 0, 0, 0, loc)
	for m := 0; m < 5*60; m++ {
		for _, d := range dueSchedules(s, start.Add(time.Duration(m)*time.Minute)) {
			count[d.ID]++
		}
	}
	if count["half3"] != 0 || count["halfvier"] != 1 {
		t.Errorf("counts = %v, want half3=0 halfvier=1", count)
	}
}

func TestTickRunsEachMinuteOnce(t *testing.T) {
	loc := amsterdam(t)
	runs := 0
	snap := &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}}
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) { return snap, nil },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
	s.tick(time.Date(2027, 10, 4, 23, 0, 40, 0, loc))
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

func TestTickUsesLastSnapshotWhenFetchFails(t *testing.T) {
	loc := amsterdam(t)
	snap := &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}}
	fail := false
	runs := 0
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) {
			if fail {
				return nil, errors.New("pocketbase weg")
			}
			return snap, nil
		},
		run: func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	s.tick(time.Date(2027, 10, 4, 22, 59, 0, 0, loc)) // snapshot opgehaald
	fail = true
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc)) // fetch faalt, draait toch
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

func TestTickWithoutAnySnapshotDoesNothing(t *testing.T) {
	loc := amsterdam(t)
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) { return nil, errors.New("pocketbase weg") },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { t.Error("run zonder snapshot") },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
}
```

- [ ] **Step 2: Run de tests en zie ze falen**

Run: `cd agent && go test ./internal/app/`
Expected: FAIL, compile error `undefined: dueSchedules` / `undefined: scheduler`.

- [ ] **Step 3: `scheduler.go`**

```go
package app

import (
	"fmt"
	"log"
	"slices"
	"time"

	// Tijdzone-database in de binary: time.Local en LoadLocation werken dan
	// ook in een kaal image zonder /usr/share/zoneinfo.
	_ "time/tzdata"

	"sandhovius/local-agent/internal/pocketbase"
)

// weekdayKeys vertaalt time.Weekday (zondag = 0) naar de waarden van
// schedules.days.
var weekdayKeys = [...]string{"sun", "mon", "tue", "wed", "thu", "fri", "sat"}

// dueSchedules geeft de schema's die in de minuut van now moeten lopen.
// Vergelijkt op het lokale "15:04"-label: een tijd die door de zomertijd
// niet bestaat, loopt die nacht dus niet.
func dueSchedules(schedules []pocketbase.Schedule, now time.Time) []pocketbase.Schedule {
	minute := now.Format("15:04")
	day := weekdayKeys[now.Weekday()]
	var due []pocketbase.Schedule
	for _, s := range schedules {
		if s.Enabled && s.Time == minute && slices.Contains(s.Days, day) {
			due = append(due, s)
		}
	}
	return due
}

// scheduleSnapshot is alles wat nodig is om schema's uit te voeren zonder
// PocketBase: de schema's, scènes en devices van dit huis.
type scheduleSnapshot struct {
	schedules []pocketbase.Schedule
	scenes    map[string]pocketbase.Scene
	devices   map[string]pocketbase.Device
}

func (s *scheduleSnapshot) lookupDevice(id string) (*pocketbase.Device, error) {
	device, ok := s.devices[id]
	if !ok {
		return nil, fmt.Errorf("apparaat bestaat niet (meer)")
	}
	return &device, nil
}

// scheduler is de klok: elke minuut één tick. fetch en run zijn functies
// zodat de tests zonder PocketBase en Home Assistant kunnen.
type scheduler struct {
	fetch      func() (*scheduleSnapshot, error)
	run        func(snap *scheduleSnapshot, s pocketbase.Schedule, now time.Time)
	snap       *scheduleSnapshot
	lastMinute string
}

// tick ververst de snapshot (lukt dat niet, dan geldt de vorige) en voert
// uit wat nu aan de beurt is. Elke minuut hooguit één keer.
func (s *scheduler) tick(now time.Time) {
	minute := now.Format("2006-01-02 15:04")
	if minute == s.lastMinute {
		return
	}
	s.lastMinute = minute

	if fresh, err := s.fetch(); err != nil {
		log.Printf("[SCHEMA] Schema's verversen mislukt, laatst bekende worden gebruikt: %v\n", err)
	} else {
		s.snap = fresh
	}
	if s.snap == nil {
		return
	}
	for _, due := range dueSchedules(s.snap.schedules, now) {
		s.run(s.snap, due, now)
	}
}

// runScheduler tikt op elke minuutgrens tot de agent stopt.
//
// ponytail: een tick die langer dan een minuut duurt (trage HA), slaat de
// volgende minuut over; REST-calls hebben een timeout van 15 s, dus dat
// gebeurt alleen als Home Assistant zelf hangt.
func (a *Agent) runScheduler() {
	s := &scheduler{fetch: a.fetchScheduleSnapshot, run: a.runSchedule}
	for {
		next := time.Now().Truncate(time.Minute).Add(time.Minute)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		s.tick(time.Now())
	}
}

func (a *Agent) fetchScheduleSnapshot() (*scheduleSnapshot, error) {
	schedules, err := a.pbClient.ListSchedules(a.gatewayID)
	if err != nil {
		return nil, err
	}
	scenes, err := a.pbClient.ListScenes(a.gatewayID)
	if err != nil {
		return nil, err
	}
	devices, err := a.pbClient.ListHouseDevices(a.gatewayID)
	if err != nil {
		return nil, err
	}
	snap := &scheduleSnapshot{
		schedules: schedules,
		scenes:    make(map[string]pocketbase.Scene, len(scenes)),
		devices:   make(map[string]pocketbase.Device, len(devices)),
	}
	for _, scene := range scenes {
		snap.scenes[scene.ID] = scene
	}
	for _, device := range devices {
		snap.devices[device.ID] = device
	}
	return snap, nil
}

// runSchedule voert de scène van een schema uit en meldt het resultaat
// daarna aan PocketBase. Dat melden gebeurt op de achtergrond: zonder
// internet mag het de klok niet ophouden.
func (a *Agent) runSchedule(snap *scheduleSnapshot, s pocketbase.Schedule, now time.Time) {
	var err error
	scene, ok := snap.scenes[s.Scene]
	if !ok {
		err = fmt.Errorf("scène bestaat niet (meer)")
	} else {
		err = a.executeScene(scene, snap.lookupDevice)
	}
	if err != nil {
		log.Printf("[SCHEMA] Schema %s (%s) niet helemaal gelukt: %v\n", s.ID, s.Time, err)
	} else {
		log.Printf("[SCHEMA] Scène %q uitgevoerd door schema %s (%s)\n", scene.Name, s.ID, s.Time)
	}
	go func() {
		if markErr := a.pbClient.MarkScheduleRun(s.ID, now, err); markErr != nil {
			log.Printf("[SCHEMA] Kon resultaat van schema %s niet opslaan: %v\n", s.ID, markErr)
		}
	}()
}
```

- [ ] **Step 4: Run de tests**

Run: `cd agent && go test ./internal/app/`
Expected: FAIL op compile: `a.executeScene undefined` (de tests zelf raken dat niet, maar het pakket compileert niet). Ga door naar Step 5.

- [ ] **Step 5: `executeScene` in `agent.go`**

Vervang `runScene` en `runSceneStep` (regels ~359–419) door:

```go
// runScene voert een scène uit op verzoek van de app (command "run_scene").
// Alleen scènes van dit huis: ook als er ooit iets verkeerds in de JSON
// staat, schakelt deze box nooit andermans apparaat.
func (a *Agent) runScene(cmd pocketbase.Command) {
	scene, err := a.pbClient.GetScene(cmd.Scene)
	if err != nil {
		log.Printf("[APP] Scène-commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}
	if scene.House != a.gatewayID {
		err := fmt.Errorf("scène %s hoort niet bij dit huis", scene.ID)
		log.Printf("[APP] Scène-commando %s geweigerd: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	if err := a.executeScene(*scene, a.pbClient.GetDevice); err != nil {
		a.failCommand(cmd.ID, err)
		return
	}
	if err := a.pbClient.MarkCommandSent(cmd.ID); err != nil {
		log.Printf("[APP] Kon scène-commando %s niet als 'sent' markeren: %v\n", cmd.ID, err)
		return
	}
	log.Printf("[APP] Scène %q uitgevoerd: %d stappen (commando %s)\n", scene.Name, len(scene.Actions), cmd.ID)
}

// executeScene voert alle stappen van een scène uit, op de box. Een stap
// die mislukt houdt de rest niet tegen; de fout noemt welke stappen
// misgingen. lookup zoekt een device op: via PocketBase (knop in de app)
// of in de snapshot (schema), zodat een schema ook zonder internet werkt.
func (a *Agent) executeScene(scene pocketbase.Scene, lookup func(id string) (*pocketbase.Device, error)) error {
	var failures []error
	for _, step := range scene.Actions {
		if err := a.runSceneStep(scene.House, step, lookup); err != nil {
			log.Printf("[APP] Scène %q: stap %s op %s mislukt: %v\n", scene.Name, step.Action, step.Device, err)
			failures = append(failures, fmt.Errorf("%s %s: %w", step.Action, step.Device, err))
		}
	}
	return errors.Join(failures...)
}

func (a *Agent) runSceneStep(house string, step pocketbase.SceneAction, lookup func(id string) (*pocketbase.Device, error)) error {
	if !sceneActions[step.Action] {
		return fmt.Errorf("actie %q hoort niet in een scène", step.Action)
	}
	device, err := lookup(step.Device)
	if err != nil {
		return err
	}
	if device.Gateway != house {
		return fmt.Errorf("apparaat hoort niet bij dit huis")
	}
	if device.EntityID == "" {
		return fmt.Errorf("apparaat is (nog) niet klaargezet")
	}
	domain := "homeassistant"
	if step.Action == "set_temperature" {
		domain = "climate"
	}
	return a.haClient.CallService(domain, step.Action, device.EntityID, step.Payload)
}
```

In `Start()`, na `go a.runHeartbeat()`:

```go
	go a.runScheduler()
```

- [ ] **Step 6: Run de tests en vet**

Run: `cd agent && go vet ./... && go test ./...`
Expected: `ok  sandhovius/local-agent/internal/app`, overige pakketten `no test files`.

- [ ] **Step 7: TZ in `docker-compose.yml`**

Bij de `agent`-service onder `environment:`, na `HISTORY_RETENTION_DAYS=30`:

```yaml
      # Schema's ("23:00") zijn lokale tijd.
      - TZ=Europe/Amsterdam
```

---

### Task 4: PWA — tekst-helper voor dagen en schema's (TDD)

**Files:**
- Create: `frontend/lib/schedules.js`
- Create: `frontend/lib/schedules.test.js`

**Interfaces:**
- Produces:
  - `DAYS`: `[{ key: 'mon', short: 'ma', long: 'maandag' }, …, { key: 'sun', short: 'zo', long: 'zondag' }]`
  - `describeDays(days: string[]) → string` ("Elke dag", "Werkdagen", "Weekend", "Maandag, woensdag en vrijdag", "" bij leeg)
  - `describeSchedules(schedules: {time, days, enabled}[]) → string` ("" als er geen enabled is; één: "Werkdagen om 07:00"; meer: "Om 07:00 en 22:00")

- [ ] **Step 1: Falende test** — `frontend/lib/schedules.test.js`

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeDays, describeSchedules } from './schedules.js'

test('describeDays', () => {
  assert.equal(describeDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'Elke dag')
  assert.equal(describeDays(['fri', 'mon', 'tue', 'wed', 'thu']), 'Werkdagen')
  assert.equal(describeDays(['sun', 'sat']), 'Weekend')
  assert.equal(describeDays(['fri', 'mon', 'wed']), 'Maandag, woensdag en vrijdag')
  assert.equal(describeDays(['tue']), 'Dinsdag')
  assert.equal(describeDays([]), '')
})

test('describeSchedules', () => {
  const s = (time, days, enabled = true) => ({ time, days, enabled })
  assert.equal(describeSchedules([]), '')
  assert.equal(describeSchedules([s('23:00', ['mon'], false)]), '')
  assert.equal(describeSchedules([s('07:00', ['mon', 'tue', 'wed', 'thu', 'fri'])]), 'Werkdagen om 07:00')
  assert.equal(describeSchedules([s('22:00', ['sat']), s('07:00', ['mon']), s('07:00', ['sun'])]), 'Om 07:00 en 22:00')
})
```

- [ ] **Step 2: Run en zie falen**

Run: `cd frontend && node --test lib/schedules.test.js`
Expected: FAIL, `Cannot find module … schedules.js`.

- [ ] **Step 3: `frontend/lib/schedules.js`**

```js
// Schema's in woorden, voor de scène-tegel en de scène-sheet.

export const DAYS = [
  { key: 'mon', short: 'ma', long: 'maandag' },
  { key: 'tue', short: 'di', long: 'dinsdag' },
  { key: 'wed', short: 'wo', long: 'woensdag' },
  { key: 'thu', short: 'do', long: 'donderdag' },
  { key: 'fri', short: 'vr', long: 'vrijdag' },
  { key: 'sat', short: 'za', long: 'zaterdag' },
  { key: 'sun', short: 'zo', long: 'zondag' },
]

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// "Elke dag", "Werkdagen", "Weekend", of de dagen in weekvolgorde.
export function describeDays(days) {
  const chosen = DAYS.filter((day) => days.includes(day.key))
  const keys = chosen.map((day) => day.key).join(' ')
  if (keys === 'mon tue wed thu fri sat sun') return 'Elke dag'
  if (keys === 'mon tue wed thu fri') return 'Werkdagen'
  if (keys === 'sat sun') return 'Weekend'
  const names = chosen.map((day) => day.long)
  if (names.length === 0) return ''
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} en ${names.at(-1)}`
  return capitalize(list)
}

// Eén regel voor de tegel: alleen schema's die aan staan.
export function describeSchedules(schedules) {
  const active = schedules.filter((s) => s.enabled)
  if (active.length === 0) return ''
  if (active.length === 1) return `${describeDays(active[0].days)} om ${active[0].time}`
  const times = [...new Set(active.map((s) => s.time))].sort()
  if (times.length === 1) return `Om ${times[0]}`
  return `Om ${times.slice(0, -1).join(', ')} en ${times.at(-1)}`
}
```

- [ ] **Step 4: Run en zie slagen**

Run: `cd frontend && node --test lib/schedules.test.js`
Expected: `# pass 2`, `# fail 0` (een waarschuwing over module-type mag).

---

### Task 5: PWA — data, scène-sheet en tegel

**Files:**
- Modify: `frontend/app/page.js` (state, fetch, realtime, opslaan, props)
- Modify: `frontend/components/SceneModal.js` (sectie "Vanzelf uitvoeren", nieuwe props)
- Modify: `frontend/components/ScenesView.js` (regel op de tegel)
- Modify: `frontend/app/styles/components.css` (schema-rijen, dag-knoppen)

**Interfaces:**
- Consumes: `DAYS`, `describeDays`, `describeSchedules` uit Task 4; collectie `schedules` uit Task 1.
- Produces (page.js → SceneModal):
  - `onSaveScene(sceneId: string|null, fields: {name, actions}) → Promise<string>` (id van de scène)
  - `onSaveSchedule(sceneId: string, row: {id?, time, days, enabled}) → Promise<record>`
  - `onDeleteSchedule(scheduleId: string) → Promise<void>`
  - prop `schedules`: records van deze scène

- [ ] **Step 1: page.js — state, fetch, logout**

Bij de andere state (na regel 70 `const [scenes, setScenes] = useState([])`):

```js
  const [schedules, setSchedules] = useState([])
```

In `fetchAll` de `Promise.all` uitbreiden:

```js
      const [houseRecords, roomRecords, deviceRecords, sceneRecords, scheduleRecords] = await Promise.all([
        pb.collection('houses').getFullList(),
        pb.collection('rooms').getFullList({ sort: 'order' }),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
        pb.collection('scenes').getFullList({ sort: 'order,name' }),
        pb.collection('schedules').getFullList({ sort: 'time' }),
      ])
```

en na `setScenes(sceneRecords)`: `setSchedules(scheduleRecords)`. In `logout()` na `setScenes([])`: `setSchedules([])`.

- [ ] **Step 2: page.js — realtime**

In de `subscriptions`-array, na de `houses`-subscribe (de agent schrijft `last_run`/`last_error`; zo ziet de sheet dat live):

```js
      pb.collection('schedules').subscribe('*', (e) => {
        setSchedules((prev) =>
          e.action === 'delete'
            ? prev.filter((s) => s.id !== e.record.id)
            : [...prev.filter((s) => s.id !== e.record.id), e.record]
        )
      }),
```

- [ ] **Step 3: page.js — opslaan**

Vervang `saveScene` door een versie die het id teruggeeft, en voeg de schema-functies toe:

```js
  async function saveScene(sceneId, fields) {
    if (sceneId) {
      const updated = await pb.collection('scenes').update(sceneId, fields)
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? updated : s)))
      return sceneId
    }
    const created = await pb.collection('scenes').create({ ...fields, house: house.id, order: scenesInHouse.length })
    setScenes((prev) => [...prev, created])
    return created.id
  }

  async function saveSchedule(sceneId, row) {
    const fields = { time: row.time, days: row.days, enabled: row.enabled }
    const record = row.id
      ? await pb.collection('schedules').update(row.id, fields)
      : await pb.collection('schedules').create({ ...fields, house: house.id, scene: sceneId })
    setSchedules((prev) => [...prev.filter((s) => s.id !== record.id), record])
    return record
  }

  async function deleteSchedule(scheduleId) {
    await pb.collection('schedules').delete(scheduleId)
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId))
  }
```

- [ ] **Step 4: page.js — props**

`ScenesView` (rond regel 1171) krijgt:

```js
            schedules={schedules}
```

`SceneModal` (rond regel 1310) wordt:

```js
        <SceneModal
          key={editingScene}
          scene={editingScene === 'new' ? null : scenesInHouse.find((s) => s.id === editingScene)}
          schedules={schedules.filter((s) => s.scene === editingScene)}
          devices={devicesInHouse.filter((d) => d.type !== 'sensor')}
          roomNameById={roomNameById}
          onSaveScene={saveScene}
          onSaveSchedule={saveSchedule}
          onDeleteSchedule={deleteSchedule}
          onDelete={deleteScene}
          onClose={() => setEditingScene(null)}
        />
```

- [ ] **Step 5: ScenesView — regel op de tegel**

Import: `import { describeSchedules } from '../lib/schedules'`. Prop `schedules` toevoegen aan de functie-signatuur. In de `map`, na `const state = runState[scene.id]`:

```js
        const when = describeSchedules(schedules.filter((s) => s.scene === scene.id))
```

Na de `<span className="scene-name">…</span>`:

```jsx
              {when && <span className="scene-when">{when}</span>}
```

- [ ] **Step 6: SceneModal — state en opslaan**

Imports:

```js
import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { formatTemperature } from '../lib/temperature'
import { DAYS, describeDays } from '../lib/schedules'
import { MinusIcon, PlusIcon, TrashIcon } from '../lib/icons'
```

Helpers boven de component:

```js
function rowsFromSchedules(schedules) {
  return [...schedules]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => ({
      key: s.id,
      id: s.id,
      time: s.time,
      days: s.days,
      enabled: s.enabled,
      lastRun: s.last_run,
      lastError: s.last_error,
      dirty: false,
    }))
}

function nextWholeHour() {
  return `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`
}

// "zondag 23:00": wanneer een schema voor het laatst liep.
function formatRun(lastRun) {
  return new Date(lastRun).toLocaleString('nl-NL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}
```

Signatuur en state:

```js
export default function SceneModal({
  scene,
  schedules,
  devices,
  roomNameById,
  onSaveScene,
  onSaveSchedule,
  onDeleteSchedule,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState(scene?.name ?? '')
  const [choices, setChoices] = useState(() => choicesFromActions(scene?.actions, devices))
  const [rows, setRows] = useState(() => rowsFromSchedules(schedules))
  const [removedIds, setRemovedIds] = useState([])
  // Na een half gelukte eerste keer "Opslaan" bestaat de scène al: een
  // tweede poging werkt hem dan bij in plaats van er nog een te maken.
  const [savedSceneId, setSavedSceneId] = useState(scene?.id ?? null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
```

Row-functies (na `setChoice`):

```js
  function updateRow(key, patch) {
    setError('')
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, dirty: true, ...patch } : row)))
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), time: nextWholeHour(), days: DAYS.map((d) => d.key), enabled: true, dirty: true },
    ])
  }

  function removeRow(row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key))
    if (row.id) setRemovedIds((prev) => [...prev, row.id])
  }
```

`handleSubmit` vervangen:

```js
  async function handleSubmit(e) {
    e.preventDefault()
    if (actions.length === 0) {
      setError('Kies bij minstens één apparaat wat de scène doet.')
      return
    }
    if (rows.some((row) => row.days.length === 0)) {
      setError('Kies bij elke tijd minstens één dag.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const sceneId = await onSaveScene(savedSceneId, { name: name.trim(), actions })
      setSavedSceneId(sceneId)
      for (const scheduleId of removedIds) {
        await onDeleteSchedule(scheduleId)
        setRemovedIds((prev) => prev.filter((id) => id !== scheduleId))
      }
      for (const row of rows) {
        if (!row.dirty) continue
        const saved = await onSaveSchedule(sceneId, row)
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, id: saved.id, dirty: false } : r)))
      }
      onClose()
    } catch (err) {
      setError(describeError('Scène opslaan', err))
      setSaving(false)
    }
  }
```

- [ ] **Step 7: SceneModal — sectie "Vanzelf uitvoeren"**

Direct na de `</div>` die "Wat doet de scène?" afsluit (vóór `{error && …}`):

```jsx
        <div className="form-field">
          <span className="form-label">Vanzelf uitvoeren</span>
          {rows.length > 0 && (
            <ul className="schedule-rows">
              {rows.map((row) => (
                <li key={row.key} className="schedule-row">
                  <div className="schedule-row-top">
                    <input
                      className="input schedule-time"
                      type="time"
                      required
                      aria-label="Tijd"
                      value={row.time}
                      onChange={(e) => updateRow(row.key, { time: e.target.value })}
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.enabled}
                      aria-label={`Om ${row.time} vanzelf uitvoeren`}
                      className={`switch switch-accent ${row.enabled ? 'switch-on' : ''}`}
                      onClick={() => updateRow(row.key, { enabled: !row.enabled })}
                    >
                      <span className="switch-thumb" />
                    </button>
                  </div>
                  <div className="schedule-days" role="group" aria-label={`Dagen voor ${row.time}`}>
                    {DAYS.map((day) => {
                      const on = row.days.includes(day.key)
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className={`day-toggle ${on ? 'day-toggle-on' : ''}`}
                          aria-pressed={on}
                          aria-label={day.long}
                          onClick={() =>
                            updateRow(row.key, {
                              days: on ? row.days.filter((d) => d !== day.key) : [...row.days, day.key],
                            })
                          }
                        >
                          {day.short}
                        </button>
                      )
                    })}
                  </div>
                  <div className="schedule-row-bottom">
                    <span className="schedule-days-text">
                      {row.days.length === 0 ? 'Kies minstens één dag' : describeDays(row.days)}
                    </span>
                    <button
                      type="button"
                      className="btn-icon"
                      aria-label={`Tijd ${row.time} verwijderen`}
                      onClick={() => removeRow(row)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {row.lastError && row.lastRun && !row.dirty && (
                    <p className="error-banner" style={{ margin: 0 }}>
                      Niet gelukt op {formatRun(row.lastRun)}. Kijk bij Let op of al je apparaten bereikbaar zijn.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-plain schedule-add" onClick={addRow}>
            <PlusIcon width="18" height="18" aria-hidden="true" />
            Tijd toevoegen
          </button>
        </div>
```

- [ ] **Step 8: CSS** — `frontend/app/styles/components.css`, na `.scene-temperature-value { … }`

```css
/* Scène-tegel: wanneer de scène vanzelf loopt. */
.scene-when {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Scène-sheet: "Vanzelf uitvoeren". Een rij per tijd, op Inset. */
.schedule-rows {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0.2rem 0 0;
  padding: 0;
  list-style: none;
}

.schedule-row {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border-radius: 18px;
  background: var(--surface-2);
}

.schedule-row-top,
.schedule-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.schedule-time {
  width: auto;
  min-width: 7.5rem;
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.schedule-days {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

/* Een dag is een instelling, geen apparaatstand: accentblauw als hij aan staat. */
.day-toggle {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card-background);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.day-toggle-on {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.day-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.schedule-days-text {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.schedule-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
```

Tokens komen uit `frontend/app/styles/theme.css` (`--surface-2` = Inset, `--card-background` = paneel, `--border` = hairline) en hebben elk een licht- en donkerwaarde.

- [ ] **Step 9: Build**

Run: `cd frontend && npx next build`
Expected: build slaagt zonder fouten.

---

### Task 6: Documentatie en end-to-end check

**Files:**
- Modify: `DESIGN.md` (sectie *Scenes*)
- Modify: `CLAUDE.md` (status en volgende stappen)

- [ ] **Step 1: DESIGN.md** — na de alinea over de scene sheet (regel ~398) toevoegen:

```markdown
**Vanzelf uitvoeren.** Onder de apparaten in de scene sheet staat per tijd een rij op Inset Mist: een tijdveld, een `switch-accent` (aan/uit), zeven ronde dag-knoppen (ma … zo, 44px, `aria-pressed`, Electric Blue als ze aan staan) en de dagen in woorden ("Werkdagen", "Weekend", "Elke dag", "Maandag, woensdag en vrijdag") met een verwijderknop. "Tijd toevoegen" maakt een rij op het volgende hele uur, elke dag. Liep een tijd de vorige keer niet goed, dan zegt een Amber Notice-regel wanneer, en verwijst naar Let op. Op de scene tile staat onder de naam wanneer de scène vanzelf loopt ("Werkdagen om 07:00", of bij meer tijden "Om 07:00 en 22:00"). Een schema is een instructie, dus niets gloeit en er is geen groen.
```

- [ ] **Step 2: CLAUDE.md** — in *Huidige Status* een bullet toevoegen en *Volgende Stappen* bijwerken:

```markdown
- **Schema's**: collectie `schedules` (scène, `time` "HH:MM", `days`, `enabled`, `last_run`/`last_error` van de agent). De agent klokt (`agent/internal/app/scheduler.go`): elke minuut een snapshot van schedules/scenes/devices van het eigen huis, uitvoeren via `executeScene`, ook als PocketBase even weg is (laatste snapshot in geheugen). Bewerken in de scène-sheet ("Vanzelf uitvoeren"), tijden op de scène-tegel.
```

Vervang volgende stap 2 (schema's) door:

```markdown
2. **Agent start zonder PocketBase**: nu zijn inloggen en `registerGateway()` fataal. Nodig voor fase 3; neem dan ook de schema-snapshot naar `/data/schedules.json` mee (zie spec `docs/superpowers/specs/2026-09-28-schedules-design.md`).
```

- [ ] **Step 3: Stack herbouwen**

Run: `docker compose up -d --build agent frontend; docker compose logs --tail 20 agent`
Expected: agent start, geen `[SCHEMA]`-fouten.

- [ ] **Step 4: End-to-end (meld het vooraf als hierbij echte apparaten schakelen)**

1. Maak in de PWA een testscène "Test schema" met één apparaat, en een tijd op de huidige minuut + 2.
2. Wacht; verwacht in `docker compose logs agent`: `[SCHEMA] Scène "Test schema" uitgevoerd door schema …`; in PocketBase heeft het record `last_run` gevuld en `last_error` leeg.
3. Zet een nieuwe tijd op minuut + 2, stop PocketBase (`docker compose stop pocketbase`) nadat de agent minstens één tick gedaan heeft. Verwacht bij het afgaan: `Schema's verversen mislukt, laatst bekende worden gebruikt`, gevolgd door de uitvoering, en `Kon resultaat van schema … niet opslaan`. Start PocketBase weer (`docker compose start pocketbase`).
4. Timeout-check (Review Focus 4): `docker compose pause pocketbase`, wacht 2 minuten; de agent-log toont per minuut één verversfout binnen ~15 s (geen stilte). `docker compose unpause pocketbase`.
5. Dubbele-scène-check (Review Focus 5): in de sheet voor een nieuwe scène een tijd toevoegen, PocketBase kort pauzeren nadat de scène is gemaakt is lastig te timen; controleer daarom in de code dat een tweede "Opslaan" `savedSceneId` gebruikt.
6. Verwijder de testscène (schema's gaan mee via cascade) en zet eventueel geschakelde apparaten terug.

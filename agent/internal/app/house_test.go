package app

import (
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"sandhovius/local-agent/internal/box"
	"sandhovius/local-agent/internal/history"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/pocketbase"
)

// newHouseTestAgent maakt een Agent met een geldige box.json en een teller
// in plaats van de echte herstelstap.
func newHouseTestAgent(t *testing.T, house string) (*Agent, *int) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "box.json")
	data := `{"serial":"SN-1","secret":"geheim","house":"` + house + `"}`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	calls := 0
	a := &Agent{boxFile: path, onConnected: func() { calls++ }}
	a.setHouse(house)
	return a, &calls
}

func storedHouse(t *testing.T, a *Agent) string {
	t.Helper()
	id, err := box.Load(a.boxFile)
	if err != nil {
		t.Fatalf("box.json laden: %v", err)
	}
	return id.House
}

func TestApplyHouseClaim(t *testing.T) {
	a, calls := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	if a.house() != "h1" {
		t.Errorf("house() = %q, verwacht h1", a.house())
	}
	if !a.registered.Load() {
		t.Error("registered moet true zijn na een claim")
	}
	if *calls != 1 {
		t.Errorf("onConnected %d keer aangeroepen, verwacht 1", *calls)
	}
	if got := storedHouse(t, a); got != "h1" {
		t.Errorf("box.json house = %q, verwacht h1", got)
	}
}

func TestApplyHouseSameIsNoop(t *testing.T) {
	a, calls := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	a.applyHouse("h1")
	if *calls != 1 {
		t.Errorf("onConnected %d keer aangeroepen, verwacht 1", *calls)
	}
}

func TestApplyHouseDetach(t *testing.T) {
	a, calls := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	a.applyHouse("")
	if a.registered.Load() {
		t.Error("registered moet false zijn na loskoppelen")
	}
	if a.house() != "" {
		t.Errorf("house() = %q, verwacht leeg", a.house())
	}
	if got := storedHouse(t, a); got != "" {
		t.Errorf("box.json house = %q, verwacht leeg", got)
	}
	if *calls != 1 {
		t.Errorf("onConnected %d keer aangeroepen, verwacht 1 (niet bij loskoppelen)", *calls)
	}
}

func TestApplyHouseSwitch(t *testing.T) {
	a, calls := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	a.applyHouse("h2")
	if a.house() != "h2" {
		t.Errorf("house() = %q, verwacht h2", a.house())
	}
	if *calls != 2 {
		t.Errorf("onConnected %d keer aangeroepen, verwacht 2", *calls)
	}
}

func TestApplyHouseFirstConnectWithStoredHouse(t *testing.T) {
	a, calls := newHouseTestAgent(t, "h1")
	if a.registered.Load() {
		t.Fatal("registered hoort false te zijn voor de eerste verbinding")
	}
	a.applyHouse("h1")
	if !a.registered.Load() {
		t.Error("registered moet true zijn na de eerste verbinding")
	}
	if *calls != 1 {
		t.Errorf("onConnected %d keer aangeroepen, verwacht 1", *calls)
	}
}

// Review Focus 2: een box zonder huis start lokaal, zonder snapshot en
// zonder crash.
func TestStartWithoutHouseOffline(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	a.schedulesFile = filepath.Join(t.TempDir(), "schedules.json")
	if snap := a.loadScheduleSnapshot(); snap != nil {
		t.Errorf("snapshot = %v, verwacht nil zonder huis", snap)
	}
	if a.registered.Load() {
		t.Error("registered hoort false te zijn zonder huis")
	}
}

// Review Focus 3: na loskoppelen draait de scheduler niets meer van het
// oude huis, ook niet uit de snapshot in het geheugen.
func TestDetachStopsScheduler(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	now := time.Date(2026, 10, 5, 7, 30, 0, 0, time.Local) // maandag
	old := &scheduleSnapshot{schedules: []pocketbase.Schedule{
		{ID: "s1", Scene: "sc1", Time: "07:30", Days: []string{"mon"}, Enabled: true},
	}}
	runs := 0
	s := &scheduler{
		snap:  old,
		fetch: a.fetchScheduleSnapshot,
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	a.applyHouse("")
	s.tick(now)
	if runs != 0 {
		t.Errorf("schema van het oude huis liep %d keer na loskoppelen, verwacht 0", runs)
	}
}

func TestDetachDoesNotSaveEmptySnapshot(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	a.schedulesFile = filepath.Join(t.TempDir(), "schedules.json")
	a.applyHouse("")
	snap, err := a.fetchScheduleSnapshot()
	if err != nil || snap == nil || len(snap.schedules) != 0 {
		t.Fatalf("fetch zonder huis = %v, %v; verwacht lege snapshot zonder fout", snap, err)
	}
}

// Na loskoppelen of wisselen hoort de device-cache niets van het oude huis
// meer te hebben.
func TestApplyHouseClearsDeviceCache(t *testing.T) {
	for _, next := range []string{"", "h2"} {
		a, _ := newHouseTestAgent(t, "")
		a.devices = newDeviceCache(nil, a.house)
		a.applyHouse("h1")
		a.devices.byEntity["light.a"] = "d1"
		a.applyHouse(next)
		if ids := a.devices.entityIDs(); len(ids) != 0 {
			t.Errorf("na %q: cache bevat nog %v", next, ids)
		}
	}
}

// Zonder huis gaat een HA-event alleen naar de lokale geschiedenis; de
// nil pbClient laat het test paniekeren als het toch PocketBase raakt.
func TestForwardHAEventWithoutHouseStaysLocal(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	store, err := history.NewStore(filepath.Join(t.TempDir(), "h.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	a.history = store
	a.devices = newDeviceCache(nil, a.house)
	a.devices.byEntity["light.a"] = "d1" // oude rest: mag niet meer doorgestuurd worden
	a.forwardHAEvent(homeassistant.HAEvent{EntityID: "light.a", State: "on"})
}

func TestDetachClearsRegisteredBeforeHouse(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	a.applyHouse("h1")
	a.applyHouse("")
	if a.registered.Load() || a.house() != "" {
		t.Error("na loskoppelen: registered en house moeten allebei leeg zijn")
	}
}

// Stroom, poll en opstarten kunnen tegelijk hetzelfde nieuwe huis melden:
// de herstelstap mag maar één keer starten.
func TestApplyHouseConcurrentStartsRecoveryOnce(t *testing.T) {
	a, _ := newHouseTestAgent(t, "")
	a.devices = newDeviceCache(nil, a.house)
	var calls atomic.Int32
	a.onConnected = func() {
		time.Sleep(10 * time.Millisecond) // de herstelstap duurt even
		calls.Add(1)
	}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			a.applyHouse("h1")
		}()
	}
	wg.Wait()
	if n := calls.Load(); n != 1 {
		t.Errorf("herstelstap %d keer gestart, verwacht 1", n)
	}
}

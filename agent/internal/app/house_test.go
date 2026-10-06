package app

import (
	"os"
	"path/filepath"
	"testing"

	"sandhovius/local-agent/internal/box"
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

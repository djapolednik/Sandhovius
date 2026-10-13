package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

func testSnapshot() *scheduleSnapshot {
	return &scheduleSnapshot{
		schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")},
		scenes:    map[string]pocketbase.Scene{"s1": {ID: "s1", House: "huis1", Name: "Naar bed"}},
		devices:   map[string]pocketbase.Device{"d1": {ID: "d1", Gateway: "huis1", EntityID: "input_boolean.lamp"}},
	}
}

var savedAt = time.Date(2026, 10, 6, 21, 0, 0, 0, time.UTC)

func TestSnapshotRoundTrip(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	if err := saveSnapshot(p, "huis1", testSnapshot(), savedAt); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis1")
	if err != nil || got == nil {
		t.Fatalf("loadSnapshot = %v, %v", got, err)
	}
	if len(got.schedules) != 1 || got.schedules[0].ID != "a" || got.schedules[0].Time != "23:00" {
		t.Errorf("schedules = %+v", got.schedules)
	}
	if got.scenes["s1"].Name != "Naar bed" {
		t.Errorf("scenes = %+v", got.scenes)
	}
	if got.devices["d1"].EntityID != "input_boolean.lamp" {
		t.Errorf("devices = %+v", got.devices)
	}
}

// Een huis zonder schema's is ook een stand: na een herstart mag een
// inmiddels verwijderd schema niet terugkomen uit een oud bestand.
func TestSnapshotEmptyHouse(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	if err := saveSnapshot(p, "huis1", testSnapshot(), savedAt); err != nil {
		t.Fatal(err)
	}
	empty := &scheduleSnapshot{}
	if err := saveSnapshot(p, "huis1", empty, savedAt); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis1")
	if err != nil || got == nil {
		t.Fatalf("loadSnapshot = %v, %v", got, err)
	}
	if len(got.schedules) != 0 {
		t.Errorf("schedules = %+v, want leeg", got.schedules)
	}
}

func TestSnapshotMissingFile(t *testing.T) {
	got, err := loadSnapshot(filepath.Join(t.TempDir(), "bestaat-niet.json"), "huis1")
	if got != nil || err != nil {
		t.Errorf("loadSnapshot = %v, %v, want nil, nil", got, err)
	}
}

func TestSnapshotOtherHouse(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	if err := saveSnapshot(p, "huis1", testSnapshot(), savedAt); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis2")
	if got != nil || err != nil {
		t.Errorf("loadSnapshot = %v, %v, want nil, nil", got, err)
	}
}

func TestSnapshotCorrupt(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	if err := os.WriteFile(p, []byte("{kapot"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis1")
	if got != nil || err == nil {
		t.Errorf("loadSnapshot = %v, %v, want nil + fout", got, err)
	}
}

func TestSnapshotNoTempFileLeft(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	if err := saveSnapshot(p, "huis1", testSnapshot(), savedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("tijdelijk bestand blijft staan: %v", err)
	}
}

// Bewegingslichten reizen mee in hetzelfde bestand.
func TestSnapshotKeepsMotionLights(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	snap := testSnapshot()
	snap.motionLights = []pocketbase.MotionLight{motionRule("gang", "d1", 3, "d1")}
	if err := saveSnapshot(p, "huis1", snap, savedAt); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis1")
	if err != nil || got == nil || len(got.motionLights) != 1 || got.motionLights[0].OffAfter != 3 {
		t.Fatalf("motionLights = %+v, %v", got, err)
	}
}

// Een bestand van vóór de bewegingslichten blijft leesbaar.
func TestSnapshotWithoutMotionLights(t *testing.T) {
	p := filepath.Join(t.TempDir(), "schedules.json")
	old := `{"house":"huis1","saved_at":"2026-10-06T21:00:00Z","schedules":[],"scenes":[],"devices":[]}`
	if err := os.WriteFile(p, []byte(old), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := loadSnapshot(p, "huis1")
	if err != nil || got == nil || len(got.motionLights) != 0 {
		t.Fatalf("oud bestand: %+v, %v", got, err)
	}
}

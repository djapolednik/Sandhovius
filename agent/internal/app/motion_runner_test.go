package app

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"sandhovius/local-agent/internal/pocketbase"
)

type switchCall struct {
	Entity string
	On     bool
}

type fakeMotionEffects struct {
	switches []switchCall
	reports  []string // regel-id's
	failFor  string   // entity die mislukt
}

func (f *fakeMotionEffects) runner(file string) *motionRunner {
	return newMotionRunner(file,
		func(d pocketbase.Device, on bool) error {
			f.switches = append(f.switches, switchCall{d.EntityID, on})
			if d.EntityID == f.failFor {
				return errors.New("lamp onbereikbaar")
			}
			return nil
		},
		func(rule string, err error) { f.reports = append(f.reports, rule) },
	)
}

func (f *fakeMotionEffects) take() []switchCall {
	calls := f.switches
	f.switches = nil
	return calls
}

func motionSnapshot(rules ...pocketbase.MotionLight) *scheduleSnapshot {
	snap := &scheduleSnapshot{
		motionLights: rules,
		devices: map[string]pocketbase.Device{
			"sensor": {ID: "sensor", Gateway: "h1", EntityID: "gang_sensor", Type: "sensor"},
			"lamp":   {ID: "lamp", Gateway: "h1", EntityID: "light.gang", Type: "light"},
			"plug":   {ID: "plug", Gateway: "h1", EntityID: "switch.gang", Type: "switch"},
		},
	}
	return snap
}

func TestMotionRunnerSwitchesThroughTheEntities(t *testing.T) {
	f := &fakeMotionEffects{}
	r := f.runner(filepath.Join(t.TempDir(), "motion.json"))
	r.start("h1", motionSnapshot(motionRule("gang", "sensor", 3, "lamp", "plug")))
	r.onState("sun.sun", map[string]any{"state": "below_horizon"}, at(0))
	r.onState("light.gang", map[string]any{"state": "off"}, at(0))
	r.onState("switch.gang", map[string]any{"state": "OFF"}, at(0))

	r.onState("gang_sensor", map[string]any{"occupancy": true, "battery": 90}, at(0))
	got := f.take()
	want := []switchCall{{"light.gang", true}, {"switch.gang", true}}
	if !reflect.DeepEqual(sortCalls(got), want) {
		t.Fatalf("bij beweging: %v, want %v", got, want)
	}
	r.onState("gang_sensor", map[string]any{"occupancy": false, "battery": 90}, at(1))
	r.tick(at(3))
	if got := f.take(); len(got) != 0 {
		t.Fatalf("te vroeg uit: %v", got)
	}
	r.tick(at(4))
	if got := sortCalls(f.take()); !reflect.DeepEqual(got, []switchCall{{"light.gang", false}, {"switch.gang", false}}) {
		t.Fatalf("na de minuten: %v", got)
	}
	if len(f.reports) != 4 {
		t.Errorf("resultaten gemeld: %v, want 4", f.reports)
	}
}

func TestMotionRunnerDaylightFromSun(t *testing.T) {
	f := &fakeMotionEffects{}
	r := f.runner(filepath.Join(t.TempDir(), "motion.json"))
	r.start("h1", motionSnapshot(motionRule("gang", "sensor", 3, "lamp")))
	r.onState("sun.sun", map[string]any{"state": "above_horizon"}, at(0))
	r.onState("light.gang", map[string]any{"state": "off"}, at(0))
	r.onState("gang_sensor", map[string]any{"state": "on"}, at(0))
	if got := f.take(); len(got) != 0 {
		t.Errorf("overdag aan: %v", got)
	}
}

// Na een herstart gaat een lamp alsnog op tijd uit.
func TestMotionRunnerRestartKeepsTheClock(t *testing.T) {
	file := filepath.Join(t.TempDir(), "motion.json")
	snap := motionSnapshot(motionRule("gang", "sensor", 3, "lamp"))
	f := &fakeMotionEffects{}
	r := f.runner(file)
	r.start("h1", snap)
	r.onState("light.gang", map[string]any{"state": "off"}, at(0))
	r.onState("gang_sensor", map[string]any{"occupancy": true}, at(0))
	r.onState("gang_sensor", map[string]any{"occupancy": false}, at(1))

	f2 := &fakeMotionEffects{}
	restarted := f2.runner(file)
	restarted.start("h1", snap)
	restarted.tick(at(3))
	if got := f2.take(); len(got) != 0 {
		t.Fatalf("na herstart te vroeg: %v", got)
	}
	restarted.tick(at(4))
	if got := f2.take(); !reflect.DeepEqual(got, []switchCall{{"light.gang", false}}) {
		t.Fatalf("na herstart: %v", got)
	}

	// Een bestand van een ander huis telt niet.
	f3 := &fakeMotionEffects{}
	other := f3.runner(file)
	if err := os.WriteFile(file, []byte(`{"house":"h2","owners":{"lamp":{"gang":"2027-10-04T21:04:00Z"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	other.start("h1", snap)
	other.tick(at(10))
	if got := f3.take(); len(got) != 0 {
		t.Errorf("bestand van ander huis gebruikt: %v", got)
	}
}

// Een mislukte lamp houdt de andere niet tegen en wordt gemeld.
func TestMotionRunnerFailureIsReported(t *testing.T) {
	f := &fakeMotionEffects{failFor: "light.gang"}
	r := f.runner(filepath.Join(t.TempDir(), "motion.json"))
	r.start("h1", motionSnapshot(motionRule("gang", "sensor", 3, "lamp", "plug")))
	r.onState("gang_sensor", map[string]any{"occupancy": true}, at(0))
	if got := f.take(); len(got) != 2 {
		t.Errorf("beide geprobeerd: %v", got)
	}
}

// Een nieuw snapshot (regel gewijzigd in de app) geldt meteen.
func TestMotionRunnerNewSnapshot(t *testing.T) {
	f := &fakeMotionEffects{}
	r := f.runner(filepath.Join(t.TempDir(), "motion.json"))
	r.start("h1", motionSnapshot())
	r.onState("gang_sensor", map[string]any{"occupancy": true}, at(0))
	if got := f.take(); len(got) != 0 {
		t.Fatalf("zonder regel: %v", got)
	}
	r.apply(motionSnapshot(motionRule("gang", "sensor", 3, "lamp")))
	r.onState("gang_sensor", map[string]any{"occupancy": false}, at(1))
	r.onState("gang_sensor", map[string]any{"occupancy": true}, at(2))
	if got := f.take(); !reflect.DeepEqual(got, []switchCall{{"light.gang", true}}) {
		t.Errorf("na nieuw snapshot: %v", got)
	}
}

func sortCalls(calls []switchCall) []switchCall {
	out := append([]switchCall(nil), calls...)
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j].Entity < out[i].Entity {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

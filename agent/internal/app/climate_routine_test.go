package app

import (
	"fmt"
	"path/filepath"
	"slices"
	"testing"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// Klimaatstanden in routines (F2).

func TestPresetTemperatureDefaults(t *testing.T) {
	p := pb.ClimatePresets{Eco: 16.5}
	for preset, want := range map[string]float64{"comfort": 20, "eco": 16.5, "sleep": 16} {
		if got, ok := presetTemperature(p, preset); !ok || got != want {
			t.Errorf("%s: %v %v", preset, got, ok)
		}
	}
	if _, ok := presetTemperature(p, "vakantie"); ok {
		t.Errorf("onbekende stand")
	}
}

func TestRoutineClimateAction(t *testing.T) {
	r := newRoutineRunner(filepath.Join(t.TempDir(), "automations.json"))
	var steps []string
	r.step = func(_ string, a pb.SceneAction, _ func(string) (*pb.Device, error)) error {
		steps = append(steps, fmt.Sprintf("%s %s %v", a.Action, a.Device, a.Payload["temperature"]))
		return nil
	}
	var reports []string
	r.report = func(id string, err error) {
		if err != nil {
			id += " met fout"
		}
		reports = append(reports, id)
	}
	away := pb.Automation{ID: "weg", Enabled: true,
		Starter: pb.AutomationStarter{Kind: "presence", Event: "all_away"},
		Actions: []pb.AutomationAction{{Kind: "climate", Preset: "eco"}}}
	r.start("huis", &scheduleSnapshot{
		automations: []pb.Automation{away},
		devices: map[string]pb.Device{
			"woon":  {ID: "woon", Type: "climate", EntityID: "climate.woon"},
			"slaap": {ID: "slaap", Type: "climate", EntityID: "climate.slaap"},
			"lamp":  {ID: "lamp", Type: "light", EntityID: "light.lamp"},
		},
		members:  []string{"sanne"},
		presence: []pb.Presence{{House: "huis", User: "sanne", Home: true, Updated: "1"}},
		climate:  pb.ClimatePresets{Eco: 16.5},
	})
	r.onPresence(pb.PresenceEvent{EventType: "update", Record: pb.Presence{House: "huis", User: "sanne", Home: false, Updated: "2"}}, routineT0.Add(time.Minute))
	want := []string{"turn_on slaap <nil>", "set_temperature slaap 16.5", "turn_on woon <nil>", "set_temperature woon 16.5"}
	if !slices.Equal(steps, want) || !slices.Equal(reports, []string{"weg"}) {
		t.Errorf("iedereen weg → Eco: %v %v", steps, reports)
	}
}

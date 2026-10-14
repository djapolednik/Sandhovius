package app

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

func TestRoutineRunnerExecutes(t *testing.T) {
	r := newRoutineRunner(filepath.Join(t.TempDir(), "automations.json"))
	var steps []string
	var reports []string
	r.step = func(_ string, a pb.SceneAction, lookup func(string) (*pb.Device, error)) error {
		if _, err := lookup(a.Device); err != nil {
			return err
		}
		steps = append(steps, a.Action+" "+a.Device)
		if a.Device == "kapot" {
			return errors.New("reageert niet")
		}
		return nil
	}
	r.scene = func(s pb.Scene, _ func(string) (*pb.Device, error)) error {
		steps = append(steps, "scene "+s.ID)
		return nil
	}
	r.report = func(id string, err error) {
		if err != nil {
			id += " met fout"
		}
		reports = append(reports, id)
	}
	routine := pb.Automation{ID: "r1", Enabled: true,
		Starter: pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"},
		Actions: []pb.AutomationAction{
			{Kind: "device", Device: "hal", Action: "turn_on"},
			{Kind: "scene", Scene: "avond"},
			{Kind: "device", Device: "kapot", Action: "turn_on"},
		}}
	snap := &scheduleSnapshot{
		automations: []pb.Automation{routine},
		devices: map[string]pb.Device{
			"door":  {ID: "door", Source: "zigbee", Address: "0x1", Type: "sensor"},
			"hal":   {ID: "hal", EntityID: "light.hal", Type: "light"},
			"kapot": {ID: "kapot", EntityID: "light.kapot", Type: "light"},
		},
		scenes: map[string]pb.Scene{"avond": {ID: "avond"}},
	}
	r.start("huis", snap)
	now := routineT0
	r.onState(zigbeeKey("0x1"), map[string]any{"contact": true}, now)
	r.onState(zigbeeKey("0x1"), map[string]any{"contact": false}, now.Add(time.Second))
	want := []string{"turn_on hal", "scene avond", "turn_on kapot"}
	if len(steps) != 3 || steps[0] != want[0] || steps[1] != want[1] || steps[2] != want[2] {
		t.Errorf("stappen: %v", steps)
	}
	if len(reports) != 1 || reports[0] != "r1 met fout" {
		t.Errorf("gemeld: %v", reports)
	}
	// een onbekend apparaat start niets
	r.onState("light.onbekend", map[string]any{"state": "on"}, now)
}

func TestRoutineNextRunsForTime(t *testing.T) {
	loc := amsterdam(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, loc) // woensdag
	rt := pb.Automation{ID: "r1", Enabled: true, Starter: pb.AutomationStarter{Kind: "time", Time: "07:00", Days: []string{"thu"}}}
	got := routineNextRuns([]pb.Automation{rt}, now, nil)
	want := time.Date(2026, 10, 15, 7, 0, 0, 0, loc).UTC().Format(pb.DateLayout)
	if len(got) != 1 || got[0].NextRun != want {
		t.Fatalf("next_run: %+v, verwacht %s", got, want)
	}
	rt.NextRun = want
	if got := routineNextRuns([]pb.Automation{rt}, now, nil); len(got) != 0 {
		t.Errorf("al goed: %+v", got)
	}
	sun := pb.Automation{ID: "z", Enabled: true, Starter: pb.AutomationStarter{Kind: "sun", Event: "sunset", Days: []string{"wed"}}}
	if got := routineNextRuns([]pb.Automation{sun}, now, nil); len(got) != 1 || got[0].LastError == nil || *got[0].LastError != "no_location" {
		t.Errorf("zon zonder locatie: %+v", got)
	}
}

package app

import (
	"testing"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

var routineT0 = time.Date(2026, 10, 14, 21, 0, 0, 0, time.UTC) // woensdag, 23:00 in Amsterdam, donker

func routine(id string, starter pb.AutomationStarter, actions ...pb.AutomationAction) pb.Automation {
	return pb.Automation{ID: id, Enabled: true, Starter: starter, Actions: actions}
}

func lampOn(id string) pb.AutomationAction {
	return pb.AutomationAction{Kind: "device", Device: id, Action: "turn_on"}
}

func newRoutines(t *testing.T, rs ...pb.Automation) *routineEngine {
	t.Helper()
	e := newRoutineEngine()
	e.setRoutines(rs)
	e.setLocation(amsterdamHome)
	return e
}

func runIDs(res routineResult) []string {
	out := []string{}
	for _, r := range res.Runs {
		out = append(out, r.Routine)
	}
	return out
}

func TestRoutineSensorOpenIsATransition(t *testing.T) {
	door := pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}
	e := newRoutines(t, routine("r1", door, lampOn("lamp")))
	now := routineT0
	// de eerste melding is geen overgang
	if res := e.onDevice("door", map[string]any{"contact": true}, now); len(res.Runs) != 0 {
		t.Fatalf("eerste melding: %v", runIDs(res))
	}
	res := e.onDevice("door", map[string]any{"contact": false}, now.Add(time.Minute))
	if len(res.Runs) != 1 || res.Runs[0].Routine != "r1" || res.Runs[0].Actions[0].Device != "lamp" {
		t.Fatalf("open: %+v", res)
	}
	// nog steeds open (batterij-update): niet nog eens
	if res := e.onDevice("door", map[string]any{"contact": false, "battery": 80}, now.Add(3*time.Minute)); len(res.Runs) != 0 {
		t.Errorf("nog open: %v", runIDs(res))
	}
}

func TestRoutineConditions(t *testing.T) {
	loc := amsterdam(t)
	motion := pb.AutomationStarter{Kind: "sensor", Device: "pir", Event: "motion"}
	dark := routine("dark", motion, lampOn("lamp"))
	dark.Conditions = []pb.AutomationCondition{{Kind: "dark"}}
	night := routine("night", motion, lampOn("lamp2"))
	night.Conditions = []pb.AutomationCondition{{Kind: "between", From: "22:00", To: "06:00"}}
	weekend := routine("weekend", motion, lampOn("lamp3"))
	weekend.Conditions = []pb.AutomationCondition{{Kind: "days", Days: []string{"sat", "sun"}}}

	fire := func(at time.Time) []string {
		e := newRoutines(t, dark, night, weekend)
		e.onDevice("pir", map[string]any{"occupancy": false}, at.Add(-time.Minute))
		return runIDs(e.onDevice("pir", map[string]any{"occupancy": true}, at))
	}
	// woensdag 13:00: licht, geen nacht, geen weekend
	if got := fire(time.Date(2026, 10, 14, 13, 0, 0, 0, loc)); len(got) != 0 {
		t.Errorf("middag: %v", got)
	}
	// woensdag 23:30: donker en nacht
	if got := fire(time.Date(2026, 10, 14, 23, 30, 0, 0, loc)); len(got) != 2 {
		t.Errorf("avond: %v", got)
	}
	// zaterdag 03:00: donker, nacht (over middernacht) en weekend
	if got := fire(time.Date(2026, 10, 17, 3, 0, 0, 0, loc)); len(got) != 3 {
		t.Errorf("zaterdagnacht: %v", got)
	}
}

func TestRoutineTemperatureCrossing(t *testing.T) {
	cold := routine("cold", pb.AutomationStarter{Kind: "sensor", Device: "t", Event: "below", Value: 18}, lampOn("heater"))
	e := newRoutines(t, cold)
	now := routineT0
	steps := []struct {
		temp float64
		runs int
	}{{19, 0}, {18.5, 0}, {17.9, 1}, {17.5, 0}, {18.2, 0}, {17.8, 1}}
	for i, s := range steps {
		res := e.onDevice("t", map[string]any{"temperature": s.temp}, now.Add(time.Duration(i*2)*time.Minute))
		if len(res.Runs) != s.runs {
			t.Errorf("stap %d (%.1f°): %d keer, verwacht %d", i, s.temp, len(res.Runs), s.runs)
		}
	}
}

func TestRoutineTimeAndSun(t *testing.T) {
	loc := amsterdam(t)
	morning := routine("ochtend", pb.AutomationStarter{Kind: "time", Time: "07:00", Days: []string{"wed"}}, lampOn("lamp"))
	sunset := routine("avond", pb.AutomationStarter{Kind: "sun", Event: "sunset", Days: []string{"wed"}}, lampOn("lamp2"))
	e := newRoutines(t, morning, sunset)
	if got := runIDs(e.tick(time.Date(2026, 10, 14, 7, 0, 10, 0, loc))); len(got) != 1 || got[0] != "ochtend" {
		t.Errorf("07:00: %v", got)
	}
	// dezelfde minuut nog eens: niet
	if got := runIDs(e.tick(time.Date(2026, 10, 14, 7, 0, 40, 0, loc))); len(got) != 0 {
		t.Errorf("07:00 nog eens: %v", got)
	}
	_, set, _ := sunTimes(time.Date(2026, 10, 14, 0, 0, 0, 0, loc), amsterdamHome.Lat, amsterdamHome.Lon)
	if got := runIDs(e.tick(set.Truncate(time.Minute))); len(got) != 1 || got[0] != "avond" {
		t.Errorf("zonsondergang: %v", got)
	}
}

func TestRoutineOffAfterOnlyWhatItTurnedOn(t *testing.T) {
	door := pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}
	r := routine("r1", door, lampOn("hal"), lampOn("keuken"))
	r.OffAfter = 5
	e := newRoutines(t, r)
	now := routineT0
	e.onDevice("hal", map[string]any{"state": "off"}, now)
	e.onDevice("keuken", map[string]any{"state": "on"}, now) // stond al aan: van de bewoner
	e.onDevice("door", map[string]any{"contact": true}, now)
	e.onDevice("door", map[string]any{"contact": false}, now.Add(time.Minute))
	if res := e.tick(now.Add(5 * time.Minute)); len(res.Offs) != 0 {
		t.Errorf("te vroeg uit: %+v", res.Offs)
	}
	res := e.tick(now.Add(6*time.Minute + time.Second))
	if len(res.Offs) != 1 || res.Offs[0].Device != "hal" || res.Offs[0].Routine != "r1" {
		t.Errorf("uit na 5 min: %+v", res.Offs)
	}
}

func TestRoutineOffAfterReleasedWhenSwitchedOff(t *testing.T) {
	r := routine("r1", pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}, lampOn("hal"))
	r.OffAfter = 5
	e := newRoutines(t, r)
	now := routineT0
	e.onDevice("door", map[string]any{"contact": true}, now)
	e.onDevice("door", map[string]any{"contact": false}, now)
	e.onDevice("hal", map[string]any{"state": "on"}, now.Add(time.Second))
	e.onDevice("hal", map[string]any{"state": "off"}, now.Add(time.Minute)) // met de hand uit
	if res := e.tick(now.Add(10 * time.Minute)); len(res.Offs) != 0 {
		t.Errorf("met de hand uit, toch uit: %+v", res.Offs)
	}
}

// Een routine die een lamp aanzet, start niet een andere routine die op die
// lamp wacht: de ketting stopt na één stap.
func TestRoutineNoChains(t *testing.T) {
	first := routine("eerste", pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}, lampOn("hal"))
	second := routine("tweede", pb.AutomationStarter{Kind: "device", Device: "hal", To: "on"}, lampOn("keuken"))
	e := newRoutines(t, first, second)
	now := routineT0
	e.onDevice("hal", map[string]any{"state": "off"}, now)
	e.onDevice("door", map[string]any{"contact": true}, now)
	if got := runIDs(e.onDevice("door", map[string]any{"contact": false}, now.Add(time.Second))); len(got) != 1 {
		t.Fatalf("deur: %v", got)
	}
	if got := runIDs(e.onDevice("hal", map[string]any{"state": "on"}, now.Add(2*time.Second))); len(got) != 0 {
		t.Errorf("ketting: %v", got)
	}
	// later met de hand: dan wel
	e.onDevice("hal", map[string]any{"state": "off"}, now.Add(time.Minute))
	if got := runIDs(e.onDevice("hal", map[string]any{"state": "on"}, now.Add(2*time.Minute))); len(got) != 1 || got[0] != "tweede" {
		t.Errorf("met de hand aan: %v", got)
	}
}

func TestRoutineOncePerMinuteAndDisabled(t *testing.T) {
	r := routine("r1", pb.AutomationStarter{Kind: "sensor", Device: "pir", Event: "motion"}, lampOn("hal"))
	off := routine("uit", pb.AutomationStarter{Kind: "sensor", Device: "pir", Event: "motion"}, lampOn("x"))
	off.Enabled = false
	e := newRoutines(t, r, off)
	now := routineT0
	count := 0
	for i := 0; i < 6; i++ {
		e.onDevice("pir", map[string]any{"occupancy": false}, now.Add(time.Duration(i*10)*time.Second))
		count += len(e.onDevice("pir", map[string]any{"occupancy": true}, now.Add(time.Duration(i*10+1)*time.Second)).Runs)
	}
	if count != 1 {
		t.Errorf("binnen een minuut %d keer", count)
	}
}

func TestRoutineOwnersSurviveRestart(t *testing.T) {
	r := routine("r1", pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}, lampOn("hal"))
	r.OffAfter = 1
	e := newRoutines(t, r)
	now := routineT0
	e.onDevice("door", map[string]any{"contact": true}, now)
	e.onDevice("door", map[string]any{"contact": false}, now)
	saved := e.owned()

	restarted := newRoutines(t, r)
	restarted.restore(saved)
	res := restarted.tick(now.Add(2 * time.Minute))
	if len(res.Offs) != 1 || res.Offs[0].Device != "hal" {
		t.Errorf("na herstart: %+v", res.Offs)
	}
}

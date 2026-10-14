package app

import (
	"path/filepath"
	"slices"
	"testing"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// Thuis of weg in routines (spec 2026-10-14-presence-design.md).

func away(user string) pb.Presence { return pb.Presence{User: user, Home: false} }
func home(user string) pb.Presence { return pb.Presence{User: user, Home: true} }

func presenceRoutines(t *testing.T) *routineEngine {
	t.Helper()
	ev := func(event, user string) pb.AutomationStarter {
		return pb.AutomationStarter{Kind: "presence", Event: event, User: user}
	}
	return newRoutines(t,
		routine("all_away", ev("all_away", ""), lampOn("off")),
		routine("first_home", ev("first_home", ""), lampOn("hal")),
		routine("sanne_home", ev("arrives", "sanne"), lampOn("bureau")),
		routine("tom_leaves", ev("leaves", "tom"), lampOn("x")),
	)
}

func TestPresenceFirstStateStartsNothing(t *testing.T) {
	e := presenceRoutines(t)
	// na een herstart is iedereen al weg: dat is de uitgangssituatie
	if res := e.setPresence([]string{"sanne", "tom"}, []pb.Presence{away("sanne"), away("tom")}, routineT0); len(res.Runs) != 0 {
		t.Errorf("eerste stand: %v", runIDs(res))
	}
}

func TestPresenceTransitions(t *testing.T) {
	e := presenceRoutines(t)
	members := []string{"sanne", "tom"}
	now := routineT0
	e.setPresence(members, nil, now) // geen rijen: iedereen thuis

	got := func(rows ...pb.Presence) []string {
		now = now.Add(time.Minute)
		ids := runIDs(e.setPresence(members, rows, now))
		slices.Sort(ids)
		return ids
	}
	if ids := got(away("tom")); !slices.Equal(ids, []string{"tom_leaves"}) {
		t.Errorf("tom weg: %v", ids)
	}
	if ids := got(away("tom"), away("sanne")); !slices.Equal(ids, []string{"all_away"}) {
		t.Errorf("iedereen weg: %v", ids)
	}
	if ids := got(away("tom"), away("sanne")); len(ids) != 0 {
		t.Errorf("zelfde stand nog eens: %v", ids)
	}
	if ids := got(away("tom"), home("sanne")); !slices.Equal(ids, []string{"first_home", "sanne_home"}) {
		t.Errorf("sanne thuis als eerste: %v", ids)
	}
	if ids := got(home("tom"), home("sanne")); len(ids) != 0 {
		t.Errorf("tom ook thuis: %v", ids)
	}
}

func TestPresenceMemberChangesStartNoHouseEvent(t *testing.T) {
	e := presenceRoutines(t)
	now := routineT0
	e.setPresence([]string{"sanne"}, []pb.Presence{away("sanne")}, now)
	// tom wordt lid (standaard thuis): "de eerste thuis" hoort daar niet bij
	if res := e.setPresence([]string{"sanne", "tom"}, []pb.Presence{away("sanne")}, now.Add(time.Minute)); len(res.Runs) != 0 {
		t.Errorf("nieuw lid: %v", runIDs(res))
	}
	// tom vertrekt uit het huis terwijl hij thuis was: geen "iedereen weg"
	if res := e.setPresence([]string{"sanne"}, []pb.Presence{away("sanne")}, now.Add(2*time.Minute)); len(res.Runs) != 0 {
		t.Errorf("lid weg uit het huis: %v", runIDs(res))
	}
}

func TestPresenceConditions(t *testing.T) {
	door := pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"}
	cond := func(id, state, user string) pb.Automation {
		r := routine(id, door, lampOn(id))
		r.Conditions = []pb.AutomationCondition{{Kind: "presence", State: state, User: user}}
		return r
	}
	e := newRoutines(t,
		cond("someone", "someone_home", ""), cond("nobody", "nobody_home", ""),
		cond("sanne_home", "home", "sanne"), cond("sanne_away", "away", "sanne"),
	)
	now := routineT0
	open := func() []string {
		e.onDevice("door", map[string]any{"contact": true}, now)
		now = now.Add(time.Minute)
		ids := runIDs(e.onDevice("door", map[string]any{"contact": false}, now))
		slices.Sort(ids)
		now = now.Add(time.Minute)
		return ids
	}
	// nog geen stand: iedereen thuis
	if ids := open(); !slices.Equal(ids, []string{"sanne_home", "someone"}) {
		t.Errorf("zonder stand: %v", ids)
	}
	e.setPresence([]string{"sanne", "tom"}, []pb.Presence{away("sanne")}, now)
	if ids := open(); !slices.Equal(ids, []string{"sanne_away", "someone"}) {
		t.Errorf("sanne weg, tom thuis: %v", ids)
	}
	e.setPresence([]string{"sanne", "tom"}, []pb.Presence{away("sanne"), away("tom")}, now)
	if ids := open(); !slices.Equal(ids, []string{"nobody", "sanne_away"}) {
		t.Errorf("niemand thuis: %v", ids)
	}
}

func TestPresenceRunnerRealtimeAndStaleSnapshot(t *testing.T) {
	r := newRoutineRunner(filepath.Join(t.TempDir(), "automations.json"))
	var steps []string
	r.step = func(_ string, a pb.SceneAction, _ func(string) (*pb.Device, error)) error {
		steps = append(steps, a.Device)
		return nil
	}
	r.report = func(string, error) {}
	all := pb.Automation{ID: "r1", Enabled: true,
		Starter: pb.AutomationStarter{Kind: "presence", Event: "all_away"},
		Actions: []pb.AutomationAction{{Kind: "device", Device: "hal", Action: "turn_off"}}}
	snap := func(rows ...pb.Presence) *scheduleSnapshot {
		return &scheduleSnapshot{
			automations: []pb.Automation{all},
			devices:     map[string]pb.Device{"hal": {ID: "hal", EntityID: "light.hal", Type: "light"}},
			members:     []string{"sanne"},
			presence:    rows,
		}
	}
	old := pb.Presence{House: "huis", User: "sanne", Home: true, Updated: "2026-10-14 20:00:00.000Z"}
	r.start("huis", snap(old))
	now := routineT0
	r.onPresence(pb.PresenceEvent{EventType: "update",
		Record: pb.Presence{House: "huis", User: "sanne", Home: false, Updated: "2026-10-14 21:00:00.000Z"}}, now)
	if !slices.Equal(steps, []string{"hal"}) {
		t.Fatalf("iedereen weg via realtime: %v", steps)
	}
	// een snapshot van vóór die melding draait hem niet terug
	r.apply(snap(old))
	if !slices.Equal(steps, []string{"hal"}) {
		t.Errorf("oud snapshot startte iets: %v", steps)
	}
	// een melding van een ander huis telt niet
	r.onPresence(pb.PresenceEvent{EventType: "update",
		Record: pb.Presence{House: "ander", User: "sanne", Home: true, Updated: "2026-10-14 22:00:00.000Z"}}, now)
	if home := r.engine.isHome("sanne"); home {
		t.Errorf("ander huis zette sanne thuis")
	}
}

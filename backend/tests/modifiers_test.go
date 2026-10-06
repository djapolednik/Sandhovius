//go:build integration

// Regressietest voor body-modifiers. De veldregels ("@request.body.x:isset =
// false") werken alleen als PocketBase modifiers als "x+", "+x", "x-" en
// "x:autogenerate" eerst terugbrengt naar "x". Op 0.40.4 klopt dat; deze test
// bewaakt het bij een upgrade van PocketBase.
package tests

import (
	"reflect"
	"testing"
)

func TestBoxModifiersCaught(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	cases := []struct {
		collection, id string
		body           map[string]any
	}{
		{"devices", w.DevA, map[string]any{"favorite_order+": 5}},
		{"devices", w.DevA, map[string]any{"favorite_order-": 5}},
		{"devices", w.DevA, map[string]any{"gateway+": w.HouseB}},
		{"devices", w.DevA, map[string]any{"gateway-": w.HouseA}},
		{"devices", w.DevA, map[string]any{"+room": w.roomA}},
		{"devices", w.DevA, map[string]any{"room+": w.roomA}},
		{"devices", w.DevA, map[string]any{"name:autogenerate": ""}},
		{"houses", w.HouseA, map[string]any{"user-": w.UserA}},
		{"schedules", w.SchedA, map[string]any{"days+": "tue"}},
		{"schedules", w.SchedA, map[string]any{"+days": "tue"}},
		{"schedules", w.SchedA, map[string]any{"days-": "mon"}},
		{"schedules", w.SchedA, map[string]any{"house-": w.HouseA}},
		{"commands", w.CmdA, map[string]any{"device-": w.DevA}},
		{"commands", w.CmdA, map[string]any{"+scene": w.SceneA}},
	}
	for _, c := range cases {
		before := getRecord(t, p, c.collection, c.id)
		st, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/"+c.collection+"/records/"+c.id, c.body)
		after := getRecord(t, p, c.collection, c.id)
		if st < 400 {
			t.Errorf("box A: %s %v gaf status %d (verwacht >= 400): %v", c.collection, c.body, st, out)
		}
		if !reflect.DeepEqual(before, after) {
			t.Errorf("box A: %s %v heeft het record gewijzigd: %v -> %v", c.collection, c.body, before, after)
		}
	}

	// device_state aanmaken met "device+" naar een device van huis B
	before := listIDs(t, p, p.AdminToken, "device_state")
	st, out := p.do(t, w.BoxATok, "POST", "/api/collections/device_state/records",
		map[string]any{"device+": w.DevB, "state": map[string]any{"on": true}})
	if st < 400 {
		t.Errorf("box A mag device_state met device+ voor huis B aanmaken: %d %v", st, out)
	}
	if after := listIDs(t, p, p.AdminToken, "device_state"); len(after) != len(before) {
		t.Errorf("device_state: er is een record bijgekomen (%d -> %d)", len(before), len(after))
	}
}

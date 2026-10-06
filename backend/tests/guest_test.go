//go:build integration

// Gasten (geen token): @request.auth.id is dan "", gelijk aan een lege
// "user". Zonder expliciete check op de collectie van de inlogger zou een gast
// een huis zonder eigenaar kunnen zien, claimen en bedienen.
package tests

import (
	"reflect"
	"testing"
)

func TestGuestCannotReachOwnerlessHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	house := p.create(t, "houses", map[string]any{"name": "Zonder eigenaar"})
	dev := p.create(t, "devices", map[string]any{
		"gateway": house, "entity_id": "light.wees", "name": "wees", "type": "light"})
	p.create(t, "device_state", map[string]any{"device": dev, "state": map[string]any{"on": false}})
	p.create(t, "commands", map[string]any{"device": dev, "action": "turn_on", "status": "pending"})
	room := p.create(t, "rooms", map[string]any{"house": house, "name": "Kamer", "order": 1})
	scene := p.create(t, "scenes", map[string]any{"house": house, "name": "Scène", "order": 1, "actions": []any{}})
	p.create(t, "schedules", map[string]any{
		"house": house, "scene": scene, "time": "23:00", "days": []string{"mon"}, "enabled": true})

	for _, c := range []string{"houses", "devices", "device_state", "commands", "rooms", "scenes", "schedules"} {
		if ids := listIDs(t, p, "", c); len(ids) != 0 {
			t.Errorf("gast ziet in %s %v", c, ids)
		}
	}
	for c, id := range map[string]string{"houses": house, "devices": dev, "rooms": room, "scenes": scene} {
		if st, _ := p.do(t, "", "GET", "/api/collections/"+c+"/records/"+id, nil); st != 404 {
			t.Errorf("gast leest %s zonder eigenaar: status %d (verwacht 404)", c, st)
		}
	}

	before := getRecord(t, p, "houses", house)
	st, out := p.do(t, "", "PATCH", "/api/collections/houses/records/"+house,
		map[string]any{"user": w.UserA, "name": "van mij"})
	if st < 400 {
		t.Errorf("gast mag huis zonder eigenaar wijzigen: %d %v", st, out)
	}
	if after := getRecord(t, p, "houses", house); !reflect.DeepEqual(before, after) {
		t.Errorf("huis zonder eigenaar gewijzigd door gast: %v -> %v", before, after)
	}

	creates := map[string]map[string]any{
		"commands": {"device": dev, "action": "turn_off", "status": "pending"},
		"devices":  {"gateway": house, "entity_id": "light.nep", "name": "nep", "type": "light"},
		"rooms":    {"house": house, "name": "Nep", "order": 2},
		"scenes":   {"house": house, "name": "Nep", "order": 2, "actions": []any{}},
	}
	for c, body := range creates {
		n := len(listIDs(t, p, p.AdminToken, c))
		st, out := p.do(t, "", "POST", "/api/collections/"+c+"/records", body)
		if st < 400 {
			t.Errorf("gast mag in %s aanmaken voor huis zonder eigenaar: %d %v", c, st, out)
		}
		if m := len(listIDs(t, p, p.AdminToken, c)); m != n {
			t.Errorf("%s: gast heeft een record aangemaakt", c)
		}
	}
	// ook een scène-commando voor het huis zonder eigenaar
	n := len(listIDs(t, p, p.AdminToken, "commands"))
	if st, out := p.do(t, "", "POST", "/api/collections/commands/records",
		map[string]any{"scene": scene, "action": "run_scene", "status": "pending"}); st < 400 {
		t.Errorf("gast mag een scène-commando maken: %d %v", st, out)
	}
	if m := len(listIDs(t, p, p.AdminToken, "commands")); m != n {
		t.Error("commands: gast heeft een scène-commando aangemaakt")
	}
}

func TestResidentCannotSetClaimedAt(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	before := getRecord(t, p, "houses", w.HouseA)
	st, out := p.do(t, w.UserATok, "PATCH", "/api/collections/houses/records/"+w.HouseA,
		map[string]any{"claimed_at": "2030-01-01 00:00:00.000Z"})
	if st < 400 {
		t.Errorf("bewoner mag claimed_at zetten: %d %v", st, out)
	}
	if after := getRecord(t, p, "houses", w.HouseA); !reflect.DeepEqual(before, after) {
		t.Errorf("claimed_at gewijzigd door bewoner: %v -> %v", before["claimed_at"], after["claimed_at"])
	}
	// gewone wijzigingen blijven mogen
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/collections/houses/records/"+w.HouseA,
		map[string]any{"name": "Nieuwe naam"}); st != 200 {
		t.Errorf("bewoner mag eigen huis niet hernoemen: %d %v", st, out)
	}
}

//go:build integration

// Thuis of weg (spec 2026-10-14-presence-design.md): één rij per lid per huis,
// alleen je eigen stand zetten, iedereen in het huis en de box lezen hem.
// Routines kennen thuis/weg als starter en voorwaarde, ook per lid.
package tests

import "testing"

const presencePath = "/api/collections/presence/records"

func TestPresenceRights(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	sanne, sanneTok := newUserToken(t, p, "sanne@sandhovius.test")
	addMember(t, p, w.HouseA, sanne)
	stranger, strangerTok := newUserToken(t, p, "vreemd@sandhovius.test")

	st, out := p.do(t, w.UserATok, "POST", presencePath, map[string]any{"house": w.HouseA, "user": w.UserA, "home": false})
	if st != 200 {
		t.Fatalf("lid zet zichzelf op weg: %d %v", st, out)
	}
	id := out["id"].(string)
	if st, _ := p.do(t, w.UserATok, "POST", presencePath, map[string]any{"house": w.HouseA, "user": w.UserA, "home": true}); st < 400 {
		t.Errorf("tweede rij voor hetzelfde lid: %d", st)
	}
	if st, _ := p.do(t, w.UserATok, "POST", presencePath, map[string]any{"house": w.HouseA, "user": sanne, "home": false}); st < 400 {
		t.Errorf("lid zet een ander op weg: %d", st)
	}
	if st, _ := p.do(t, strangerTok, "POST", presencePath, map[string]any{"house": w.HouseA, "user": stranger, "home": false}); st < 400 {
		t.Errorf("geen lid zet zich in huis A: %d", st)
	}
	if st, _ := p.do(t, sanneTok, "PATCH", presencePath+"/"+id, map[string]any{"home": true}); st < 400 {
		t.Errorf("lid wijzigt de stand van een ander: %d", st)
	}
	if st, _ := p.do(t, w.UserATok, "PATCH", presencePath+"/"+id, map[string]any{"user": sanne}); st < 400 {
		t.Errorf("rij overzetten naar een ander: %d", st)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", presencePath+"/"+id, map[string]any{"home": true}); st != 200 {
		t.Errorf("lid zet zichzelf op thuis: %d %v", st, out)
	}
	if st, _ := p.do(t, sanneTok, "GET", presencePath+"/"+id, nil); st != 200 {
		t.Errorf("huisgenoot ziet de stand niet: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "GET", presencePath+"/"+id, nil); st != 200 {
		t.Errorf("box ziet de stand niet: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "PATCH", presencePath+"/"+id, map[string]any{"home": false}); st < 400 {
		t.Errorf("box zet de stand: %d", st)
	}
	if st, _ := p.do(t, w.BoxBTok, "GET", presencePath+"/"+id, nil); st < 400 {
		t.Errorf("box van een ander huis ziet de stand: %d", st)
	}
	if st, _ := p.do(t, w.UserATok, "DELETE", presencePath+"/"+id, nil); st < 400 {
		t.Errorf("rij verwijderen mag niet (geen rij = thuis via de app): %d", st)
	}

	// Verlaten ruimt de rij op.
	st, out = p.do(t, sanneTok, "POST", presencePath, map[string]any{"house": w.HouseA, "user": sanne, "home": false})
	if st != 200 {
		t.Fatalf("sanne zet zich op weg: %d %v", st, out)
	}
	sanneRow := out["id"].(string)
	if st, out := p.do(t, sanneTok, "DELETE", "/api/sandhovius/houses/"+w.HouseA+"/members/"+sanne, nil); st != 204 {
		t.Fatalf("sanne verlaat het huis: %d %v", st, out)
	}
	if st, _ := p.do(t, p.AdminToken, "GET", presencePath+"/"+sanneRow, nil); st != 404 {
		t.Errorf("rij van wie vertrok bestaat nog: %d", st)
	}
}

func TestRoutinePresence(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	sanne, _ := newUserToken(t, p, "sanne@sandhovius.test")
	addMember(t, p, w.HouseA, sanne)
	outsider, _ := newUserToken(t, p, "vreemd@sandhovius.test")

	ok := []map[string]any{
		{"starter": map[string]any{"kind": "presence", "event": "all_away"}},
		{"starter": map[string]any{"kind": "presence", "event": "first_home"}},
		{"starter": map[string]any{"kind": "presence", "event": "arrives", "user": sanne}},
		{"conditions": []any{map[string]any{"kind": "presence", "state": "nobody_home"}}},
		{"conditions": []any{map[string]any{"kind": "presence", "state": "away", "user": w.UserA}}},
	}
	for i, extra := range ok {
		if st, out := p.do(t, w.UserATok, "POST", automationsPath, w.routine(extra)); st != 200 {
			t.Errorf("geldig %d %v: %d %v", i, extra, st, out)
		}
	}
	bad := map[string]map[string]any{
		"onbekende gebeurtenis":  {"starter": map[string]any{"kind": "presence", "event": "nearby"}},
		"aankomen zonder lid":    {"starter": map[string]any{"kind": "presence", "event": "arrives"}},
		"aankomen van geen lid":  {"starter": map[string]any{"kind": "presence", "event": "leaves", "user": outsider}},
		"huis-gebeurtenis + lid": {"starter": map[string]any{"kind": "presence", "event": "all_away", "user": sanne}},
		"voorwaarde geen lid":    {"conditions": []any{map[string]any{"kind": "presence", "state": "home", "user": outsider}}},
		"onbekende stand":        {"conditions": []any{map[string]any{"kind": "presence", "state": "sleeping"}}},
	}
	for name, extra := range bad {
		st, out := p.do(t, w.UserATok, "POST", automationsPath, w.routine(extra))
		if st != 400 || out["code"] != "invalid_automation" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
}

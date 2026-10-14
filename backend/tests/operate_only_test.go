//go:build integration

// Rechten als één schakelaar (spec 2026-10-14-member-rights-design.md, D1):
// een lid op "alleen bedienen" (houses.operate_only) wijzigt niets aan scènes,
// schema's, routines, bewegingslicht, kamers of apparaten en koppelt niets;
// bedienen en de eigen dingen blijven. Beheerders mogen altijd alles.
package tests

import "testing"

func TestOperateOnly(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	kim, kimTok := newUserToken(t, p, "kim@sandhovius.test")
	addMember(t, p, w.HouseA, kim)
	member := "/api/sandhovius/houses/" + w.HouseA + "/members/" + kim

	sceneBody := map[string]any{"house": w.HouseA, "name": "Kim", "actions": []any{}}
	// Lege operate_only: een gewoon lid mag wijzigen (de "!=" op een lege lijst).
	if st, out := p.do(t, kimTok, "POST", "/api/collections/scenes/records", sceneBody); st != 200 {
		t.Fatalf("lid zonder beperking maakt een scène: %d %v", st, out)
	}

	// Alleen een beheerder zet het, via het endpoint; niet direct op het huis.
	if st, _ := p.do(t, kimTok, "PATCH", member, map[string]any{"can_edit": false}); st < 400 {
		t.Errorf("lid beperkt zichzelf/anderen: %d", st)
	}
	if st, _ := p.do(t, w.UserATok, "PATCH", "/api/collections/houses/records/"+w.HouseA, map[string]any{"operate_only": []string{kim}}); st < 400 {
		t.Errorf("beheerder zet operate_only direct: %d", st)
	}
	st, out := p.do(t, w.UserATok, "PATCH", member, map[string]any{"can_edit": false})
	if st != 200 || out["can_edit"] != false || out["role"] != "member" {
		t.Fatalf("beheerder zet kim op alleen bedienen: %d %v", st, out)
	}

	// Kim mag niets meer wijzigen…
	blocked := []struct {
		name, method, path string
		body               map[string]any
	}{
		{"scène maken", "POST", "/api/collections/scenes/records", sceneBody},
		{"scène wijzigen", "PATCH", "/api/collections/scenes/records/" + w.SceneA, map[string]any{"name": "Nee"}},
		{"scène verwijderen", "DELETE", "/api/collections/scenes/records/" + w.SceneA, nil},
		{"schema uitzetten", "PATCH", "/api/collections/schedules/records/" + w.SchedA, map[string]any{"enabled": false}},
		{"routine maken", "POST", automationsPath, w.routine(nil)},
		{"kamer maken", "POST", "/api/collections/rooms/records", map[string]any{"house": w.HouseA, "name": "Zolder"}},
		{"kamer hernoemen", "PATCH", "/api/collections/rooms/records/" + w.roomA, map[string]any{"name": "Nee"}},
		{"apparaat hernoemen", "PATCH", "/api/collections/devices/records/" + w.DevA, map[string]any{"name": "Nee"}},
		{"apparaat verwijderen", "DELETE", "/api/collections/devices/records/" + w.DevA, nil},
		{"koppelen", "POST", "/api/collections/pairing_sessions/records", map[string]any{"house": w.HouseA, "kind": "light", "status": "starting"}},
		{"bewegingslicht", "POST", "/api/collections/motion_lights/records", map[string]any{"house": w.HouseA, "sensor": w.Thermo, "devices": []string{w.DevA}, "off_after": 3}},
	}
	for _, b := range blocked {
		if st, out := p.do(t, kimTok, b.method, b.path, b.body); st < 400 {
			t.Errorf("alleen bedienen, %s: %d %v", b.name, st, out)
		}
	}
	// …maar bedient wel, en houdt zijn eigen dingen.
	allowed := []struct {
		name, path string
		body       map[string]any
	}{
		{"schakelen", "/api/collections/commands/records", map[string]any{"device": w.DevA, "action": "toggle", "status": "pending"}},
		{"scène uitvoeren", "/api/collections/commands/records", map[string]any{"scene": w.SceneA, "action": "run_scene", "status": "pending"}},
		{"favoriet", "/api/collections/favorites/records", map[string]any{"user": kim, "device": w.DevA, "order": 0}},
		{"thuis/weg", presencePath, map[string]any{"house": w.HouseA, "user": kim, "home": false}},
		{"Meld dit", notifyRulesPath, map[string]any{"house": w.HouseA, "user": kim, "device": w.Door, "event": "open", "enabled": true}},
	}
	for _, a := range allowed {
		if st, out := p.do(t, kimTok, "POST", a.path, a.body); st != 200 {
			t.Errorf("alleen bedienen, %s: %d %v", a.name, st, out)
		}
	}
	// De beheerder zelf en de box merken niets.
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/collections/scenes/records/"+w.SceneA, map[string]any{"name": "Avond"}); st != 200 {
		t.Errorf("beheerder wijzigt een scène: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/schedules/records/"+w.SchedA, map[string]any{"last_error": ""}); st != 200 {
		t.Errorf("box schrijft last_error: %d %v", st, out)
	}

	// De ledenlijst zegt het; beheerder maken haalt de beperking weg.
	_, list := p.do(t, w.UserATok, "GET", "/api/sandhovius/houses/"+w.HouseA+"/members", nil)
	for _, raw := range list["items"].([]any) {
		m := raw.(map[string]any)
		if m["id"] == kim && m["can_edit"] != false {
			t.Errorf("ledenlijst: kim %v", m)
		}
		if m["id"] == w.UserA && m["can_edit"] != true {
			t.Errorf("ledenlijst: beheerder %v", m)
		}
	}
	if st, out := p.do(t, w.UserATok, "PATCH", member, map[string]any{"role": "admin", "can_edit": false}); st != 409 || out["code"] != "admin_can_edit" {
		t.Errorf("beheerder op alleen bedienen: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", member, map[string]any{"role": "admin"}); st != 200 || out["can_edit"] != true {
		t.Fatalf("kim wordt beheerder: %d %v", st, out)
	}
	if h := p.houseRecord(t, w.HouseA); len(h["operate_only"].([]any)) != 0 {
		t.Errorf("beheerder staat nog op alleen bedienen: %v", h["operate_only"])
	}
	if st, out := p.do(t, kimTok, "PATCH", "/api/collections/scenes/records/"+w.SceneA, map[string]any{"name": "Kim"}); st != 200 {
		t.Errorf("kim als beheerder wijzigt een scène: %d %v", st, out)
	}

	// Terug naar lid: de beperking komt niet vanzelf terug; vertrekken ruimt hem op.
	if st, out := p.do(t, w.UserATok, "PATCH", member, map[string]any{"role": "member", "can_edit": false}); st != 200 || out["can_edit"] != false {
		t.Fatalf("kim terug naar lid, alleen bedienen: %d %v", st, out)
	}
	if st, out := p.do(t, kimTok, "DELETE", member, nil); st != 204 {
		t.Fatalf("kim vertrekt: %d %v", st, out)
	}
	if h := p.houseRecord(t, w.HouseA); len(h["operate_only"].([]any)) != 0 {
		t.Errorf("vertrokken lid staat nog op alleen bedienen: %v", h["operate_only"])
	}
}

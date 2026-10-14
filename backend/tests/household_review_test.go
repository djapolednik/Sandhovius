//go:build integration

// Huishouden, na de eindreview: de laatste beheerder kan zijn account niet
// verwijderen (anders een huis zonder beheerder, of een box die niemand meer
// kan ontkoppelen), en geen bewoner hangt een apparaat of kamer aan een ander
// huis.
package tests

import "testing"

func TestLastAdminCannotDeleteAccount(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)

	// A is de enige beheerder van A (met een huisgenoot erbij)
	st, out := p.do(t, w.UserATok, "DELETE", "/api/collections/users/records/"+w.UserA, nil)
	if st != 409 || out["code"] != "last_admin_of_house" || param(out, "house") != "Huis A" {
		t.Errorf("laatste beheerder verwijdert account: %d %v (verwacht 409)", st, out)
	}
	if _, admins := membersOf(t, p, w.HouseA); !hasID(admins, w.UserA) {
		t.Errorf("A is geen beheerder meer: %v", admins)
	}

	// ook als enige bewoner: anders hangt de box aan een huis zonder beheerder
	x, xTok := newUserToken(t, p, "x@sandhovius.test")
	newHouse(t, p, "Huis X", []string{x}, nil)
	if st, out := p.do(t, xTok, "DELETE", "/api/collections/users/records/"+x, nil); st != 409 {
		t.Errorf("enige bewoner en beheerder verwijdert account: %d %v (verwacht 409)", st, out)
	}

	// een huisgenoot mag zijn account wel verwijderen
	if st, out := p.do(t, mTok, "DELETE", "/api/collections/users/records/"+m, nil); st != 204 {
		t.Errorf("huisgenoot verwijdert account: %d %v", st, out)
	}
	// met een tweede beheerder mag A ook
	n := newUser(t, p, "tweede@sandhovius.test")
	addMember(t, p, w.HouseA, n)
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/sandhovius/houses/"+w.HouseA+"/members/"+n,
		map[string]any{"role": "admin"}); st != 200 {
		t.Fatalf("tweede beheerder: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "DELETE", "/api/collections/users/records/"+w.UserA, nil); st != 204 {
		t.Errorf("A met tweede beheerder verwijdert account: %d %v", st, out)
	}
	if members, admins := membersOf(t, p, w.HouseA); hasID(members, w.UserA) || !hasID(admins, n) {
		t.Errorf("na verwijderen van A: members %v admins %v", members, admins)
	}
}

func TestResidentCannotMoveDeviceOrRoom(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	// X: huisgenoot van A en beheerder van een eigen huis met een kamer
	x, xTok := newUserToken(t, p, "x@sandhovius.test")
	houseX := newHouse(t, p, "Huis X", []string{x}, nil)
	roomX := p.create(t, "rooms", map[string]any{"house": houseX, "name": "Kamer X", "order": 1})
	addMember(t, p, w.HouseA, x)

	patchRefused(t, p, xTok, "devices", w.DevA, map[string]any{"gateway": houseX}, "X")
	patchRefused(t, p, xTok, "devices", w.DevA, map[string]any{"room": roomX}, "X (kamer van ander huis)")
	patchRefused(t, p, w.UserATok, "devices", w.DevA, map[string]any{"room": w.roomB}, "A (kamer van B)")
	patchRefused(t, p, xTok, "rooms", w.roomA, map[string]any{"house": houseX}, "X")
	if st, out := p.do(t, xTok, "POST", "/api/collections/devices/records", map[string]any{
		"gateway": w.HouseA, "entity_id": "light.n", "name": "n", "type": "light", "room": roomX}); st < 400 {
		t.Errorf("X maakt een device in A met een kamer van X: %d %v", st, out)
	}
	if st, out := p.do(t, xTok, "POST", "/api/collections/devices/records", map[string]any{
		"gateway": w.HouseA, "entity_id": "light.m", "name": "m", "type": "light", "room": w.roomA}); st < 400 {
		// alleen de box maakt devices (na koppelen), zie devices_test.go
		t.Errorf("X maakt zelf een device in A: %d %v", st, out)
	}

	// eigen kamer kiezen en weer leeg maken blijft mogen
	for _, room := range []any{w.roomA, nil} {
		if st, out := p.do(t, xTok, "PATCH", "/api/collections/devices/records/"+w.DevA,
			map[string]any{"room": room}); st != 200 {
			t.Errorf("huisgenoot zet kamer %v: %d %v", room, st, out)
		}
	}
	if st, out := p.do(t, xTok, "PATCH", "/api/collections/rooms/records/"+w.roomA,
		map[string]any{"name": "Woonkamer"}); st != 200 {
		t.Errorf("huisgenoot hernoemt kamer: %d %v", st, out)
	}
}

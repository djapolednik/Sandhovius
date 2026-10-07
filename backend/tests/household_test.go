//go:build integration

// Huishouden: een huis heeft leden (members) en beheerders (admins, altijd ook
// lid). Elk lid bedient het huis; alleen een beheerder hernoemt het en
// ontkoppelt de box. Niemand zet members of admins met een gewone PATCH: dat
// loopt via eigen endpoints, zodat de invariant op één plek bewaakt wordt.
package tests

import (
	"reflect"
	"sort"
	"testing"
)

// newHouse maakt als superuser een huis; beheerders worden ook lid.
func newHouse(t *testing.T, p *pb, name string, admins []string, members []string) string {
	t.Helper()
	all := append([]string{}, admins...)
	for _, m := range members {
		if !contains(all, m) {
			all = append(all, m)
		}
	}
	return p.create(t, "houses", map[string]any{"name": name, "members": all, "admins": admins})
}

// sameIDs: v (een meervoudige relatie uit een API-antwoord) bevat precies want.
func sameIDs(v any, want ...string) bool {
	raw, ok := v.([]any)
	if !ok {
		return false
	}
	got := []string{}
	for _, x := range raw {
		s, _ := x.(string)
		got = append(got, s)
	}
	w := append([]string{}, want...)
	sort.Strings(got)
	sort.Strings(w)
	return reflect.DeepEqual(got, w)
}

// addMember zet als superuser een gebruiker in members van een huis.
func addMember(t *testing.T, p *pb, house, user string) {
	t.Helper()
	if st, out := p.do(t, p.AdminToken, "PATCH", "/api/collections/houses/records/"+house,
		map[string]any{"members+": user}); st != 200 {
		t.Fatalf("lid toevoegen: %d %v", st, out)
	}
}

// newUserToken maakt een (onbevestigde) bewoner en geeft id en token terug.
func newUserToken(t *testing.T, p *pb, email string) (string, string) {
	t.Helper()
	id := newUser(t, p, email)
	return id, p.login(t, "users", email, boxPw)
}

var residentCollections = []string{"houses", "devices", "device_state", "commands", "scenes", "schedules", "rooms"}

// patchRefused: PATCH geeft >= 400 en het record is ongewijzigd.
func patchRefused(t *testing.T, p *pb, token, collection, id string, body map[string]any, who string) {
	t.Helper()
	before := getRecord(t, p, collection, id)
	st, out := p.do(t, token, "PATCH", "/api/collections/"+collection+"/records/"+id, body)
	if st < 400 {
		t.Errorf("%s: %s %v gaf status %d (verwacht >= 400): %v", who, collection, body, st, out)
	}
	if after := getRecord(t, p, collection, id); !reflect.DeepEqual(before, after) {
		t.Errorf("%s: %s %v heeft het record gewijzigd: %v -> %v", who, collection, body, before, after)
	}
}

func TestHousemateCanOperate(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)

	want := w.idsA()
	want["rooms"] = w.roomA
	for _, c := range residentCollections {
		if ids := listIDs(t, p, mTok, c); len(ids) != 1 || ids[0] != want[c] {
			t.Errorf("huisgenoot ziet in %s %v, verwacht alleen %s", c, ids, want[c])
		}
		if st, out := p.do(t, mTok, "GET", "/api/collections/"+c+"/records/"+want[c], nil); st != 200 {
			t.Errorf("huisgenoot leest %s van A niet: %d %v", c, st, out)
		}
	}

	creates := []struct {
		collection string
		body       map[string]any
	}{
		{"commands", map[string]any{"device": w.DevA, "action": "turn_off", "status": "pending"}},
		{"commands", map[string]any{"scene": w.SceneA, "action": "run_scene", "status": "pending"}},
		{"rooms", map[string]any{"house": w.HouseA, "name": "Zolder", "order": 2}},
		{"scenes", map[string]any{"house": w.HouseA, "name": "Film", "order": 2, "actions": []any{}}},
	}
	for _, c := range creates {
		if st, out := p.do(t, mTok, "POST", "/api/collections/"+c.collection+"/records", c.body); st != 200 {
			t.Errorf("huisgenoot mag niet in %s aanmaken %v: %d %v", c.collection, c.body, st, out)
		}
	}
	if st, out := p.do(t, mTok, "PATCH", "/api/collections/devices/records/"+w.DevA,
		map[string]any{"name": "Leeslamp"}); st != 200 {
		t.Errorf("huisgenoot mag device niet hernoemen: %d %v", st, out)
	}

	// en niets in huis B
	if st, out := p.do(t, mTok, "POST", "/api/collections/commands/records",
		map[string]any{"device": w.DevB, "action": "turn_off", "status": "pending"}); st < 400 {
		t.Errorf("huisgenoot van A mag een command op een device van B maken: %d %v", st, out)
	}
}

func TestHousemateCannotAdmin(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)

	patchRefused(t, p, mTok, "houses", w.HouseA, map[string]any{"name": "Van mij"}, "huisgenoot")
	patchRefused(t, p, mTok, "houses", w.HouseA, map[string]any{"members": []string{m}}, "huisgenoot")
	patchRefused(t, p, mTok, "houses", w.HouseA, map[string]any{"admins": []string{w.UserA, m}}, "huisgenoot")
	patchRefused(t, p, mTok, "houses", w.HouseA, map[string]any{"admins+": m}, "huisgenoot")

	st, out := p.do(t, mTok, "POST", "/api/sandhovius/release", map[string]any{"house": w.HouseA})
	if st != 404 {
		t.Errorf("huisgenoot ontkoppelt huis A: %d %v (verwacht 404)", st, out)
	}
	if box := p.boxRecord(t, p.boxIDBySerial(t, "SH-A")); box["house"] != w.HouseA {
		t.Errorf("box A is losgekoppeld door een huisgenoot: %v", box["house"])
	}
}

func TestAdminCannotPatchMembership(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	m := newUser(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)

	for _, body := range []map[string]any{
		{"members": []string{w.UserA, m, newUser(t, p, "x@sandhovius.test")}},
		{"members": []string{w.UserA}},
		{"admins": []string{w.UserA, m}},
		{"admins+": m},
		{"members-": m},
	} {
		patchRefused(t, p, w.UserATok, "houses", w.HouseA, body, "beheerder")
	}
	// hernoemen blijft mogen
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/collections/houses/records/"+w.HouseA,
		map[string]any{"name": "Nieuwe naam"}); st != 200 {
		t.Errorf("beheerder mag eigen huis niet hernoemen: %d %v", st, out)
	}
}

func TestRoleDoesNotLeakBetweenHouses(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	x, xTok := newUserToken(t, p, "x@sandhovius.test")
	houseX := newHouse(t, p, "Huis X", []string{x}, nil)
	addMember(t, p, w.HouseA, x)

	if st, out := p.do(t, xTok, "PATCH", "/api/collections/houses/records/"+houseX,
		map[string]any{"name": "Strandhuis"}); st != 200 {
		t.Errorf("beheerder X mag eigen huis niet hernoemen: %d %v", st, out)
	}
	patchRefused(t, p, xTok, "houses", w.HouseA, map[string]any{"name": "Van X"}, "X (huisgenoot van A)")

	st, out := p.do(t, xTok, "POST", "/api/sandhovius/release", map[string]any{"house": w.HouseA})
	if st != 404 {
		t.Errorf("X ontkoppelt huis A: %d %v (verwacht 404)", st, out)
	}
	if box := p.boxRecord(t, p.boxIDBySerial(t, "SH-A")); box["house"] != w.HouseA {
		t.Errorf("box A is losgekoppeld door X: %v", box["house"])
	}
}

func TestNonMemberSeesNothing(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, nTok := newUserToken(t, p, "niemand@sandhovius.test")

	ids := w.idsA()
	ids["rooms"] = w.roomA
	for _, c := range residentCollections {
		if got := listIDs(t, p, nTok, c); len(got) != 0 {
			t.Errorf("gebruiker zonder huis ziet in %s %v", c, got)
		}
		if st, _ := p.do(t, nTok, "GET", "/api/collections/"+c+"/records/"+ids[c], nil); st != 404 {
			t.Errorf("gebruiker zonder huis leest %s van A: status %d (verwacht 404)", c, st)
		}
	}
}

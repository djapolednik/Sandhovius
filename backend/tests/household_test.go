//go:build integration

// Huishouden: een huis heeft leden (members) en beheerders (admins, altijd ook
// lid). Elk lid bedient het huis; alleen een beheerder hernoemt het en
// ontkoppelt de box. Niemand zet members of admins met een gewone PATCH: dat
// loopt via eigen endpoints, zodat de invariant op één plek bewaakt wordt.
package tests

import (
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
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

// Favorieten zijn per persoon: je ziet en maakt alleen je eigen favorieten, en
// alleen voor apparaten van een huis waar je lid van bent.
func TestFavoritesArePersonal(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)
	x, xTok := newUserToken(t, p, "x@sandhovius.test")

	st, out := p.do(t, w.UserATok, "POST", "/api/collections/favorites/records",
		map[string]any{"user": w.UserA, "device": w.DevA, "order": 1})
	if st != 200 {
		t.Fatalf("bewoner A mag geen eigen favoriet maken: %d %v", st, out)
	}
	favA, _ := out["id"].(string)

	if ids := listIDs(t, p, w.UserATok, "favorites"); len(ids) != 1 || ids[0] != favA {
		t.Errorf("A ziet favorieten %v, verwacht alleen %s", ids, favA)
	}
	if ids := listIDs(t, p, mTok, "favorites"); len(ids) != 0 {
		t.Errorf("huisgenoot ziet de favorieten van A: %v", ids)
	}
	if st, _ := p.do(t, mTok, "GET", "/api/collections/favorites/records/"+favA, nil); st != 404 {
		t.Errorf("huisgenoot leest de favoriet van A: %d (verwacht 404)", st)
	}
	patchRefused(t, p, mTok, "favorites", favA, map[string]any{"order": 9}, "huisgenoot")
	if st, _ := p.do(t, mTok, "DELETE", "/api/collections/favorites/records/"+favA, nil); st < 400 {
		t.Errorf("huisgenoot verwijdert de favoriet van A: %d", st)
	}

	if st, out := p.do(t, mTok, "POST", "/api/collections/favorites/records",
		map[string]any{"user": w.UserA, "device": w.DevA, "order": 2}); st < 400 {
		t.Errorf("huisgenoot maakt een favoriet voor A: %d %v", st, out)
	}
	if st, out := p.do(t, mTok, "POST", "/api/collections/favorites/records",
		map[string]any{"user": m, "device": w.DevA, "order": 1}); st != 200 {
		t.Errorf("huisgenoot mag geen eigen favoriet maken: %d %v", st, out)
	}
	if st, out := p.do(t, xTok, "POST", "/api/collections/favorites/records",
		map[string]any{"user": x, "device": w.DevA, "order": 1}); st < 400 {
		t.Errorf("niet-lid maakt een favoriet op een device van A: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "POST", "/api/collections/favorites/records",
		map[string]any{"user": w.UserA, "device": w.DevB, "order": 1}); st < 400 {
		t.Errorf("A maakt een favoriet op een device van B: %d %v", st, out)
	}

	// eigen favoriet: volgorde wijzigen mag, user of device verhangen niet
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/collections/favorites/records/"+favA,
		map[string]any{"order": 5}); st != 200 {
		t.Errorf("A mag de volgorde van een eigen favoriet niet wijzigen: %d %v", st, out)
	}
	patchRefused(t, p, w.UserATok, "favorites", favA, map[string]any{"user": m}, "A")
	patchRefused(t, p, w.UserATok, "favorites", favA, map[string]any{"device": w.DevB}, "A")

	// device weg → favorieten weg
	if st, out := p.do(t, w.UserATok, "DELETE", "/api/collections/devices/records/"+w.DevA, nil); st != 204 {
		t.Fatalf("device verwijderen: %d %v", st, out)
	}
	if ids := listIDs(t, p, p.AdminToken, "favorites"); len(ids) != 0 {
		t.Errorf("favorieten blijven na het verwijderen van het device: %v", ids)
	}
}


// --- Uitnodigingen en lidmaatschap (endpoints in pb_hooks/household.pb.js) ---

// household start PocketBase met een SMTP-catcher en de vaste fixture.
func household(t *testing.T) (*pb, world, *smtpCatcher) {
	t.Helper()
	c := newSMTPCatcher(t)
	p := startPBEnv(t, mailEnv(c.Port))
	return p, fixture(t, p), c
}

func invite(t *testing.T, p *pb, token, invitedBy, house, email, role string) (int, map[string]any) {
	t.Helper()
	return p.do(t, token, "POST", "/api/collections/invitations/records",
		map[string]any{"house": house, "email": email, "role": role, "invited_by": invitedBy})
}

func mustInvite(t *testing.T, p *pb, token, invitedBy, house, email, role string) string {
	t.Helper()
	st, out := invite(t, p, token, invitedBy, house, email, role)
	if st != 200 {
		t.Fatalf("uitnodigen %s: %d %v", email, st, out)
	}
	id, _ := out["id"].(string)
	return id
}

func accept(t *testing.T, p *pb, token, invitation string) (int, map[string]any) {
	t.Helper()
	return p.do(t, token, "POST", "/api/sandhovius/invitations/"+invitation+"/accept", nil)
}

func membersOf(t *testing.T, p *pb, house string) (members, admins []any) {
	t.Helper()
	h := p.houseRecord(t, house)
	members, _ = h["members"].([]any)
	admins, _ = h["admins"].([]any)
	return members, admins
}

func hasID(list []any, id string) bool {
	for _, x := range list {
		if x == id {
			return true
		}
	}
	return false
}

func TestInviteOnlyAdminOfThatHouse(t *testing.T) {
	p, w, c := household(t)
	// X: huisgenoot van A, beheerder van een eigen huis
	x, xTok := newUserToken(t, p, "x@sandhovius.test")
	newHouse(t, p, "Huis X", []string{x}, nil)
	addMember(t, p, w.HouseA, x)

	if st, out := invite(t, p, xTok, x, w.HouseA, "nieuw@sandhovius.test", "member"); st < 400 {
		t.Errorf("huisgenoot van A nodigt uit voor A: %d %v", st, out)
	}
	// ook niet met invited_by van een ander
	if st, out := invite(t, p, xTok, w.UserA, w.HouseA, "nieuw@sandhovius.test", "member"); st < 400 {
		t.Errorf("X nodigt uit namens A: %d %v", st, out)
	}
	if ids := listIDs(t, p, p.AdminToken, "invitations"); len(ids) != 0 {
		t.Errorf("er zijn uitnodigingen gemaakt: %v", ids)
	}

	mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "nieuw@sandhovius.test", "member")
	m := decodeMail(c.wait(t, 1)[0])
	if !strings.Contains(m, "nieuw@sandhovius.test") || !strings.Contains(m, "http://pwa.test/uitnodiging") {
		t.Errorf("uitnodigingsmail mist adres of link: %s", m)
	}
}

func TestInviteRoleCheckDoesNotLeak(t *testing.T) {
	p, w, _ := household(t)
	x, xTok := newUserToken(t, p, "x@sandhovius.test")
	// X is geen beheerder van A: hetzelfde antwoord of het adres nu lid is of niet
	stMember, _ := invite(t, p, xTok, x, w.HouseA, "a@sandhovius.test", "member")
	stOther, _ := invite(t, p, xTok, x, w.HouseA, "iemand@sandhovius.test", "member")
	if stMember != stOther {
		t.Errorf("antwoord verraadt lidmaatschap: lid %d, geen lid %d", stMember, stOther)
	}
}

func TestInviteExistingMember(t *testing.T) {
	p, w, _ := household(t)
	st, out := invite(t, p, w.UserATok, w.UserA, w.HouseA, "A@Sandhovius.test", "member")
	// PocketBase zet zelf een punt achter de melding van een hookfout
	if st != 400 || out["message"] != "Al lid van dit huis." {
		t.Errorf("lid uitnodigen: %d %v (verwacht 400 \"Al lid van dit huis.\")", st, out)
	}
}

func TestInviteReplaces(t *testing.T) {
	p, w, c := household(t)
	mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "nieuw@sandhovius.test", "member")
	mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "Nieuw@sandhovius.test", "admin")
	ids := listIDs(t, p, p.AdminToken, "invitations")
	if len(ids) != 1 {
		t.Fatalf("verwacht één uitnodiging, kreeg %v", ids)
	}
	inv := getRecord(t, p, "invitations", ids[0])
	if inv["role"] != "admin" || inv["email"] != "nieuw@sandhovius.test" {
		t.Errorf("uitnodiging = %v", inv)
	}
	exp, err := time.Parse("2006-01-02 15:04:05.000Z", inv["expires"].(string))
	if err != nil || exp.Before(time.Now().Add(6*24*time.Hour)) || exp.After(time.Now().Add(8*24*time.Hour)) {
		t.Errorf("expires = %v (verwacht over 7 dagen)", inv["expires"])
	}
	if inv["house_name"] != "Huis A" || inv["inviter_name"] != "a@sandhovius.test" {
		t.Errorf("house_name/inviter_name = %v / %v", inv["house_name"], inv["inviter_name"])
	}
	c.wait(t, 2)
}

func TestInviteEmailCase(t *testing.T) {
	p, w, _ := household(t)
	id := mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "Jan@Example.nl", "member")
	jan, janTok := verifiedUser(t, p, "jan@example.nl")
	if ids := listIDs(t, p, janTok, "invitations"); len(ids) != 1 || ids[0] != id {
		t.Errorf("genodigde ziet %v, verwacht %s", ids, id)
	}
	if st, out := accept(t, p, janTok, id); st != 200 || out["house"] != w.HouseA {
		t.Fatalf("accepteren: %d %v", st, out)
	}
	if members, _ := membersOf(t, p, w.HouseA); !hasID(members, jan) {
		t.Errorf("jan is geen lid: %v", members)
	}
}

func TestInviteMailEscapes(t *testing.T) {
	p, w, c := household(t)
	if st, out := p.do(t, p.AdminToken, "PATCH", "/api/collections/houses/records/"+w.HouseA,
		map[string]any{"name": "<b>Thuis</b>"}); st != 200 {
		t.Fatalf("hernoemen: %d %v", st, out)
	}
	if st, out := p.do(t, p.AdminToken, "PATCH", "/api/collections/users/records/"+w.UserA,
		map[string]any{"name": "<script>x</script>"}); st != 200 {
		t.Fatalf("naam: %d %v", st, out)
	}
	mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "nieuw@sandhovius.test", "member")
	// alleen het HTML-deel: onderwerp en platte tekst zijn geen HTML
	m := decodeMail(c.wait(t, 1)[0])
	if i := strings.Index(m, "Content-Type: text/html"); i >= 0 {
		m = m[i:]
	} else {
		t.Fatalf("geen HTML-deel: %s", m)
	}
	if !strings.Contains(m, "&lt;b&gt;Thuis&lt;/b&gt;") || strings.Contains(m, "<b>Thuis</b>") {
		t.Errorf("huisnaam niet geëscaped: %s", m)
	}
	if strings.Contains(m, "<script>") {
		t.Errorf("naam niet geëscaped: %s", m)
	}
}

func TestAcceptRules(t *testing.T) {
	p, w, _ := household(t)
	_, otherTok := verifiedUser(t, p, "ander@sandhovius.test")
	_, unverTok := newUserToken(t, p, "onbevestigd@sandhovius.test")
	jan, janTok := verifiedUser(t, p, "jan@sandhovius.test")

	id := mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "onbevestigd@sandhovius.test", "member")
	if st, out := accept(t, p, otherTok, id); st != 404 || out["message"] != "Uitnodiging niet gevonden" {
		t.Errorf("ander adres: %d %v (verwacht 404)", st, out)
	}
	if st, out := accept(t, p, unverTok, id); st != 403 || out["message"] != "Bevestig eerst je e-mailadres" {
		t.Errorf("onbevestigd: %d %v (verwacht 403)", st, out)
	}

	id = mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "jan@sandhovius.test", "admin")
	if st, out := p.do(t, p.AdminToken, "PATCH", "/api/collections/invitations/records/"+id,
		map[string]any{"expires": "2020-01-01 00:00:00.000Z"}); st != 200 {
		t.Fatalf("verlopen maken: %d %v", st, out)
	}
	if st, out := accept(t, p, janTok, id); st != 410 || out["message"] != "Deze uitnodiging is verlopen" {
		t.Errorf("verlopen: %d %v (verwacht 410)", st, out)
	}

	id = mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "jan@sandhovius.test", "admin")
	if st, out := accept(t, p, janTok, id); st != 200 {
		t.Fatalf("geldig: %d %v", st, out)
	}
	members, admins := membersOf(t, p, w.HouseA)
	if !hasID(members, jan) || !hasID(admins, jan) || !hasID(admins, w.UserA) {
		t.Errorf("na accepteren als beheerder: members %v admins %v", members, admins)
	}
	if st, _ := p.do(t, p.AdminToken, "GET", "/api/collections/invitations/records/"+id, nil); st != 404 {
		t.Errorf("uitnodiging bestaat nog na accepteren: %d", st)
	}
}

func TestAcceptTwice(t *testing.T) {
	p, w, _ := household(t)
	jan, janTok := verifiedUser(t, p, "jan@sandhovius.test")
	id := mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "jan@sandhovius.test", "member")
	if st, out := accept(t, p, janTok, id); st != 200 {
		t.Fatalf("eerste keer: %d %v", st, out)
	}
	if st, out := accept(t, p, janTok, id); st != 404 {
		t.Errorf("tweede keer: %d %v (verwacht 404)", st, out)
	}
	members, _ := membersOf(t, p, w.HouseA)
	n := 0
	for _, m := range members {
		if m == jan {
			n++
		}
	}
	if n != 1 {
		t.Errorf("jan staat %d keer in members: %v", n, members)
	}

	// ingetrokken
	_, pietTok := verifiedUser(t, p, "piet@sandhovius.test")
	id = mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "piet@sandhovius.test", "member")
	if st, out := p.do(t, w.UserATok, "DELETE", "/api/collections/invitations/records/"+id, nil); st != 204 {
		t.Fatalf("intrekken: %d %v", st, out)
	}
	if st, out := accept(t, p, pietTok, id); st != 404 {
		t.Errorf("na intrekken: %d %v (verwacht 404)", st, out)
	}
}

func TestInviteeCanDecline(t *testing.T) {
	p, w, _ := household(t)
	_, janTok := verifiedUser(t, p, "jan@sandhovius.test")
	_, otherTok := verifiedUser(t, p, "ander@sandhovius.test")
	id := mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "jan@sandhovius.test", "member")
	if ids := listIDs(t, p, otherTok, "invitations"); len(ids) != 0 {
		t.Errorf("een ander ziet de uitnodiging: %v", ids)
	}
	if st, _ := p.do(t, otherTok, "DELETE", "/api/collections/invitations/records/"+id, nil); st < 400 {
		t.Errorf("een ander verwijdert de uitnodiging: %d", st)
	}
	if st, out := p.do(t, janTok, "DELETE", "/api/collections/invitations/records/"+id, nil); st != 204 {
		t.Errorf("weigeren: %d %v", st, out)
	}
}

func TestMembersEndpoint(t *testing.T) {
	p, w, _ := household(t)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)
	_, xTok := newUserToken(t, p, "x@sandhovius.test")

	st, out := p.do(t, mTok, "GET", "/api/sandhovius/houses/"+w.HouseA+"/members", nil)
	if st != 200 {
		t.Fatalf("leden: %d %v", st, out)
	}
	items, _ := out["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("leden = %v", items)
	}
	first := items[0].(map[string]any)
	second := items[1].(map[string]any)
	if first["id"] != w.UserA || first["role"] != "admin" || first["email"] != "a@sandhovius.test" {
		t.Errorf("eerste lid = %v (verwacht beheerder A)", first)
	}
	if second["id"] != m || second["role"] != "member" || second["email"] != "huisgenoot@sandhovius.test" {
		t.Errorf("tweede lid = %v", second)
	}
	if st, _ := p.do(t, xTok, "GET", "/api/sandhovius/houses/"+w.HouseA+"/members", nil); st != 404 {
		t.Errorf("niet-lid: %d (verwacht 404)", st)
	}
}

func TestLastAdmin(t *testing.T) {
	p, w, _ := household(t)
	path := "/api/sandhovius/houses/" + w.HouseA + "/members/" + w.UserA
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{"role": "member"}); st != 409 ||
		out["message"] != "Er moet minstens één beheerder blijven" {
		t.Errorf("laatste beheerder degraderen: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "DELETE", path, nil); st != 409 {
		t.Errorf("laatste beheerder verlaat: %d %v", st, out)
	}

	m, _ := newUserToken(t, p, "tweede@sandhovius.test")
	addMember(t, p, w.HouseA, m)
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/sandhovius/houses/"+w.HouseA+"/members/"+m,
		map[string]any{"role": "admin"}); st != 200 {
		t.Fatalf("tweede beheerder maken: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{"role": "member"}); st != 200 {
		t.Errorf("degraderen met twee beheerders: %d %v", st, out)
	}
	members, admins := membersOf(t, p, w.HouseA)
	if !hasID(members, w.UserA) || hasID(admins, w.UserA) || !hasID(admins, m) {
		t.Errorf("na degraderen: members %v admins %v", members, admins)
	}
}

func TestUnknownRole(t *testing.T) {
	p, w, _ := household(t)
	path := "/api/sandhovius/houses/" + w.HouseA + "/members/" + w.UserA
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{"role": "eigenaar"}); st != 400 {
		t.Errorf("onbekende rol: %d %v (verwacht 400)", st, out)
	}
}

func TestLeaveCleansFavorites(t *testing.T) {
	p, w, _ := household(t)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)
	houseX := newHouse(t, p, "Huis X", []string{m}, nil)
	devX := p.create(t, "devices", map[string]any{"gateway": houseX, "entity_id": "light.x", "name": "x", "type": "light"})
	favA := p.create(t, "favorites", map[string]any{"user": m, "device": w.DevA, "order": 1})
	favX := p.create(t, "favorites", map[string]any{"user": m, "device": devX, "order": 1})
	favOwner := p.create(t, "favorites", map[string]any{"user": w.UserA, "device": w.DevA, "order": 1})

	if st, out := p.do(t, mTok, "DELETE", "/api/sandhovius/houses/"+w.HouseA+"/members/"+m, nil); st != 204 {
		t.Fatalf("verlaten: %d %v", st, out)
	}
	if members, _ := membersOf(t, p, w.HouseA); hasID(members, m) {
		t.Errorf("nog lid na verlaten: %v", members)
	}
	ids := listIDs(t, p, p.AdminToken, "favorites")
	if contains(ids, favA) || !contains(ids, favX) || !contains(ids, favOwner) {
		t.Errorf("favorieten na verlaten: %v (weg: %s, blijven: %s %s)", ids, favA, favX, favOwner)
	}
	if got := listIDs(t, p, mTok, "devices"); len(got) != 1 || got[0] != devX {
		t.Errorf("na verlaten ziet huisgenoot devices %v", got)
	}
}

func TestHousemateCannotManage(t *testing.T) {
	p, w, _ := household(t)
	m, mTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, m)
	n := newUser(t, p, "derde@sandhovius.test")
	addMember(t, p, w.HouseA, n)
	_, xTok := newUserToken(t, p, "x@sandhovius.test")

	for _, target := range []string{w.UserA, n} {
		full := "/api/sandhovius/houses/" + w.HouseA + "/members/" + target
		if st, out := p.do(t, mTok, "PATCH", full, map[string]any{"role": "member"}); st != 404 {
			t.Errorf("huisgenoot wijzigt rol van %s: %d %v", target, st, out)
		}
		if st, out := p.do(t, mTok, "DELETE", full, nil); st != 404 {
			t.Errorf("huisgenoot verwijdert %s: %d %v", target, st, out)
		}
	}
	if st, out := p.do(t, mTok, "PATCH", "/api/sandhovius/houses/"+w.HouseA+"/members/"+m,
		map[string]any{"role": "admin"}); st != 404 {
		t.Errorf("huisgenoot maakt zichzelf beheerder: %d %v", st, out)
	}
	// niet-lid mag niets
	if st, _ := p.do(t, xTok, "DELETE", "/api/sandhovius/houses/"+w.HouseA+"/members/"+w.UserA, nil); st != 404 {
		t.Errorf("niet-lid verwijdert beheerder: %d", st)
	}
	members, admins := membersOf(t, p, w.HouseA)
	if len(members) != 3 || len(admins) != 1 {
		t.Errorf("lidmaatschap veranderd: members %v admins %v", members, admins)
	}
}

// De uitnodiging in de opmaak van de app: kaartje met huis en rol, een knop,
// en ook een platte-tekstversie.
func TestInviteMailLayout(t *testing.T) {
	p, w, c := household(t)
	mustInvite(t, p, w.UserATok, w.UserA, w.HouseA, "nieuw@sandhovius.test", "admin")
	m := decodeMail(c.wait(t, 1)[0])
	for _, want := range []string{"text/plain", "text/html", "Als beheerder", "Verloopt over 7 dagen", "Uitnodiging bekijken", "border-radius:28px"} {
		if !strings.Contains(m, want) {
			t.Errorf("%q ontbreekt in de mail", want)
		}
	}
}

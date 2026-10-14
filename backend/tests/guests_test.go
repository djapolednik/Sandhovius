//go:build integration

// Gast met een einddatum (spec 2026-10-14-guests-design.md, D2): een
// uitnodiging met until/ends maakt een gast die alleen bedient; de cron haalt
// hem na de einddatum weg, met dezelfde opruiming als vertrekken.
package tests

import (
	"strings"
	"testing"
	"time"
)

func guestInvite(t *testing.T, p *pb, w world, email, role, until string, ends time.Time) (int, map[string]any) {
	t.Helper()
	return p.do(t, w.UserATok, "POST", "/api/collections/invitations/records", map[string]any{
		"house": w.HouseA, "email": email, "role": role, "invited_by": w.UserA,
		"until": until, "ends": ends.UTC().Format("2006-01-02 15:04:05.000Z"),
	})
}

func TestGuestInvitation(t *testing.T) {
	p, w, mail := household(t)
	tomorrow := time.Now().Add(24 * time.Hour)

	for name, c := range map[string]struct {
		role string
		ends time.Time
	}{
		"gast als beheerder":    {"admin", tomorrow},
		"einde in het verleden": {"member", time.Now().Add(-time.Hour)},
		"langer dan een jaar":   {"member", time.Now().Add(400 * 24 * time.Hour)},
	} {
		if st, out := guestInvite(t, p, w, "fout@sandhovius.test", c.role, "2026-10-20", c.ends); st != 400 || out["code"] != "invalid_until" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}

	st, out := guestInvite(t, p, w, "oppas@sandhovius.test", "member", "2026-10-20", tomorrow)
	if st != 200 {
		t.Fatalf("gast uitnodigen: %d %v", st, out)
	}
	if msgs := mail.wait(t, 1); !strings.Contains(msgs[len(msgs)-1], "Als gast, tot en met 20 oktober 2026") {
		t.Errorf("mail zegt niets over de einddatum: %s", msgs[len(msgs)-1])
	}

	oppas, oppasTok := verifiedUser(t, p, "oppas@sandhovius.test")
	if st, out := accept(t, p, oppasTok, out["id"].(string)); st != 200 {
		t.Fatalf("gast accepteert: %d %v", st, out)
	}
	h := p.houseRecord(t, w.HouseA)
	if !hasID(h["members"].([]any), oppas) || !hasID(h["operate_only"].([]any), oppas) {
		t.Errorf("gast is geen lid op alleen bedienen: %v %v", h["members"], h["operate_only"])
	}
	_, list := p.do(t, w.UserATok, "GET", "/api/sandhovius/houses/"+w.HouseA+"/members", nil)
	found := false
	for _, raw := range list["items"].([]any) {
		m := raw.(map[string]any)
		if m["id"] == oppas {
			found = m["until"] == "2026-10-20" && m["can_edit"] == false
		}
	}
	if !found {
		t.Errorf("ledenlijst zonder einddatum voor de gast: %v", list["items"])
	}
	// Niemand schrijft zelf in guests.
	if st, _ := p.do(t, w.UserATok, "POST", "/api/collections/guests/records",
		map[string]any{"house": w.HouseA, "user": w.UserA, "until": "2030-01-01", "ends": "2030-01-01 22:59:59.000Z"}); st < 400 {
		t.Errorf("beheerder maakt zelf een gast: %d", st)
	}
	if ids := listIDs(t, p, oppasTok, "guests"); len(ids) != 1 {
		t.Errorf("gast ziet zijn einddatum niet: %v", ids)
	}

	// Beheerder maken: de einddatum vervalt.
	if st, out := p.do(t, w.UserATok, "PATCH", "/api/sandhovius/houses/"+w.HouseA+"/members/"+oppas, map[string]any{"role": "admin"}); st != 200 {
		t.Fatalf("gast wordt beheerder: %d %v", st, out)
	}
	if ids := listIDs(t, p, p.AdminToken, "guests"); len(ids) != 0 {
		t.Errorf("beheerder heeft nog een einddatum: %v", ids)
	}
}

func TestGuestExpires(t *testing.T) {
	p, w, _ := household(t)
	st, out := guestInvite(t, p, w, "logee@sandhovius.test", "member", "2026-10-20", time.Now().Add(time.Hour))
	if st != 200 {
		t.Fatalf("gast uitnodigen: %d %v", st, out)
	}
	logee, logeeTok := verifiedUser(t, p, "logee@sandhovius.test")
	if st, out := accept(t, p, logeeTok, out["id"].(string)); st != 200 {
		t.Fatalf("gast accepteert: %d %v", st, out)
	}
	if st, out := p.do(t, logeeTok, "POST", "/api/collections/favorites/records", map[string]any{"user": logee, "device": w.DevA, "order": 0}); st != 200 {
		t.Fatalf("gast zet een favoriet: %d %v", st, out)
	}
	// De einddatum is voorbij (de superuser zet hem terug in de tijd).
	guests := listIDs(t, p, p.AdminToken, "guests")
	if len(guests) != 1 {
		t.Fatalf("geen gast: %v", guests)
	}
	past := time.Now().Add(-time.Minute).UTC().Format("2006-01-02 15:04:05.000Z")
	if st, out := p.do(t, p.AdminToken, "PATCH", "/api/collections/guests/records/"+guests[0], map[string]any{"ends": past}); st != 200 {
		t.Fatalf("einddatum verzetten: %d %v", st, out)
	}
	// De cron draait elke minuut.
	deadline := time.Now().Add(80 * time.Second)
	for time.Now().Before(deadline) {
		if !hasID(p.houseRecord(t, w.HouseA)["members"].([]any), logee) {
			break
		}
		time.Sleep(2 * time.Second)
	}
	h := p.houseRecord(t, w.HouseA)
	if hasID(h["members"].([]any), logee) || hasID(h["operate_only"].([]any), logee) {
		t.Fatalf("verlopen gast is nog lid: %v %v", h["members"], h["operate_only"])
	}
	if ids := listIDs(t, p, p.AdminToken, "favorites"); len(ids) != 0 {
		t.Errorf("favorieten van de verlopen gast blijven: %v", ids)
	}
	if ids := listIDs(t, p, p.AdminToken, "guests"); len(ids) != 0 {
		t.Errorf("gast-record blijft: %v", ids)
	}
	if st, _ := p.do(t, logeeTok, "GET", "/api/collections/houses/records/"+w.HouseA, nil); st < 400 {
		t.Errorf("verlopen gast ziet het huis nog: %d", st)
	}
}

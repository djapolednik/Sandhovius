//go:build integration

// Koppelen: een lid opent een sessie in zijn huis, de box schrijft wat hij
// vindt, een lid kiest en geeft een naam. Eén open sessie per huis.
package tests

import "testing"

const (
	sessionsPath   = "/api/collections/pairing_sessions/records"
	candidatesPath = "/api/collections/pairing_candidates/records"
)

func startSession(t *testing.T, p *pb, tok, house string) (int, map[string]any) {
	t.Helper()
	return p.do(t, tok, "POST", sessionsPath, map[string]any{"house": house, "kind": "light", "status": "starting"})
}

func TestMemberStartsSession(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	st, out := startSession(t, p, w.UserATok, w.HouseA)
	if st != 200 {
		t.Fatalf("lid start een sessie: %d %v", st, out)
	}
	if out["created_by"] != w.UserA {
		t.Errorf("created_by = %v, verwacht %s", out["created_by"], w.UserA)
	}
	if st, out := startSession(t, p, w.UserATok, w.HouseB); st < 400 {
		t.Errorf("lid start een sessie in een ander huis: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "POST", sessionsPath,
		map[string]any{"house": w.HouseA, "kind": "light", "status": "open"}); st < 400 {
		t.Errorf("lid start een sessie als open: %d %v", st, out)
	}
}

func TestOneOpenSessionPerHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, first := startSession(t, p, w.UserATok, w.HouseA)
	for _, status := range []string{"starting", "open", "waiting_button"} {
		if st, out := p.do(t, p.AdminToken, "PATCH", sessionsPath+"/"+first["id"].(string), map[string]any{"status": status}); st != 200 {
			t.Fatalf("status %s zetten: %d %v", status, st, out)
		}
		st, out := startSession(t, p, w.UserATok, w.HouseA)
		if st != 400 || out["code"] != "session_open" {
			t.Errorf("tweede sessie naast %s: %d %v", status, st, out)
		}
	}
	p.do(t, w.UserATok, "PATCH", sessionsPath+"/"+first["id"].(string), map[string]any{"status": "closed"})
	if st, out := startSession(t, p, w.UserATok, w.HouseA); st != 200 {
		t.Errorf("nieuwe sessie na sluiten: %d %v", st, out)
	}
}

func TestMemberSessionFields(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, s := startSession(t, p, w.UserATok, w.HouseA)
	path := sessionsPath + "/" + s["id"].(string)
	for _, body := range []map[string]any{{"extend": true}, {"button_pressed": true}, {"status": "closed"}} {
		if st, out := p.do(t, w.UserATok, "PATCH", path, body); st != 200 {
			t.Errorf("lid zet %v: %d %v", body, st, out)
		}
	}
	for _, body := range []map[string]any{
		{"status": "open"}, {"expires": "2031-01-01 00:00:00.000Z"}, {"error": "x"}, {"kind": "sensor"}, {"house": w.HouseB},
	} {
		if st, out := p.do(t, w.UserATok, "PATCH", path, body); st < 400 {
			t.Errorf("lid zet %v: %d %v", body, st, out)
		}
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{
		"status": "open", "expires": "2031-01-01 00:00:00.000Z", "extend": false}); st != 200 {
		t.Errorf("box opent de sessie: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxBTok, "PATCH", path, map[string]any{"status": "failed"}); st < 400 {
		t.Errorf("box B wijzigt een sessie van huis A: %d %v", st, out)
	}
}

func candidate(session string) map[string]any {
	return map[string]any{
		"session": session, "source": "zigbee", "address": "0x00158d0001", "type": "light",
		"capabilities": []string{"onoff"}, "model": "LED1836G9", "status": "found"}
}

func TestBoxWritesCandidates(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, s := startSession(t, p, w.UserATok, w.HouseA)
	if st, out := p.do(t, w.BoxATok, "POST", candidatesPath, candidate(s["id"].(string))); st != 200 {
		t.Errorf("box A schrijft een candidate: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxBTok, "POST", candidatesPath, candidate(s["id"].(string))); st < 400 {
		t.Errorf("box B schrijft een candidate in huis A: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "POST", candidatesPath, candidate(s["id"].(string))); st < 400 {
		t.Errorf("lid schrijft een candidate: %d %v", st, out)
	}
}

func TestMemberCandidateFields(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, s := startSession(t, p, w.UserATok, w.HouseA)
	_, c := p.do(t, w.BoxATok, "POST", candidatesPath, candidate(s["id"].(string)))
	path := candidatesPath + "/" + c["id"].(string)
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{
		"identify": 1, "name": "Gang", "room": w.roomA, "add": true}); st != 200 {
		t.Errorf("lid kiest de candidate: %d %v", st, out)
	}
	for _, body := range []map[string]any{
		{"status": "added"}, {"address": "0x2"}, {"device": w.DevA}, {"type": "sensor"}, {"room": w.roomB},
	} {
		if st, out := p.do(t, w.UserATok, "PATCH", path, body); st < 400 {
			t.Errorf("lid zet %v: %d %v", body, st, out)
		}
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"status": "added", "device": w.DevA}); st != 200 {
		t.Errorf("box rondt de candidate af: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"name": "Box"}); st < 400 {
		t.Errorf("box zet de naam: %d %v", st, out)
	}
}

func TestOtherHouseSeesNothing(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	_, s := startSession(t, p, w.UserATok, w.HouseA)
	p.do(t, w.BoxATok, "POST", candidatesPath, candidate(s["id"].(string)))
	_, outsiderTok := newUserToken(t, p, "buiten@sandhovius.test")
	for _, c := range []string{"pairing_sessions", "pairing_candidates"} {
		if ids := listIDs(t, p, outsiderTok, c); len(ids) != 0 {
			t.Errorf("buitenstaander ziet %s: %v", c, ids)
		}
		if ids := listIDs(t, p, w.BoxBTok, c); len(ids) != 0 {
			t.Errorf("box B ziet %s: %v", c, ids)
		}
		if ids := listIDs(t, p, w.UserATok, c); len(ids) != 1 {
			t.Errorf("lid A ziet in %s %v, verwacht 1", c, ids)
		}
	}
}

//go:build integration

package tests

import "testing"

const boxPw = "geheim-123456"

func newBox(t *testing.T, p *pb, serial string) string {
	t.Helper()
	return p.create(t, "boxes", map[string]any{"serial": serial, "password": boxPw, "passwordConfirm": boxPw})
}

func newUser(t *testing.T, p *pb, email string) string {
	t.Helper()
	return p.create(t, "users", map[string]any{"email": email, "password": boxPw, "passwordConfirm": boxPw})
}

func TestBoxLogsInWithSerial(t *testing.T) {
	p := startPB(t)
	newBox(t, p, "SH-T-1")
	status, out := p.do(t, "", "POST", "/api/collections/boxes/auth-with-password",
		map[string]any{"identity": "SH-T-1", "password": boxPw})
	if status != 200 || out["token"] == "" {
		t.Fatalf("box kan niet inloggen: %d %v", status, out)
	}
	rec, _ := out["record"].(map[string]any)
	if rec["house"] != "" {
		t.Fatalf("nieuwe box hoort geen huis te hebben, kreeg %v", rec["house"])
	}
}

func TestBoxSeesOnlyItself(t *testing.T) {
	p := startPB(t)
	id1 := newBox(t, p, "SH-T-1")
	newBox(t, p, "SH-T-2")
	tok := p.login(t, "boxes", "SH-T-1", boxPw)
	status, out := p.do(t, tok, "GET", "/api/collections/boxes/records", nil)
	items, _ := out["items"].([]any)
	if status != 200 || len(items) != 1 {
		t.Fatalf("box hoort alleen zichzelf te zien: %d %v", status, out)
	}
	if items[0].(map[string]any)["id"] != id1 {
		t.Fatalf("box ziet een andere box: %v", items[0])
	}
}

func TestUserCannotSeeBoxes(t *testing.T) {
	p := startPB(t)
	newBox(t, p, "SH-T-1")
	newUser(t, p, "bewoner@sandhovius.test")
	tok := p.login(t, "users", "bewoner@sandhovius.test", boxPw)
	status, out := p.do(t, tok, "GET", "/api/collections/boxes/records", nil)
	items, _ := out["items"].([]any)
	if status != 403 && len(items) != 0 {
		t.Fatalf("bewoner ziet boxen: %d %v", status, out)
	}
}

func TestBoxCannotUpdateItself(t *testing.T) {
	p := startPB(t)
	id := newBox(t, p, "SH-T-1")
	tok := p.login(t, "boxes", "SH-T-1", boxPw)
	status, out := p.do(t, tok, "PATCH", "/api/collections/boxes/records/"+id, map[string]any{"house": "x"})
	if status < 400 {
		t.Fatalf("box mag zichzelf niet wijzigen: %d %v", status, out)
	}
}

func TestClaimedAtIsPlainDate(t *testing.T) {
	p := startPB(t)
	uid := newUser(t, p, "bewoner@sandhovius.test")
	hid := p.create(t, "houses", map[string]any{"name": "Testhuis", "user": uid})
	_, house := p.do(t, p.AdminToken, "GET", "/api/collections/houses/records/"+hid, nil)
	if house["claimed_at"] != "" {
		t.Fatalf("claimed_at hoort leeg te zijn, kreeg %v", house["claimed_at"])
	}
}

func TestBoxLoginRateLimited(t *testing.T) {
	p := startPB(t)
	newBox(t, p, "SH-T-1")
	limited := false
	for i := 0; i < 11; i++ {
		status, _ := p.do(t, "", "POST", "/api/collections/boxes/auth-with-password",
			map[string]any{"identity": "SH-T-1", "password": "fout"})
		if status == 429 {
			limited = true
		}
	}
	if !limited {
		t.Fatal("11 foute box-logins binnen een minuut gaven nooit een 429")
	}
}

func TestUserLoginStillWorksWithRateLimits(t *testing.T) {
	p := startPB(t)
	newUser(t, p, "bewoner@sandhovius.test")
	for i := 0; i < 2; i++ {
		status, out := p.do(t, "", "POST", "/api/collections/users/auth-with-password",
			map[string]any{"identity": "bewoner@sandhovius.test", "password": boxPw})
		if status != 200 {
			t.Fatalf("bewoner-login %d gaf %d: %v", i+1, status, out)
		}
	}
}

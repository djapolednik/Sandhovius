//go:build integration

// Meldingen (spec 2026-10-14-notifications-design.md): de box schrijft zijn
// publieke sleutel op het huis, bewoners hun eigen aanmeldingen en Meld
// dit-regels; de box leest ze en ruimt verlopen aanmeldingen op.
package tests

import "testing"

const (
	subscriptionsPath = "/api/collections/push_subscriptions/records"
	notifyRulesPath   = "/api/collections/notification_rules/records"
)

func TestPushKeyOnlyBox(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	house := "/api/collections/houses/records/" + w.HouseA
	if st, out := p.do(t, w.BoxATok, "PATCH", house, map[string]any{"push_key": "BOXKEY"}); st != 200 {
		t.Fatalf("box zet push_key: %d %v", st, out)
	}
	if st, _ := p.do(t, w.UserATok, "PATCH", house, map[string]any{"push_key": "NEP"}); st < 400 {
		t.Errorf("bewoner zet push_key: %d", st)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", house, map[string]any{"name": "Thuis"}); st != 200 {
		t.Errorf("beheerder hernoemt het huis niet meer: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "GET", house, nil); st != 200 || out["push_key"] != "BOXKEY" {
		t.Errorf("bewoner leest push_key: %d %v", st, out["push_key"])
	}
}

func TestPushSubscriptionRights(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	sanne, sanneTok := newUserToken(t, p, "sanne@sandhovius.test")
	addMember(t, p, w.HouseA, sanne)
	sub := func(user, endpoint string) map[string]any {
		return map[string]any{"house": w.HouseA, "user": user, "endpoint": endpoint,
			"p256dh": "BPk", "auth": "au", "key": "BOXKEY", "language": "nl"}
	}
	st, out := p.do(t, w.UserATok, "POST", subscriptionsPath, sub(w.UserA, "https://push.example/a"))
	if st != 200 {
		t.Fatalf("eigen aanmelding: %d %v", st, out)
	}
	id := out["id"].(string)
	if st, _ := p.do(t, w.UserATok, "POST", subscriptionsPath, sub(sanne, "https://push.example/b")); st < 400 {
		t.Errorf("aanmelding voor een ander: %d", st)
	}
	if st, _ := p.do(t, w.UserATok, "POST", subscriptionsPath, sub(w.UserA, "https://push.example/a")); st < 400 {
		t.Errorf("zelfde endpoint twee keer: %d", st)
	}
	if st, _ := p.do(t, sanneTok, "GET", subscriptionsPath+"/"+id, nil); st < 400 {
		t.Errorf("huisgenoot ziet andermans aanmelding: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "GET", subscriptionsPath+"/"+id, nil); st != 200 {
		t.Errorf("box leest de aanmelding niet: %d", st)
	}
	if st, _ := p.do(t, w.BoxBTok, "GET", subscriptionsPath+"/"+id, nil); st < 400 {
		t.Errorf("box van een ander huis leest de aanmelding: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "PATCH", subscriptionsPath+"/"+id, map[string]any{"key": "X"}); st < 400 {
		t.Errorf("box wijzigt de aanmelding: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "DELETE", subscriptionsPath+"/"+id, nil); st != 204 {
		t.Errorf("box ruimt een verlopen aanmelding niet op: %d", st)
	}
}

func TestNotificationRules(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	sanne, sanneTok := newUserToken(t, p, "sanne@sandhovius.test")
	addMember(t, p, w.HouseA, sanne)
	rule := func(extra map[string]any) map[string]any {
		body := map[string]any{"house": w.HouseA, "user": w.UserA, "device": w.Door, "event": "open", "enabled": true}
		for k, v := range extra {
			body[k] = v
		}
		return body
	}
	st, out := p.do(t, w.UserATok, "POST", notifyRulesPath, rule(map[string]any{"nobody_home": true, "from": "22:00", "to": "07:00"}))
	if st != 200 {
		t.Fatalf("Meld dit: %d %v", st, out)
	}
	id := out["id"].(string)
	if st, out := p.do(t, w.UserATok, "POST", notifyRulesPath, rule(map[string]any{"device": w.Thermo, "event": "motion"})); st != 200 {
		t.Errorf("beweging melden: %d %v", st, out)
	}
	bad := map[string]map[string]any{
		"deur meldt geen beweging": {"event": "motion"},
		"lamp is geen sensor":      {"device": w.DevA},
		"apparaat van ander huis":  {"device": w.DevB},
		"alleen van":               {"device": w.Thermo, "event": "motion", "from": "22:00"},
		"van gelijk aan tot":       {"device": w.Thermo, "event": "motion", "from": "22:00", "to": "22:00"},
	}
	for name, extra := range bad {
		st, out := p.do(t, w.UserATok, "POST", notifyRulesPath, rule(extra))
		if st != 400 || out["code"] != "invalid_notification_rule" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
	if st, _ := p.do(t, w.UserATok, "POST", notifyRulesPath, rule(map[string]any{"user": sanne})); st < 400 {
		t.Errorf("Meld dit voor een ander: %d", st)
	}
	if st, _ := p.do(t, sanneTok, "PATCH", notifyRulesPath+"/"+id, map[string]any{"enabled": false}); st < 400 {
		t.Errorf("huisgenoot wijzigt andermans regel: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "GET", notifyRulesPath+"/"+id, nil); st != 200 {
		t.Errorf("box leest de regel niet: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "DELETE", notifyRulesPath+"/"+id, nil); st < 400 {
		t.Errorf("box verwijdert een regel: %d", st)
	}
}

func TestRoutineNotifyAction(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	outsider, _ := newUserToken(t, p, "vreemd@sandhovius.test")
	notify := func(a map[string]any) map[string]any {
		return w.routine(map[string]any{"actions": []any{a}})
	}
	if st, out := p.do(t, w.UserATok, "POST", automationsPath, notify(map[string]any{"kind": "notify", "text": "Wasmachine klaar"})); st != 200 {
		t.Errorf("melding aan iedereen: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "POST", automationsPath, notify(map[string]any{"kind": "notify", "text": "Deur", "users": []string{w.UserA}})); st != 200 {
		t.Errorf("melding aan een lid: %d %v", st, out)
	}
	long := ""
	for i := 0; i < 81; i++ {
		long += "x"
	}
	for name, a := range map[string]map[string]any{
		"lege tekst":   {"kind": "notify", "text": "  "},
		"te lang":      {"kind": "notify", "text": long},
		"aan geen lid": {"kind": "notify", "text": "Hoi", "users": []string{outsider}},
	} {
		st, out := p.do(t, w.UserATok, "POST", automationsPath, notify(a))
		if st != 400 || out["code"] != "invalid_automation" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
}

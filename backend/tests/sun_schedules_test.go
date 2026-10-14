//go:build integration

// Zon in schema's (spec 2026-10-14-sun-schedules-design.md): een schema loopt
// op een tijd of bij zonsopkomst/-ondergang met een verschuiving. De box
// schrijft wanneer het de volgende keer loopt (next_run).
package tests

import "testing"

const schedulesPath = "/api/collections/schedules/records"

func scheduleBody(w world, extra map[string]any) map[string]any {
	body := map[string]any{"house": w.HouseA, "scene": w.SceneA, "days": []string{"mon"}, "enabled": true}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

func TestSunSchedule(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	ok := []map[string]any{
		{"time": "07:30"}, // zonder trigger: een tijd, zoals altijd
		{"trigger": "time", "time": "23:00"},
		{"trigger": "sunset"},
		{"trigger": "sunrise", "offset_min": -30},
		{"trigger": "sunset", "offset_min": 120},
	}
	for _, extra := range ok {
		if st, out := p.do(t, w.UserATok, "POST", schedulesPath, scheduleBody(w, extra)); st != 200 {
			t.Errorf("%v: %d %v", extra, st, out)
		}
	}
	bad := []map[string]any{
		{},                                      // tijd zonder tijd
		{"trigger": "time"},                     // idem
		{"trigger": "sunset", "time": "18:00"},  // zon met een tijd
		{"trigger": "time", "time": "08:00", "offset_min": 15},
	}
	for _, extra := range bad {
		st, out := p.do(t, w.UserATok, "POST", schedulesPath, scheduleBody(w, extra))
		if st != 400 || out["code"] != "invalid_schedule_time" {
			t.Errorf("%v: %d %v", extra, st, out)
		}
	}
	if st, out := p.do(t, w.UserATok, "POST", schedulesPath, scheduleBody(w, map[string]any{"trigger": "sunset", "offset_min": 180})); st != 400 {
		t.Errorf("verschuiving van 3 uur: %d %v", st, out)
	}
	// van tijd naar zon in één keer: tijd leeg
	if st, out := p.do(t, w.UserATok, "PATCH", schedulesPath+"/"+w.SchedA,
		map[string]any{"trigger": "sunrise", "time": "", "offset_min": 15}); st != 200 {
		t.Errorf("schema naar zonsopkomst: %d %v", st, out)
	}
}

func TestNextRunIsForTheBox(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	when := "2031-01-02 17:04:00.000Z"
	if st, out := p.do(t, w.UserATok, "PATCH", schedulesPath+"/"+w.SchedA, map[string]any{"next_run": when}); st < 400 {
		t.Errorf("bewoner zet next_run: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "POST", schedulesPath, scheduleBody(w, map[string]any{"time": "08:00", "next_run": when})); st < 400 {
		t.Errorf("bewoner maakt een schema met next_run: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", schedulesPath+"/"+w.SchedA, map[string]any{"next_run": when, "last_error": "no_location"}); st != 200 {
		t.Errorf("box zet next_run: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", schedulesPath+"/"+w.SchedA, map[string]any{"trigger": "sunset"}); st < 400 {
		t.Errorf("box zet trigger: %d %v", st, out)
	}
}

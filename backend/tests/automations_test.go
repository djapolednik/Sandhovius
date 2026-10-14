//go:build integration

// Routines (spec 2026-10-14-routines-design.md): leden van het huis beheren
// ze; starter, voorwaarden en acties zijn JSON uit een gesloten lijst, en de
// hook controleert soorten, apparaten en scènes uit het eigen huis en grenzen.
// last_run, last_error en next_run schrijft alleen de box.
package tests

import "testing"

const automationsPath = "/api/collections/automations/records"

type routineWorld struct {
	world
	Door, Thermo, LampB string
}

func routineFixture(t *testing.T, p *pb) routineWorld {
	t.Helper()
	w := routineWorld{world: fixture(t, p)}
	w.Door = p.create(t, "devices", map[string]any{"gateway": w.HouseA, "name": "Voordeur", "type": "sensor",
		"capabilities": []string{"contact", "battery"}, "online": true})
	w.Thermo = p.create(t, "devices", map[string]any{"gateway": w.HouseA, "name": "Gang", "type": "sensor",
		"capabilities": []string{"occupancy", "temperature"}, "online": true})
	return w
}

func (w routineWorld) routine(extra map[string]any) map[string]any {
	body := map[string]any{
		"house":      w.HouseA,
		"enabled":    true,
		"starter":    map[string]any{"kind": "sensor", "device": w.Door, "event": "open"},
		"conditions": []any{map[string]any{"kind": "dark"}},
		"actions":    []any{map[string]any{"kind": "device", "device": w.DevA, "action": "turn_on"}},
		"off_after":  5,
	}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

func TestRoutineValid(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	ok := []map[string]any{
		{},
		{"starter": map[string]any{"kind": "time", "time": "07:00", "days": []string{"mon", "tue"}}},
		{"starter": map[string]any{"kind": "sun", "event": "sunset", "offset_min": -30, "days": []string{"sun"}}},
		{"starter": map[string]any{"kind": "device", "device": w.DevA, "to": "off"},
			"actions": []any{map[string]any{"kind": "scene", "scene": w.SceneA}}},
		{"starter": map[string]any{"kind": "sensor", "device": w.Thermo, "event": "below", "value": 18.5}},
		{"starter": map[string]any{"kind": "sensor", "device": w.Thermo, "event": "motion"},
			"conditions": []any{map[string]any{"kind": "between", "from": "22:00", "to": "06:00"},
				map[string]any{"kind": "days", "days": []string{"sat", "sun"}}}},
		{"actions": []any{map[string]any{"kind": "device", "device": w.DevA, "action": "turn_on",
			"payload": map[string]any{"brightness_pct": 30, "color_temp_kelvin": 2700}}}, "off_after": 0},
	}
	for i, extra := range ok {
		if st, out := p.do(t, w.UserATok, "POST", automationsPath, w.routine(extra)); st != 200 {
			t.Errorf("geldig %d %v: %d %v", i, extra, st, out)
		}
	}
}

func TestRoutineInvalid(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	bad := map[string]map[string]any{
		"onbekende starter":       {"starter": map[string]any{"kind": "webhook"}},
		"sensor kan dat niet":     {"starter": map[string]any{"kind": "sensor", "device": w.Door, "event": "motion"}},
		"lamp als sensor":         {"starter": map[string]any{"kind": "sensor", "device": w.DevA, "event": "open"}},
		"apparaat van ander huis": {"actions": []any{map[string]any{"kind": "device", "device": w.DevB, "action": "turn_on"}}},
		"scène van ander huis":    {"actions": []any{map[string]any{"kind": "scene", "scene": w.SceneB}}},
		"geen acties":             {"actions": []any{}},
		"te veel acties": {"actions": func() []any {
			out := []any{}
			for i := 0; i < 11; i++ {
				out = append(out, map[string]any{"kind": "device", "device": w.DevA, "action": "turn_off"})
			}
			return out
		}()},
		"vrije service":        {"actions": []any{map[string]any{"kind": "device", "device": w.DevA, "action": "lock"}}},
		"onbekende payload":    {"actions": []any{map[string]any{"kind": "device", "device": w.DevA, "action": "turn_on", "payload": map[string]any{"flash": "long"}}}},
		"verkeerde tijd":       {"starter": map[string]any{"kind": "time", "time": "25:00", "days": []string{"mon"}}},
		"geen dagen":           {"starter": map[string]any{"kind": "time", "time": "07:00", "days": []string{}}},
		"te ver van de zon":    {"starter": map[string]any{"kind": "sun", "event": "sunset", "offset_min": 300, "days": []string{"mon"}}},
		"temperatuur te hoog":  {"starter": map[string]any{"kind": "sensor", "device": w.Thermo, "event": "above", "value": 80}},
		"onbekende voorwaarde": {"conditions": []any{map[string]any{"kind": "raining"}}},
		"daarna uit 7":         {"off_after": 7},
	}
	for name, extra := range bad {
		st, out := p.do(t, w.UserATok, "POST", automationsPath, w.routine(extra))
		if st != 400 || out["code"] != "invalid_automation" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
}

func TestRoutineRights(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	st, out := p.do(t, w.UserATok, "POST", automationsPath, w.routine(nil))
	if st != 200 {
		t.Fatalf("lid maakt een routine: %d %v", st, out)
	}
	id := out["id"].(string)
	userBTok := p.login(t, "users", "b@sandhovius.test", boxPw)
	when := "2031-01-02 03:04:05.000Z"
	if st, _ := p.do(t, userBTok, "GET", automationsPath+"/"+id, nil); st < 400 {
		t.Errorf("lid van een ander huis ziet de routine: %d", st)
	}
	if st, out := p.do(t, userBTok, "POST", automationsPath, w.routine(map[string]any{"actions": []any{map[string]any{"kind": "scene", "scene": w.SceneA}}})); st < 400 {
		t.Errorf("lid van een ander huis maakt een routine in A: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", automationsPath+"/"+id, map[string]any{"last_run": when}); st < 400 {
		t.Errorf("bewoner zet last_run: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", automationsPath+"/"+id, map[string]any{"last_run": when, "last_error": "", "next_run": when}); st != 200 {
		t.Errorf("box zet last_run: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", automationsPath+"/"+id, map[string]any{"enabled": false}); st < 400 {
		t.Errorf("box zet enabled: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxBTok, "GET", automationsPath+"/"+id, nil); st < 400 {
		t.Errorf("box van een ander huis ziet de routine: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", automationsPath+"/"+id, map[string]any{"enabled": false}); st != 200 {
		t.Errorf("lid zet de routine uit: %d %v", st, out)
	}
}

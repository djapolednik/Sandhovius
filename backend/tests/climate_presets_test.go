//go:build integration

// Klimaatstanden (F2): temperaturen op het huis (beheerder, niet de box) en de
// routine-actie climate.
package tests

import "testing"

func TestClimatePresets(t *testing.T) {
	p := startPB(t)
	w := routineFixture(t, p)
	house := "/api/collections/houses/records/" + w.HouseA
	if st, out := p.do(t, w.UserATok, "PATCH", house, map[string]any{"climate_comfort": 20.5, "climate_eco": 17, "climate_sleep": 15.5}); st != 200 {
		t.Fatalf("beheerder zet de standen: %d %v", st, out)
	}
	for name, v := range map[string]float64{"te warm": 31, "te koud": 4, "geen halve graad": 19.3} {
		if st, out := p.do(t, w.UserATok, "PATCH", house, map[string]any{"climate_eco": v}); st != 400 || out["code"] != "invalid_climate_presets" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
	if st, _ := p.do(t, w.BoxATok, "PATCH", house, map[string]any{"climate_eco": 18}); st < 400 {
		t.Errorf("box zet een stand: %d", st)
	}

	trv := p.create(t, "devices", map[string]any{"gateway": w.HouseA, "name": "Radiator", "type": "climate", "online": true})
	climate := func(a map[string]any) map[string]any { return w.routine(map[string]any{"actions": []any{a}}) }
	for name, a := range map[string]map[string]any{
		"alle thermostaten": {"kind": "climate", "preset": "eco"},
		"één thermostaat":   {"kind": "climate", "preset": "sleep", "device": trv},
	} {
		if st, out := p.do(t, w.UserATok, "POST", automationsPath, climate(a)); st != 200 {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
	for name, a := range map[string]map[string]any{
		"onbekende stand":      {"kind": "climate", "preset": "vakantie"},
		"lamp als thermostaat": {"kind": "climate", "preset": "eco", "device": w.DevA},
	} {
		if st, out := p.do(t, w.UserATok, "POST", automationsPath, climate(a)); st != 400 || out["code"] != "invalid_automation" {
			t.Errorf("%s: %d %v", name, st, out)
		}
	}
}

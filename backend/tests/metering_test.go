//go:build integration

// Energie (C2): de box schrijft de meting van een stekker in
// device_state.metering zonder de stand te raken; bewoners lezen hem.
// power en energy zitten in de woordenlijst.
package tests

import "testing"

func TestDeviceMetering(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	path := "/api/collections/device_state/records/" + w.StateA
	before := getRecord(t, p, "device_state", w.StateA)["state"]
	metering := map[string]any{"power": 120.0, "energy_today": 0.83, "day": "2026-10-14"}
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"metering": metering}); st != 200 {
		t.Fatalf("box schrijft de meting: %d %v", st, out)
	}
	rec := getRecord(t, p, "device_state", w.StateA)
	if m, _ := rec["metering"].(map[string]any); m["energy_today"] != 0.83 {
		t.Errorf("meting: %v", rec["metering"])
	}
	if st, out := p.do(t, w.UserATok, "GET", path, nil); st != 200 || out["metering"] == nil {
		t.Errorf("bewoner leest de meting: %d %v", st, out)
	}
	if after := getRecord(t, p, "device_state", w.StateA)["state"]; after == nil || before == nil {
		t.Errorf("stand verdwenen: %v → %v", before, after)
	}
	if st, _ := p.do(t, w.UserATok, "PATCH", path, map[string]any{"metering": metering}); st < 400 {
		t.Errorf("bewoner schrijft een meting: %d", st)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/devices/records/"+w.DevA,
		map[string]any{"capabilities": []string{"onoff", "power", "energy"}}); st != 200 {
		t.Errorf("box zet power/energy als mogelijkheden: %d %v", st, out)
	}
}

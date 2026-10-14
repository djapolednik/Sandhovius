package app

import (
	"path/filepath"
	"testing"
	"time"

	"sandhovius/local-agent/internal/mqtt"
)

// Energie (C2).

func TestEnergyTodayAndRestart(t *testing.T) {
	file := filepath.Join(t.TempDir(), "energy.json")
	morning := time.Date(2026, 10, 14, 8, 0, 0, 0, time.Local)
	tr := newEnergyTracker(file)
	m, changed := tr.observe("plug", map[string]any{"power": 120.4, "energy": 10.5}, morning)
	if !changed || m["power"] != 120.0 || m["energy_today"] != 0.0 {
		t.Fatalf("eerste meting: %v %v", m, changed)
	}
	if _, changed := tr.observe("plug", map[string]any{"power": 120.2, "energy": 10.5}, morning.Add(time.Minute)); changed {
		t.Errorf("zelfde meting telt als verandering")
	}
	// Na een herstart weet hij het begin van de dag nog.
	tr = newEnergyTracker(file)
	m, _ = tr.observe("plug", map[string]any{"energy": 11.33}, morning.Add(6*time.Hour))
	if m["energy_today"] != 0.83 {
		t.Errorf("vandaag na herstart: %v", m)
	}
	// Een nieuwe dag begint bij nul; een gereset teller ook.
	m, _ = tr.observe("plug", map[string]any{"energy": 12.0}, morning.Add(24*time.Hour))
	if m["energy_today"] != 0.0 || m["day"] != "2026-10-15" {
		t.Errorf("nieuwe dag: %v", m)
	}
	m, _ = tr.observe("plug", map[string]any{"energy": 0.2}, morning.Add(25*time.Hour))
	if m["energy_today"] != 0.0 {
		t.Errorf("gereset teller: %v", m)
	}
	if m, _ := tr.observe("plug", map[string]any{"state": "ON"}, morning); m != nil {
		t.Errorf("stand zonder meting: %v", m)
	}
}

func TestClassifyMeteringPlug(t *testing.T) {
	plug := []mqtt.Expose{
		{Type: "switch", Features: []mqtt.Expose{{Name: "state", Property: "state"}}},
		{Type: "numeric", Name: "power", Property: "power"},
		{Type: "numeric", Name: "energy", Property: "energy"},
	}
	parts := classify(plug)
	if len(parts) != 1 || parts[0].Type != "switch" || len(parts[0].Capabilities) != 3 ||
		parts[0].Capabilities[1] != "power" || parts[0].Capabilities[2] != "energy" {
		t.Errorf("stekker met meting: %+v", parts)
	}
}

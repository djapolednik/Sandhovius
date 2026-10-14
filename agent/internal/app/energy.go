package app

import (
	"encoding/json"
	"errors"
	"log"
	"math"
	"os"
	"sync"
	"time"
)

// Energie (roadmap C2): een stekker met vermogensmeting meldt power (W, nu)
// en energy (kWh, een teller die alleen oploopt). De app wil "vandaag 0,8
// kWh": de teller nu min de teller bij het begin van de dag. Dat begin staat
// op schijf (/data/energy.json), zodat een herstart midden op de dag het niet
// vergeet. Alles lokaal; PocketBase krijgt alleen het getal van vandaag.

type energyBase struct {
	Day   string  `json:"day"`   // "2006-01-02", lokale tijd
	Start float64 `json:"start"` // de teller bij het begin van die dag
}

type energyTracker struct {
	mu   sync.Mutex
	file string
	base map[string]energyBase     // device → begin van de dag
	last map[string]map[string]any // device → laatst geschreven meting
}

func newEnergyTracker(file string) *energyTracker {
	t := &energyTracker{file: file, base: map[string]energyBase{}, last: map[string]map[string]any{}}
	if data, err := os.ReadFile(file); err == nil {
		if err := json.Unmarshal(data, &t.base); err != nil {
			log.Printf("[ENERGIE] %s is onleesbaar, begin opnieuw: %v\n", file, err)
			t.base = map[string]energyBase{}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("[ENERGIE] %s lezen mislukt: %v\n", file, err)
	}
	return t
}

// observe: een Zigbee2MQTT-stand van een stekker. Geeft de meting voor
// PocketBase, en of die anders is dan de vorige (anders niet schrijven: een
// stekker meldt vaak hetzelfde). nil als de stand niets over de meting zegt.
func (t *energyTracker) observe(device string, state map[string]any, now time.Time) (map[string]any, bool) {
	power, hasPower := state["power"].(float64)
	energy, hasEnergy := state["energy"].(float64)
	if !hasPower && !hasEnergy {
		return nil, false
	}
	t.mu.Lock()
	defer t.mu.Unlock()

	prev := t.last[device]
	metering := map[string]any{}
	for k, v := range prev {
		metering[k] = v
	}
	day := now.Format("2006-01-02")
	metering["day"] = day
	if hasPower {
		metering["power"] = math.Round(power)
	}
	if hasEnergy {
		base, ok := t.base[device]
		// Een nieuwe dag, een nieuwe stekker, of een teller die terugsprong
		// (gereset): vanaf hier tellen.
		if !ok || base.Day != day || energy < base.Start {
			base = energyBase{Day: day, Start: energy}
			t.base[device] = base
			t.save()
		}
		metering["energy_today"] = math.Round((energy-base.Start)*100) / 100
	} else if metering["day"] != prevDay(prev) {
		delete(metering, "energy_today") // van gisteren: niet meer tonen
	}
	changed := prev == nil || prev["power"] != metering["power"] || prev["energy_today"] != metering["energy_today"] || prev["day"] != metering["day"]
	t.last[device] = metering
	return metering, changed
}

func prevDay(prev map[string]any) any {
	if prev == nil {
		return nil
	}
	return prev["day"]
}

// save schrijft het begin van de dag atomisch (tijdelijk bestand + rename).
func (t *energyTracker) save() {
	data, _ := json.Marshal(t.base)
	tmp := t.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Printf("[ENERGIE] %s opslaan mislukt: %v\n", t.file, err)
		return
	}
	if err := os.Rename(tmp, t.file); err != nil {
		log.Printf("[ENERGIE] %s opslaan mislukt: %v\n", t.file, err)
	}
}

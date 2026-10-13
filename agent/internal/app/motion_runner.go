package app

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// motionRunner zet de bewegingslicht-motor (motion.go) in de agent: events
// erin, schakelen eruit, en wie welke lamp bezit op schijf. Alles komt uit
// het schema-snapshot, dus het werkt zonder PocketBase.
//
// switchDevice en report zijn functies, zodat de tests zonder Home Assistant
// en PocketBase kunnen. Ze lopen buiten de lock: een trage Home Assistant
// mag de event-stroom niet ophouden.
type motionRunner struct {
	mu       sync.Mutex
	engine   *motionEngine
	house    string
	devices  map[string]pocketbase.Device // device-id → device
	byEntity map[string]string            // entity_id → device-id
	sensors  map[string]bool              // device-id's die een regel als sensor heeft
	lamps    map[string]bool              // device-id's die een regel schakelt
	file     string
	saved    string // laatst weggeschreven inhoud, om niet elke keer te schrijven

	switchDevice func(device pocketbase.Device, on bool) error
	report       func(rule string, err error)
}

// motionFile is het bestand op schijf: van welk huis, en per lamp welke
// regels hem bezitten tot wanneer (nul = er is nog beweging).
type motionFile struct {
	House  string                          `json:"house"`
	Owners map[string]map[string]time.Time `json:"owners"`
}

func newMotionRunner(file string, switchDevice func(pocketbase.Device, bool) error, report func(string, error)) *motionRunner {
	return &motionRunner{
		engine:       newMotionEngine(),
		devices:      map[string]pocketbase.Device{},
		byEntity:     map[string]string{},
		sensors:      map[string]bool{},
		lamps:        map[string]bool{},
		file:         file,
		switchDevice: switchDevice,
		report:       report,
	}
}

// start: bij het opstarten, met het snapshot uit het bestand (mag nil zijn).
// Daarna het eigenaarschap van vóór de herstart terug, als dat van dit huis
// is: dan gaat een lamp die tijdens de herstart had moeten uitgaan alsnog
// uit bij de eerste tick.
func (r *motionRunner) start(house string, snap *scheduleSnapshot) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.house = house
	r.applyLocked(snap)
	if house != "" {
		if owners := r.loadLocked(house); owners != nil {
			r.engine.restore(owners)
			log.Printf("[BEWEGING] %d lamp(en) van voor de herstart nog van een regel\n", len(r.engine.owners))
		}
	}
	r.mu.Unlock()
}

// apply: een vers snapshot (de scheduler, elke minuut).
func (r *motionRunner) apply(snap *scheduleSnapshot) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.applyLocked(snap)
	r.saveLocked()
}

func (r *motionRunner) applyLocked(snap *scheduleSnapshot) {
	if snap == nil {
		snap = &scheduleSnapshot{}
	}
	r.devices = map[string]pocketbase.Device{}
	r.byEntity = map[string]string{}
	for id, d := range snap.devices {
		r.devices[id] = d
		if d.EntityID != "" {
			r.byEntity[d.EntityID] = id
		}
	}
	r.sensors = map[string]bool{}
	r.lamps = map[string]bool{}
	for _, rule := range snap.motionLights {
		r.sensors[rule.Sensor] = true
		for _, d := range rule.Devices {
			r.lamps[d] = true
		}
	}
	r.engine.setRules(snap.motionLights)
}

// onState: een stand van Home Assistant of Zigbee2MQTT. entity is de
// entity_id (HA) of de naam (Zigbee2MQTT), zoals in de device-cache.
func (r *motionRunner) onState(entity string, state map[string]any, now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	var actions []motionAction
	if entity == "sun.sun" {
		if dark, ok := darkFromSun(stateString(state)); ok {
			r.engine.setDark(dark)
		}
	} else if id, ok := r.byEntity[entity]; ok {
		if r.lamps[id] {
			r.engine.onLamp(id, lampIsOn(state))
		}
		if r.sensors[id] {
			if motion, ok := motionFromState(state); ok {
				actions = r.engine.onSensor(id, motion, now)
			}
		}
	}
	r.saveLocked()
	run := r.resolveLocked(actions)
	r.mu.Unlock()
	r.execute(run)
}

// tick: lampen waarvan de minuten om zijn, gaan uit.
func (r *motionRunner) tick(now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	actions := r.engine.due(now)
	r.saveLocked()
	run := r.resolveLocked(actions)
	r.mu.Unlock()
	r.execute(run)
}

// entitiesToSync: de entity's waarvan de motor de stand moet weten (de
// lampen van de regels, en de zon), voor het afstemmen bij het opstarten.
func (r *motionRunner) entitiesToSync() []string {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	entities := []string{"sun.sun"}
	for id := range r.lamps {
		if d, ok := r.devices[id]; ok && d.EntityID != "" {
			entities = append(entities, d.EntityID)
		}
	}
	return entities
}

type resolvedAction struct {
	motionAction
	device pocketbase.Device
}

func (r *motionRunner) resolveLocked(actions []motionAction) []resolvedAction {
	out := make([]resolvedAction, 0, len(actions))
	for _, a := range actions {
		device, ok := r.devices[a.Device]
		if !ok {
			continue // apparaat niet (meer) in het snapshot
		}
		out = append(out, resolvedAction{a, device})
	}
	return out
}

func (r *motionRunner) execute(actions []resolvedAction) {
	for _, a := range actions {
		err := r.switchDevice(a.device, a.On)
		if err != nil {
			log.Printf("[BEWEGING] %s %s (regel %s) mislukt: %v\n", onOff(a.On), a.device.EntityID, a.Rule, err)
		} else {
			log.Printf("[BEWEGING] %s %s (regel %s)\n", onOff(a.On), a.device.EntityID, a.Rule)
		}
		r.report(a.Rule, err)
	}
}

func onOff(on bool) string {
	if on {
		return "Aan"
	}
	return "Uit"
}

// saveLocked schrijft het eigenaarschap weg als het veranderde, atomisch
// zoals het snapshot. Een fout is alleen te loggen: schakelen gaat voor.
func (r *motionRunner) saveLocked() {
	if r.file == "" || r.house == "" {
		return
	}
	data, err := json.Marshal(motionFile{House: r.house, Owners: r.engine.owned()})
	if err != nil || string(data) == r.saved {
		return
	}
	tmp := r.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Printf("[BEWEGING] Opslaan in %s mislukt: %v\n", tmp, err)
		return
	}
	if err := os.Rename(tmp, r.file); err != nil {
		log.Printf("[BEWEGING] Opslaan in %s mislukt: %v\n", r.file, err)
		return
	}
	r.saved = string(data)
}

func (r *motionRunner) loadLocked(house string) map[string]map[string]time.Time {
	data, err := os.ReadFile(r.file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		log.Printf("[BEWEGING] %s lezen mislukt: %v\n", r.file, err)
		return nil
	}
	var file motionFile
	if err := json.Unmarshal(data, &file); err != nil {
		log.Printf("[BEWEGING] %s is onleesbaar: %v\n", r.file, err)
		return nil
	}
	if file.House != house {
		return nil
	}
	return file.Owners
}

// lampIsOn: HA zegt "on", Zigbee2MQTT "ON".
func lampIsOn(state map[string]any) bool {
	return strings.EqualFold(stateString(state), "on")
}

func stateString(state map[string]any) string {
	s, _ := state["state"].(string)
	return s
}

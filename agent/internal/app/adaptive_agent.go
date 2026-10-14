package app

import (
	"log"
	"sync"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// adaptiveRunner koppelt de motor van "kleur volgt de dag" (adaptive.go) aan
// de agent: lampen en locatie uit de schema-snapshot, standen uit de
// event-stroom, en een klok van een minuut. Een nil-runner doet niets.
type adaptiveRunner struct {
	mu     sync.Mutex
	engine *adaptiveEngine
	// send zet een lamp op een wittint (light.turn_on met alleen
	// color_temp_kelvin), zonder hem als "met de hand" te markeren.
	send func(entity string, kelvin int) error
}

func newAdaptiveRunner(send func(entity string, kelvin int) error) *adaptiveRunner {
	return &adaptiveRunner{engine: newAdaptiveEngine(), send: send}
}

func (r *adaptiveRunner) apply(snap *scheduleSnapshot) {
	if r == nil || snap == nil {
		return
	}
	devices := make([]pocketbase.Device, 0, len(snap.devices))
	for _, d := range snap.devices {
		devices = append(devices, d)
	}
	r.mu.Lock()
	r.engine.setLamps(devices)
	r.engine.setLocation(snap.location)
	r.mu.Unlock()
}

func (r *adaptiveRunner) onState(entity string, state map[string]any, now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	actions := r.engine.onState(entity, state, now)
	r.mu.Unlock()
	r.execute(actions)
}

func (r *adaptiveRunner) tick(now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	actions := r.engine.tick(now)
	r.mu.Unlock()
	r.execute(actions)
}

func (r *adaptiveRunner) manual(entity string) {
	if r == nil {
		return
	}
	r.mu.Lock()
	r.engine.manual(entity)
	r.mu.Unlock()
}

// entities: de lampen die meedoen, voor het afstemmen bij het opstarten.
func (r *adaptiveRunner) entities() []string {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]string, 0, len(r.engine.lamps))
	for entity := range r.engine.lamps {
		out = append(out, entity)
	}
	return out
}

func (r *adaptiveRunner) execute(actions []adaptiveAction) {
	for _, a := range actions {
		if err := r.send(a.Entity, a.Kelvin); err != nil {
			log.Printf("[KLEUR] %s op %d K zetten mislukt: %v\n", a.Entity, a.Kelvin, err)
			continue
		}
		log.Printf("[KLEUR] %s op %d K\n", a.Entity, a.Kelvin)
	}
}

// runAdaptiveClock: eerst de stand van de lampen ophalen (bij het opstarten
// zitten die niet in de event-stroom), dan elke minuut bijsturen.
func (a *Agent) runAdaptiveClock() {
	for _, entity := range a.adaptive.entities() {
		event, err := a.haClient.GetState(entity)
		if err != nil {
			log.Printf("[KLEUR] Stand van %s ophalen mislukt: %v\n", entity, err)
			continue
		}
		a.adaptive.onState(entity, map[string]any{"state": event.State, "attributes": event.Attributes}, time.Now())
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case now := <-ticker.C:
			a.adaptive.tick(now)
		}
	}
}

package app

import (
	"log"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// motionTickEvery: zo vaak kijkt de agent of er lampen uit moeten. Een lamp
// gaat dus hooguit 15 s na zijn minuten uit.
const motionTickEvery = 15 * time.Second

// runMotionClock: eerst de stand van de zon en van de lampen ophalen (bij
// het opstarten zitten die niet in de event-stroom), dan elke 15 s de
// lampen uitdoen waarvan de minuten om zijn. De eerste tick doet ook wat
// er tijdens een herstart had moeten uitgaan.
func (a *Agent) runMotionClock() {
	for _, entity := range a.motion.entitiesToSync() {
		event, err := a.haClient.GetState(entity)
		if err != nil {
			log.Printf("[BEWEGING] Stand van %s ophalen mislukt: %v\n", entity, err)
			continue
		}
		a.motion.onState(entity, map[string]any{"state": event.State, "attributes": event.Attributes}, time.Now())
	}
	a.motion.tick(time.Now())

	ticker := time.NewTicker(motionTickEvery)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case now := <-ticker.C:
			a.motion.tick(now)
		}
	}
}

// switchForMotion zet een lamp of stopcontact aan of uit, met dezelfde
// controles als een scène-stap: van dit huis en klaargezet.
func (a *Agent) switchForMotion(device pocketbase.Device, on bool) error {
	action := "turn_off"
	if on {
		action = "turn_on"
	}
	lookup := func(string) (*pocketbase.Device, error) { return &device, nil }
	return a.runSceneStep(a.house(), pocketbase.SceneAction{Device: device.ID, Action: action}, lookup)
}

// reportMotionLight meldt het resultaat aan PocketBase, op de achtergrond:
// zonder internet mag het schakelen er niet op wachten.
func (a *Agent) reportMotionLight(rule string, err error) {
	now := time.Now()
	go func() {
		if markErr := a.pbClient.MarkMotionLightRun(rule, now, err); markErr != nil {
			log.Printf("[BEWEGING] Kon resultaat van %s niet opslaan: %v\n", rule, markErr)
		}
	}()
}

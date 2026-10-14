package app

import (
	"log"
	"time"
)

// locationRefresh: zo vaak vraagt de agent de thuislocatie opnieuw aan HA.
// Hij verandert zelden; tussendoor geldt de laatst bekende (ook uit de
// snapshot op schijf, zodat zon-schema's lopen als HA bij de start weg is).
const locationRefresh = time.Hour

// homeLocation: de thuislocatie voor zon-schema's, of nil als HA hem nooit
// gaf. Vraagt HA hooguit eens per locationRefresh.
func (a *Agent) homeLocation() *homeLocation {
	a.locMu.Lock()
	defer a.locMu.Unlock()
	if !a.locAt.IsZero() && time.Since(a.locAt) < locationRefresh {
		return a.loc
	}
	lat, lon, ok, err := a.haClient.HomeLocation()
	switch {
	case err != nil:
		// HA (nog) niet bereikbaar: de laatst bekende geldt, over 5 minuten
		// opnieuw proberen.
		log.Printf("[SCHEMA] Thuislocatie uit Home Assistant ophalen mislukt, laatst bekende geldt: %v\n", err)
		a.locAt = time.Now().Add(-locationRefresh + 5*time.Minute)
	case !ok:
		log.Printf("[SCHEMA] Geen thuislocatie in Home Assistant: zon-schema's lopen niet\n")
		a.loc, a.locAt = nil, time.Now()
	default:
		a.loc, a.locAt = &homeLocation{Lat: lat, Lon: lon}, time.Now()
	}
	return a.loc
}

// rememberLocation: de locatie uit de snapshot op schijf, bij de start.
func (a *Agent) rememberLocation(loc *homeLocation) {
	if loc == nil {
		return
	}
	a.locMu.Lock()
	defer a.locMu.Unlock()
	if a.loc == nil {
		a.loc = loc // locAt blijft nul: bij de eerste kans opnieuw vragen
	}
}

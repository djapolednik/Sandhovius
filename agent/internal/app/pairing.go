package app

import (
	"time"

	"sandhovius/local-agent/internal/mqtt"
)

// pairingWindow is hoe lang een koppelsessie openstaat (Zigbee2MQTT staat
// koppelen tot 254 s toe; de box zet het op 240 s en verlengt het zelf).
const pairingWindow = 4 * time.Minute

// pairingAction is wat de koppelmotor de runner laat doen:
//   - "candidate": een gevonden apparaat (deel) schrijven of bijwerken, per
//     Address+Part.Endpoint; Status interviewing, found of unsupported
//   - "hide": de candidate van een adres verbergen (hij bleek een ander soort)
//   - "remove": het adres van het Zigbee-netwerk halen
//   - "close_join": koppelen dichtzetten
type pairingAction struct {
	Kind    string
	Address string
	Part    Part
	Model   string
	Status  string
}

// pairingEngine beslist voor één Zigbee-koppelsessie wat er gebeurt, zonder
// I/O en zonder klok: de runner geeft de gebeurtenissen en de tijd door. De
// regel: wat op het netwerk zit, staat in de app. Een adres dat vóór de
// sessie al op het netwerk stond (known) raakt de motor nooit aan.
type pairingEngine struct {
	kind    string
	known   map[string]bool
	expires time.Time
	closed  bool

	order          []string        // adressen in volgorde van binnenkomst
	joinedSet      map[string]bool // in deze sessie binnengekomen, nog op het netwerk
	interviewedSet map[string]bool
	removed        map[string]bool
	addedSet       map[string]bool // adres met minstens één toegevoegd deel
}

func newPairingEngine(kind string, known map[string]bool, now time.Time) *pairingEngine {
	if known == nil {
		known = map[string]bool{}
	}
	return &pairingEngine{
		kind: kind, known: known, expires: now.Add(pairingWindow),
		joinedSet: map[string]bool{}, interviewedSet: map[string]bool{},
		removed: map[string]bool{}, addedSet: map[string]bool{},
	}
}

func (e *pairingEngine) expiresAt() time.Time { return e.expires }

// join noteert een nieuw adres; false als het niet voor deze sessie telt.
func (e *pairingEngine) join(ieee string) bool {
	if e.closed || e.known[ieee] || e.joinedSet[ieee] {
		return false
	}
	if e.removed[ieee] {
		// weggehaald en opnieuw gekoppeld: weer als nieuw
		delete(e.removed, ieee)
		delete(e.interviewedSet, ieee)
	} else {
		e.order = append(e.order, ieee)
	}
	e.joinedSet[ieee] = true
	return true
}

// joined: Zigbee2MQTT meldt device_joined.
func (e *pairingEngine) joined(ieee string) []pairingAction {
	if !e.join(ieee) {
		return nil
	}
	return []pairingAction{{Kind: "candidate", Address: ieee, Status: "interviewing"}}
}

// interviewed: Zigbee2MQTT meldt device_interview (ok = successful).
func (e *pairingEngine) interviewed(ieee string, dev mqtt.BridgeDevice, ok bool) []pairingAction {
	if e.closed || e.known[ieee] || e.interviewedSet[ieee] || e.removed[ieee] {
		return nil
	}
	e.join(ieee) // ook als device_joined gemist werd
	e.interviewedSet[ieee] = true

	var parts []Part
	if ok && dev.Supported {
		parts = supportedParts(dev.Model, classify(dev.Exposes))
	}
	if parts == nil {
		return append([]pairingAction{{Kind: "candidate", Address: ieee, Status: "unsupported", Model: dev.Model}},
			e.remove(ieee)...)
	}

	var actions []pairingAction
	for _, p := range parts {
		if p.Type == e.kind {
			actions = append(actions, pairingAction{Kind: "candidate", Address: ieee, Status: "found", Model: dev.Model, Part: p})
		}
	}
	if actions == nil {
		return append([]pairingAction{{Kind: "hide", Address: ieee}}, e.remove(ieee)...)
	}
	return actions
}

func (e *pairingEngine) remove(ieee string) []pairingAction {
	delete(e.joinedSet, ieee)
	e.removed[ieee] = true
	return []pairingAction{{Kind: "remove", Address: ieee}}
}

// added: een deel van dit adres is een device geworden.
func (e *pairingEngine) added(ieee, endpoint string) { e.addedSet[ieee] = true }

// extend verlengt de sessie met een heel venster vanaf nu.
func (e *pairingEngine) extend(now time.Time) time.Time {
	e.expires = now.Add(pairingWindow)
	return e.expires
}

// tick sluit de sessie als hij verlopen is (ook als de app weg is).
func (e *pairingEngine) tick(now time.Time) []pairingAction {
	if e.closed || now.Before(e.expires) {
		return nil
	}
	return e.close()
}

// close zet koppelen dicht en haalt elk adres uit deze sessie zonder
// toegevoegd deel van het netwerk.
func (e *pairingEngine) close() []pairingAction {
	if e.closed {
		return nil
	}
	e.closed = true
	actions := []pairingAction{{Kind: "close_join"}}
	for _, ieee := range e.order {
		if e.joinedSet[ieee] && !e.addedSet[ieee] {
			actions = append(actions, e.remove(ieee)...)
		}
	}
	return actions
}

// joinedAddresses: de adressen die in deze sessie binnenkwamen en nog op het
// netwerk staan (voor /data/devices.json, zodat een herstart ze kan opruimen).
func (e *pairingEngine) joinedAddresses() []string {
	out := []string{}
	for _, ieee := range e.order {
		if e.joinedSet[ieee] {
			out = append(out, ieee)
		}
	}
	return out
}

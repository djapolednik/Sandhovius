package app

import (
	"fmt"
	"log"
	"sync"
	"time"

	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

// zigbeeKey is de sleutel waaronder de stand van een Zigbee-sensor (zonder
// HA-entiteit) binnenkomt, voor de bewegingslichten.
func zigbeeKey(address string) string { return "zigbee:" + address }

const (
	permitJoinTopic   = "zigbee2mqtt/bridge/request/permit_join"
	deviceRemoveTopic = "zigbee2mqtt/bridge/request/device/remove"
	permitJoinSeconds = 240
	pbDate            = "2006-01-02 15:04:05.000Z"
)

// pairingPB en pairingHA zijn de PocketBase- en HA-aanroepen van de runner
// (*pocketbase.Client en *homeassistant.Client; tests zetten nep).
type pairingPB interface {
	UpdatePairingSession(id string, fields map[string]any) error
	CreatePairingCandidate(p pocketbase.PairingCandidate) (pocketbase.PairingCandidate, error)
	UpdatePairingCandidate(id string, fields map[string]any) error
	CreateDevice(d pocketbase.NewDevice) (pocketbase.Device, error)
	ListOpenPairingSessions(house string) ([]pocketbase.PairingSession, error)
}

type pairingHA interface {
	ListDevices() ([]homeassistant.RegistryDevice, error)
	ListEntities() ([]homeassistant.RegistryEntity, error)
}

// runningSession is de Zigbee-koppelsessie die nu loopt.
type runningSession struct {
	id     string
	engine *pairingEngine
	// per candidate-id: welk deel, en de laatst geziene identify-teller
	parts     map[string]candidatePart
	byKey     map[string]string // adres|endpoint → candidate-id
	identify  map[string]int
	adding    map[string]bool
	addresses map[string][]string // adres → candidate-id's
}

type candidatePart struct {
	address string
	part    Part
	model   string
	found   bool
}

// pairingRunner koppelt de koppelmotor aan Zigbee2MQTT (MQTT), PocketBase en
// HA's registry (spec 2026-10-14-device-pairing-design.md). Eén sessie
// tegelijk, alleen van het eigen huis.
type pairingRunner struct {
	mu        sync.Mutex
	storePath string
	store     *deviceStore
	house     func() string
	dir       *bridgeDirectory
	publish   func(topic string, payload any) error
	pb        pairingPB
	ha        pairingHA
	now       func() time.Time
	sleep     func(time.Duration)
	session   *runningSession
}

func newPairingRunner(storePath string, house func() string, dir *bridgeDirectory, publish func(string, any) error,
	pb pairingPB, ha pairingHA, now func() time.Time) *pairingRunner {
	store, err := loadDeviceStore(storePath)
	if err != nil {
		log.Printf("[KOPPELEN] %s niet te lezen, begin leeg: %v\n", storePath, err)
	}
	return &pairingRunner{storePath: storePath, store: store, house: house, dir: dir, publish: publish,
		pb: pb, ha: ha, now: now, sleep: time.Sleep}
}

func (r *pairingRunner) saveLocked() {
	if r.session != nil {
		r.store.Session = &storedSession{ID: r.session.id, Joined: r.session.engine.joinedAddresses()}
	} else {
		r.store.Session = nil
	}
	if err := r.store.save(r.storePath); err != nil {
		log.Printf("[KOPPELEN] %s schrijven mislukt: %v\n", r.storePath, err)
	}
}

// onSession: een realtime-wijziging van een koppelsessie.
func (r *pairingRunner) onSession(s pocketbase.PairingSession) {
	if r == nil || s.House != r.house() || s.Kind == "hue" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()

	switch {
	case s.Status == "starting" && r.session == nil:
		if err := r.publish(permitJoinTopic, map[string]any{"time": permitJoinSeconds}); err != nil {
			log.Printf("[KOPPELEN] Koppelen openen mislukt: %v\n", err)
			r.pb.UpdatePairingSession(s.ID, map[string]any{"status": "failed", "error": "zigbee_unavailable"})
			return
		}
		r.session = &runningSession{id: s.ID, engine: newPairingEngine(s.Kind, r.dir.addresses(), now),
			parts: map[string]candidatePart{}, byKey: map[string]string{}, identify: map[string]int{},
			adding: map[string]bool{}, addresses: map[string][]string{}}
		r.pb.UpdatePairingSession(s.ID, map[string]any{"status": "open",
			"expires": r.session.engine.expiresAt().UTC().Format(pbDate)})
		r.saveLocked()
		log.Printf("[KOPPELEN] Sessie %s open (%s)\n", s.ID, s.Kind)

	case r.session != nil && s.ID == r.session.id && s.Status == "closed":
		r.executeLocked(r.session.engine.close())

	case r.session != nil && s.ID == r.session.id && s.Extend:
		expires := r.session.engine.extend(now)
		r.publish(permitJoinTopic, map[string]any{"time": permitJoinSeconds})
		r.pb.UpdatePairingSession(s.ID, map[string]any{"extend": false, "expires": expires.UTC().Format(pbDate)})
	}
}

// onBridgeEvent: een melding van Zigbee2MQTT over een apparaat.
func (r *pairingRunner) onBridgeEvent(ev mqtt.BridgeEvent) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.session == nil {
		return
	}
	switch {
	case ev.Type == "device_joined":
		r.executeLocked(r.session.engine.joined(ev.IEEE))
	case ev.Type == "device_interview" && ev.Status == "successful" && ev.Device != nil:
		r.executeLocked(r.session.engine.interviewed(ev.IEEE, *ev.Device, true))
	case ev.Type == "device_interview" && ev.Status == "failed":
		r.executeLocked(r.session.engine.interviewed(ev.IEEE, mqtt.BridgeDevice{IEEE: ev.IEEE}, false))
	}
	r.saveLocked()
}

// executeLocked voert de acties van de motor uit.
func (r *pairingRunner) executeLocked(actions []pairingAction) {
	s := r.session
	for _, a := range actions {
		switch a.Kind {
		case "candidate":
			r.writeCandidateLocked(a)
		case "hide":
			for _, id := range s.addresses[a.Address] {
				r.pb.UpdatePairingCandidate(id, map[string]any{"status": "failed"})
			}
		case "remove":
			if err := r.publish(deviceRemoveTopic, map[string]any{"id": a.Address}); err != nil {
				log.Printf("[KOPPELEN] %s van het netwerk halen mislukt: %v\n", a.Address, err)
			} else {
				log.Printf("[KOPPELEN] %s van het netwerk gehaald\n", a.Address)
			}
		case "close_join":
			r.publish(permitJoinTopic, map[string]any{"time": 0})
			r.pb.UpdatePairingSession(s.id, map[string]any{"status": "closed"})
			log.Printf("[KOPPELEN] Sessie %s dicht\n", s.id)
		}
	}
	if s.engine.closed {
		r.session = nil
	}
	r.saveLocked()
}

// writeCandidateLocked schrijft of werkt een candidate bij. Het eerste deel
// van een adres hergebruikt het record van "wordt klaargezet".
func (r *pairingRunner) writeCandidateLocked(a pairingAction) {
	s := r.session
	key := a.Address + "|" + a.Part.Endpoint
	id, ok := s.byKey[key]
	if !ok && a.Status != "interviewing" {
		// het "wordt klaargezet"-record (endpoint leeg) overnemen
		if waiting, ok2 := s.byKey[a.Address+"|"]; ok2 && !s.parts[waiting].found {
			id, ok = waiting, true
			delete(s.byKey, a.Address+"|")
		}
	}
	if !ok {
		created, err := r.pb.CreatePairingCandidate(pocketbase.PairingCandidate{
			Session: s.id, Source: "zigbee", Address: a.Address, Endpoint: a.Part.Endpoint, Type: a.Part.Type,
			Model: a.Model, Status: a.Status, Capabilities: a.Part.Capabilities})
		if err != nil {
			log.Printf("[KOPPELEN] Candidate %s schrijven mislukt: %v\n", a.Address, err)
			return
		}
		id = created.ID
		s.addresses[a.Address] = append(s.addresses[a.Address], id)
	} else {
		r.pb.UpdatePairingCandidate(id, map[string]any{"status": a.Status, "type": a.Part.Type,
			"endpoint": a.Part.Endpoint, "model": a.Model, "capabilities": a.Part.Capabilities})
	}
	s.byKey[key] = id
	s.parts[id] = candidatePart{address: a.Address, part: a.Part, model: a.Model, found: a.Status == "found"}
}

// onCandidate: een bewoner liet knipperen of koos "toevoegen".
func (r *pairingRunner) onCandidate(c pocketbase.PairingCandidate) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.session
	if s == nil || c.Session != s.id {
		return
	}
	cp, ok := s.parts[c.ID]
	if !ok {
		return
	}
	if c.Identify > s.identify[c.ID] {
		s.identify[c.ID] = c.Identify
		if err := r.blinkLocked(cp.address); err != nil {
			log.Printf("[KOPPELEN] Knipperen %s: %v\n", cp.address, err)
		}
	}
	if c.Add && cp.found && !s.adding[c.ID] && c.Status != "adding" && c.Status != "added" {
		s.adding[c.ID] = true
		r.addLocked(c, cp)
	}
}

// addLocked maakt het device. HA maakt de entiteit pas als Zigbee2MQTT de
// discovery publiceert, dus een paar keer kijken.
func (r *pairingRunner) addLocked(c pocketbase.PairingCandidate, cp candidatePart) {
	r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "adding"})
	entity := ""
	if cp.part.Type != "sensor" {
		for try := 0; try < 5 && entity == ""; try++ {
			if try > 0 {
				r.sleep(time.Second)
			}
			devs, err1 := r.ha.ListDevices()
			ents, err2 := r.ha.ListEntities()
			if err1 == nil && err2 == nil {
				entity, _ = homeassistant.ZigbeeEntity(devs, ents, cp.address, cp.part.Type, cp.part.Endpoint)
			}
		}
		if entity == "" {
			log.Printf("[KOPPELEN] Geen HA-entiteit voor %s %s\n", cp.address, cp.part.Endpoint)
			r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "failed"})
			r.session.adding[c.ID] = false
			return
		}
	}
	name := c.Name
	if name == "" {
		name = cp.model
	}
	dev, err := r.pb.CreateDevice(pocketbase.NewDevice{Gateway: r.house(), Room: c.Room, Name: name,
		Type: cp.part.Type, Source: "zigbee", Address: cp.address, Endpoint: cp.part.Endpoint,
		EntityID: entity, Model: cp.model, Capabilities: cp.part.Capabilities})
	if err != nil {
		log.Printf("[KOPPELEN] Device %s aanmaken mislukt: %v\n", cp.address, err)
		r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "failed"})
		r.session.adding[c.ID] = false
		return
	}
	r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "added", "device": dev.ID})
	r.session.engine.added(cp.address, cp.part.Endpoint)
	r.store.addOwned(cp.address)
	r.saveLocked()
	log.Printf("[KOPPELEN] %s toegevoegd als %q\n", cp.address, name)
}

// blinkLocked laat een Zigbee-apparaat knipperen, als het dat kan: een lamp
// met effect "blink", anders "identify". Een stekker zonder identify niet:
// aan en uit zetten kan het apparaat erachter starten.
func (r *pairingRunner) blinkLocked(address string) error {
	dev, ok := r.dir.device(address)
	if !ok {
		return fmt.Errorf("%s staat niet op het netwerk", address)
	}
	payload := identifyPayload(dev.Exposes)
	if payload == nil {
		return nil
	}
	return r.publish("zigbee2mqtt/"+dev.FriendlyName+"/set", payload)
}

func identifyPayload(exposes []mqtt.Expose) map[string]any {
	for _, e := range exposes {
		if e.Name == "effect" {
			return map[string]any{"effect": "blink"}
		}
	}
	for _, e := range exposes {
		if e.Name == "identify" {
			return map[string]any{"identify": "identify"}
		}
	}
	return nil
}

// identify: "Laat knipperen" in de detail-sheet (command identify).
func (r *pairingRunner) identify(dev pocketbase.Device) error {
	if r == nil {
		return fmt.Errorf("koppelen staat uit")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if dev.Source != "zigbee" || dev.Address == "" {
		return fmt.Errorf("dit apparaat kan niet knipperen")
	}
	return r.blinkLocked(dev.Address)
}

// tick sluit een verlopen sessie, ook als de app weg is.
func (r *pairingRunner) tick() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.session != nil {
		r.executeLocked(r.session.engine.tick(r.now()))
	}
}

// onDeviceDeleted: een device is uit de app verwijderd; remaining is het
// aantal devices dat nog op hetzelfde adres staat. Pas als het laatste deel
// weg is, en alleen een adres dat de agent zelf toevoegde, gaat het van het
// netwerk.
func (r *pairingRunner) onDeviceDeleted(dev pocketbase.Device, remaining int) {
	if r == nil || dev.Source != "zigbee" || dev.Address == "" || remaining > 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.store.owns(dev.Address) {
		return
	}
	if err := r.publish(deviceRemoveTopic, map[string]any{"id": dev.Address}); err != nil {
		log.Printf("[KOPPELEN] %s van het netwerk halen mislukt: %v\n", dev.Address, err)
		return
	}
	r.store.removeOwned(dev.Address)
	r.saveLocked()
	log.Printf("[KOPPELEN] %s verwijderd en van het netwerk gehaald\n", dev.Address)
}

// recover ruimt na een herstart een sessie op die nog liep: koppelen dicht,
// niet toegevoegde adressen van het netwerk, en de open sessies van het huis
// in PocketBase op "closed".
func (r *pairingRunner) recover() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.session != nil {
		return // loopt nog in dit proces; tick sluit hem
	}
	open, err := r.pb.ListOpenPairingSessions(r.house())
	if err != nil {
		log.Printf("[KOPPELEN] Open sessies ophalen mislukt: %v\n", err)
	}
	stored := r.store.Session
	if stored == nil && len(open) == 0 {
		return
	}
	r.publish(permitJoinTopic, map[string]any{"time": 0})
	if stored != nil {
		for _, a := range stored.Joined {
			if !r.store.owns(a) {
				r.publish(deviceRemoveTopic, map[string]any{"id": a})
			}
		}
	}
	for _, s := range open {
		if s.Kind != "hue" {
			r.pb.UpdatePairingSession(s.ID, map[string]any{"status": "closed"})
		}
	}
	r.saveLocked()
	log.Println("[KOPPELEN] Sessie van vóór de herstart opgeruimd")
}

// listenForPairing volgt koppelsessies en candidates van het eigen huis via
// realtime, en blijft herverbinden totdat de agent stopt.
func (a *Agent) listenForPairing() {
	for {
		err := a.pbClient.SubscribePairing(a.ctx, nil, func(e pocketbase.PairingEvent) {
			if !a.registered.Load() || e.Action == "delete" {
				return
			}
			if e.Session != nil {
				a.pairing.onSession(*e.Session)
			}
			if e.Candidate != nil {
				a.pairing.onCandidate(*e.Candidate)
			}
		})
		if a.ctx.Err() != nil {
			return
		}
		log.Printf("[APP] Koppel-stream verbroken: %v — probeer over 5s opnieuw\n", err)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

// runPairingClock sluit verlopen koppelsessies, ook zonder app.
func (a *Agent) runPairingClock() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.pairing.tick()
		}
	}
}

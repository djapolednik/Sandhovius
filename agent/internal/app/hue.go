package app

// Philips Hue koppelen via de lokale bridge (spec 2026-10-14-device-pairing-design.md).
//
// De config-flow van HA's Hue-integratie (niet tegen de dev-HA nagekeken: die
// draaide niet tijdens het bouwen; nakijken bij de handmatige test):
//   - ontdekt (zeroconf op de box): een lopende flow met handler "hue", stap "link"
//   - zelf starten: stap "init" (bridge kiezen, {"id": "manual"} voor een adres)
//     of meteen "manual" ({"host": ...}), daarna "link"
//   - "link" indienen zonder op de knop te drukken: weer "link" met
//     errors.base = "register_failed"; na drukken: create_entry
//   - al gekoppeld: abort "already_configured"

import (
	"log"
	"time"

	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/pocketbase"
)

type hueSession struct {
	id       string
	flowID   string
	expires  time.Time
	parts    map[string]hueCandidate // candidate-id → lamp
	identify map[string]int
	adding   map[string]bool
}

type hueCandidate struct {
	address, entity, model, name string
	capabilities                 []string
}

// hueCandidates: de lampen van de Hue-bridge (config-entries entryIDs) die
// nog niet in de app staan. Address is het HA-device-id. Kamers en zones
// (standaard uitgeschakelde entiteiten) en de bridge zelf vallen weg.
// Hue-sensoren nog niet: hun stand heeft een eigen vertaling nodig.
func hueCandidates(devs []homeassistant.RegistryDevice, ents []homeassistant.RegistryEntity, entryIDs []string, inApp map[string]bool) []pocketbase.PairingCandidate {
	entries := map[string]bool{}
	for _, id := range entryIDs {
		entries[id] = true
	}
	var out []pocketbase.PairingCandidate
	for _, d := range devs {
		ours := false
		for _, e := range d.ConfigEntries {
			ours = ours || entries[e]
		}
		if !ours || inApp[d.ID] {
			continue
		}
		if _, ok := hueEntity(ents, d.ID); !ok {
			continue
		}
		out = append(out, pocketbase.PairingCandidate{Source: "hue", Address: d.ID, Type: "light", Model: d.Model, Status: "found"})
	}
	return out
}

// hueEntity: de (ingeschakelde) lamp-entiteit van een Hue-device.
func hueEntity(ents []homeassistant.RegistryEntity, deviceID string) (string, bool) {
	for _, e := range ents {
		if e.DeviceID == deviceID && e.DisabledBy == nil && len(e.EntityID) > 6 && e.EntityID[:6] == "light." {
			return e.EntityID, true
		}
	}
	return "", false
}

// hueLightCapabilities uit HA's supported_color_modes.
func hueLightCapabilities(modes []any) []string {
	caps := map[string]bool{"onoff": true}
	for _, m := range modes {
		switch m {
		case "brightness", "white":
			caps["brightness"] = true
		case "color_temp":
			caps["brightness"], caps["color_temp"] = true, true
		case "xy", "hs", "rgb", "rgbw", "rgbww":
			caps["brightness"], caps["color"] = true, true
		}
	}
	return ordered(caps)
}

func (r *pairingRunner) onHueSessionLocked(s pocketbase.PairingSession, now time.Time) {
	h := r.hue
	switch {
	case s.Status == "starting" && h == nil && r.session == nil:
		r.hue = &hueSession{id: s.ID, expires: now.Add(pairingWindow), parts: map[string]hueCandidate{},
			identify: map[string]int{}, adding: map[string]bool{}}
		r.startHueLocked()

	case h != nil && s.ID == h.id && s.Status == "closed":
		r.hue = nil

	case h != nil && s.ID == h.id && s.ButtonPressed && h.flowID != "":
		res, err := r.ha.SubmitFlow(h.flowID, map[string]any{})
		if err != nil {
			log.Printf("[KOPPELEN] Hue-koppeling indienen mislukt: %v\n", err)
			r.failHueLocked("hue_not_found")
			return
		}
		r.walkHueLocked(res)

	case h != nil && s.ID == h.id && s.Extend:
		h.expires = now.Add(pairingWindow)
		r.pb.UpdatePairingSession(h.id, map[string]any{"extend": false, "expires": h.expires.UTC().Format(pbDate)})
	}
}

// startHueLocked: al gekoppeld → meteen de lampen; anders een ontdekte flow,
// of zelf een flow starten met hueHost.
func (r *pairingRunner) startHueLocked() {
	if entries, err := r.ha.ConfigEntryIDs("hue"); err == nil && len(entries) > 0 {
		r.openHueLocked(entries)
		return
	}
	if flows, err := r.ha.ListFlows(); err == nil {
		for _, f := range flows {
			if f.Handler == "hue" {
				r.walkHueLocked(homeassistant.FlowResult{Type: "form", FlowID: f.FlowID, StepID: f.StepID})
				return
			}
		}
	}
	if r.hueHost == "" {
		r.failHueLocked("hue_not_found")
		return
	}
	res, err := r.ha.StartFlow("hue", nil)
	if err != nil {
		log.Printf("[KOPPELEN] Hue-flow starten mislukt: %v\n", err)
		r.failHueLocked("hue_not_found")
		return
	}
	r.walkHueLocked(res)
}

// walkHueLocked loopt de flow door tot de knop-stap of het einde.
func (r *pairingRunner) walkHueLocked(res homeassistant.FlowResult) {
	h := r.hue
	for step := 0; step < 5; step++ {
		switch {
		case res.Type == "create_entry" || (res.Type == "abort" && res.Reason == "already_configured"):
			h.flowID = ""
			entries, _ := r.ha.ConfigEntryIDs("hue")
			r.openHueLocked(entries)
			return
		case res.Type != "form":
			log.Printf("[KOPPELEN] Hue-flow gestopt: %s %s\n", res.Type, res.Reason)
			r.failHueLocked("hue_not_found")
			return
		case res.StepID == "link":
			h.flowID = res.FlowID
			fields := map[string]any{"status": "waiting_button", "button_pressed": false,
				"expires": h.expires.UTC().Format(pbDate), "error": ""}
			if res.Errors["base"] != "" {
				fields["error"] = "hue_button" // te vroeg ingediend: nog niet gedrukt
			}
			r.pb.UpdatePairingSession(h.id, fields)
			return
		}
		var data map[string]any
		switch {
		case res.StepID == "init" && r.hueHost != "":
			data = map[string]any{"id": "manual"}
		case res.StepID == "manual" && r.hueHost != "":
			data = map[string]any{"host": r.hueHost}
		default:
			log.Printf("[KOPPELEN] Onverwachte Hue-stap %q\n", res.StepID)
			r.failHueLocked("hue_not_found")
			return
		}
		next, err := r.ha.SubmitFlow(res.FlowID, data)
		if err != nil {
			log.Printf("[KOPPELEN] Hue-stap %s mislukt: %v\n", res.StepID, err)
			r.failHueLocked("hue_not_found")
			return
		}
		res = next
	}
	r.failHueLocked("hue_not_found")
}

// openHueLocked: de bridge is gekoppeld; zijn lampen worden candidates. HA
// maakt de entiteiten pas na het koppelen, dus een paar keer kijken.
func (r *pairingRunner) openHueLocked(entries []string) {
	h := r.hue
	inApp := map[string]bool{}
	if r.inApp != nil {
		inApp = r.inApp("hue")
	}
	var devs []homeassistant.RegistryDevice
	var ents []homeassistant.RegistryEntity
	var cands []pocketbase.PairingCandidate
	for try := 0; try < 5 && len(cands) == 0; try++ {
		if try > 0 {
			r.sleep(time.Second)
		}
		devs, _ = r.ha.ListDevices()
		ents, _ = r.ha.ListEntities()
		cands = hueCandidates(devs, ents, entries, inApp)
	}
	names := map[string]string{}
	for _, d := range devs {
		names[d.ID] = d.Name
	}
	for _, c := range cands {
		entity, _ := hueEntity(ents, c.Address)
		if state, err := r.ha.GetState(entity); err == nil {
			modes, _ := state.Attributes["supported_color_modes"].([]any)
			c.Capabilities = hueLightCapabilities(modes)
		} else {
			c.Capabilities = []string{"onoff"}
		}
		c.Session = h.id
		created, err := r.pb.CreatePairingCandidate(c)
		if err != nil {
			log.Printf("[KOPPELEN] Hue-candidate %s schrijven mislukt: %v\n", c.Address, err)
			continue
		}
		h.parts[created.ID] = hueCandidate{address: c.Address, entity: entity, model: c.Model,
			name: names[c.Address], capabilities: c.Capabilities}
	}
	r.pb.UpdatePairingSession(h.id, map[string]any{"status": "open", "button_pressed": false, "error": "",
		"expires": h.expires.UTC().Format(pbDate)})
	log.Printf("[KOPPELEN] Hue-bridge gekoppeld: %d lampen gevonden\n", len(cands))
}

func (r *pairingRunner) onHueCandidateLocked(c pocketbase.PairingCandidate) {
	h := r.hue
	part, ok := h.parts[c.ID]
	if !ok {
		return
	}
	if c.Identify > h.identify[c.ID] {
		h.identify[c.ID] = c.Identify
		if err := r.ha.CallService("light", "turn_on", part.entity, map[string]any{"flash": "short"}); err != nil {
			log.Printf("[KOPPELEN] Hue-lamp laten knipperen mislukt: %v\n", err)
		}
	}
	if !c.Add || h.adding[c.ID] || c.Status == "adding" || c.Status == "added" {
		return
	}
	h.adding[c.ID] = true
	r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "adding"})
	name := c.Name
	if name == "" {
		name = part.name
	}
	dev, err := r.pb.CreateDevice(pocketbase.NewDevice{Gateway: r.house(), Room: c.Room, Name: name, Type: "light",
		Source: "hue", Address: part.address, EntityID: part.entity, Model: part.model, Capabilities: part.capabilities})
	if err != nil {
		log.Printf("[KOPPELEN] Hue-lamp %s aanmaken mislukt: %v\n", part.address, err)
		r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "failed"})
		h.adding[c.ID] = false
		return
	}
	r.pb.UpdatePairingCandidate(c.ID, map[string]any{"status": "added", "device": dev.ID})
	log.Printf("[KOPPELEN] Hue-lamp %q toegevoegd\n", name)
}

func (r *pairingRunner) failHueLocked(code string) {
	r.pb.UpdatePairingSession(r.hue.id, map[string]any{"status": "failed", "error": code})
	r.hue = nil
}

func (r *pairingRunner) closeHueLocked() {
	r.pb.UpdatePairingSession(r.hue.id, map[string]any{"status": "closed"})
	r.hue = nil
}

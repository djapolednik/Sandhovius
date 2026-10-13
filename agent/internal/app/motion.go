package app

import (
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// Bewegingslicht (spec 2026-10-13-motion-light-design): bij beweging gaan de
// lampen van een regel aan, OffAfter minuten na de laatste beweging weer uit.
//
// De motor is puur: hij krijgt events en de tijd, en geeft terug wat er aan
// of uit moet. Het schakelen zelf, het opslaan op schijf en de klok doet de
// agent. Niet veilig voor gelijktijdig gebruik; de agent zet er een mutex
// omheen.
//
// Eigenaarschap: een regel doet alleen een lamp uit die hij zelf aanzette
// (of die een andere regel aanzette en die hij mede bezit). Een lamp die al
// aan stond, blijft van de bewoner; een lamp die tussendoor uit gaat, is van
// niemand meer.

// motionAction: deze lamp aan of uit, namens deze regel.
type motionAction struct {
	Rule   string
	Device string
	On     bool
}

type motionEngine struct {
	rules map[string]pocketbase.MotionLight // alleen ingeschakelde regels
	// owners: lamp → regel → uit-tijd. Nul = er is nog beweging, de klok
	// loopt niet.
	owners map[string]map[string]time.Time
	// lamps: laatst bekende stand per lamp. Onbekend telt als uit: bij het
	// opstarten haalt de agent de stand van elke lamp meteen op.
	lamps map[string]bool
	dark  *bool // nil = onbekend, telt als donker
}

func newMotionEngine() *motionEngine {
	return &motionEngine{
		rules:  map[string]pocketbase.MotionLight{},
		owners: map[string]map[string]time.Time{},
		lamps:  map[string]bool{},
	}
}

// setRules vervangt de regels (uit het snapshot). Een regel die weg is of
// uitgeschakeld, laat zijn lampen los: die blijven zoals ze zijn.
func (m *motionEngine) setRules(rules []pocketbase.MotionLight) {
	m.rules = map[string]pocketbase.MotionLight{}
	for _, r := range rules {
		if r.Enabled {
			m.rules[r.ID] = r
		}
	}
	m.dropOwnersWithoutRule()
}

// setDark: HA's sun.sun, zie darkFromSun.
func (m *motionEngine) setDark(dark bool) {
	m.dark = &dark
}

// onLamp: een lamp ging aan of uit, door wat dan ook. Uit = van niemand meer.
func (m *motionEngine) onLamp(device string, on bool) {
	m.lamps[device] = on
	if !on {
		delete(m.owners, device)
	}
}

// onSensor: de sensor meldt beweging of geen beweging.
func (m *motionEngine) onSensor(sensor string, motion bool, now time.Time) []motionAction {
	var actions []motionAction
	for _, r := range m.rules {
		if r.Sensor != sensor {
			continue
		}
		if !motion {
			// De klok gaat lopen voor elke lamp die deze regel bezit. Loopt hij
			// al, dan niet opnieuw: Zigbee2MQTT herhaalt "geen beweging" bij
			// elk bericht (ook een batterij-update), en dat zou het uitgaan
			// eindeloos uitstellen.
			for _, d := range r.Devices {
				if until, owned := m.owners[d][r.ID]; owned && until.IsZero() {
					m.owners[d][r.ID] = now.Add(time.Duration(r.OffAfter) * time.Minute)
				}
			}
			continue
		}
		mayTurnOn := !r.OnlyDark || m.dark == nil || *m.dark
		for _, d := range r.Devices {
			owners := m.owners[d]
			switch {
			case owners != nil:
				// Al van een regel (deze of een andere): mede-eigenaar, klok stil.
				// Ook overdag: de beweging houdt een lamp die al brandt aan.
				owners[r.ID] = time.Time{}
			case !m.lamps[d] && mayTurnOn:
				m.owners[d] = map[string]time.Time{r.ID: {}}
				m.lamps[d] = true // het event van HA bevestigt het straks
				actions = append(actions, motionAction{Rule: r.ID, Device: d, On: true})
			}
			// Aan en van niemand: van de bewoner, niet aanraken.
		}
	}
	return actions
}

// due: lampen waarvan de klok van elke eigenaar verstreken is, gaan uit.
func (m *motionEngine) due(now time.Time) []motionAction {
	var actions []motionAction
	for d, owners := range m.owners {
		last, rule, running := time.Time{}, "", false
		for id, until := range owners {
			if until.IsZero() || until.After(now) {
				running = true
				break
			}
			if until.After(last) {
				last, rule = until, id
			}
		}
		if running {
			continue
		}
		delete(m.owners, d)
		m.lamps[d] = false
		actions = append(actions, motionAction{Rule: rule, Device: d, On: false})
	}
	return actions
}

// owned geeft een kopie van wie wat bezit, om op schijf te zetten.
func (m *motionEngine) owned() map[string]map[string]time.Time {
	out := make(map[string]map[string]time.Time, len(m.owners))
	for d, owners := range m.owners {
		out[d] = make(map[string]time.Time, len(owners))
		for id, until := range owners {
			out[d][id] = until
		}
	}
	return out
}

// restore zet het eigenaarschap terug na een herstart (zie owned). Een lamp
// met een eigenaar brandt: de regel zette hem aan en hij ging niet uit.
func (m *motionEngine) restore(owned map[string]map[string]time.Time) {
	m.owners = map[string]map[string]time.Time{}
	for d, owners := range owned {
		m.owners[d] = map[string]time.Time{}
		for id, until := range owners {
			m.owners[d][id] = until
		}
		m.lamps[d] = true
	}
	m.dropOwnersWithoutRule()
}

func (m *motionEngine) dropOwnersWithoutRule() {
	for d, owners := range m.owners {
		for id := range owners {
			if _, ok := m.rules[id]; !ok {
				delete(owners, id)
			}
		}
		if len(owners) == 0 {
			delete(m.owners, d)
		}
	}
}

// motionFromState leest beweging uit een device-stand. Zigbee2MQTT meldt
// occupancy of motion als bool; HA (binary_sensor, of de input_boolean van
// een dev-sensor) "on" of "off". ok is false als de stand niets over
// beweging zegt (een temperatuur, alleen de batterij).
func motionFromState(state map[string]any) (motion, ok bool) {
	for _, key := range []string{"occupancy", "motion"} {
		if v, isBool := state[key].(bool); isBool {
			return v, true
		}
	}
	switch state["state"] {
	case "on":
		return true, true
	case "off":
		return false, true
	}
	return false, false
}

// darkFromSun: HA's sun.sun staat op below_horizon of above_horizon.
func darkFromSun(state string) (dark, ok bool) {
	switch state {
	case "below_horizon":
		return true, true
	case "above_horizon":
		return false, true
	}
	return false, false
}

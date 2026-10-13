package app

import (
	"reflect"
	"sort"
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

var motionT0 = time.Date(2027, 10, 4, 21, 0, 0, 0, time.UTC)

func at(minutes float64) time.Time {
	return motionT0.Add(time.Duration(minutes * float64(time.Minute)))
}

func motionRule(id, sensor string, offAfter int, devices ...string) pocketbase.MotionLight {
	return pocketbase.MotionLight{ID: id, Sensor: sensor, Devices: devices, OnlyDark: true, OffAfter: offAfter, Enabled: true}
}

// engine met de regels, het donker, en alle genoemde lampen bekend als uit.
func newTestEngine(dark bool, rules ...pocketbase.MotionLight) *motionEngine {
	m := newMotionEngine()
	m.setRules(rules)
	m.setDark(dark)
	for _, r := range rules {
		for _, d := range r.Devices {
			m.onLamp(d, false)
		}
	}
	return m
}

func sorted(actions []motionAction) []motionAction {
	sort.Slice(actions, func(i, j int) bool { return actions[i].Device < actions[j].Device })
	return actions
}

func expect(t *testing.T, what string, got []motionAction, want ...motionAction) {
	t.Helper()
	if len(got) == 0 && len(want) == 0 {
		return
	}
	if !reflect.DeepEqual(sorted(got), sorted(want)) {
		t.Errorf("%s: %v, want %v", what, got, want)
	}
}

func on(rule, device string) motionAction { return motionAction{Rule: rule, Device: device, On: true} }
func off(rule, device string) motionAction {
	return motionAction{Rule: rule, Device: device, On: false}
}

func TestMotionTurnsOnInTheDarkAndOffAfterTheMinutes(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp1", "lamp2"))

	expect(t, "beweging", m.onSensor("sensor", true, at(0)), on("gang", "lamp1"), on("gang", "lamp2"))
	expect(t, "nog meer beweging: al aan", m.onSensor("sensor", true, at(0.5)))
	expect(t, "geen beweging", m.onSensor("sensor", false, at(1)))
	expect(t, "net voor de minuten", m.due(at(3.9)))
	expect(t, "na de minuten", m.due(at(4)), off("gang", "lamp1"), off("gang", "lamp2"))
	expect(t, "daarna niets meer", m.due(at(10)))
}

func TestMotionAgainStopsTheClock(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	m.onSensor("sensor", true, at(0))
	m.onSensor("sensor", false, at(1))
	expect(t, "weer beweging", m.onSensor("sensor", true, at(2)))
	expect(t, "klok stil zolang er beweging is", m.due(at(10)))
	m.onSensor("sensor", false, at(10))
	expect(t, "drie minuten na de laatste", m.due(at(13)), off("gang", "lamp"))
}

// Zigbee2MQTT stuurt bij elk bericht de hele stand: een batterij-update
// herhaalt "geen beweging". Dat mag de klok niet opnieuw laten beginnen.
func TestMotionRepeatedNoMotionDoesNotPostpone(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	m.onSensor("sensor", true, at(0))
	m.onSensor("sensor", false, at(1))
	m.onSensor("sensor", false, at(2.5)) // batterij-update
	m.onSensor("sensor", false, at(3.5)) // nog een
	expect(t, "drie minuten na de eerste geen-beweging", m.due(at(4)), off("gang", "lamp"))
}

func TestMotionDaylight(t *testing.T) {
	m := newTestEngine(false, motionRule("gang", "sensor", 3, "lamp"))
	expect(t, "overdag niet aan", m.onSensor("sensor", true, at(0)))

	always := motionRule("altijd", "sensor2", 3, "lamp2")
	always.OnlyDark = false
	m = newTestEngine(false, always)
	expect(t, "zonder alleen-donker ook overdag", m.onSensor("sensor2", true, at(0)), on("altijd", "lamp2"))
}

func TestMotionUnknownDarkCountsAsDark(t *testing.T) {
	m := newMotionEngine()
	m.setRules([]pocketbase.MotionLight{motionRule("gang", "sensor", 3, "lamp")})
	m.onLamp("lamp", false)
	expect(t, "donker onbekend", m.onSensor("sensor", true, at(0)), on("gang", "lamp"))
}

// Licht geworden terwijl de regel de lamp nog bezit: de beweging houdt hem
// aan, en hij gaat gewoon uit na de minuten.
func TestMotionKeepsItsOwnLampAfterSunrise(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	m.onSensor("sensor", true, at(0))
	m.setDark(false)
	m.onSensor("sensor", false, at(1))
	m.onSensor("sensor", true, at(2))
	expect(t, "nog beweging", m.due(at(10)))
	m.onSensor("sensor", false, at(10))
	expect(t, "uit na de minuten", m.due(at(13)), off("gang", "lamp"))
}

func TestMotionLeavesALampThatWasAlreadyOn(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp", "lamp2"))
	m.onLamp("lamp", true) // zelf aangedaan
	expect(t, "alleen de lamp die uit stond", m.onSensor("sensor", true, at(0)), on("gang", "lamp2"))
	m.onSensor("sensor", false, at(1))
	expect(t, "alleen die gaat uit", m.due(at(4)), off("gang", "lamp2"))
}

func TestMotionLetsGoOfALampSwitchedOffInBetween(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	m.onSensor("sensor", true, at(0))
	m.onLamp("lamp", false) // in de app uitgezet
	m.onLamp("lamp", true)  // en zelf weer aan
	m.onSensor("sensor", false, at(1))
	expect(t, "niet meer van de regel", m.due(at(10)))
}

func TestMotionTwoRulesOneLamp(t *testing.T) {
	m := newTestEngine(true, motionRule("voor", "s1", 3, "lamp"), motionRule("achter", "s2", 5, "lamp"))
	expect(t, "eerste sensor", m.onSensor("s1", true, at(0)), on("voor", "lamp"))
	expect(t, "tweede sensor: al aan, wel mede-eigenaar", m.onSensor("s2", true, at(1)))
	m.onSensor("s1", false, at(2))
	expect(t, "achter heeft nog beweging", m.due(at(10)))
	m.onSensor("s2", false, at(10))
	expect(t, "pas als niemand hem nog bezit", m.due(at(14.9)))
	expect(t, "na de vijf minuten van achter", m.due(at(15)), off("achter", "lamp"))
}

func TestMotionDisabledOrRemovedRuleLetsGo(t *testing.T) {
	r := motionRule("gang", "sensor", 3, "lamp")
	m := newTestEngine(true, r)
	m.onSensor("sensor", true, at(0))
	r.Enabled = false
	m.setRules([]pocketbase.MotionLight{r})
	expect(t, "uitgeschakeld: geen beweging meer", m.onSensor("sensor", true, at(1)))
	m.onSensor("sensor", false, at(1))
	expect(t, "en hij doet de lamp niet uit", m.due(at(10)))

	m = newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	m.onSensor("sensor", true, at(0))
	m.setRules(nil)
	expect(t, "verwijderd: lamp blijft aan", m.due(at(10)))
}

func TestMotionRuleWithoutLampsDoesNothing(t *testing.T) {
	m := newTestEngine(true, motionRule("leeg", "sensor", 3))
	expect(t, "geen lampen", m.onSensor("sensor", true, at(0)))
}

func TestMotionOtherSensorDoesNothing(t *testing.T) {
	m := newTestEngine(true, motionRule("gang", "sensor", 3, "lamp"))
	expect(t, "andere sensor", m.onSensor("keuken", true, at(0)))
}

// Na een herstart: wie de regels nog bezit en tot wanneer.
func TestMotionOwnersSurviveARestart(t *testing.T) {
	rules := []pocketbase.MotionLight{motionRule("gang", "sensor", 3, "lamp", "lamp2")}
	m := newTestEngine(true, rules...)
	m.onSensor("sensor", true, at(0))
	m.onSensor("sensor", false, at(1))
	saved := m.owned()

	restarted := newMotionEngine()
	restarted.setRules(rules)
	restarted.restore(saved)
	expect(t, "nog binnen de minuten", restarted.due(at(3)))
	expect(t, "daarna uit", restarted.due(at(4)), off("gang", "lamp"), off("gang", "lamp2"))

	// Een regel die er na de herstart niet meer is: zijn lampen blijven aan.
	gone := newMotionEngine()
	gone.restore(saved)
	expect(t, "regel weg", gone.due(at(10)))
}

func TestMotionFromState(t *testing.T) {
	cases := []struct {
		name   string
		state  map[string]any
		motion bool
		ok     bool
	}{
		{"zigbee occupancy", map[string]any{"occupancy": true}, true, true},
		{"zigbee geen occupancy", map[string]any{"occupancy": false, "battery": 80}, false, true},
		{"zigbee motion", map[string]any{"motion": true}, true, true},
		{"ha binary_sensor aan", map[string]any{"state": "on"}, true, true},
		{"ha binary_sensor uit", map[string]any{"state": "off"}, false, true},
		{"temperatuur", map[string]any{"state": "21.5"}, false, false},
		{"alleen batterij", map[string]any{"battery": 80}, false, false},
	}
	for _, c := range cases {
		motion, ok := motionFromState(c.state)
		if motion != c.motion || ok != c.ok {
			t.Errorf("%s: %v, %v; want %v, %v", c.name, motion, ok, c.motion, c.ok)
		}
	}
}

func TestDarkFromSun(t *testing.T) {
	if dark, ok := darkFromSun("below_horizon"); !dark || !ok {
		t.Errorf("below_horizon: %v %v", dark, ok)
	}
	if dark, ok := darkFromSun("above_horizon"); dark || !ok {
		t.Errorf("above_horizon: %v %v", dark, ok)
	}
	if _, ok := darkFromSun("unavailable"); ok {
		t.Errorf("unavailable telt niet")
	}
}

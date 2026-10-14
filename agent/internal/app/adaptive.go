package app

import (
	"math"
	"slices"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// Kleur volgt de dag (spec 2026-10-14-adaptive-light-design.md): een pure
// motor, zoals motion.go. Hij weet welke lampen meedoen en hoe ze staan, en
// zegt "zet lamp X op N K". De I/O zit in adaptive_agent.go.

const (
	kelvinNight = 2200 // nacht en avond
	kelvinEdge  = 2700 // bij zonsopkomst en zonsondergang
	kelvinNoon  = 4000 // midden op de dag
	// Pas sturen bij zoveel verschil: geen zichtbare stapjes, weinig verkeer.
	kelvinStep = 50
	// Een wittint die zoveel afwijkt van wat de motor zette, koos iemand anders.
	kelvinOwnChoice = 150
	// Zo lang na een eigen commando telt een afwijking nog als echo.
	echoWindow = time.Minute
)

// kelvinFor is de wittint op het moment now, bij deze zonsopkomst en
// -ondergang: 's nachts warm, een uur voor zonsopkomst oplopend, overdag een
// boog naar fris midden op de dag, en een uur na zonsondergang weer warm.
// Afgerond op kelvinStep.
func kelvinFor(now, rise, set time.Time) int {
	var k float64
	switch {
	case now.Before(rise.Add(-time.Hour)) || !now.Before(set.Add(time.Hour)):
		k = kelvinNight
	case now.Before(rise):
		f := 1 - rise.Sub(now).Hours()
		k = kelvinNight + (kelvinEdge-kelvinNight)*f
	case now.Before(set):
		f := now.Sub(rise).Seconds() / set.Sub(rise).Seconds()
		k = kelvinEdge + (kelvinNoon-kelvinEdge)*math.Sin(math.Pi*f)
	default:
		f := now.Sub(set).Hours()
		k = kelvinEdge - (kelvinEdge-kelvinNight)*f
	}
	return int(math.Round(k/kelvinStep)) * kelvinStep
}

type adaptiveAction struct {
	Entity string
	Kelvin int
}

type adaptiveLamp struct {
	min, max int
	on       bool
	mode     string
	kelvin   int
	// manual: iemand koos zelf een kleur; tot de lamp uit gaat niet sturen.
	manual bool
	// expect: de wittint die de motor zette of goed vond, en wanneer.
	expect   int
	expectAt time.Time
}

type adaptiveEngine struct {
	lamps map[string]*adaptiveLamp // op entity_id
	loc   *homeLocation
}

func newAdaptiveEngine() *adaptiveEngine {
	return &adaptiveEngine{lamps: map[string]*adaptiveLamp{}}
}

// setLamps: de lampen die meedoen (adaptive aan en kleurtemperatuur). Wat al
// bekend was houdt zijn stand.
func (e *adaptiveEngine) setLamps(devices []pocketbase.Device) {
	next := map[string]*adaptiveLamp{}
	for _, d := range devices {
		if !d.Adaptive || d.Type != "light" || d.EntityID == "" || !slices.Contains(d.Capabilities, "color_temp") {
			continue
		}
		if l, ok := e.lamps[d.EntityID]; ok {
			next[d.EntityID] = l
		} else {
			next[d.EntityID] = &adaptiveLamp{}
		}
	}
	e.lamps = next
}

func (e *adaptiveEngine) setLocation(loc *homeLocation) { e.loc = loc }

// target: de wittint voor deze lamp nu, binnen wat hij kan.
func (e *adaptiveEngine) target(l *adaptiveLamp, now time.Time) (int, bool) {
	if e.loc == nil {
		return 0, false
	}
	rise, set, ok := sunTimes(now, e.loc.Lat, e.loc.Lon)
	if !ok {
		return 0, false
	}
	k := kelvinFor(now, rise, set)
	if l.min > 0 && k < l.min {
		k = l.min
	}
	if l.max > 0 && k > l.max {
		k = l.max
	}
	return k, true
}

// onState: een nieuwe stand van een lamp. Gaat hij aan, dan meteen de juiste
// wittint; gaat hij uit, dan volgt hij de volgende keer weer.
func (e *adaptiveEngine) onState(entity string, state map[string]any, now time.Time) []adaptiveAction {
	l, ok := e.lamps[entity]
	if !ok {
		return nil
	}
	attrs, _ := state["attributes"].(map[string]any)
	if v, ok := number(attrs["min_color_temp_kelvin"]); ok {
		l.min = int(v)
	}
	if v, ok := number(attrs["max_color_temp_kelvin"]); ok {
		l.max = int(v)
	}
	if !lampIsOn(state) {
		l.on, l.manual, l.expect = false, false, 0
		return nil
	}
	wasOn := l.on
	l.on = true
	l.mode, _ = attrs["color_mode"].(string)
	if v, ok := number(attrs["color_temp_kelvin"]); ok {
		l.kelvin = int(v)
	}
	if !wasOn {
		return e.steer(entity, l, now)
	}
	// Al aan: koos iemand anders een kleur of wittint?
	if l.mode != "" && l.mode != "color_temp" {
		l.manual = true
	} else if l.expect > 0 && now.Sub(l.expectAt) > echoWindow && abs(l.kelvin-l.expect) > kelvinOwnChoice {
		l.manual = true
	}
	return nil
}

// manual: de bewoner koos zelf een kleur (app of scène).
func (e *adaptiveEngine) manual(entity string) {
	if l, ok := e.lamps[entity]; ok {
		l.manual = true
	}
}

// tick: elke minuut; stuurt alleen bij genoeg verschil.
func (e *adaptiveEngine) tick(now time.Time) []adaptiveAction {
	var out []adaptiveAction
	for entity, l := range e.lamps {
		if l.on {
			out = append(out, e.steer(entity, l, now)...)
		}
	}
	return out
}

func (e *adaptiveEngine) steer(entity string, l *adaptiveLamp, now time.Time) []adaptiveAction {
	if l.manual {
		return nil
	}
	k, ok := e.target(l, now)
	if !ok {
		return nil
	}
	if l.mode == "color_temp" && abs(k-l.kelvin) < kelvinStep {
		if l.expect == 0 {
			l.expect, l.expectAt = l.kelvin, now
		}
		return nil
	}
	l.kelvin, l.mode, l.expect, l.expectAt = k, "color_temp", k, now
	return []adaptiveAction{{Entity: entity, Kelvin: k}}
}

func number(v any) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

package app

import (
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

func TestKelvinFor(t *testing.T) {
	loc := amsterdam(t)
	day := time.Date(2026, 10, 14, 0, 0, 0, 0, loc)
	rise := time.Date(2026, 10, 14, 8, 0, 0, 0, loc)
	set := time.Date(2026, 10, 14, 18, 0, 0, 0, loc)
	at := func(h, m int) time.Time { return day.Add(time.Duration(h)*time.Hour + time.Duration(m)*time.Minute) }
	cases := []struct {
		name string
		now  time.Time
		want int
	}{
		{"nacht", at(3, 0), 2200},
		{"half uur voor opkomst", at(7, 30), 2450},
		{"zonsopkomst", at(8, 0), 2700},
		{"midden op de dag", at(13, 0), 4000},
		{"zonsondergang", at(18, 0), 2700},
		{"half uur na ondergang", at(18, 30), 2450},
		{"avond", at(21, 0), 2200},
	}
	for _, c := range cases {
		if got := kelvinFor(c.now, rise, set); got != c.want {
			t.Errorf("%s: %d K, verwacht %d K", c.name, got, c.want)
		}
	}
	// altijd afgerond op 50 K en tussen 2200 en 4000
	for m := 0; m < 24*60; m += 7 {
		k := kelvinFor(day.Add(time.Duration(m)*time.Minute), rise, set)
		if k%50 != 0 || k < 2200 || k > 4000 {
			t.Fatalf("%d min: %d K", m, k)
		}
	}
}

func adaptiveLampDevice(id, entity string) pocketbase.Device {
	return pocketbase.Device{ID: id, EntityID: entity, Type: "light", Adaptive: true,
		Capabilities: []string{"onoff", "brightness", "color_temp"}}
}

func lampState(on bool, mode string, kelvin int) map[string]any {
	state := "off"
	if on {
		state = "on"
	}
	attrs := map[string]any{"min_color_temp_kelvin": 2000.0, "max_color_temp_kelvin": 6500.0}
	if mode != "" {
		attrs["color_mode"] = mode
	}
	if kelvin > 0 {
		attrs["color_temp_kelvin"] = float64(kelvin)
	}
	return map[string]any{"state": state, "attributes": attrs}
}

// Middag 14 oktober 2026 in Amsterdam: ruim 3500 K.
func adaptiveNoon(t *testing.T) time.Time {
	return time.Date(2026, 10, 14, 13, 0, 0, 0, amsterdam(t))
}

func newTestAdaptive(devices ...pocketbase.Device) *adaptiveEngine {
	e := newAdaptiveEngine()
	e.setLamps(devices)
	e.setLocation(amsterdamHome)
	return e
}

func TestAdaptiveTurnOnSetsKelvin(t *testing.T) {
	now := adaptiveNoon(t)
	e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
	if acts := e.onState("light.lees", lampState(false, "", 0), now); len(acts) != 0 {
		t.Fatalf("uit: %+v", acts)
	}
	acts := e.onState("light.lees", lampState(true, "color_temp", 2700), now)
	if len(acts) != 1 || acts[0].Entity != "light.lees" || acts[0].Kelvin < 3500 {
		t.Fatalf("aan: %+v", acts)
	}
	// de echo van het eigen commando is geen eigen keuze
	e.onState("light.lees", lampState(true, "color_temp", acts[0].Kelvin), now.Add(5*time.Second))
	if acts := e.tick(now.Add(time.Minute)); len(acts) != 0 {
		t.Errorf("al goed: %+v", acts)
	}
}

func TestAdaptiveNeverTouchesALampThatIsOff(t *testing.T) {
	now := adaptiveNoon(t)
	e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
	e.onState("light.lees", lampState(false, "color_temp", 2200), now)
	if acts := e.tick(now); len(acts) != 0 {
		t.Errorf("lamp uit: %+v", acts)
	}
}

func TestAdaptiveFollowsTheDay(t *testing.T) {
	loc := amsterdam(t)
	e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
	evening := time.Date(2026, 10, 14, 17, 0, 0, 0, loc)
	acts := e.onState("light.lees", lampState(true, "color_temp", 4000), evening)
	if len(acts) != 1 {
		t.Fatalf("aan: %+v", acts)
	}
	first := acts[0].Kelvin
	e.onState("light.lees", lampState(true, "color_temp", first), evening.Add(5*time.Second))
	// anderhalf uur later is het warmer
	later := e.tick(evening.Add(90 * time.Minute))
	if len(later) != 1 || later[0].Kelvin >= first {
		t.Errorf("later: %+v (eerst %d K)", later, first)
	}
}

func TestAdaptivePausesOnOwnChoiceUntilOff(t *testing.T) {
	now := adaptiveNoon(t)
	e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
	acts := e.onState("light.lees", lampState(true, "color_temp", 2700), now)
	e.onState("light.lees", lampState(true, "color_temp", acts[0].Kelvin), now.Add(time.Second))

	// de bewoner kiest in de app zelf een wittint
	e.manual("light.lees")
	e.onState("light.lees", lampState(true, "color_temp", 2200), now.Add(2*time.Minute))
	if acts := e.tick(now.Add(3 * time.Hour)); len(acts) != 0 {
		t.Errorf("gepauzeerd: %+v", acts)
	}
	// uit en weer aan: weer volgen
	e.onState("light.lees", lampState(false, "color_temp", 2200), now.Add(4*time.Hour))
	if acts := e.onState("light.lees", lampState(true, "color_temp", 2200), now.Add(4*time.Hour+time.Second)); len(acts) != 1 {
		t.Errorf("weer aan: %+v", acts)
	}
}

func TestAdaptivePausesOnColourFromOutside(t *testing.T) {
	now := adaptiveNoon(t)
	for name, outside := range map[string]map[string]any{
		"kleur":          lampState(true, "xy", 0),
		"andere wittint": lampState(true, "color_temp", 2200),
	} {
		e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
		acts := e.onState("light.lees", lampState(true, "color_temp", 2700), now)
		e.onState("light.lees", lampState(true, "color_temp", acts[0].Kelvin), now.Add(time.Second))
		// een afstandsbediening, ruim na het eigen commando
		e.onState("light.lees", outside, now.Add(5*time.Minute))
		if acts := e.tick(now.Add(3 * time.Hour)); len(acts) != 0 {
			t.Errorf("%s: %+v", name, acts)
		}
	}
}

func TestAdaptiveOnlyChosenLampsWithColorTemp(t *testing.T) {
	now := adaptiveNoon(t)
	off := adaptiveLampDevice("d2", "light.uit")
	off.Adaptive = false
	dim := adaptiveLampDevice("d3", "light.dim")
	dim.Capabilities = []string{"onoff", "brightness"}
	e := newTestAdaptive(off, dim)
	for _, entity := range []string{"light.uit", "light.dim"} {
		if acts := e.onState(entity, lampState(true, "color_temp", 2700), now); len(acts) != 0 {
			t.Errorf("%s: %+v", entity, acts)
		}
	}
}

func TestAdaptiveWithoutLocation(t *testing.T) {
	e := newAdaptiveEngine()
	e.setLamps([]pocketbase.Device{adaptiveLampDevice("d1", "light.lees")})
	if acts := e.onState("light.lees", lampState(true, "color_temp", 2700), adaptiveNoon(t)); len(acts) != 0 {
		t.Errorf("zonder locatie: %+v", acts)
	}
}

func TestAdaptiveRespectsLampRange(t *testing.T) {
	now := adaptiveNoon(t)
	e := newTestAdaptive(adaptiveLampDevice("d1", "light.lees"))
	state := lampState(true, "color_temp", 2700)
	state["attributes"].(map[string]any)["max_color_temp_kelvin"] = 3000.0
	acts := e.onState("light.lees", state, now)
	if len(acts) != 1 || acts[0].Kelvin != 3000 {
		t.Errorf("begrensd: %+v", acts)
	}
}

// Een commando of scène met een wittint of kleur pauzeert de lamp; aan- en
// uitzetten of alleen helderheid niet. De motor zelf stuurt zonder pauze.
func TestCallHAMarksOwnColour(t *testing.T) {
	var sent []map[string]any
	a := &Agent{callService: func(_, _, _ string, data map[string]any) error {
		sent = append(sent, data)
		return nil
	}}
	a.adaptive = newAdaptiveRunner(func(entity string, kelvin int) error {
		return a.rawCallHA("light", "turn_on", entity, map[string]any{"color_temp_kelvin": kelvin})
	})
	a.adaptive.engine.setLamps([]pocketbase.Device{adaptiveLampDevice("d1", "light.lees")})
	lamp := a.adaptive.engine.lamps["light.lees"]

	_ = a.callHA("light", "turn_on", "light.lees", map[string]any{"brightness_pct": 40})
	if lamp.manual {
		t.Error("helderheid pauzeert niet")
	}
	_ = a.adaptive.send("light.lees", 3000)
	if lamp.manual {
		t.Error("de motor zelf pauzeert niet")
	}
	_ = a.callHA("light", "turn_on", "light.lees", map[string]any{"color_temp_kelvin": 2200})
	if !lamp.manual {
		t.Error("een eigen wittint pauzeert")
	}
	if len(sent) != 3 {
		t.Errorf("verstuurd: %v", sent)
	}
}

package app

import (
	"reflect"
	"strings"
	"testing"

	"sandhovius/local-agent/internal/pocketbase"
)

func TestServiceCall(t *testing.T) {
	cases := []struct {
		name    string
		action  string
		entity  string
		payload map[string]any
		domain  string
		service string
		data    map[string]any
		errText string
	}{
		{"zonder payload", "turn_on", "light.x", nil, "homeassistant", "turn_on", nil, ""},
		{"lege payload", "turn_on", "light.x", map[string]any{}, "homeassistant", "turn_on", map[string]any{}, ""},
		{"turn_off blijft", "turn_off", "light.x", nil, "homeassistant", "turn_off", nil, ""},
		{"set_temperature", "set_temperature", "climate.x", map[string]any{"temperature": 21.0}, "climate", "set_temperature", map[string]any{"temperature": 21.0}, ""},
		{"helderheid", "turn_on", "light.x", map[string]any{"brightness_pct": 60}, "light", "turn_on", map[string]any{"brightness_pct": 60}, ""},
		{"helderheid als float64", "turn_on", "light.x", map[string]any{"brightness_pct": 60.0}, "light", "turn_on", map[string]any{"brightness_pct": 60}, ""},
		{"helderheid 1", "turn_on", "light.x", map[string]any{"brightness_pct": 1.0}, "light", "turn_on", map[string]any{"brightness_pct": 1}, ""},
		{"helderheid 100", "turn_on", "light.x", map[string]any{"brightness_pct": 100.0}, "light", "turn_on", map[string]any{"brightness_pct": 100}, ""},
		{"helderheid 0", "turn_on", "light.x", map[string]any{"brightness_pct": 0.0}, "", "", nil, "Ongeldige helderheid"},
		{"helderheid 101", "turn_on", "light.x", map[string]any{"brightness_pct": 101.0}, "", "", nil, "Ongeldige helderheid"},
		{"helderheid 60.5", "turn_on", "light.x", map[string]any{"brightness_pct": 60.5}, "", "", nil, "Ongeldige helderheid"},
		{"helderheid tekst", "turn_on", "light.x", map[string]any{"brightness_pct": "60"}, "", "", nil, "Ongeldige helderheid"},
		{"kelvin", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 2700.0}, "light", "turn_on", map[string]any{"color_temp_kelvin": 2700}, ""},
		{"kelvin 1500", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 1500}, "light", "turn_on", map[string]any{"color_temp_kelvin": 1500}, ""},
		{"kelvin 9000", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 9000}, "light", "turn_on", map[string]any{"color_temp_kelvin": 9000}, ""},
		{"kelvin 1499", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 1499.0}, "", "", nil, "Ongeldige kleurtemperatuur"},
		{"kelvin 9001", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 9001.0}, "", "", nil, "Ongeldige kleurtemperatuur"},
		{"rgb", "turn_on", "light.x", map[string]any{"rgb_color": []any{255.0, 0.0, 128.0}}, "light", "turn_on", map[string]any{"rgb_color": []any{255, 0, 128}}, ""},
		{"rgb 2 waarden", "turn_on", "light.x", map[string]any{"rgb_color": []any{255.0, 0.0}}, "", "", nil, "Ongeldige kleur"},
		{"rgb 4 waarden", "turn_on", "light.x", map[string]any{"rgb_color": []any{1.0, 2.0, 3.0, 4.0}}, "", "", nil, "Ongeldige kleur"},
		{"rgb -1", "turn_on", "light.x", map[string]any{"rgb_color": []any{-1.0, 0.0, 0.0}}, "", "", nil, "Ongeldige kleur"},
		{"rgb 256", "turn_on", "light.x", map[string]any{"rgb_color": []any{256.0, 0.0, 0.0}}, "", "", nil, "Ongeldige kleur"},
		{"rgb geen getallen", "turn_on", "light.x", map[string]any{"rgb_color": []any{"a", "b", "c"}}, "", "", nil, "Ongeldige kleur"},
		{"rgb geen lijst", "turn_on", "light.x", map[string]any{"rgb_color": "rood"}, "", "", nil, "Ongeldige kleur"},
		{"rgb fractie", "turn_on", "light.x", map[string]any{"rgb_color": []any{1.5, 0.0, 0.0}}, "", "", nil, "Ongeldige kleur"},
		{"kelvin en rgb", "turn_on", "light.x", map[string]any{"color_temp_kelvin": 3000.0, "rgb_color": []any{1.0, 2.0, 3.0}}, "", "", nil, "Kies wit of kleur, niet allebei"},
		{"onbekende sleutel", "turn_on", "light.x", map[string]any{"effect": "colorloop"}, "", "", nil, "Onbekende instelling: effect"},
		{"payload op niet-lamp", "turn_on", "input_boolean.x", map[string]any{"brightness_pct": 50.0}, "", "", nil, "Deze lamp kan niet dimmen of kleuren"},
	}
	for _, c := range cases {
		domain, service, data, err := serviceCall(c.action, c.entity, c.payload)
		if c.errText != "" {
			if err == nil || err.Error() != c.errText {
				t.Errorf("%s: err = %v, want %q", c.name, err, c.errText)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: onverwachte fout: %v", c.name, err)
			continue
		}
		if domain != c.domain || service != c.service {
			t.Errorf("%s: %s.%s, want %s.%s", c.name, domain, service, c.domain, c.service)
		}
		if !reflect.DeepEqual(data, c.data) {
			t.Errorf("%s: data = %#v, want %#v", c.name, data, c.data)
		}
	}
}

// Een stap met een ongeldige payload mag de rest van de scène niet
// tegenhouden; de fout noemt alleen de mislukte stap.
func TestExecuteSceneInvalidLightStepDoesNotStopOthers(t *testing.T) {
	type call struct {
		domain, service, entity string
		data                    map[string]any
	}
	var calls []call
	a := &Agent{callService: func(domain, service, entityID string, data map[string]any) error {
		calls = append(calls, call{domain, service, entityID, data})
		return nil
	}}
	lookup := func(id string) (*pocketbase.Device, error) {
		return &pocketbase.Device{ID: id, Gateway: "h1", EntityID: "light." + id}, nil
	}
	scene := pocketbase.Scene{House: "h1", Name: "test", Actions: []pocketbase.SceneAction{
		{Device: "kapot", Action: "turn_on", Payload: map[string]any{"brightness_pct": 0.0}},
		{Device: "goed", Action: "turn_on", Payload: map[string]any{"brightness_pct": 40.0}},
	}}
	err := a.executeScene(scene, lookup)
	if err == nil || !strings.Contains(err.Error(), "Ongeldige helderheid") {
		t.Fatalf("err = %v, want Ongeldige helderheid", err)
	}
	if len(calls) != 1 {
		t.Fatalf("calls = %d, want 1: %#v", len(calls), calls)
	}
	want := call{"light", "turn_on", "light.goed", map[string]any{"brightness_pct": 40}}
	if !reflect.DeepEqual(calls[0], want) {
		t.Errorf("call = %#v, want %#v", calls[0], want)
	}
}

package app

import (
	"errors"
	"math"
	"strings"
)

// serviceCall bepaalt welke Home Assistant-service een commando of scène-stap
// nodig heeft. set_temperature bestaat alleen in het climate-domein. turn_on
// met een payload op een lamp gaat naar light.turn_on, met een gecontroleerde
// payload (helderheid, kleurtemperatuur of RGB-kleur); al het andere loopt
// via de domein-agnostische homeassistant.<action> met de payload ongewijzigd.
func serviceCall(action, entityID string, payload map[string]any) (domain, service string, data map[string]any, err error) {
	if action == "set_temperature" {
		return "climate", action, payload, nil
	}
	if action != "turn_on" || len(payload) == 0 {
		return "homeassistant", action, payload, nil
	}
	if !strings.HasPrefix(entityID, "light.") {
		return "", "", nil, errors.New("Deze lamp kan niet dimmen of kleuren")
	}
	data, err = lightPayload(payload)
	if err != nil {
		return "", "", nil, err
	}
	return "light", "turn_on", data, nil
}

// lightPayload controleert de payload van light.turn_on en geeft een schone
// kopie terug, met gehele getallen als int (JSON levert float64).
func lightPayload(payload map[string]any) (map[string]any, error) {
	for key := range payload {
		switch key {
		case "brightness_pct", "color_temp_kelvin", "rgb_color":
		default:
			return nil, errors.New("Onbekende instelling: " + key)
		}
	}
	_, hasKelvin := payload["color_temp_kelvin"]
	_, hasRGB := payload["rgb_color"]
	if hasKelvin && hasRGB {
		return nil, errors.New("Kies wit of kleur, niet allebei")
	}

	clean := map[string]any{}
	if v, ok := payload["brightness_pct"]; ok {
		n, ok := wholeNumber(v)
		if !ok || n < 1 || n > 100 {
			return nil, errors.New("Ongeldige helderheid")
		}
		clean["brightness_pct"] = n
	}
	if v, ok := payload["color_temp_kelvin"]; ok {
		n, ok := wholeNumber(v)
		if !ok || n < 1500 || n > 9000 {
			return nil, errors.New("Ongeldige kleurtemperatuur")
		}
		clean["color_temp_kelvin"] = n
	}
	if v, ok := payload["rgb_color"]; ok {
		list, ok := v.([]any)
		if !ok || len(list) != 3 {
			return nil, errors.New("Ongeldige kleur")
		}
		rgb := make([]any, 3)
		for i, item := range list {
			n, ok := wholeNumber(item)
			if !ok || n < 0 || n > 255 {
				return nil, errors.New("Ongeldige kleur")
			}
			rgb[i] = n
		}
		clean["rgb_color"] = rgb
	}
	return clean, nil
}

// wholeNumber accepteert een geheel getal, ook als JSON het als float64
// aanleverde (60.0); 60.5, tekst en NaN/Inf horen er niet bij.
func wholeNumber(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) || n != math.Trunc(n) || math.Abs(n) > 1e9 {
			return 0, false
		}
		return int(n), true
	}
	return 0, false
}

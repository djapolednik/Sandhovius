package app

import (
	"sort"

	"sandhovius/local-agent/internal/mqtt"
)

// Part is één bedienbaar deel van een Zigbee-apparaat zoals de app het toont:
// een lamp, een stekker, een sensor of een thermostaat. Een dubbele
// inbouwschakelaar geeft twee delen met hetzelfde adres en een eigen Endpoint
// (spec 2026-10-14-device-pairing-design.md).
type Part struct {
	Endpoint     string
	Type         string // light | switch | sensor | climate
	Capabilities []string
}

// capabilityOrder is de vaste woordenlijst (zelfde lijst als
// backend/pb_hooks/device_rules.js), in deze volgorde.
var capabilityOrder = []string{
	"onoff", "brightness", "color_temp", "color", "heating", "occupancy", "contact",
	"water_leak", "smoke", "temperature", "humidity", "illuminance", "battery",
}

// sensorExposes: de namen van Zigbee2MQTT die als sensor tellen. Let op:
// device_temperature is de chip, niet de kamer, en telt dus niet.
var sensorExposes = map[string]string{
	"occupancy": "occupancy", "contact": "contact", "water_leak": "water_leak", "smoke": "smoke",
	"temperature": "temperature", "humidity": "humidity", "illuminance": "illuminance", "illuminance_lux": "illuminance",
}

var lightFeatures = map[string]string{
	"state": "onoff", "brightness": "brightness", "color_temp": "color_temp", "color_xy": "color", "color_hs": "color",
}

// classify deelt een apparaat in delen in uit zijn exposes. nil betekent: niet
// ondersteund (niets dat de app kan tonen of bedienen).
func classify(exposes []mqtt.Expose) []Part {
	var parts []Part
	sensor := map[string]bool{}
	battery := false

	for _, e := range exposes {
		switch e.Type {
		case "light":
			caps := map[string]bool{}
			for _, f := range e.Features {
				if c, ok := lightFeatures[f.Name]; ok {
					caps[c] = true
				}
			}
			caps["onoff"] = true
			parts = append(parts, Part{Endpoint: e.Endpoint, Type: "light", Capabilities: ordered(caps)})
		case "switch":
			parts = append(parts, Part{Endpoint: e.Endpoint, Type: "switch", Capabilities: []string{"onoff"}})
		case "climate":
			caps := map[string]bool{"heating": true}
			for _, f := range e.Features {
				if f.Name == "local_temperature" {
					caps["temperature"] = true
				}
			}
			parts = append(parts, Part{Endpoint: e.Endpoint, Type: "climate", Capabilities: ordered(caps)})
		default:
			if e.Name == "battery" {
				battery = true
			} else if c, ok := sensorExposes[e.Name]; ok {
				sensor[c] = true
			}
		}
	}

	if len(parts) == 0 && len(sensor) > 0 {
		parts = []Part{{Type: "sensor", Capabilities: ordered(sensor)}}
	}
	if len(parts) == 0 {
		return nil
	}
	if battery {
		for i := range parts {
			parts[i].Capabilities = append(parts[i].Capabilities, "battery")
		}
	}
	sort.SliceStable(parts, func(i, j int) bool { return parts[i].Endpoint < parts[j].Endpoint })
	return parts
}

func ordered(set map[string]bool) []string {
	out := []string{}
	for _, c := range capabilityOrder {
		if set[c] {
			out = append(out, c)
		}
	}
	return out
}

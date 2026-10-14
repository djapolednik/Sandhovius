package mqtt

import "encoding/json"

// Expose is één eigenschap uit een Zigbee2MQTT-definitie: generiek
// (binary/numeric/enum, met Name en Property) of specifiek (light, switch,
// climate, met Features). Endpoint is gezet bij apparaten met meer delen
// ("l1", "l2").
type Expose struct {
	Type     string   `json:"type"`
	Name     string   `json:"name"`
	Property string   `json:"property"`
	Endpoint string   `json:"endpoint"`
	Features []Expose `json:"features"`
}

// BridgeDevice is één apparaat op het Zigbee-netwerk, zoals Zigbee2MQTT het
// retained publiceert op zigbee2mqtt/bridge/devices.
type BridgeDevice struct {
	IEEE, FriendlyName, Model, Vendor string
	Type                              string // Coordinator | Router | EndDevice
	Supported, InterviewCompleted     bool
	Exposes                           []Expose
}

// BridgeEvent is een melding op zigbee2mqtt/bridge/event.
type BridgeEvent struct {
	Type         string // device_joined | device_interview | device_announce | device_leave
	IEEE         string
	FriendlyName string
	Status       string        // bij device_interview: started | successful | failed
	Device       *BridgeDevice // bij device_interview successful, uit data.definition
}

type definition struct {
	Model   string   `json:"model"`
	Vendor  string   `json:"vendor"`
	Exposes []Expose `json:"exposes"`
}

type bridgeDevice struct {
	IEEE               string      `json:"ieee_address"`
	Type               string      `json:"type"`
	FriendlyName       string      `json:"friendly_name"`
	Supported          bool        `json:"supported"`
	InterviewCompleted bool        `json:"interview_completed"`
	Definition         *definition `json:"definition"`
}

// ParseBridgeDevices leest zigbee2mqtt/bridge/devices; de coördinator (de
// stick zelf) laat hij weg.
func ParseBridgeDevices(topic string, payload []byte) ([]BridgeDevice, bool) {
	if topic != "zigbee2mqtt/bridge/devices" {
		return nil, false
	}
	var raw []bridgeDevice
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, false
	}
	devices := []BridgeDevice{}
	for _, d := range raw {
		if d.Type == "Coordinator" {
			continue
		}
		dev := BridgeDevice{
			IEEE: d.IEEE, FriendlyName: d.FriendlyName, Type: d.Type,
			Supported: d.Supported, InterviewCompleted: d.InterviewCompleted,
		}
		if d.Definition != nil {
			dev.Model, dev.Vendor, dev.Exposes = d.Definition.Model, d.Definition.Vendor, d.Definition.Exposes
		}
		devices = append(devices, dev)
	}
	return devices, true
}

// ParseBridgeEvent leest zigbee2mqtt/bridge/event.
func ParseBridgeEvent(topic string, payload []byte) (BridgeEvent, bool) {
	if topic != "zigbee2mqtt/bridge/event" {
		return BridgeEvent{}, false
	}
	var raw struct {
		Type string `json:"type"`
		Data struct {
			IEEE         string      `json:"ieee_address"`
			FriendlyName string      `json:"friendly_name"`
			Status       string      `json:"status"`
			Supported    bool        `json:"supported"`
			Definition   *definition `json:"definition"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &raw); err != nil || raw.Type == "" {
		return BridgeEvent{}, false
	}
	ev := BridgeEvent{Type: raw.Type, IEEE: raw.Data.IEEE, FriendlyName: raw.Data.FriendlyName, Status: raw.Data.Status}
	if raw.Data.Definition != nil {
		ev.Device = &BridgeDevice{
			IEEE: raw.Data.IEEE, FriendlyName: raw.Data.FriendlyName, Supported: raw.Data.Supported,
			InterviewCompleted: raw.Data.Status == "successful",
			Model:              raw.Data.Definition.Model, Vendor: raw.Data.Definition.Vendor,
			Exposes: raw.Data.Definition.Exposes,
		}
	}
	return ev, true
}

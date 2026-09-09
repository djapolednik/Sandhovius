package mqtt

import (
	"encoding/json"
	"strings"
)

// ZigbeeEvent is a parsed Zigbee2MQTT device state update.
type ZigbeeEvent struct {
	FriendlyName string
	State        map[string]interface{}
}

// ParseZigbeeEvent parses a message received on a "zigbee2mqtt/#"
// subscription. Zigbee2MQTT publishes device state as JSON directly on
// "zigbee2mqtt/<friendly_name>"; everything else on that topic tree
// (bridge status, logging, per-device "/availability" sub-topics, ...)
// is not device state, so ok is false for those.
func ParseZigbeeEvent(topic string, payload []byte) (ZigbeeEvent, bool) {
	const prefix = "zigbee2mqtt/"
	if !strings.HasPrefix(topic, prefix) {
		return ZigbeeEvent{}, false
	}

	friendlyName := strings.TrimPrefix(topic, prefix)
	if friendlyName == "" || strings.HasPrefix(friendlyName, "bridge/") || strings.Contains(friendlyName, "/") {
		return ZigbeeEvent{}, false
	}

	var state map[string]interface{}
	if err := json.Unmarshal(payload, &state); err != nil {
		return ZigbeeEvent{}, false
	}

	return ZigbeeEvent{FriendlyName: friendlyName, State: state}, true
}

// ZigbeeAvailability is a parsed Zigbee2MQTT availability signal — an
// explicit "this device just went online/offline" message, distinct from
// a regular state update.
type ZigbeeAvailability struct {
	FriendlyName string
	Online       bool
}

// ParseZigbeeAvailability parses messages on
// "zigbee2mqtt/<friendly_name>/availability", published when Zigbee2MQTT's
// availability feature is enabled. Payload is {"state":"online"} or
// {"state":"offline"}.
func ParseZigbeeAvailability(topic string, payload []byte) (ZigbeeAvailability, bool) {
	const prefix = "zigbee2mqtt/"
	const suffix = "/availability"
	if !strings.HasPrefix(topic, prefix) || !strings.HasSuffix(topic, suffix) {
		return ZigbeeAvailability{}, false
	}

	friendlyName := strings.TrimSuffix(strings.TrimPrefix(topic, prefix), suffix)
	if friendlyName == "" {
		return ZigbeeAvailability{}, false
	}

	var body struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return ZigbeeAvailability{}, false
	}

	return ZigbeeAvailability{FriendlyName: friendlyName, Online: body.State == "online"}, true
}

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

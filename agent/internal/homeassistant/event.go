package homeassistant

import "time"

// HAEvent is a parsed Home Assistant state_changed event, trimmed down to
// what the rest of the agent needs to forward to PocketBase.
type HAEvent struct {
	EntityID   string
	State      string
	Attributes map[string]interface{}
	Timestamp  time.Time
}

// rawMessage mirrors the envelope every message on the HA websocket API
// arrives in. Most fields we don't care about are simply left out — the
// JSON decoder ignores anything not listed here.
// https://developers.home-assistant.io/docs/api/websocket
type rawMessage struct {
	Type  string    `json:"type"`
	Event *rawEvent `json:"event"`
}

type rawEvent struct {
	EventType string       `json:"event_type"`
	Data      rawEventData `json:"data"`
	TimeFired time.Time    `json:"time_fired"`
}

type rawEventData struct {
	EntityID string    `json:"entity_id"`
	NewState *rawState `json:"new_state"`
}

type rawState struct {
	State      string                 `json:"state"`
	Attributes map[string]interface{} `json:"attributes"`
}

// parseStateChanged converts a raw websocket message into an HAEvent.
// ok is false when the message is not a relevant state_changed event —
// e.g. the subscribe_events confirmation ("type":"result"), a different
// event_type, or an entity being removed (new_state is null). Callers
// should skip those rather than treat them as an error.
func parseStateChanged(raw rawMessage) (HAEvent, bool) {
	if raw.Type != "event" || raw.Event == nil {
		return HAEvent{}, false
	}
	if raw.Event.EventType != "state_changed" {
		return HAEvent{}, false
	}
	newState := raw.Event.Data.NewState
	if newState == nil {
		return HAEvent{}, false
	}
	return HAEvent{
		EntityID:   raw.Event.Data.EntityID,
		State:      newState.State,
		Attributes: newState.Attributes,
		Timestamp:  raw.Event.TimeFired,
	}, true
}

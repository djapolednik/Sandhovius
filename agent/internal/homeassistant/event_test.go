package homeassistant

import (
	"encoding/json"
	"testing"
	"time"
)

// De tijd van de stand zelf (new_state.last_updated), niet van het event:
// GetState geeft ook last_updated, zo vergelijkt de agent gelijke klokken.
func TestParseStateChangedUsesLastUpdated(t *testing.T) {
	raw := `{"type":"event","event":{"event_type":"state_changed","time_fired":"2026-10-12T20:00:01.500Z",
		"data":{"entity_id":"light.a","new_state":{"state":"on","attributes":{},"last_updated":"2026-10-12T20:00:01.250Z"}}}}`
	var msg rawMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatal(err)
	}
	ev, ok := parseStateChanged(msg)
	if !ok {
		t.Fatal("event niet herkend")
	}
	want := time.Date(2026, 10, 12, 20, 0, 1, 250e6, time.UTC)
	if !ev.Timestamp.Equal(want) {
		t.Errorf("Timestamp = %v, verwacht %v", ev.Timestamp, want)
	}
}

func TestParseStateChangedFallsBackToTimeFired(t *testing.T) {
	raw := `{"type":"event","event":{"event_type":"state_changed","time_fired":"2026-10-12T20:00:01.500Z",
		"data":{"entity_id":"light.a","new_state":{"state":"on","attributes":{}}}}}`
	var msg rawMessage
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatal(err)
	}
	ev, _ := parseStateChanged(msg)
	if !ev.Timestamp.Equal(time.Date(2026, 10, 12, 20, 0, 1, 500e6, time.UTC)) {
		t.Errorf("Timestamp = %v, verwacht time_fired", ev.Timestamp)
	}
}

package app

import (
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

func TestCommandExpired(t *testing.T) {
	now := time.Date(2026, 10, 6, 19, 10, 0, 0, time.UTC)
	cases := []struct {
		name    string
		cmd     pocketbase.Command
		expired bool
	}{
		{"vers (PocketBase-formaat)", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:09:30.123Z"}, false},
		{"precies op de grens", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:08:00.000Z"}, false},
		{"te oud", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:07:59.000Z"}, true},
		{"serverklok loopt voor", pocketbase.Command{Action: "turn_on", Created: "2026-10-06 19:10:05.000Z"}, false},
		{"zonder created (van vóór de migratie)", pocketbase.Command{Action: "turn_on"}, true},
		{"onleesbaar", pocketbase.Command{Action: "turn_on", Created: "gisteren"}, true},
		{"provision verloopt nooit", pocketbase.Command{Action: "provision", Created: "2026-10-01 08:00:00.000Z"}, false},
		{"scène verloopt ook", pocketbase.Command{Action: "run_scene", Created: "2026-10-06 18:00:00.000Z"}, true},
	}
	for _, c := range cases {
		if got := commandExpired(c.cmd, now); got != c.expired {
			t.Errorf("%s: expired = %v, want %v", c.name, got, c.expired)
		}
	}
}

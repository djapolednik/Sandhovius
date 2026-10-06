//go:build integration

// Rate limits: de standaardregel *:create (20 per 5 s per IP) is te krap voor
// bulkacties. "Alles uit" maakt één command per device tegelijk, en een box
// met veel devices maakt bij de eerste start voor elk een device_state aan.
package tests

import (
	"fmt"
	"testing"
	"time"
)

// burst doet n POSTs achter elkaar met de rauwe do (geen retry) en geeft het
// aantal dat niet 200 gaf.
func burst(t *testing.T, p *pb, token, collection string, bodies []map[string]any) int {
	t.Helper()
	fails := 0
	for i, body := range bodies {
		st, out := p.do(t, token, "POST", "/api/collections/"+collection+"/records", body)
		if st != 200 {
			fails++
			t.Logf("%s %d -> %d %v", collection, i+1, st, out)
		}
	}
	return fails
}

func TestResidentCommandBurst(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	time.Sleep(6 * time.Second) // venster van de fixture laten verlopen
	bodies := []map[string]any{}
	for i := 0; i < 25; i++ {
		bodies = append(bodies, map[string]any{"device": w.DevA, "action": "turn_off", "status": "pending"})
	}
	if fails := burst(t, p, w.UserATok, "commands", bodies); fails > 0 {
		t.Errorf("%d van 25 commands van een bewoner geweigerd in een burst", fails)
	}
}

func TestBoxDeviceStateBurst(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	bodies := []map[string]any{}
	for i := 0; i < 25; i++ {
		d := p.create(t, "devices", map[string]any{
			"gateway": w.HouseA, "entity_id": fmt.Sprintf("light.burst%d", i), "name": "x", "type": "light"})
		bodies = append(bodies, map[string]any{"device": d, "state": map[string]any{"on": true}})
	}
	time.Sleep(6 * time.Second)
	if fails := burst(t, p, w.BoxATok, "device_state", bodies); fails > 0 {
		t.Errorf("%d van 25 device_state-creates van een box geweigerd in een burst", fails)
	}
}

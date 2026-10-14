package homeassistant

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/gorilla/websocket"
)

// fakeHAWebsocket speelt de websocket-API van HA: auth, daarna per commando
// het antwoord van reply (op type). Alle commando's komen in calls.
type fakeHAWebsocket struct {
	mu    sync.Mutex
	calls []map[string]any
	reply func(cmd map[string]any) any
}

func (f *fakeHAWebsocket) server(t *testing.T) *httptest.Server {
	t.Helper()
	up := websocket.Upgrader{}
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := up.Upgrade(w, r, nil)
		if err != nil {
			t.Errorf("upgrade: %v", err)
			return
		}
		defer conn.Close()
		conn.WriteJSON(map[string]any{"type": "auth_required"})
		var auth map[string]any
		conn.ReadJSON(&auth)
		conn.WriteJSON(map[string]any{"type": "auth_ok"})
		for {
			var cmd map[string]any
			if err := conn.ReadJSON(&cmd); err != nil {
				return
			}
			f.mu.Lock()
			f.calls = append(f.calls, cmd)
			f.mu.Unlock()
			conn.WriteJSON(map[string]any{"id": cmd["id"], "type": "result", "success": true, "result": f.reply(cmd)})
		}
	}))
}

func wsURL(srv *httptest.Server) string { return "ws" + strings.TrimPrefix(srv.URL, "http") }

func TestListDevicesAndEntities(t *testing.T) {
	f := &fakeHAWebsocket{reply: func(cmd map[string]any) any {
		switch cmd["type"] {
		case "config/device_registry/list":
			return []any{map[string]any{"id": "dev1", "name": "Gang", "model": "LED1836G9", "manufacturer": "IKEA",
				"identifiers": []any{[]any{"mqtt", "zigbee2mqtt_0x01"}}, "config_entries": []any{"e1"}}}
		case "config/entity_registry/list":
			return []any{map[string]any{"entity_id": "light.gang", "device_id": "dev1", "platform": "mqtt"}}
		}
		return nil
	}}
	srv := f.server(t)
	defer srv.Close()
	c := NewClient(wsURL(srv), srv.URL, "tok")

	devs, err := c.ListDevices()
	if err != nil {
		t.Fatal(err)
	}
	want := []RegistryDevice{{ID: "dev1", Name: "Gang", Model: "LED1836G9", Manufacturer: "IKEA",
		Identifiers: [][]string{{"mqtt", "zigbee2mqtt_0x01"}}, ConfigEntries: []string{"e1"}}}
	if !reflect.DeepEqual(devs, want) {
		t.Errorf("devices = %+v", devs)
	}
	ents, err := c.ListEntities()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(ents, []RegistryEntity{{EntityID: "light.gang", DeviceID: "dev1", Platform: "mqtt"}}) {
		t.Errorf("entities = %+v", ents)
	}
}

func TestZigbeeEntity(t *testing.T) {
	devs := []RegistryDevice{
		{ID: "dev1", Identifiers: [][]string{{"mqtt", "zigbee2mqtt_0x01"}}},
		{ID: "dev2", Identifiers: [][]string{{"mqtt", "zigbee2mqtt_0x02"}}},
	}
	ents := []RegistryEntity{
		{EntityID: "sensor.gang_battery", DeviceID: "dev1"},
		{EntityID: "light.gang", DeviceID: "dev1"},
		{EntityID: "switch.stekker_l1", DeviceID: "dev2"},
		{EntityID: "switch.stekker_l2", DeviceID: "dev2"},
	}
	cases := []struct {
		ieee, domain, endpoint, want string
		ok                           bool
	}{
		{"0x01", "light", "", "light.gang", true},
		{"0x02", "switch", "l2", "switch.stekker_l2", true},
		{"0x02", "switch", "l1", "switch.stekker_l1", true},
		{"0x01", "switch", "", "", false},
		{"0x09", "light", "", "", false},
	}
	for _, c := range cases {
		got, ok := ZigbeeEntity(devs, ents, c.ieee, c.domain, c.endpoint)
		if got != c.want || ok != c.ok {
			t.Errorf("%s %s %q: (%q, %v), verwacht (%q, %v)", c.ieee, c.domain, c.endpoint, got, ok, c.want, c.ok)
		}
	}
}

func TestDeleteHelpers(t *testing.T) {
	f := &fakeHAWebsocket{reply: func(cmd map[string]any) any {
		switch cmd["type"] {
		case "input_boolean/list":
			return []any{map[string]any{"id": "lamp"}, map[string]any{"id": "stekker"}}
		case "input_number/list":
			return []any{map[string]any{"id": "temperatuur"}}
		}
		return nil
	}}
	srv := f.server(t)
	defer srv.Close()

	n, err := NewClient(wsURL(srv), srv.URL, "tok").DeleteHelpers()
	if err != nil || n != 3 {
		t.Fatalf("DeleteHelpers = %d, %v; verwacht 3", n, err)
	}
	var deleted []string
	ids := map[float64]bool{}
	for _, c := range f.calls {
		if ids[c["id"].(float64)] {
			t.Errorf("commando-id %v twee keer gebruikt", c["id"])
		}
		ids[c["id"].(float64)] = true
		switch c["type"] {
		case "input_boolean/delete":
			deleted = append(deleted, "input_boolean."+c["input_boolean_id"].(string))
		case "input_number/delete":
			deleted = append(deleted, "input_number."+c["input_number_id"].(string))
		}
	}
	want := []string{"input_boolean.lamp", "input_boolean.stekker", "input_number.temperatuur"}
	if !reflect.DeepEqual(deleted, want) {
		t.Errorf("verwijderd = %v", deleted)
	}
}

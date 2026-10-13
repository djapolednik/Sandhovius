package app

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"sandhovius/local-agent/internal/pocketbase"
)

// De cache koppelt HA-entity's aan devices. Entity-ID's komen uit de naam,
// dus twee huizen met een "Lamp" delen input_boolean.lamp: met devices van
// andere huizen erin zou deze box hun device_state overschrijven.
func TestDeviceCacheRefreshOnlyThisHouse(t *testing.T) {
	var filter string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filter = r.URL.Query().Get("filter")
		w.Write([]byte(`{"items":[{"id":"d1","gateway":"huis1","entity_id":"input_boolean.lamp"}]}`))
	}))
	defer srv.Close()

	cache := newDeviceCache(pocketbase.NewClient(srv.URL), func() string { return "huis1" })
	if _, err := cache.refresh(); err != nil {
		t.Fatal(err)
	}
	if filter != "gateway='huis1'" {
		t.Errorf("filter = %q, want gateway='huis1'", filter)
	}
	if id, ok, _ := cache.lookup("input_boolean.lamp"); !ok || id != "d1" {
		t.Errorf("lookup = %q, %v", id, ok)
	}
}

func TestDeviceCacheRefreshWithoutHouse(t *testing.T) {
	cache := newDeviceCache(pocketbase.NewClient("http://127.0.0.1:1"), func() string { return "" })
	if _, err := cache.refresh(); err == nil {
		t.Error("refresh zonder huis gaf geen fout")
	}
}

// Een device verwijderen en opnieuw aanmaken met dezelfde entity (een
// sensor opnieuw koppelen onder dezelfde naam): de cache mag niet naar het
// verwijderde device blijven wijzen, anders weigert PocketBase elke stand.
func TestDeviceCacheFollowsDeviceEvents(t *testing.T) {
	cache := newDeviceCache(nil, func() string { return "huis1" })
	cache.applyEvent("create", pocketbase.Device{ID: "oud", Gateway: "huis1", EntityID: "gang_sensor"})
	if id, ok := cache.cached("gang_sensor"); !ok || id != "oud" {
		t.Fatalf("na create: %q %v", id, ok)
	}
	cache.applyEvent("delete", pocketbase.Device{ID: "oud", Gateway: "huis1", EntityID: "gang_sensor"})
	if _, ok := cache.cached("gang_sensor"); ok {
		t.Fatalf("na delete nog in de cache")
	}
	cache.applyEvent("create", pocketbase.Device{ID: "nieuw", Gateway: "huis1", EntityID: "gang_sensor"})
	if id, _ := cache.cached("gang_sensor"); id != "nieuw" {
		t.Errorf("na opnieuw aanmaken: %q, want nieuw", id)
	}
	// Een andere entity voor hetzelfde device: de oude verdwijnt.
	cache.applyEvent("update", pocketbase.Device{ID: "nieuw", Gateway: "huis1", EntityID: "binary_sensor.gang"})
	if _, ok := cache.cached("gang_sensor"); ok {
		t.Errorf("oude entity nog in de cache")
	}
	if id, _ := cache.cached("binary_sensor.gang"); id != "nieuw" {
		t.Errorf("nieuwe entity: %q", id)
	}
}

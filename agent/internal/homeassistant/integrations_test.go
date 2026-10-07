package homeassistant

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHasIntegration(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/config/config_entries/entry" || r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("onverwacht verzoek: %s", r.URL.Path)
		}
		w.Write([]byte(`[{"domain":"met"},{"domain":"mqtt"}]`))
	}))
	defer srv.Close()
	c := NewClient("ws://x", srv.URL, "tok")

	if ok, err := c.HasIntegration("mqtt"); err != nil || !ok {
		t.Errorf("mqtt: ok=%v err=%v, verwacht true", ok, err)
	}
	if ok, err := c.HasIntegration("zha"); err != nil || ok {
		t.Errorf("zha: ok=%v err=%v, verwacht false", ok, err)
	}
}

func TestAddMQTTSendsBrokerAndPort(t *testing.T) {
	var started map[string]any
	var submitted map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/config/config_entries/flow":
			json.NewDecoder(r.Body).Decode(&started)
			w.Write([]byte(`{"type":"form","flow_id":"f1","step_id":"broker"}`))
		case strings.HasSuffix(r.URL.Path, "/f1"):
			json.NewDecoder(r.Body).Decode(&submitted)
			w.Write([]byte(`{"type":"create_entry"}`))
		default:
			t.Errorf("onverwacht pad %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	if err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883); err != nil {
		t.Fatalf("AddMQTT: %v", err)
	}
	if started["handler"] != "mqtt" {
		t.Errorf("handler = %v", started["handler"])
	}
	if submitted["broker"] != "mosquitto" || submitted["port"] != float64(1883) {
		t.Errorf("formulier = %v", submitted)
	}
	other, _ := submitted["other_settings"].(map[string]any)
	if other["set_client_cert"] != false || other["set_ca_cert"] != "off" {
		t.Errorf("other_settings = %v", submitted["other_settings"])
	}
}

func TestAddMQTTFlowError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/config/config_entries/flow" {
			w.Write([]byte(`{"type":"form","flow_id":"f1"}`))
			return
		}
		w.Write([]byte(`{"type":"form","errors":{"base":"cannot_connect"}}`))
	}))
	defer srv.Close()
	if err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883); err == nil {
		t.Error("verwacht een fout als de flow niet eindigt in create_entry")
	}
}

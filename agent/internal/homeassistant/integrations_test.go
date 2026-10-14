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

func TestListFlows(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/config/config_entries/flow" {
			t.Errorf("onverwacht verzoek: %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`[{"flow_id":"f1","handler":"hue","step_id":"link","context":{"source":"zeroconf"}},
		  {"flow_id":"f2","handler":"met","step_id":"user"}]`))
	}))
	defer srv.Close()
	flows, err := NewClient("ws://x", srv.URL, "tok").ListFlows()
	if err != nil {
		t.Fatal(err)
	}
	want := []Flow{{FlowID: "f1", Handler: "hue", StepID: "link"}, {FlowID: "f2", Handler: "met", StepID: "user"}}
	if len(flows) != 2 || flows[0] != want[0] || flows[1] != want[1] {
		t.Errorf("flows = %+v", flows)
	}
}

func TestSubmitFlowReturnsErrors(t *testing.T) {
	var submitted map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/config/config_entries/flow/f1" {
			t.Errorf("onverwacht pad %s", r.URL.Path)
		}
		json.NewDecoder(r.Body).Decode(&submitted)
		w.Write([]byte(`{"type":"form","flow_id":"f1","step_id":"link","errors":{"base":"register_failed"}}`))
	}))
	defer srv.Close()
	res, err := NewClient("ws://x", srv.URL, "tok").SubmitFlow("f1", map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Type != "form" || res.StepID != "link" || res.Errors["base"] != "register_failed" {
		t.Errorf("resultaat = %+v", res)
	}
	if submitted == nil {
		t.Error("geen body verstuurd")
	}
}

func TestStartFlowCreateEntry(t *testing.T) {
	var started map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&started)
		w.Write([]byte(`{"type":"create_entry","flow_id":"f1","result":{"entry_id":"e1","domain":"hue"}}`))
	}))
	defer srv.Close()
	res, err := NewClient("ws://x", srv.URL, "tok").StartFlow("hue", map[string]any{"host": "192.168.1.20"})
	if err != nil {
		t.Fatal(err)
	}
	if started["handler"] != "hue" || started["host"] != "192.168.1.20" {
		t.Errorf("start = %v", started)
	}
	if res.Type != "create_entry" || res.EntryID != "e1" {
		t.Errorf("resultaat = %+v", res)
	}
}

func TestConfigEntryIDs(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`[{"entry_id":"e1","domain":"hue"},{"entry_id":"e2","domain":"mqtt"},{"entry_id":"e3","domain":"hue"}]`))
	}))
	defer srv.Close()
	ids, err := NewClient("ws://x", srv.URL, "tok").ConfigEntryIDs("hue")
	if err != nil || len(ids) != 2 || ids[0] != "e1" || ids[1] != "e3" {
		t.Errorf("ids = %v, err %v", ids, err)
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

// flowServer fakes HA's flow API; second is what the form step answers.
func flowServer(t *testing.T, second func(w http.ResponseWriter), deleted *[]string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "DELETE":
			*deleted = append(*deleted, r.URL.Path)
			w.Write([]byte(`{"message":"Flow aborted"}`))
		case r.URL.Path == "/api/config/config_entries/flow":
			w.Write([]byte(`{"type":"form","flow_id":"f1"}`))
		default:
			second(w)
		}
	}))
}

func TestAddMQTTFormErrorAbortsFlow(t *testing.T) {
	var deleted []string
	srv := flowServer(t, func(w http.ResponseWriter) {
		w.Write([]byte(`{"type":"form","errors":{"base":"cannot_connect"}}`))
	}, &deleted)
	defer srv.Close()
	err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883)
	if err == nil || !strings.Contains(err.Error(), "cannot_connect") {
		t.Fatalf("err = %v, verwacht cannot_connect", err)
	}
	if len(deleted) != 1 || deleted[0] != "/api/config/config_entries/flow/f1" {
		t.Errorf("deleted = %v", deleted)
	}
}

func TestAddMQTTPostErrorAbortsFlow(t *testing.T) {
	var deleted []string
	srv := flowServer(t, func(w http.ResponseWriter) { http.Error(w, "boom", 500) }, &deleted)
	defer srv.Close()
	if err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883); err == nil {
		t.Fatal("verwacht een fout")
	}
	if len(deleted) != 1 {
		t.Errorf("deleted = %v", deleted)
	}
}

func TestAddMQTTSuccessKeepsFlow(t *testing.T) {
	var deleted []string
	srv := flowServer(t, func(w http.ResponseWriter) { w.Write([]byte(`{"type":"create_entry"}`)) }, &deleted)
	defer srv.Close()
	if err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883); err != nil {
		t.Fatal(err)
	}
	if len(deleted) != 0 {
		t.Errorf("deleted = %v, verwacht niets", deleted)
	}
}

func TestAddMQTTAbortedStartDoesNotSubmit(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		w.Write([]byte(`{"type":"abort","reason":"already_in_progress"}`))
	}))
	defer srv.Close()
	err := NewClient("ws://x", srv.URL, "tok").AddMQTT("mosquitto", 1883)
	if err == nil {
		t.Fatal("expected an error when the flow start aborts")
	}
	if len(paths) != 1 {
		t.Fatalf("expected only the start request, got %v", paths)
	}
}

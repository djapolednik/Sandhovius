package pocketbase

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"testing"
	"time"
)

// recorder bewaart het laatste verzoek en antwoordt met een vaste body.
type recorder struct {
	method, path, query string
	body                map[string]any
	reply               string
}

func (rec *recorder) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.method, rec.path, rec.query = r.Method, r.URL.Path, r.URL.RawQuery
		raw, _ := io.ReadAll(r.Body)
		rec.body = nil
		json.Unmarshal(raw, &rec.body)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, rec.reply)
	}))
}

func TestCreateDeviceSendsIdentity(t *testing.T) {
	rec := &recorder{reply: `{"id":"d1","gateway":"h1","name":"Gang","type":"light","source":"zigbee",
	  "address":"0x1","endpoint":"","entity_id":"light.gang","model":"LED1836G9","capabilities":["onoff","brightness"]}`}
	srv := rec.server(t)
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box")

	got, err := c.CreateDevice(NewDevice{
		Gateway: "h1", Room: "r1", Name: "Gang", Type: "light", Source: "zigbee", Address: "0x1",
		EntityID: "light.gang", Model: "LED1836G9", Capabilities: []string{"onoff", "brightness"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if rec.method != "POST" || rec.path != "/api/collections/devices/records" {
		t.Errorf("verzoek %s %s", rec.method, rec.path)
	}
	for k, want := range map[string]any{
		"gateway": "h1", "room": "r1", "name": "Gang", "type": "light", "source": "zigbee",
		"address": "0x1", "entity_id": "light.gang", "model": "LED1836G9",
	} {
		if rec.body[k] != want {
			t.Errorf("body[%s] = %v, verwacht %v", k, rec.body[k], want)
		}
	}
	if !reflect.DeepEqual(rec.body["capabilities"], []any{"onoff", "brightness"}) {
		t.Errorf("capabilities = %v", rec.body["capabilities"])
	}
	if got.ID != "d1" || got.Address != "0x1" || !reflect.DeepEqual(got.Capabilities, []string{"onoff", "brightness"}) {
		t.Errorf("antwoord verkeerd gelezen: %+v", got)
	}
}

func TestListOpenPairingSessions(t *testing.T) {
	rec := &recorder{reply: `{"items":[{"id":"s1","house":"h1","kind":"light","status":"open",
	  "expires":"2026-10-14 10:04:00.000Z","extend":true,"button_pressed":false}]}`}
	srv := rec.server(t)
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box")

	sessions, err := c.ListOpenPairingSessions("h1")
	if err != nil {
		t.Fatal(err)
	}
	q, _ := url.ParseQuery(rec.query)
	filter := q.Get("filter")
	for _, part := range []string{"house='h1'", "status='starting'", "status='open'", "status='waiting_button'"} {
		if !strings.Contains(filter, part) {
			t.Errorf("filter %q mist %q", filter, part)
		}
	}
	want := time.Date(2026, 10, 14, 10, 4, 0, 0, time.UTC)
	if len(sessions) != 1 || sessions[0].ID != "s1" || !sessions[0].Expires.Equal(want) || !sessions[0].Extend {
		t.Errorf("sessies verkeerd gelezen: %+v", sessions)
	}
	if _, err := c.ListOpenPairingSessions("h1' || house!='"); err == nil {
		t.Error("vreemd huis-id geaccepteerd")
	}
}

func TestUpdatePairingCandidate(t *testing.T) {
	rec := &recorder{reply: `{}`}
	srv := rec.server(t)
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box")

	if err := c.UpdatePairingCandidate("c1", map[string]any{"status": "added", "device": "d1"}); err != nil {
		t.Fatal(err)
	}
	if rec.method != "PATCH" || rec.path != "/api/collections/pairing_candidates/records/c1" ||
		rec.body["status"] != "added" || rec.body["device"] != "d1" {
		t.Errorf("verzoek %s %s %v", rec.method, rec.path, rec.body)
	}
}

func TestSubscribePairingBothCollections(t *testing.T) {
	var subscriptions []any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			subscriptions, _ = body["subscriptions"].([]any)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "id:client1\nevent:PB_CONNECT\ndata:{}\n\n")
		w.(http.Flusher).Flush()
		time.Sleep(50 * time.Millisecond) // na het subscriben
		fmt.Fprint(w, "event:pairing_sessions\ndata:{\"action\":\"update\",\"record\":{\"id\":\"s1\",\"house\":\"h1\",\"kind\":\"light\",\"status\":\"starting\",\"expires\":\"\"}}\n\n")
		fmt.Fprint(w, "event:pairing_candidates\ndata:{\"action\":\"update\",\"record\":{\"id\":\"c1\",\"session\":\"s1\",\"address\":\"0x1\",\"status\":\"found\",\"add\":true,\"identify\":2,\"capabilities\":[\"onoff\"]}}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	events := make(chan PairingEvent, 2)
	go c.SubscribePairing(ctx, nil, func(e PairingEvent) { events <- e })

	var got []PairingEvent
	for len(got) < 2 {
		select {
		case e := <-events:
			got = append(got, e)
		case <-ctx.Done():
			t.Fatalf("na %d events gestopt", len(got))
		}
	}
	if !reflect.DeepEqual(subscriptions, []any{"pairing_sessions", "pairing_candidates"}) {
		t.Errorf("subscriptions = %v", subscriptions)
	}
	if s := got[0].Session; got[0].Action != "update" || s == nil || s.ID != "s1" || s.Status != "starting" || !s.Expires.IsZero() || got[0].Candidate != nil {
		t.Errorf("sessie-event: %+v", got[0])
	}
	if cand := got[1].Candidate; cand == nil || cand.ID != "c1" || !cand.Add || cand.Identify != 2 || got[1].Session != nil {
		t.Errorf("candidate-event: %+v", got[1])
	}
}

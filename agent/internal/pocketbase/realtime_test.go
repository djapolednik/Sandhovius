package pocketbase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// fakeRealtime speelt PocketBase's realtime: een SSE-stroom die de
// client-id stuurt, en een POST om te subscriben.
func fakeRealtime(t *testing.T, subscribeStatus int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			w.WriteHeader(subscribeStatus)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "id:client1\nevent:PB_CONNECT\ndata:{}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
}

func TestSubscribeCommandsCallsOnSubscribed(t *testing.T) {
	srv := fakeRealtime(t, http.StatusNoContent)
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box-token")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	subscribed := make(chan struct{}, 1)
	go c.SubscribeCommands(ctx, func() { subscribed <- struct{}{} }, func(CommandEvent) {})

	select {
	case <-subscribed:
	case <-ctx.Done():
		t.Fatal("onSubscribed is niet aangeroepen")
	}
}

func TestSubscribeCommandsSkipsOnSubscribedWhenSubscribeFails(t *testing.T) {
	srv := fakeRealtime(t, http.StatusForbidden)
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box-token")

	called := false
	err := c.SubscribeCommands(context.Background(), func() { called = true }, func(CommandEvent) {})
	if err == nil {
		t.Error("verwacht een fout bij een mislukte subscribe")
	}
	if called {
		t.Error("onSubscribed aangeroepen terwijl subscriben mislukte")
	}
}

// Zonder token (PocketBase was weg bij het opstarten, nog niet ingelogd) zou
// PocketBase een gast-abonnement accepteren dat nooit command-events krijgt.
// Dan liever een fout, zodat de herhaallus het later opnieuw probeert.
func TestSubscribeCommandsRefusesWithoutToken(t *testing.T) {
	posts := 0
	streams := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			posts++
			w.WriteHeader(http.StatusNoContent)
			return
		}
		streams++
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "id:client1\nevent:PB_CONNECT\ndata:{}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer srv.Close()
	c := NewClient(srv.URL)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	called := false
	err := c.SubscribeCommands(ctx, func() { called = true }, func(CommandEvent) {})
	if err == nil {
		t.Error("verwacht een fout zonder token")
	}
	if posts != 0 || called {
		t.Errorf("subscribe zonder token: %d POSTs, onSubscribed = %v", posts, called)
	}
	if ctx.Err() != nil {
		t.Error("SubscribeCommands bleef hangen tot de timeout")
	}
}

// De box abonneert zich op "boxes"; PocketBase stuurt (door de view-regel)
// alleen events van zijn eigen record, met het huis erin.
func TestSubscribeBoxDeliversHouse(t *testing.T) {
	var subscribedTo string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var body struct {
				Subscriptions []string `json:"subscriptions"`
			}
			json.NewDecoder(r.Body).Decode(&body)
			if len(body.Subscriptions) == 1 {
				subscribedTo = body.Subscriptions[0]
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "id:client1\nevent:PB_CONNECT\ndata:{}\n\n")
		fmt.Fprint(w, "event:boxes\ndata:{\"action\":\"update\",\"record\":{\"id\":\"b1\",\"serial\":\"SN-1\",\"house\":\"h1\"}}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer srv.Close()
	c := NewClient(srv.URL)
	c.setToken("box-token")

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	got := make(chan BoxEvent, 1)
	go c.SubscribeBox(ctx, nil, func(e BoxEvent) { got <- e })

	select {
	case e := <-got:
		if e.EventType != "update" || e.Record.House != "h1" {
			t.Errorf("event = %+v, verwacht update met huis h1", e)
		}
	case <-ctx.Done():
		t.Fatal("geen box-event ontvangen")
	}
	if subscribedTo != "boxes" {
		t.Errorf("geabonneerd op %q, verwacht boxes", subscribedTo)
	}
}

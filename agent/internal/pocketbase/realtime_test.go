package pocketbase

import (
	"context"
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

	called := false
	err := c.SubscribeCommands(context.Background(), func() { called = true }, func(CommandEvent) {})
	if err == nil {
		t.Error("verwacht een fout bij een mislukte subscribe")
	}
	if called {
		t.Error("onSubscribed aangeroepen terwijl subscriben mislukte")
	}
}

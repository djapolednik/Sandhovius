//go:build integration

// De box volgt zijn eigen record via realtime: een claim of release in de
// hook moet als event bij de box aankomen, en alleen bij die box.
package tests

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

// boxStream opent een realtime-stroom als box, abonneert op "boxes" en geeft
// het huis uit elk boxes-event door.
func boxStream(t *testing.T, p *pb, token string) <-chan string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, "GET", p.URL+"/api/realtime", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	houses := make(chan string, 8)
	ready := make(chan struct{})
	go func() {
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		event := ""
		for scanner.Scan() {
			line := scanner.Text()
			switch {
			case strings.HasPrefix(line, "id:") && ready != nil:
				id := strings.TrimSpace(strings.TrimPrefix(line, "id:"))
				status, out := p.do(t, token, "POST", "/api/realtime",
					map[string]any{"clientId": id, "subscriptions": []string{"boxes"}})
				if status != 204 {
					t.Errorf("subscribe: %d %v", status, out)
				}
				close(ready)
				ready = nil
			case strings.HasPrefix(line, "event:"):
				event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			case strings.HasPrefix(line, "data:") && event == "boxes":
				var msg struct {
					Record map[string]any `json:"record"`
				}
				json.Unmarshal([]byte(strings.TrimPrefix(line, "data:")), &msg)
				house, _ := msg.Record["house"].(string)
				houses <- house
			}
		}
	}()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("realtime-stroom kwam niet op gang")
	}
	return houses
}

func waitHouse(t *testing.T, houses <-chan string, want, what string) {
	t.Helper()
	select {
	case got := <-houses:
		if got != want {
			t.Fatalf("%s: huis %q, verwacht %q", what, got, want)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("%s: geen event binnen 3 s", what)
	}
}

func TestBoxSeesClaimAndReleaseViaRealtime(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-R-1", "K7QM-2XRP-9DTW")
	newBox(t, p, "SH-R-2")
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	mine := boxStream(t, p, p.login(t, "boxes", "SH-R-1", boxPw))
	other := boxStream(t, p, p.login(t, "boxes", "SH-R-2", boxPw))

	st, out := p.claim(t, tok, map[string]any{"serial": "SH-R-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim: %d %v", st, out)
	}
	house := out["house"].(string)
	waitHouse(t, mine, house, "na claim")

	st, out = p.do(t, tok, "POST", "/api/sandhovius/release", map[string]any{"house": house})
	if st != 200 {
		t.Fatalf("release: %d %v", st, out)
	}
	waitHouse(t, mine, "", "na release")

	// Een andere box hoort niets van dit record (view-regel).
	select {
	case got := <-other:
		t.Fatalf("andere box kreeg een event (huis %q)", got)
	case <-time.After(500 * time.Millisecond):
	}
}

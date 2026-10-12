package pocketbase

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// CommandEvent is a realtime notification about a change to a "commands"
// record. EventType is PocketBase's own action name ("create", "update",
// "delete") — not to be confused with Command.Action, the actual
// turn_on/turn_off/toggle instruction inside the record.
type CommandEvent struct {
	EventType string  `json:"action"`
	Record    Command `json:"record"`
}

// SubscribeCommands opens a PocketBase realtime (SSE) connection and calls
// handler for every change on the "commands" collection. onSubscribed (may
// be nil) runs once the subscription is in place — the moment to catch up
// on whatever was missed while the stream was down. It blocks until ctx is
// canceled or the connection drops, returning an error in the latter case
// so the caller can decide whether to reconnect.
func (c *Client) SubscribeCommands(ctx context.Context, onSubscribed func(), handler func(CommandEvent)) error {
	return c.subscribeCollection(ctx, "commands", onSubscribed, func(data []byte) {
		var event CommandEvent
		if err := json.Unmarshal(data, &event); err == nil {
			handler(event)
		}
	})
}

// DeviceEvent is a realtime notification about a change to a "devices"
// record. EventType is PocketBase's own action name ("create", "update",
// "delete").
type DeviceEvent struct {
	EventType string `json:"action"`
	Record    Device `json:"record"`
}

// SubscribeDevices opens a PocketBase realtime (SSE) connection and calls
// handler for every change on the "devices" collection — used to notice
// when a user renames a device so the change can be mirrored into Home
// Assistant. Blocks until ctx is canceled or the connection drops.
func (c *Client) SubscribeDevices(ctx context.Context, handler func(DeviceEvent)) error {
	return c.subscribeCollection(ctx, "devices", nil, func(data []byte) {
		var event DeviceEvent
		if err := json.Unmarshal(data, &event); err == nil {
			handler(event)
		}
	})
}

// BoxEvent is a realtime notification about the box's own record.
type BoxEvent struct {
	EventType string    `json:"action"`
	Record    BoxRecord `json:"record"`
}

// SubscribeBox opens a realtime connection on the "boxes" collection. The
// view rule (id = @request.auth.id) means PocketBase only sends events for
// the box's own record — so a claim or a release arrives within a second
// instead of at the next poll. onSubscribed (may be nil) is the moment to
// read the record once, for whatever changed while the stream was down.
func (c *Client) SubscribeBox(ctx context.Context, onSubscribed func(), handler func(BoxEvent)) error {
	return c.subscribeCollection(ctx, "boxes", onSubscribed, func(data []byte) {
		var event BoxEvent
		if err := json.Unmarshal(data, &event); err == nil {
			handler(event)
		}
	})
}

// subscribeCollection opens a PocketBase realtime (SSE) connection
// subscribed to a single collection and calls handler with the raw JSON of
// every matching event's "data" line. onSubscribed (may be nil) is called
// right after the subscription succeeds. Blocks until ctx is canceled or the
// connection drops, returning an error in the latter case so the caller can
// decide whether to reconnect.
func (c *Client) subscribeCollection(ctx context.Context, collectionName string, onSubscribed func(), handler func(data []byte)) error {
	// Zonder token (nog niet ingelogd, bv. PocketBase was weg bij het
	// opstarten) accepteert PocketBase een gast-abonnement dat nooit events
	// krijgt. Dan een fout, zodat de herhaallus het later opnieuw probeert.
	if c.authToken() == "" {
		return fmt.Errorf("pocketbase: subscribe to %s: nog niet ingelogd", collectionName)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+"/api/realtime", nil)
	if err != nil {
		return fmt.Errorf("pocketbase: build realtime request: %w", err)
	}
	req.Header.Set("Accept", "text/event-stream")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("pocketbase: open realtime stream: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("pocketbase: realtime stream returned status %d", resp.StatusCode)
	}

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	subscribed := false
	var eventName string

	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case strings.HasPrefix(line, "id:"):
			clientID := strings.TrimSpace(strings.TrimPrefix(line, "id:"))
			if !subscribed {
				if err := c.subscribeRealtime(clientID, []string{collectionName}); err != nil {
					return fmt.Errorf("pocketbase: subscribe to %s: %w", collectionName, err)
				}
				subscribed = true
				if onSubscribed != nil {
					onSubscribed()
				}
			}

		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))

		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if eventName == collectionName {
				handler([]byte(data))
			}
			eventName = ""
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("pocketbase: realtime stream read error: %w", err)
	}
	return fmt.Errorf("pocketbase: realtime stream closed")
}

func (c *Client) subscribeRealtime(clientID string, subscriptions []string) error {
	return c.doAuthed("POST", "/api/realtime", map[string]any{
		"clientId":      clientID,
		"subscriptions": subscriptions,
	}, nil)
}

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
// handler for every change on the "commands" collection. It blocks until
// ctx is canceled or the connection drops, returning an error in the
// latter case so the caller can decide whether to reconnect.
func (c *Client) SubscribeCommands(ctx context.Context, handler func(CommandEvent)) error {
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
				if err := c.subscribeRealtime(clientID, []string{"commands"}); err != nil {
					return fmt.Errorf("pocketbase: subscribe to commands: %w", err)
				}
				subscribed = true
			}

		case strings.HasPrefix(line, "event:"):
			eventName = strings.TrimSpace(strings.TrimPrefix(line, "event:"))

		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			if eventName == "commands" {
				var event CommandEvent
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					handler(event)
				}
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

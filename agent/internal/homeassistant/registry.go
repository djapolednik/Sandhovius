package homeassistant

import (
	"fmt"

	"github.com/gorilla/websocket"
)

type resultError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type entityRegistryUpdateResult struct {
	Success bool         `json:"success"`
	Error   *resultError `json:"error"`
}

type helperCreateResult struct {
	Success bool         `json:"success"`
	Error   *resultError `json:"error"`
	Result  struct {
		ID string `json:"id"`
	} `json:"result"`
}

// dialAuthed opens a short-lived, authenticated websocket connection for a
// single request/response call. Registry and helper-storage writes have no
// REST equivalent (websocket-only), and the long-lived connection
// Connect/ReadEvent hold is a single-reader loop not set up to correlate
// command responses — so each of these calls gets its own connection
// instead.
func (c *Client) dialAuthed() (*websocket.Conn, error) {
	conn, _, err := websocket.DefaultDialer.Dial(c.url, nil)
	if err != nil {
		return nil, fmt.Errorf("ha: dial: %w", err)
	}

	var msg BaseMessage
	if err := conn.ReadJSON(&msg); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ha: read auth_required: %w", err)
	}
	if msg.Type != "auth_required" {
		conn.Close()
		return nil, fmt.Errorf("ha: unexpected first message: %s", msg.Type)
	}

	if err := conn.WriteJSON(AuthMessage{Type: "auth", AccessToken: c.token}); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ha: send auth: %w", err)
	}
	if err := conn.ReadJSON(&msg); err != nil {
		conn.Close()
		return nil, fmt.Errorf("ha: read auth result: %w", err)
	}
	if msg.Type != "auth_ok" {
		conn.Close()
		return nil, fmt.Errorf("ha: auth failed: %s", msg.Message)
	}

	return conn, nil
}

// RenameEntity sets an entity's friendly name in Home Assistant's entity
// registry.
func (c *Client) RenameEntity(entityID, name string) error {
	conn, err := c.dialAuthed()
	if err != nil {
		return fmt.Errorf("ha: rename: %w", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(map[string]any{
		"id":        1,
		"type":      "config/entity_registry/update",
		"entity_id": entityID,
		"name":      name,
	}); err != nil {
		return fmt.Errorf("ha: send rename command: %w", err)
	}

	var result entityRegistryUpdateResult
	if err := conn.ReadJSON(&result); err != nil {
		return fmt.Errorf("ha: read rename result: %w", err)
	}
	if !result.Success {
		if result.Error != nil {
			return fmt.Errorf("ha: rename failed: %s (%s)", result.Error.Message, result.Error.Code)
		}
		return fmt.Errorf("ha: rename failed")
	}
	return nil
}

// CreateInputBoolean provisions a new Home Assistant "helper" entity of
// domain input_boolean — used as the on/off relay for light/switch/climate
// devices added from the Sandhovius UI, so nobody has to set anything up in
// Home Assistant by hand. Home Assistant decides the exact object_id (by
// slugifying name, de-duplicating if needed); the returned entity_id
// reflects whatever it picked.
func (c *Client) CreateInputBoolean(name string) (string, error) {
	return c.createHelper("input_boolean", map[string]any{"name": name})
}

// CreateInputNumber provisions a new Home Assistant "helper" entity of
// domain input_number — used for the numeric reading of sensor devices
// added from the Sandhovius UI. Defaults to a temperature-shaped range,
// the only kind of numeric sensor Sandhovius currently models.
func (c *Client) CreateInputNumber(name string) (string, error) {
	return c.createHelper("input_number", map[string]any{
		"name":                name,
		"min":                 -20,
		"max":                 50,
		"step":                0.5,
		"unit_of_measurement": "°C",
	})
}

func (c *Client) createHelper(domain string, payload map[string]any) (string, error) {
	conn, err := c.dialAuthed()
	if err != nil {
		return "", fmt.Errorf("ha: create %s helper: %w", domain, err)
	}
	defer conn.Close()

	command := map[string]any{"id": 1, "type": domain + "/create"}
	for k, v := range payload {
		command[k] = v
	}
	if err := conn.WriteJSON(command); err != nil {
		return "", fmt.Errorf("ha: send %s create command: %w", domain, err)
	}

	var result helperCreateResult
	if err := conn.ReadJSON(&result); err != nil {
		return "", fmt.Errorf("ha: read %s create result: %w", domain, err)
	}
	if !result.Success {
		if result.Error != nil {
			return "", fmt.Errorf("ha: %s create failed: %s (%s)", domain, result.Error.Message, result.Error.Code)
		}
		return "", fmt.Errorf("ha: %s create failed", domain)
	}

	return domain + "." + result.Result.ID, nil
}

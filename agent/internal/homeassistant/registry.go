package homeassistant

import (
	"encoding/json"
	"fmt"
	"strings"

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

// wsResult is het antwoord op één websocket-commando.
type wsResult struct {
	Success bool            `json:"success"`
	Error   *resultError    `json:"error"`
	Result  json.RawMessage `json:"result"`
}

// wsCall stuurt één commando over een open verbinding en geeft het result
// terug. id moet per verbinding oplopen.
func wsCall(conn *websocket.Conn, id int, command map[string]any) (json.RawMessage, error) {
	msg := map[string]any{"id": id}
	for k, v := range command {
		msg[k] = v
	}
	if err := conn.WriteJSON(msg); err != nil {
		return nil, fmt.Errorf("send %v: %w", command["type"], err)
	}
	var res wsResult
	if err := conn.ReadJSON(&res); err != nil {
		return nil, fmt.Errorf("read %v: %w", command["type"], err)
	}
	if !res.Success {
		if res.Error != nil {
			return nil, fmt.Errorf("%v failed: %s (%s)", command["type"], res.Error.Message, res.Error.Code)
		}
		return nil, fmt.Errorf("%v failed", command["type"])
	}
	return res.Result, nil
}

// wsList doet één list-commando op een eigen verbinding en leest het result
// in out.
func (c *Client) wsList(kind string, out any) error {
	conn, err := c.dialAuthed()
	if err != nil {
		return fmt.Errorf("ha: %s: %w", kind, err)
	}
	defer conn.Close()
	raw, err := wsCall(conn, 1, map[string]any{"type": kind})
	if err != nil {
		return fmt.Errorf("ha: %w", err)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("ha: decode %s: %w", kind, err)
	}
	return nil
}

// RegistryDevice is een apparaat uit HA's device-registry. Een apparaat van
// Zigbee2MQTT heeft identifier ["mqtt", "zigbee2mqtt_<ieee>"].
type RegistryDevice struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Model         string     `json:"model"`
	Manufacturer  string     `json:"manufacturer"`
	Identifiers   [][]string `json:"identifiers"`
	ConfigEntries []string   `json:"config_entries"`
}

// RegistryEntity is een entiteit uit HA's entity-registry.
type RegistryEntity struct {
	EntityID string `json:"entity_id"`
	DeviceID string `json:"device_id"`
	Platform string `json:"platform"`
	// DisabledBy is gezet als de entiteit uit staat (bijvoorbeeld de
	// kamers en zones van een Hue-bridge, standaard uit in HA).
	DisabledBy *string `json:"disabled_by"`
}

// ListDevices geeft HA's device-registry.
func (c *Client) ListDevices() ([]RegistryDevice, error) {
	var devs []RegistryDevice
	if err := c.wsList("config/device_registry/list", &devs); err != nil {
		return nil, err
	}
	return devs, nil
}

// ListEntities geeft HA's entity-registry.
func (c *Client) ListEntities() ([]RegistryEntity, error) {
	var ents []RegistryEntity
	if err := c.wsList("config/entity_registry/list", &ents); err != nil {
		return nil, err
	}
	return ents, nil
}

// ZigbeeEntity zoekt de HA-entiteit van een Zigbee2MQTT-apparaat (op
// IEEE-adres) in een domein (light, switch, climate). Bij een endpoint
// ("l1") eindigt de entity_id op "_l1", zoals Zigbee2MQTT ze noemt.
func ZigbeeEntity(devs []RegistryDevice, ents []RegistryEntity, ieee, domain, endpoint string) (string, bool) {
	deviceID := ""
	for _, d := range devs {
		for _, ident := range d.Identifiers {
			for _, v := range ident {
				if v == "zigbee2mqtt_"+ieee {
					deviceID = d.ID
				}
			}
		}
	}
	if deviceID == "" {
		return "", false
	}
	for _, e := range ents {
		if e.DeviceID != deviceID || !strings.HasPrefix(e.EntityID, domain+".") {
			continue
		}
		if endpoint == "" || strings.HasSuffix(e.EntityID, "_"+endpoint) {
			return e.EntityID, true
		}
	}
	return "", false
}

// DeleteHelpers verwijdert alle input_boolean- en input_number-helpers: de
// virtuele apparaten van vóór het koppelen. Op de box maakt niemand anders
// zulke helpers. Geeft het aantal verwijderde terug.
func (c *Client) DeleteHelpers() (int, error) {
	conn, err := c.dialAuthed()
	if err != nil {
		return 0, fmt.Errorf("ha: delete helpers: %w", err)
	}
	defer conn.Close()

	id, deleted := 0, 0
	for _, domain := range []string{"input_boolean", "input_number"} {
		id++
		raw, err := wsCall(conn, id, map[string]any{"type": domain + "/list"})
		if err != nil {
			return deleted, fmt.Errorf("ha: %w", err)
		}
		var helpers []struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(raw, &helpers); err != nil {
			return deleted, fmt.Errorf("ha: decode %s/list: %w", domain, err)
		}
		for _, h := range helpers {
			id++
			if _, err := wsCall(conn, id, map[string]any{"type": domain + "/delete", domain + "_id": h.ID}); err != nil {
				return deleted, fmt.Errorf("ha: %w", err)
			}
			deleted++
		}
	}
	return deleted, nil
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

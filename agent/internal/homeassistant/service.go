package homeassistant

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// CallService calls a Home Assistant service (e.g. domain "homeassistant",
// service "turn_on") for a specific entity, over the REST API — separate
// from the websocket connection used for reading events. extra carries
// additional service data (e.g. {"brightness": 80}); may be nil.
//
// "homeassistant" is a special domain in HA whose turn_on/turn_off/toggle
// services work across any entity domain that supports them (light,
// switch, climate, input_boolean, ...), so callers don't need to know a
// device's specific domain to control it.
func (c *Client) CallService(domain, service, entityID string, extra map[string]any) error {
	data := map[string]any{"entity_id": entityID}
	for k, v := range extra {
		data[k] = v
	}

	encoded, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("ha: encode service call body: %w", err)
	}

	url := fmt.Sprintf("%s/api/services/%s/%s", c.restURL, domain, service)
	req, err := http.NewRequest("POST", url, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("ha: build service call request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("ha: call service %s.%s: %w", domain, service, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ha: service %s.%s returned %d: %s", domain, service, resp.StatusCode, string(body))
	}
	return nil
}

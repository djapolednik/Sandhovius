package homeassistant

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// HasIntegration reports whether HA has a config entry for the given
// integration domain (e.g. "mqtt").
func (c *Client) HasIntegration(domain string) (bool, error) {
	req, err := http.NewRequest("GET", c.restURL+"/api/config/config_entries/entry", nil)
	if err != nil {
		return false, fmt.Errorf("ha: build config entries request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("ha: list config entries: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("ha: list config entries returned %d: %s", resp.StatusCode, body)
	}

	var entries []struct {
		Domain string `json:"domain"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return false, fmt.Errorf("ha: decode config entries: %w", err)
	}
	for _, e := range entries {
		if e.Domain == domain {
			return true, nil
		}
	}
	return false, nil
}

// AddMQTT sets up the MQTT integration through HA's config flow, pointing
// it at the given broker without authentication or TLS (the box's own
// Mosquitto). Same as Instellingen → Integraties → MQTT in the HA UI.
func (c *Client) AddMQTT(broker string, port int) error {
	var form struct {
		FlowID string `json:"flow_id"`
	}
	if err := c.postJSON("/api/config/config_entries/flow", map[string]any{"handler": "mqtt"}, &form); err != nil {
		return fmt.Errorf("ha: start mqtt flow: %w", err)
	}

	// The form wants the collapsed "other_settings" section too; these are
	// the defaults the UI would submit.
	input := map[string]any{
		"broker":   broker,
		"port":     port,
		"protocol": "5",
		"other_settings": map[string]any{
			"set_client_cert": false,
			"set_ca_cert":     "off",
			"transport":       "tcp",
		},
	}

	var result struct {
		Type   string         `json:"type"`
		Reason string         `json:"reason"`
		Errors map[string]any `json:"errors"`
	}
	if err := c.postJSON("/api/config/config_entries/flow/"+form.FlowID, input, &result); err != nil {
		return fmt.Errorf("ha: finish mqtt flow: %w", err)
	}
	if result.Type != "create_entry" {
		return fmt.Errorf("ha: mqtt flow ended in %q (%s %v)", result.Type, result.Reason, result.Errors)
	}
	return nil
}

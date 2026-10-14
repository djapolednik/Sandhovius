package homeassistant

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
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

// Flow is een lopende config-flow in HA, bijvoorbeeld een door HA zelf
// ontdekte Hue-bridge (handler "hue").
type Flow struct {
	FlowID  string `json:"flow_id"`
	Handler string `json:"handler"`
	StepID  string `json:"step_id"`
}

// FlowResult is het antwoord van HA op het starten of indienen van een flow:
// Type "form" (volgende stap, eventueel met Errors), "create_entry"
// (EntryID gezet) of "abort" (Reason).
type FlowResult struct {
	Type    string
	FlowID  string
	StepID  string
	Reason  string
	EntryID string
	Errors  map[string]string
}

func (r *FlowResult) UnmarshalJSON(data []byte) error {
	var raw struct {
		Type   string            `json:"type"`
		FlowID string            `json:"flow_id"`
		StepID string            `json:"step_id"`
		Reason string            `json:"reason"`
		Errors map[string]string `json:"errors"`
		Result json.RawMessage   `json:"result"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*r = FlowResult{Type: raw.Type, FlowID: raw.FlowID, StepID: raw.StepID, Reason: raw.Reason, Errors: raw.Errors}
	// Bij create_entry is result de config-entry (een object met entry_id);
	// oudere HA-versies gaven alleen het id.
	var entry struct {
		EntryID string `json:"entry_id"`
	}
	if json.Unmarshal(raw.Result, &entry) == nil && entry.EntryID != "" {
		r.EntryID = entry.EntryID
	} else {
		json.Unmarshal(raw.Result, &r.EntryID)
	}
	return nil
}

// ListFlows geeft de lopende config-flows, ook die HA zelf ontdekte.
func (c *Client) ListFlows() ([]Flow, error) {
	var flows []Flow
	if err := c.getJSON("/api/config/config_entries/flow", &flows); err != nil {
		return nil, fmt.Errorf("ha: list flows: %w", err)
	}
	return flows, nil
}

// StartFlow start een config-flow voor een integratie; data gaat mee in het
// startverzoek (bijvoorbeeld host).
func (c *Client) StartFlow(handler string, data map[string]any) (FlowResult, error) {
	body := map[string]any{"handler": handler}
	for k, v := range data {
		body[k] = v
	}
	var res FlowResult
	if err := c.postJSON("/api/config/config_entries/flow", body, &res); err != nil {
		return FlowResult{}, fmt.Errorf("ha: start %s flow: %w", handler, err)
	}
	return res, nil
}

// SubmitFlow dient de huidige stap van een flow in.
func (c *Client) SubmitFlow(flowID string, data map[string]any) (FlowResult, error) {
	if data == nil {
		data = map[string]any{}
	}
	var res FlowResult
	if err := c.postJSON("/api/config/config_entries/flow/"+flowID, data, &res); err != nil {
		return FlowResult{}, fmt.Errorf("ha: submit flow %s: %w", flowID, err)
	}
	return res, nil
}

// ConfigEntryIDs geeft de config-entries van één integratie (domain).
func (c *Client) ConfigEntryIDs(domain string) ([]string, error) {
	var entries []struct {
		EntryID string `json:"entry_id"`
		Domain  string `json:"domain"`
	}
	if err := c.getJSON("/api/config/config_entries/entry?domain="+url.QueryEscape(domain), &entries); err != nil {
		return nil, fmt.Errorf("ha: list %s entries: %w", domain, err)
	}
	ids := []string{}
	for _, e := range entries {
		if e.Domain == domain {
			ids = append(ids, e.EntryID)
		}
	}
	return ids, nil
}

func (c *Client) getJSON(path string, out any) error {
	req, err := http.NewRequest("GET", c.restURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("%s returned %d: %s", path, resp.StatusCode, raw)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// AddMQTT sets up the MQTT integration through HA's config flow, pointing
// it at the given broker without authentication or TLS (the box's own
// Mosquitto). Same as Instellingen → Integraties → MQTT in the HA UI.
func (c *Client) AddMQTT(broker string, port int) error {
	form, err := c.StartFlow("mqtt", nil)
	if err != nil {
		return err
	}
	// An abort (already_in_progress, single_instance_allowed) has no flow to
	// submit to or to delete.
	if form.Type != "form" || form.FlowID == "" {
		return fmt.Errorf("ha: mqtt flow did not start a form (type %q, reason %q)", form.Type, form.Reason)
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

	result, err := c.SubmitFlow(form.FlowID, input)
	if err != nil {
		c.abortFlow(form.FlowID)
		return fmt.Errorf("ha: finish mqtt flow: %w", err)
	}
	if result.Type != "create_entry" {
		c.abortFlow(form.FlowID)
		return fmt.Errorf("ha: mqtt flow ended in %q (%s %v)", result.Type, result.Reason, result.Errors)
	}
	return nil
}

// abortFlow removes a config flow that did not finish, so a failed attempt
// does not leave a half-open flow in HA. Best effort: only logged.
func (c *Client) abortFlow(flowID string) {
	req, err := http.NewRequest("DELETE", c.restURL+"/api/config/config_entries/flow/"+flowID, nil)
	if err != nil {
		log.Printf("[HA] Flow %s afbreken mislukt: %v\n", flowID, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[HA] Flow %s afbreken mislukt: %v\n", flowID, err)
		return
	}
	resp.Body.Close()
}

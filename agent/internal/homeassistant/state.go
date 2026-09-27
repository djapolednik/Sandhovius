package homeassistant

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// GetState reads an entity's current state over the REST API, in the same
// shape as a state_changed event. The agent uses it to catch up on state
// it may have missed: right after it created a helper entity (HA announces
// the first state before the agent knows which device it belongs to), and
// after (re)connecting to Home Assistant.
func (c *Client) GetState(entityID string) (HAEvent, error) {
	endpoint := fmt.Sprintf("%s/api/states/%s", c.restURL, url.PathEscape(entityID))
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return HAEvent{}, fmt.Errorf("ha: build state request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return HAEvent{}, fmt.Errorf("ha: get state of %s: %w", entityID, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return HAEvent{}, fmt.Errorf("ha: read state of %s: %w", entityID, err)
	}
	if resp.StatusCode >= 300 {
		return HAEvent{}, fmt.Errorf("ha: get state of %s returned %d: %s", entityID, resp.StatusCode, body)
	}

	var state struct {
		State       string                 `json:"state"`
		Attributes  map[string]interface{} `json:"attributes"`
		LastUpdated time.Time              `json:"last_updated"`
	}
	if err := json.Unmarshal(body, &state); err != nil {
		return HAEvent{}, fmt.Errorf("ha: decode state of %s: %w", entityID, err)
	}
	return HAEvent{
		EntityID:   entityID,
		State:      state.State,
		Attributes: state.Attributes,
		Timestamp:  state.LastUpdated,
	}, nil
}

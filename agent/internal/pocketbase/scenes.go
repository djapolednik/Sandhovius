package pocketbase

import (
	"fmt"
	"net/url"
)

// SceneAction is one step of a scene, in the same words as a single
// command: which device, which action, optional payload.
type SceneAction struct {
	Device  string         `json:"device"`
	Action  string         `json:"action"` // "turn_on", "turn_off", "set_temperature"
	Payload map[string]any `json:"payload"`
}

type Scene struct {
	ID      string        `json:"id"`
	House   string        `json:"house"`
	Name    string        `json:"name"`
	Actions []SceneAction `json:"actions"`
}

type sceneListResponse struct {
	Items []Scene `json:"items"`
}

// ListScenes geeft alle scènes van één huis.
func (c *Client) ListScenes(houseID string) ([]Scene, error) {
	var resp sceneListResponse
	path := "/api/collections/scenes/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list scenes: %w", err)
	}
	return resp.Items, nil
}

func (c *Client) GetScene(sceneID string) (*Scene, error) {
	var scene Scene
	if err := c.doAuthed("GET", "/api/collections/scenes/records/"+sceneID, nil, &scene); err != nil {
		return nil, fmt.Errorf("pocketbase: get scene %s: %w", sceneID, err)
	}
	return &scene, nil
}

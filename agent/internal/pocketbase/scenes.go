package pocketbase

import "fmt"

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

func (c *Client) GetScene(sceneID string) (*Scene, error) {
	var scene Scene
	if err := c.doAuthed("GET", "/api/collections/scenes/records/"+sceneID, nil, &scene); err != nil {
		return nil, fmt.Errorf("pocketbase: get scene %s: %w", sceneID, err)
	}
	return &scene, nil
}

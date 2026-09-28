package pocketbase

import "fmt"

type Command struct {
	ID      string         `json:"id"`
	Device  string         `json:"device"`
	Scene   string         `json:"scene"`
	Action  string         `json:"action"` // "turn_on", "turn_off", "toggle", "set_temperature", "provision", "run_scene"
	Payload map[string]any `json:"payload"`
	Status  string         `json:"status"` // "pending", "sent", "failed"
}

type commandListResponse struct {
	Items []Command `json:"items"`
}

// ListPendingCommands returns commands still awaiting execution. Used at
// startup to catch up on commands created while the agent wasn't running —
// the realtime subscription only delivers changes from the moment it
// connects onward, it doesn't replay history.
func (c *Client) ListPendingCommands() ([]Command, error) {
	var resp commandListResponse
	if err := c.doAuthed("GET", "/api/collections/commands/records?filter=status%3D%27pending%27&perPage=200", nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list pending commands: %w", err)
	}
	return resp.Items, nil
}

// MarkCommandSent marks a command as successfully executed.
func (c *Client) MarkCommandSent(commandID string) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/commands/records/"+commandID,
		map[string]any{"status": "sent"},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark command %s sent: %w", commandID, err)
	}
	return nil
}

// MarkCommandFailed marks a command as failed, recording why.
func (c *Client) MarkCommandFailed(commandID string, reason error) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/commands/records/"+commandID,
		map[string]any{"status": "failed", "error": reason.Error()},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark command %s failed: %w", commandID, err)
	}
	return nil
}

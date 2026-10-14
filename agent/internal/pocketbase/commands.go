package pocketbase

import (
	"fmt"
	"net/url"
	"regexp"
)

type Command struct {
	ID      string         `json:"id"`
	Device  string         `json:"device"`
	Scene   string         `json:"scene"`
	Action  string         `json:"action"` // "turn_on", "turn_off", "toggle", "set_temperature", "run_scene", "identify"
	Payload map[string]any `json:"payload"`
	Status  string         `json:"status"`  // "pending", "sent", "failed"
	Created string         `json:"created"` // PocketBase-formaat: "2006-01-02 15:04:05.000Z"
}

type commandListResponse struct {
	Items []Command `json:"items"`
}

// recordID is the shape of a PocketBase record id. House ids go into a
// filter string, so anything else is refused rather than escaped.
var recordID = regexp.MustCompile(`^[a-z0-9]+$`)

// pendingCommandsFilter selects the pending commands for one house: device
// commands via the device's gateway, scene commands via the scene's house.
// As superuser the agent sees every house's commands; without this filter
// one box would run another box's commands.
func pendingCommandsFilter(house string) (string, error) {
	if !recordID.MatchString(house) {
		return "", fmt.Errorf("pocketbase: invalid house id %q", house)
	}
	return fmt.Sprintf("status='pending' && (device.gateway='%s' || scene.house='%s')", house, house), nil
}

// ListPendingCommands returns this house's commands still awaiting
// execution. Used to catch up on commands created while the agent or its
// realtime stream was down — the subscription only delivers changes from
// the moment it connects onward, it doesn't replay history.
func (c *Client) ListPendingCommands(house string) ([]Command, error) {
	filter, err := pendingCommandsFilter(house)
	if err != nil {
		return nil, err
	}
	var resp commandListResponse
	path := "/api/collections/commands/records?perPage=200&filter=" + url.QueryEscape(filter)
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
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

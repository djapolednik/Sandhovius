package pocketbase

import "fmt"

// SetGatewayStatus updates a gateway's status ("online", "offline" or
// "error"). PocketBase automatically refreshes last_seen on every update.
func (c *Client) SetGatewayStatus(gatewayID, status string) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/houses/records/"+gatewayID,
		map[string]any{"select": status},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: set gateway %s status to %s: %w", gatewayID, status, err)
	}
	return nil
}

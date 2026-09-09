package pocketbase

import "fmt"

type Device struct {
	ID       string `json:"id"`
	Gateway  string `json:"gateway"`
	EntityID string `json:"entity_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Online   bool   `json:"online"`
}

type deviceListResponse struct {
	Items []Device `json:"items"`
}

// ListDevices returns every device record currently in PocketBase. There's
// no pagination here — fine for a handful of devices in a home, would need
// revisiting at a much larger scale.
func (c *Client) ListDevices() ([]Device, error) {
	var resp deviceListResponse
	if err := c.doAuthed("GET", "/api/collections/devices/records?perPage=200", nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list devices: %w", err)
	}
	return resp.Items, nil
}

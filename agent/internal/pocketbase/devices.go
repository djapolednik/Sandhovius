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

// GetDevice fetches a single device record by id.
func (c *Client) GetDevice(deviceID string) (*Device, error) {
	var device Device
	if err := c.doAuthed("GET", "/api/collections/devices/records/"+deviceID, nil, &device); err != nil {
		return nil, fmt.Errorf("pocketbase: get device %s: %w", deviceID, err)
	}
	return &device, nil
}

// SetDeviceEntityID links a device to a newly-provisioned Home Assistant
// entity. Used right after auto-provisioning a helper for a device that was
// created from the Sandhovius UI without an entity_id.
func (c *Client) SetDeviceEntityID(deviceID, entityID string) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/devices/records/"+deviceID,
		map[string]any{"entity_id": entityID},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: set device %s entity_id: %w", deviceID, err)
	}
	return nil
}

// SetDeviceOnline updates a device's online flag.
func (c *Client) SetDeviceOnline(deviceID string, online bool) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/devices/records/"+deviceID,
		map[string]any{"online": online},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: set device %s online=%v: %w", deviceID, online, err)
	}
	return nil
}

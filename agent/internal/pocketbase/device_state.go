package pocketbase

import (
	"fmt"
	"net/url"
)

type DeviceState struct {
	ID     string         `json:"id"`
	Device string         `json:"device"`
	State  map[string]any `json:"state"`
}

type deviceStateListResponse struct {
	Items []DeviceState `json:"items"`
}

// UpsertDeviceState writes the latest known state for a device to
// PocketBase: one row per device, always overwritten in place. This keeps
// the cloud copy small (just "what is the current state right now") — full
// history stays local, not here.
func (c *Client) UpsertDeviceState(deviceID string, state map[string]any) error {
	existing, err := c.findDeviceStateByDevice(deviceID)
	if err != nil {
		return fmt.Errorf("pocketbase: upsert device_state for %s: %w", deviceID, err)
	}

	if existing != nil {
		return c.doAuthed(
			"PATCH",
			"/api/collections/device_state/records/"+existing.ID,
			map[string]any{"state": state},
			nil,
		)
	}

	return c.doAuthed(
		"POST",
		"/api/collections/device_state/records",
		map[string]any{"device": deviceID, "state": state},
		nil,
	)
}

// findDeviceStateByDevice looks up the (at most one) device_state record
// for a given device. deviceID always comes from PocketBase's own record
// IDs (15 lowercase alphanumeric chars, see the "devices" collection
// schema) so it is safe to inline into the filter expression here.
func (c *Client) findDeviceStateByDevice(deviceID string) (*DeviceState, error) {
	filter := url.QueryEscape(fmt.Sprintf("device='%s'", deviceID))
	path := fmt.Sprintf("/api/collections/device_state/records?filter=%s&perPage=1", filter)

	var resp deviceStateListResponse
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, err
	}
	if len(resp.Items) == 0 {
		return nil, nil
	}
	return &resp.Items[0], nil
}

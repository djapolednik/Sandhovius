package pocketbase

import (
	"fmt"
	"net/url"
)

type Device struct {
	ID       string `json:"id"`
	Gateway  string `json:"gateway"`
	Room     string `json:"room"`
	EntityID string `json:"entity_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Online   bool   `json:"online"`
	// Identiteit uit het koppelen (spec 2026-10-14-device-pairing-design.md):
	// Source zigbee/hue, Address het Zigbee IEEE-adres of het HA-device-id,
	// Endpoint "l1"/"l2" bij een apparaat met meer delen.
	Source       string   `json:"source"`
	Address      string   `json:"address"`
	Endpoint     string   `json:"endpoint"`
	Model        string   `json:"model"`
	ShownAs      string   `json:"shown_as"`
	Capabilities []string `json:"capabilities"`
}

// NewDevice is wat de box na koppelen aanmaakt.
type NewDevice struct {
	Gateway, Room, Name, Type, Source, Address, Endpoint, EntityID, Model string
	Capabilities                                                          []string
}

// CreateDevice maakt een device in het huis van de box (alleen de box mag
// dat, na koppelen in de app).
func (c *Client) CreateDevice(d NewDevice) (Device, error) {
	body := map[string]any{
		"gateway": d.Gateway, "name": d.Name, "type": d.Type, "source": d.Source,
		"address": d.Address, "endpoint": d.Endpoint, "entity_id": d.EntityID, "model": d.Model,
		"capabilities": d.Capabilities, "online": true,
	}
	if d.Room != "" {
		body["room"] = d.Room
	}
	var out Device
	if err := c.doAuthed("POST", "/api/collections/devices/records", body, &out); err != nil {
		return Device{}, fmt.Errorf("pocketbase: create device %s: %w", d.Address, err)
	}
	return out, nil
}

type deviceListResponse struct {
	Items []Device `json:"items"`
}

// ListHouseDevices geeft de devices van één huis.
func (c *Client) ListHouseDevices(houseID string) ([]Device, error) {
	var resp deviceListResponse
	path := "/api/collections/devices/records?perPage=500&filter=" + url.QueryEscape("gateway='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list house devices: %w", err)
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

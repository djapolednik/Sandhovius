package pocketbase

import (
	"fmt"
	"net/url"
	"time"
)

// MotionLight zet lampen aan bij beweging op een sensor en, OffAfter minuten
// na de laatste beweging, weer uit (collectie motion_lights). Sensor en
// Devices zijn device-id's van hetzelfde huis.
type MotionLight struct {
	ID       string   `json:"id"`
	House    string   `json:"house"`
	Sensor   string   `json:"sensor"`
	Devices  []string `json:"devices"`
	OnlyDark bool     `json:"only_dark"`
	OffAfter int      `json:"off_after"`
	Enabled  bool     `json:"enabled"`
}

type motionLightListResponse struct {
	Items []MotionLight `json:"items"`
}

// ListMotionLights geeft alle bewegingslichten van één huis, ook de
// uitgeschakelde.
func (c *Client) ListMotionLights(houseID string) ([]MotionLight, error) {
	var resp motionLightListResponse
	path := "/api/collections/motion_lights/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list motion lights: %w", err)
	}
	return resp.Items, nil
}

// MarkMotionLightRun schrijft wanneer een bewegingslicht voor het laatst
// schakelde en of dat lukte (last_error leeg = gelukt). Diagnose: de app
// toont alleen óf er een fout is.
func (c *Client) MarkMotionLightRun(id string, at time.Time, runErr error) error {
	lastError := ""
	if runErr != nil {
		lastError = runErr.Error()
	}
	err := c.doAuthed(
		"PATCH",
		"/api/collections/motion_lights/records/"+id,
		map[string]any{"last_run": at.UTC().Format(pbDateLayout), "last_error": lastError},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark motion light %s run: %w", id, err)
	}
	return nil
}

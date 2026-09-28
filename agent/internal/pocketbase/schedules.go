package pocketbase

import (
	"fmt"
	"net/url"
	"time"
)

// Schedule voert een scène uit op een tijdstip ("23:00", lokale tijd) op de
// gekozen weekdagen ("mon" … "sun").
type Schedule struct {
	ID      string   `json:"id"`
	House   string   `json:"house"`
	Scene   string   `json:"scene"`
	Time    string   `json:"time"`
	Days    []string `json:"days"`
	Enabled bool     `json:"enabled"`
}

type scheduleListResponse struct {
	Items []Schedule `json:"items"`
}

// ListSchedules geeft alle schema's van één huis, ook de uitgeschakelde.
func (c *Client) ListSchedules(houseID string) ([]Schedule, error) {
	var resp scheduleListResponse
	path := "/api/collections/schedules/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list schedules: %w", err)
	}
	return resp.Items, nil
}

// pbDateLayout is het datumformaat dat PocketBase zelf gebruikt (UTC).
const pbDateLayout = "2006-01-02 15:04:05.000Z"

// MarkScheduleRun legt vast wanneer een schema liep en of dat lukte (runErr
// nil = gelukt, last_error wordt dan leeggemaakt).
func (c *Client) MarkScheduleRun(scheduleID string, at time.Time, runErr error) error {
	lastError := ""
	if runErr != nil {
		lastError = runErr.Error()
	}
	err := c.doAuthed(
		"PATCH",
		"/api/collections/schedules/records/"+scheduleID,
		map[string]any{"last_run": at.UTC().Format(pbDateLayout), "last_error": lastError},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark schedule %s run: %w", scheduleID, err)
	}
	return nil
}

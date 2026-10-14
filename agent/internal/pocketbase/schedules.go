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
	// Zon (spec 2026-10-14-sun-schedules-design.md): "time" of leeg = op
	// Time; "sunrise"/"sunset" = bij de zon plus OffsetMin minuten.
	Trigger   string `json:"trigger"`
	OffsetMin int    `json:"offset_min"`
	// NextRun schrijft de box (DateLayout); LastError ook.
	NextRun   string `json:"next_run"`
	LastError string `json:"last_error"`
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

// DateLayout is het datumformaat dat PocketBase zelf gebruikt (UTC).
const DateLayout = "2006-01-02 15:04:05.000Z"

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
		map[string]any{"last_run": at.UTC().Format(DateLayout), "last_error": lastError},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: mark schedule %s run: %w", scheduleID, err)
	}
	return nil
}

// SetScheduleNextRun schrijft wanneer een zon-schema de volgende keer loopt
// (leeg = niet bekend) en, als lastError niet nil is, de fout.
func (c *Client) SetScheduleNextRun(scheduleID, nextRun string, lastError *string) error {
	body := map[string]any{"next_run": nextRun}
	if lastError != nil {
		body["last_error"] = *lastError
	}
	if err := c.doAuthed("PATCH", "/api/collections/schedules/records/"+scheduleID, body, nil); err != nil {
		return fmt.Errorf("pocketbase: set next run of schedule %s: %w", scheduleID, err)
	}
	return nil
}

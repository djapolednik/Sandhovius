package pocketbase

import (
	"fmt"
	"net/url"
	"time"
)

// Automation is een routine (collectie automations, spec
// 2026-10-14-routines-design.md): als Starter gebeurt, alleen als alle
// Conditions waar zijn, doe Actions; OffAfter minuten later gaat uit wat de
// routine aanzette (0 = nooit). De gesloten lijst soorten bewaakt
// automation_rules.js; de agent controleert opnieuw.
type Automation struct {
	ID         string                `json:"id"`
	House      string                `json:"house"`
	Name       string                `json:"name"`
	Enabled    bool                  `json:"enabled"`
	Starter    AutomationStarter     `json:"starter"`
	Conditions []AutomationCondition `json:"conditions"`
	Actions    []AutomationAction    `json:"actions"`
	OffAfter   int                   `json:"off_after"`
	NextRun    string                `json:"next_run"`
	LastError  string                `json:"last_error"`
}

// AutomationStarter: kind "time" (Time, Days), "sun" (Event sunrise/sunset,
// OffsetMin, Days), "device" (Device, To on/off) of "sensor" (Device, Event
// motion/no_motion/open/closed/leak/smoke/above/below, Value bij above/below)
// of "presence" (Event all_away/first_home, of arrives/leaves met User).
type AutomationStarter struct {
	Kind      string   `json:"kind"`
	Time      string   `json:"time,omitempty"`
	Days      []string `json:"days,omitempty"`
	Event     string   `json:"event,omitempty"`
	OffsetMin int      `json:"offset_min,omitempty"`
	Device    string   `json:"device,omitempty"`
	To        string   `json:"to,omitempty"`
	Value     float64  `json:"value,omitempty"`
	User      string   `json:"user,omitempty"`
}

// AutomationCondition: kind "between" (From, To; mag over middernacht),
// "dark", "days" (Days) of "presence" (State someone_home/nobody_home, of
// home/away met User).
type AutomationCondition struct {
	Kind  string   `json:"kind"`
	From  string   `json:"from,omitempty"`
	To    string   `json:"to,omitempty"`
	Days  []string `json:"days,omitempty"`
	State string   `json:"state,omitempty"`
	User  string   `json:"user,omitempty"`
}

// AutomationAction: kind "device" (Device, Action turn_on/turn_off, Payload
// brightness_pct/color_temp_kelvin) of "scene" (Scene).
type AutomationAction struct {
	Kind    string         `json:"kind"`
	Device  string         `json:"device,omitempty"`
	Action  string         `json:"action,omitempty"`
	Payload map[string]any `json:"payload,omitempty"`
	Scene   string         `json:"scene,omitempty"`
}

type automationListResponse struct {
	Items []Automation `json:"items"`
}

// ListAutomations geeft alle routines van één huis, ook de uitgeschakelde.
func (c *Client) ListAutomations(houseID string) ([]Automation, error) {
	var resp automationListResponse
	path := "/api/collections/automations/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list automations: %w", err)
	}
	return resp.Items, nil
}

// MarkAutomationRun schrijft wanneer een routine liep en of dat lukte
// (runErr nil = gelukt; last_error wordt dan leeg).
func (c *Client) MarkAutomationRun(id string, at time.Time, runErr error) error {
	lastError := ""
	if runErr != nil {
		lastError = runErr.Error()
	}
	body := map[string]any{"last_run": at.UTC().Format(DateLayout), "last_error": lastError}
	if err := c.doAuthed("PATCH", "/api/collections/automations/records/"+id, body, nil); err != nil {
		return fmt.Errorf("pocketbase: mark automation %s run: %w", id, err)
	}
	return nil
}

// SetAutomationNextRun schrijft wanneer een routine op tijd of zon de volgende
// keer loopt (leeg = onbekend) en, als lastError niet nil is, de fout.
func (c *Client) SetAutomationNextRun(id, nextRun string, lastError *string) error {
	body := map[string]any{"next_run": nextRun}
	if lastError != nil {
		body["last_error"] = *lastError
	}
	if err := c.doAuthed("PATCH", "/api/collections/automations/records/"+id, body, nil); err != nil {
		return fmt.Errorf("pocketbase: set next run of automation %s: %w", id, err)
	}
	return nil
}

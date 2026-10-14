package pocketbase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"time"
)

// PairingSession is een koppelsessie die een bewoner in de app opent
// (spec 2026-10-14-device-pairing-design.md).
type PairingSession struct {
	ID, House, Kind, Status string
	Expires                 time.Time // nul: nog niet gezet
	Extend, ButtonPressed   bool
}

// UnmarshalJSON leest expires in het datumformaat van PocketBase; leeg wordt
// de nul-tijd.
func (s *PairingSession) UnmarshalJSON(data []byte) error {
	var raw struct {
		ID            string `json:"id"`
		House         string `json:"house"`
		Kind          string `json:"kind"`
		Status        string `json:"status"`
		Expires       string `json:"expires"`
		Extend        bool   `json:"extend"`
		ButtonPressed bool   `json:"button_pressed"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	*s = PairingSession{ID: raw.ID, House: raw.House, Kind: raw.Kind, Status: raw.Status,
		Extend: raw.Extend, ButtonPressed: raw.ButtonPressed}
	if raw.Expires != "" {
		t, err := time.Parse(pbDateLayout, raw.Expires)
		if err != nil {
			return fmt.Errorf("pocketbase: expires %q: %w", raw.Expires, err)
		}
		s.Expires = t
	}
	return nil
}

// PairingCandidate is een gevonden apparaat (of deel) in een koppelsessie.
type PairingCandidate struct {
	ID           string   `json:"id"`
	Session      string   `json:"session"`
	Source       string   `json:"source"`
	Address      string   `json:"address"`
	Endpoint     string   `json:"endpoint"`
	Type         string   `json:"type"`
	Model        string   `json:"model"`
	Status       string   `json:"status"`
	Name         string   `json:"name"`
	Room         string   `json:"room"`
	Device       string   `json:"device"`
	Capabilities []string `json:"capabilities"`
	Identify     int      `json:"identify"`
	Add          bool     `json:"add"`
}

// PairingEvent is een realtime-melding op pairing_sessions (Session gezet)
// of pairing_candidates (Candidate gezet). Action: create/update/delete.
type PairingEvent struct {
	Action    string
	Session   *PairingSession
	Candidate *PairingCandidate
}

// ListOpenPairingSessions geeft de sessies van een huis die nog niet dicht
// zijn (starting, open, waiting_button).
func (c *Client) ListOpenPairingSessions(houseID string) ([]PairingSession, error) {
	if !recordID.MatchString(houseID) {
		return nil, fmt.Errorf("pocketbase: ongeldig huis-id %q", houseID)
	}
	filter := "house='" + houseID + "' && (status='starting' || status='open' || status='waiting_button')"
	var resp struct {
		Items []PairingSession `json:"items"`
	}
	path := "/api/collections/pairing_sessions/records?perPage=50&filter=" + url.QueryEscape(filter)
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list pairing sessions: %w", err)
	}
	return resp.Items, nil
}

// UpdatePairingSession wijzigt de velden die de box schrijft (status,
// expires, error, extend, button_pressed).
func (c *Client) UpdatePairingSession(id string, fields map[string]any) error {
	if err := c.doAuthed("PATCH", "/api/collections/pairing_sessions/records/"+id, fields, nil); err != nil {
		return fmt.Errorf("pocketbase: update pairing session %s: %w", id, err)
	}
	return nil
}

// CreatePairingCandidate schrijft een gevonden apparaat.
func (c *Client) CreatePairingCandidate(p PairingCandidate) (PairingCandidate, error) {
	body := map[string]any{
		"session": p.Session, "source": p.Source, "address": p.Address, "endpoint": p.Endpoint,
		"type": p.Type, "model": p.Model, "status": p.Status, "capabilities": p.Capabilities,
	}
	var out PairingCandidate
	if err := c.doAuthed("POST", "/api/collections/pairing_candidates/records", body, &out); err != nil {
		return PairingCandidate{}, fmt.Errorf("pocketbase: create pairing candidate %s: %w", p.Address, err)
	}
	return out, nil
}

// UpdatePairingCandidate wijzigt de velden die de box schrijft.
func (c *Client) UpdatePairingCandidate(id string, fields map[string]any) error {
	if err := c.doAuthed("PATCH", "/api/collections/pairing_candidates/records/"+id, fields, nil); err != nil {
		return fmt.Errorf("pocketbase: update pairing candidate %s: %w", id, err)
	}
	return nil
}

// SubscribePairing volgt pairing_sessions en pairing_candidates op één
// realtime-verbinding (de regels geven de box alleen zijn eigen huis).
// Blokkeert tot ctx klaar is of de verbinding wegvalt.
func (c *Client) SubscribePairing(ctx context.Context, onSubscribed func(), handler func(PairingEvent)) error {
	collections := []string{"pairing_sessions", "pairing_candidates"}
	return c.subscribeCollections(ctx, collections, onSubscribed, func(collection string, data []byte) {
		var raw struct {
			Action string          `json:"action"`
			Record json.RawMessage `json:"record"`
		}
		if err := json.Unmarshal(data, &raw); err != nil {
			return
		}
		event := PairingEvent{Action: raw.Action}
		if collection == "pairing_sessions" {
			var s PairingSession
			if err := json.Unmarshal(raw.Record, &s); err != nil {
				return
			}
			event.Session = &s
		} else {
			var cand PairingCandidate
			if err := json.Unmarshal(raw.Record, &cand); err != nil {
				return
			}
			event.Candidate = &cand
		}
		handler(event)
	})
}

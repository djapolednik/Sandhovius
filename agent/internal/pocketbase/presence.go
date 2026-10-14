package pocketbase

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// Presence is thuis of weg van één lid (collectie presence, spec
// 2026-10-14-presence-design.md). Geen rij = thuis.
type Presence struct {
	ID    string `json:"id"`
	House string `json:"house"`
	User  string `json:"user"`
	Home  bool   `json:"home"`
	// Updated: wanneer de rij veranderde ("2006-01-02 15:04:05.000Z",
	// sorteerbaar als tekst), zodat een oud snapshot een nieuwere
	// realtime-melding niet terugdraait.
	Updated string `json:"updated"`
}

type presenceListResponse struct {
	Items []Presence `json:"items"`
}

// ListPresence geeft de thuis/weg-rijen van één huis.
func (c *Client) ListPresence(houseID string) ([]Presence, error) {
	var resp presenceListResponse
	path := "/api/collections/presence/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list presence: %w", err)
	}
	return resp.Items, nil
}

// HouseMembers geeft de ids van de leden van het huis (houses.members).
func (c *Client) HouseMembers(houseID string) ([]string, error) {
	var house struct {
		Members []string `json:"members"`
	}
	if err := c.doAuthed("GET", "/api/collections/houses/records/"+url.PathEscape(houseID), nil, &house); err != nil {
		return nil, fmt.Errorf("pocketbase: house members: %w", err)
	}
	return house.Members, nil
}

// PresenceEvent is een realtime-melding op presence ("create", "update",
// "delete").
type PresenceEvent struct {
	EventType string   `json:"action"`
	Record    Presence `json:"record"`
}

// SubscribePresence volgt thuis/weg realtime, zodat een routine op
// thuiskomen niet op het snapshot van de volgende minuut hoeft te wachten.
// Blokkeert tot ctx stopt of de verbinding wegvalt.
func (c *Client) SubscribePresence(ctx context.Context, handler func(PresenceEvent)) error {
	return c.subscribeCollection(ctx, "presence", nil, func(data []byte) {
		var event PresenceEvent
		if err := json.Unmarshal(data, &event); err == nil {
			handler(event)
		}
	})
}

package pocketbase

import (
	"fmt"
	"net/url"
)

type Gateway struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type gatewayListResponse struct {
	Items []Gateway `json:"items"`
}

// FindGatewayByName looks up a gateway record by its name. It returns
// nil, nil when no gateway with that name exists yet.
func (c *Client) FindGatewayByName(name string) (*Gateway, error) {
	filter := url.QueryEscape(fmt.Sprintf("name='%s'", name))
	path := fmt.Sprintf("/api/collections/gateways/records?filter=%s&perPage=1", filter)

	var resp gatewayListResponse
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: find gateway %q: %w", name, err)
	}
	if len(resp.Items) == 0 {
		return nil, nil
	}
	return &resp.Items[0], nil
}

// CreateGateway registers a new gateway record with the given name and an
// initial "online" status.
func (c *Client) CreateGateway(name string) (*Gateway, error) {
	var created Gateway
	err := c.doAuthed(
		"POST",
		"/api/collections/gateways/records",
		map[string]any{"name": name, "select": "online"},
		&created,
	)
	if err != nil {
		return nil, fmt.Errorf("pocketbase: create gateway %q: %w", name, err)
	}
	return &created, nil
}

// SetGatewayStatus updates a gateway's status ("online", "offline" or
// "error"). PocketBase automatically refreshes last_seen on every update.
func (c *Client) SetGatewayStatus(gatewayID, status string) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/gateways/records/"+gatewayID,
		map[string]any{"select": status},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: set gateway %s status to %s: %w", gatewayID, status, err)
	}
	return nil
}

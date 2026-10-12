package pocketbase

import (
	"errors"
	"fmt"
)

// BoxRecord is the box's own record in the "boxes" auth collection. House is
// empty as long as the box is not linked to a house.
type BoxRecord struct {
	ID     string `json:"id"`
	Serial string `json:"serial"`
	House  string `json:"house"`
}

type authResponse struct {
	Token  string    `json:"token"`
	Record BoxRecord `json:"record"`
}

// SetCredentials remembers the box serial and secret without logging in,
// so the agent can start while PocketBase is unreachable and log in later.
// The credentials let the client silently re-authenticate if the token
// expires (see doAuthed).
func (c *Client) SetCredentials(serial, secret string) {
	c.mu.Lock()
	c.serial = serial
	c.secret = secret
	c.mu.Unlock()
}

// Login logs in as the box with the stored credentials, keeps the token and
// returns the box record (including the house it belongs to).
func (c *Client) Login() (*BoxRecord, error) {
	c.mu.RLock()
	serial, secret := c.serial, c.secret
	c.mu.RUnlock()

	var resp authResponse
	err := c.do(
		"POST",
		"/api/collections/boxes/auth-with-password",
		map[string]string{"identity": serial, "password": secret},
		&resp,
	)
	if err != nil {
		return nil, fmt.Errorf("pocketbase: login: %w", err)
	}

	c.setToken(resp.Token)
	return &resp.Record, nil
}

// RefreshBox renews the token and returns the current box record, so the
// agent notices when the box is linked to (or removed from) a house. On 401
// doAuthed logs in again first.
func (c *Client) RefreshBox() (*BoxRecord, error) {
	var resp authResponse
	if err := c.doAuthed("POST", "/api/collections/boxes/auth-refresh", nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: refresh box: %w", err)
	}
	c.setToken(resp.Token)
	return &resp.Record, nil
}

// ReportBox tells PocketBase which agent version runs on this box; the hook
// stores it with the time on the box's own record (agent_version,
// reported_at). Works with or without a house.
func (c *Client) ReportBox(version string) error {
	if err := c.doAuthed("POST", "/api/sandhovius/box/report", map[string]string{"agent_version": version}, nil); err != nil {
		return fmt.Errorf("pocketbase: report box: %w", err)
	}
	return nil
}

// doAuthed is like do, but if the request fails because the token expired
// (HTTP 401), it re-authenticates once using the stored credentials and
// retries the request. Domain methods (device_state.go, ...) should call
// this instead of do directly.
func (c *Client) doAuthed(method, path string, body any, out any) error {
	err := c.do(method, path, body, out)

	var statusErr *StatusError
	if errors.As(err, &statusErr) && statusErr.StatusCode == 401 {
		if _, loginErr := c.Login(); loginErr != nil {
			return fmt.Errorf("pocketbase: re-authenticate after 401: %w", loginErr)
		}
		return c.do(method, path, body, out)
	}

	return err
}

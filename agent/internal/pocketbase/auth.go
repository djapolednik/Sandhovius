package pocketbase

import (
	"errors"
	"fmt"
)

type authResponse struct {
	Token string `json:"token"`
}

// Authenticate logs in as the PocketBase superuser and stores the resulting
// token on the client. It also remembers the credentials so the client can
// silently re-authenticate later if the token expires (see doAuthed).
func (c *Client) Authenticate(email, password string) error {
	c.SetCredentials(email, password)
	return c.Login()
}

// SetCredentials remembers the superuser credentials without logging in,
// so the agent can start while PocketBase is unreachable and log in later.
func (c *Client) SetCredentials(email, password string) {
	c.mu.Lock()
	c.email = email
	c.password = password
	c.mu.Unlock()
}

// Login logs in with the stored credentials and keeps the token.
func (c *Client) Login() error {
	c.mu.RLock()
	email, password := c.email, c.password
	c.mu.RUnlock()

	var resp authResponse
	err := c.do(
		"POST",
		"/api/collections/_superusers/auth-with-password",
		map[string]string{"identity": email, "password": password},
		&resp,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: login: %w", err)
	}

	c.setToken(resp.Token)
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
		if loginErr := c.Login(); loginErr != nil {
			return fmt.Errorf("pocketbase: re-authenticate after 401: %w", loginErr)
		}
		return c.do(method, path, body, out)
	}

	return err
}

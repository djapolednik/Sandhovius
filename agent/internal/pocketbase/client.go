package pocketbase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

// Client is a minimal REST client for the PocketBase API. It knows how to
// send authenticated JSON requests; it has no knowledge of specific
// collections like "devices" or "device_state" — that lives in the other
// files in this package.
type Client struct {
	baseURL    string
	httpClient *http.Client // realtime (SSE): lange verbinding, geen timeout
	restClient *http.Client // gewone REST-calls: nooit eindeloos wachten

	mu     sync.RWMutex
	token  string
	serial string
	secret string

	// upsertMu serializes UpsertDeviceState calls. Without it, two
	// concurrent upserts for a device with no existing row yet could both
	// see "not found" and both create a row — a classic check-then-act
	// race. The agent is the only writer to device_state, so a single
	// process-wide lock fully closes that race.
	upsertMu sync.Mutex
}

// restTimeout begrenst elke REST-call. Zonder timeout blijft een call naar
// een hangende PocketBase (straks op Scaleway, internet half weg) minutenlang
// staan, en daarmee de schema-lus en de hartslag.
const restTimeout = 15 * time.Second

// streamKeepAlive bepaalt hoe snel een halfopen realtime-verbinding opvalt
// (netwerk weg zonder dat de verbinding netjes sluit): na 15 s stilte een
// probe, daarna elke 5 s, na 3 gemiste is hij dood (~30 s). Met Go's
// standaard duurde dat ~3 min. Een tijdslimiet op de stroom zelf helpt niet:
// PocketBase sluit een stille stroom pas na 5 min, dus stilte is normaal.
var streamKeepAlive = net.KeepAliveConfig{
	Enable:   true,
	Idle:     15 * time.Second,
	Interval: 5 * time.Second,
	Count:    3,
}

func NewClient(baseURL string) *Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAliveConfig: streamKeepAlive}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = dialer.DialContext
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Transport: transport},
		restClient: &http.Client{Timeout: restTimeout},
	}
}

func (c *Client) setToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = token
}

func (c *Client) authToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.token
}

// StatusError is returned by do when PocketBase responds with a non-2xx
// status. Callers (e.g. auth.go) can type-assert it to react to specific
// status codes such as 401.
type StatusError struct {
	Method     string
	Path       string
	StatusCode int
	Body       string
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("pocketbase: %s %s returned %d: %s", e.Method, e.Path, e.StatusCode, e.Body)
}

// do sends an authenticated JSON request to the PocketBase API.
// body is marshaled as the JSON request body when non-nil.
// out is populated by unmarshaling the JSON response when non-nil.
func (c *Client) do(method, path string, body any, out any) error {
	var reqBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("pocketbase: encode request body: %w", err)
		}
		reqBody = bytes.NewReader(encoded)
	}

	req, err := http.NewRequest(method, c.baseURL+path, reqBody)
	if err != nil {
		return fmt.Errorf("pocketbase: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token := c.authToken(); token != "" {
		req.Header.Set("Authorization", token)
	}

	resp, err := c.restClient.Do(req)
	if err != nil {
		return fmt.Errorf("pocketbase: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("pocketbase: read response body: %w", err)
	}

	if resp.StatusCode >= 300 {
		return &StatusError{Method: method, Path: path, StatusCode: resp.StatusCode, Body: string(respBody)}
	}

	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("pocketbase: decode response: %w", err)
		}
	}
	return nil
}

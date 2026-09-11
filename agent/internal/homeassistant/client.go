package homeassistant

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

type Client struct {
	url        string
	restURL    string
	token      string
	connection *websocket.Conn
	httpClient *http.Client
}

type AuthMessage struct {
	Type        string `json:"type"`
	AccessToken string `json:"access_token"`
}

type SubscribeMessage struct {
	ID        int    `json:"id"`
	Type      string `json:"type"`
	EventType string `json:"event_type"`
}

type BaseMessage struct {
	Type    string `json:"type"`
	Message string `json:"message,omitempty"`
}

func NewClient(haURL, restURL, haToken string) *Client {
	return &Client{
		url:        haURL,
		restURL:    restURL,
		token:      haToken,
		httpClient: &http.Client{},
	}
}

func (c *Client) Connect() error {
	// 1. Verbinding openen
	connection, _, err := websocket.DefaultDialer.Dial(c.url, nil)
	if err != nil {
		return err
	}
	c.connection = connection

	// 2. Verwacht 'auth_required'
	var msg BaseMessage
	if err := c.connection.ReadJSON(&msg); err != nil {
		return err
	}
	if msg.Type != "auth_required" {
		return fmt.Errorf("onverwacht eerste bericht van HA: %s", msg.Type)
	}

	// 3. Stuur authenticatie token
	authMsg := AuthMessage{
		Type:        "auth",
		AccessToken: c.token,
	}
	if err := c.connection.WriteJSON(authMsg); err != nil {
		return err
	}

	// 4. Controleer of inloggen gelukt is ('auth_ok')
	if err := c.connection.ReadJSON(&msg); err != nil {
		return err
	}

	if msg.Type != "auth_ok" {
		return fmt.Errorf("authenticatie mislukt bij Home Assistant: %s", msg.Message)
	}

	log.Println("[HA] Inloggen gelukt (auth_ok ontvangen)")

	if err := c.connection.WriteJSON(SubscribeMessage{
		ID:        1,
		Type:      "subscribe_events",
		EventType: "state_changed",
	}); err != nil {
		return err
	}

	return nil
}

// ReadEvent blocks until the next message arrives on the websocket and
// parses it. ok reports whether the message was a relevant state_changed
// event — non-event messages (e.g. the subscribe_events confirmation)
// return ok=false with no error.
func (c *Client) ReadEvent() (event HAEvent, ok bool, err error) {
	var raw rawMessage
	if err := c.connection.ReadJSON(&raw); err != nil {
		return HAEvent{}, false, err
	}
	event, ok = parseStateChanged(raw)
	return event, ok, nil
}

func (c *Client) Disconnect(quiesce uint) {
	if c.connection != nil {
		c.connection.Close()
	}
}

package homeassistant

import (
	"fmt"
	"log"

	"github.com/gorilla/websocket"
)

type Client struct {
	url        string
	token      string
	connection *websocket.Conn
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

func NewClient(haURL, haToken string) *Client {
	return &Client{
		url:   haURL,
		token: haToken,
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

func (c *Client) Auth() error {
	msg := AuthMessage{
		Type:        "auth",
		AccessToken: c.token,
	}
	if err := c.connection.WriteJSON(msg); err != nil {
		return err
	}
	return nil
}

func (c *Client) Subscribe() error {
	msg := SubscribeMessage{
		ID:        1,
		Type:      "subscribe",
		EventType: "",
	}
	if err := c.connection.WriteJSON(msg); err != nil {
		return err
	}
	return nil
}

func (c *Client) ReadEvent() (map[string]interface{}, error) {
	var event map[string]interface{}
	err := c.connection.ReadJSON(&event)
	return event, err
}

func (c *Client) Disconnect(quiesce uint) {
	if c.connection != nil {
		c.connection.Close()
	}
}

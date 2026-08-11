package mqtt

import (
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	brokerURL  string
	username   string
	password   string
	clientID   string
	mqttClient mqtt.Client
}

func NewClient(brokerURL, username, password, clientID string) *Client {
	if brokerURL == "" {
		brokerURL = "tcp://localhost:1883"
	} else {
		// Ensure schema is present
		if !strings.Contains(brokerURL, "://") {
			brokerURL = "tcp://" + brokerURL
		}
		// Ensure port is present (check the part after the schema)
		parts := strings.SplitN(brokerURL, "://", 2)
		if len(parts) == 2 && !strings.Contains(parts[1], ":") {
			brokerURL = brokerURL + ":1883"
		}
	}

	return &Client{
		brokerURL: brokerURL,
		username:  username,
		password:  password,
		clientID:  clientID,
	}
}

func (c *Client) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(c.brokerURL)
	opts.SetUsername(c.username)
	opts.SetPassword(c.password)
	opts.SetClientID(c.clientID)

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	c.mqttClient = client
	return nil
}

func (c *Client) Subscribe(topic string, handler MessageHandler) error {
	pahoCallback := func(client mqtt.Client, msg mqtt.Message) {
		handler(msg.Topic(), msg.Payload())
	}

	token := c.mqttClient.Subscribe(topic, 0, pahoCallback)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

func (c *Client) Disconnect(quiesce uint) {
	if c.mqttClient != nil {
		c.mqttClient.Disconnect(quiesce)
	}
}

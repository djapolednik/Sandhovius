package mqtt

import (
	"log"
	"strings"
	"sync"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	brokerURL  string
	username   string
	password   string
	clientID   string
	mqttClient mqtt.Client

	// subscriptions remembers every topic Subscribe() was asked for, so
	// they can be re-issued on every (re)connect. Paho's default session
	// (CleanSession=true) forgets subscriptions on disconnect — without
	// this, the client silently stops receiving messages after a broker
	// restart while looking perfectly healthy otherwise.
	mu            sync.Mutex
	subscriptions map[string]MessageHandler
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
		brokerURL:     brokerURL,
		username:      username,
		password:      password,
		clientID:      clientID,
		subscriptions: make(map[string]MessageHandler),
	}
}

func (c *Client) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(c.brokerURL)
	opts.SetUsername(c.username)
	opts.SetPassword(c.password)
	opts.SetClientID(c.clientID)
	opts.SetAutoReconnect(true)
	opts.OnConnect = func(client mqtt.Client) {
		c.resubscribeAll(client)
	}
	opts.OnConnectionLost = func(_ mqtt.Client, err error) {
		log.Printf("[MQTT] Verbinding verbroken: %v — paho herverbindt automatisch\n", err)
	}

	client := mqtt.NewClient(opts)
	token := client.Connect()
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}

	c.mqttClient = client
	return nil
}

func (c *Client) Subscribe(topic string, handler MessageHandler) error {
	c.mu.Lock()
	c.subscriptions[topic] = handler
	c.mu.Unlock()

	return c.subscribeNow(c.mqttClient, topic, handler)
}

func (c *Client) subscribeNow(client mqtt.Client, topic string, handler MessageHandler) error {
	pahoCallback := func(client mqtt.Client, msg mqtt.Message) {
		handler(msg.Topic(), msg.Payload())
	}

	token := client.Subscribe(topic, 0, pahoCallback)
	if token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

// resubscribeAll re-issues every known subscription. Called on every
// OnConnect, including the very first connect (when subscriptions is still
// empty, so it's a no-op then) and every automatic reconnect afterwards.
func (c *Client) resubscribeAll(client mqtt.Client) {
	c.mu.Lock()
	subs := make(map[string]MessageHandler, len(c.subscriptions))
	for topic, handler := range c.subscriptions {
		subs[topic] = handler
	}
	c.mu.Unlock()

	for topic, handler := range subs {
		if err := c.subscribeNow(client, topic, handler); err != nil {
			log.Printf("[MQTT] Kon topic %s niet opnieuw abonneren: %v\n", topic, err)
		}
	}
}

func (c *Client) Disconnect(quiesce uint) {
	if c.mqttClient != nil {
		c.mqttClient.Disconnect(quiesce)
	}
}

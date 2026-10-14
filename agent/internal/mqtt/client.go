package mqtt

import (
	"encoding/json"
	"errors"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type MessageHandler func(topic string, payload []byte)

type Client struct {
	brokerURL  string
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

// NewClient verwacht een volledige broker-URL, bv. "tcp://mosquitto:1883".
func NewClient(brokerURL, clientID string) *Client {
	return &Client{
		brokerURL:     brokerURL,
		clientID:      clientID,
		subscriptions: make(map[string]MessageHandler),
	}
}

func (c *Client) Connect() error {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(c.brokerURL)
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

// Publish stuurt een bericht (QoS 1, niet retained); payload wordt JSON,
// behalve []byte.
func (c *Client) Publish(topic string, payload any) error {
	if c == nil || c.mqttClient == nil {
		return errors.New("mqtt: niet verbonden")
	}
	raw, ok := payload.([]byte)
	if !ok {
		var err error
		if raw, err = json.Marshal(payload); err != nil {
			return err
		}
	}
	token := c.mqttClient.Publish(topic, 1, false, raw)
	if !token.WaitTimeout(5 * time.Second) {
		return errors.New("mqtt: publish duurde te lang")
	}
	return token.Error()
}

func (c *Client) Disconnect(quiesce uint) {
	if c.mqttClient != nil {
		c.mqttClient.Disconnect(quiesce)
	}
}

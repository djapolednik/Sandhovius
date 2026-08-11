package app

import (
	"log"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
)

type Agent struct {
	mqttClient *mqtt.Client
	haClient   *homeassistant.Client
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client) *Agent {
	return &Agent{
		mqttClient: mqttClient,
		haClient:   haClient,
	}
}

func (a *Agent) Start() error {
	if err := a.mqttClient.Connect(); err != nil {
		return err
	}

	topics := []string{"sandhovius/#", "zigbee2mqtt/#"}

	for _, topic := range topics {
		err := a.mqttClient.Subscribe(topic, a.handleMQTTMessage)
		if err != nil {
			return err
		}
	}

	log.Println("[APP] Geabonneerd op MQTT topics")

	if err := a.haClient.Connect(); err != nil {
		return err
	} else {
		go a.listenToHAEvents()
	}

	return nil
}

func (a *Agent) handleMQTTMessage(topic string, payload []byte) {
	log.Printf("[APP] MQTT Event op [%s]: %s\n", topic, string(payload))
}

func (a *Agent) listenToHAEvents() {
	for {
		event, err := a.haClient.ReadEvent()
		if err != nil {
			log.Printf("[APP] HA Event error: %v\n", err)
			continue
		}
		log.Printf("[APP] HA Event ontvangen: %v\n", event)
	}
}

func (a *Agent) Stop() {
	log.Println("[APP] Agent stopt, netwerkverbindingen sluiten...")
	if a.mqttClient != nil {
		a.mqttClient.Disconnect(250)
	}
	if a.haClient != nil {
		a.haClient.Disconnect(250)
	}
}

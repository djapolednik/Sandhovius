package app

import (
	"log"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type Agent struct {
	mqttClient *mqtt.Client
	haClient   *homeassistant.Client
	pbClient   *pocketbase.Client
	devices    *deviceCache
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client, pbClient *pocketbase.Client) *Agent {
	return &Agent{
		mqttClient: mqttClient,
		haClient:   haClient,
		pbClient:   pbClient,
		devices:    newDeviceCache(pbClient),
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

	if err := a.devices.refresh(); err != nil {
		log.Printf("[APP] Kon device-cache niet opwarmen: %v\n", err)
	}

	if err := a.haClient.Connect(); err != nil {
		return err
	} else {
		go a.listenToHAEvents()
	}

	return nil
}

func (a *Agent) handleMQTTMessage(topic string, payload []byte) {
	event, ok := mqtt.ParseZigbeeEvent(topic, payload)
	if !ok {
		return // geen device-state (bv. zigbee2mqtt/bridge/state, of een sandhovius/* bericht)
	}
	a.forwardZigbeeEvent(event)
}

// forwardZigbeeEvent vertaalt een Zigbee2MQTT state-update naar een
// PocketBase device_state upsert. Zelfde patroon als forwardHAEvent:
// onbekende friendly_names worden gelogd en overgeslagen.
func (a *Agent) forwardZigbeeEvent(event mqtt.ZigbeeEvent) {
	deviceID, found, err := a.devices.lookup(event.FriendlyName)
	if err != nil {
		log.Printf("[APP] Device-lookup mislukt voor %s: %v\n", event.FriendlyName, err)
		return
	}
	if !found {
		log.Printf("[APP] Onbekend device, genegeerd: %s\n", event.FriendlyName)
		return
	}

	if err := a.pbClient.UpsertDeviceState(deviceID, event.State); err != nil {
		log.Printf("[APP] PocketBase update mislukt voor %s: %v\n", event.FriendlyName, err)
		return
	}

	log.Printf("[APP] PocketBase bijgewerkt (zigbee): %s -> %v\n", event.FriendlyName, event.State)
}

func (a *Agent) listenToHAEvents() {
	for {
		event, ok, err := a.haClient.ReadEvent()
		if err != nil {
			log.Printf("[APP] HA Event error: %v\n", err)
			continue
		}
		if !ok {
			continue // niet-relevant bericht (bv. subscribe-bevestiging)
		}
		a.forwardHAEvent(event)
	}
}

// forwardHAEvent vertaalt een HA state_changed event naar een PocketBase
// device_state upsert. Onbekende entity_ids (nog niet geregistreerd als
// device in PocketBase) worden gelogd en overgeslagen, niet als fout
// behandeld.
func (a *Agent) forwardHAEvent(event homeassistant.HAEvent) {
	deviceID, found, err := a.devices.lookup(event.EntityID)
	if err != nil {
		log.Printf("[APP] Device-lookup mislukt voor %s: %v\n", event.EntityID, err)
		return
	}
	if !found {
		log.Printf("[APP] Onbekend device, genegeerd: %s\n", event.EntityID)
		return
	}

	state := map[string]any{
		"state":      event.State,
		"attributes": event.Attributes,
	}

	if err := a.pbClient.UpsertDeviceState(deviceID, state); err != nil {
		log.Printf("[APP] PocketBase update mislukt voor %s: %v\n", event.EntityID, err)
		return
	}

	log.Printf("[APP] PocketBase bijgewerkt: %s -> %s\n", event.EntityID, event.State)
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

package app

import (
	"log"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type Agent struct {
	mqttClient  *mqtt.Client
	haClient    *homeassistant.Client
	pbClient    *pocketbase.Client
	devices     *deviceCache
	gatewayName string
	gatewayID   string
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client, pbClient *pocketbase.Client, gatewayName string) *Agent {
	return &Agent{
		mqttClient:  mqttClient,
		haClient:    haClient,
		pbClient:    pbClient,
		devices:     newDeviceCache(pbClient),
		gatewayName: gatewayName,
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

	if err := a.registerGateway(); err != nil {
		return err
	}

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

// registerGateway zoekt het gateways-record voor deze agent op naam op, en
// maakt het aan als het nog niet bestaat (zelfregistratie — geen
// handmatige provisioning-stap nodig). Zet de status meteen op "online".
func (a *Agent) registerGateway() error {
	gateway, err := a.pbClient.FindGatewayByName(a.gatewayName)
	if err != nil {
		return err
	}

	if gateway == nil {
		gateway, err = a.pbClient.CreateGateway(a.gatewayName)
		if err != nil {
			return err
		}
		log.Printf("[APP] Nieuwe gateway geregistreerd: %s (%s)\n", a.gatewayName, gateway.ID)
	} else {
		log.Printf("[APP] Bestaande gateway herkend: %s (%s)\n", a.gatewayName, gateway.ID)
	}

	a.gatewayID = gateway.ID
	return a.pbClient.SetGatewayStatus(a.gatewayID, "online")
}

func (a *Agent) handleMQTTMessage(topic string, payload []byte) {
	if avail, ok := mqtt.ParseZigbeeAvailability(topic, payload); ok {
		a.forwardZigbeeAvailability(avail)
		return
	}
	if event, ok := mqtt.ParseZigbeeEvent(topic, payload); ok {
		a.forwardZigbeeEvent(event)
		return
	}
	// geen device-state (bv. zigbee2mqtt/bridge/state, of een sandhovius/* bericht)
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

	// Een device dat state stuurt is aantoonbaar online. Echt offline gaan
	// gebeurt alleen via een expliciet availability-bericht, zie
	// forwardZigbeeAvailability.
	if err := a.pbClient.SetDeviceOnline(deviceID, true); err != nil {
		log.Printf("[APP] Kon online-status niet bijwerken voor %s: %v\n", event.FriendlyName, err)
	}
}

// forwardZigbeeAvailability verwerkt een expliciet Zigbee2MQTT
// online/offline-signaal (zigbee2mqtt/<naam>/availability).
func (a *Agent) forwardZigbeeAvailability(avail mqtt.ZigbeeAvailability) {
	deviceID, found, err := a.devices.lookup(avail.FriendlyName)
	if err != nil {
		log.Printf("[APP] Device-lookup mislukt voor %s: %v\n", avail.FriendlyName, err)
		return
	}
	if !found {
		log.Printf("[APP] Onbekend device, genegeerd: %s\n", avail.FriendlyName)
		return
	}

	if err := a.pbClient.SetDeviceOnline(deviceID, avail.Online); err != nil {
		log.Printf("[APP] Kon online-status niet bijwerken voor %s: %v\n", avail.FriendlyName, err)
		return
	}
	log.Printf("[APP] Online-status bijgewerkt: %s -> online=%v\n", avail.FriendlyName, avail.Online)
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

	// HA's expliciete offline-signaal is de state "unavailable". Elke
	// andere state betekent: we horen net iets van dit device, dus online.
	online := event.State != "unavailable"
	if err := a.pbClient.SetDeviceOnline(deviceID, online); err != nil {
		log.Printf("[APP] Kon online-status niet bijwerken voor %s: %v\n", event.EntityID, err)
	}
}

func (a *Agent) Stop() {
	log.Println("[APP] Agent stopt, netwerkverbindingen sluiten...")

	if a.gatewayID != "" {
		if err := a.pbClient.SetGatewayStatus(a.gatewayID, "offline"); err != nil {
			log.Printf("[APP] Kon gateway-status niet op offline zetten: %v\n", err)
		}
	}

	if a.mqttClient != nil {
		a.mqttClient.Disconnect(250)
	}
	if a.haClient != nil {
		a.haClient.Disconnect(250)
	}
}

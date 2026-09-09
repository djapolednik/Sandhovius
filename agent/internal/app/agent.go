package app

import (
	"context"
	"fmt"
	"log"
	"time"

	"sandhovius/local-agent/internal/history"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type Agent struct {
	mqttClient  *mqtt.Client
	haClient    *homeassistant.Client
	pbClient    *pocketbase.Client
	history     *history.Store
	devices     *deviceCache
	gatewayName string
	gatewayID   string

	historyRetention time.Duration

	ctx    context.Context
	cancel context.CancelFunc
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client, pbClient *pocketbase.Client, historyStore *history.Store, gatewayName string, historyRetentionDays int) *Agent {
	ctx, cancel := context.WithCancel(context.Background())
	return &Agent{
		mqttClient:       mqttClient,
		haClient:         haClient,
		pbClient:         pbClient,
		history:          historyStore,
		devices:          newDeviceCache(pbClient),
		gatewayName:      gatewayName,
		historyRetention: time.Duration(historyRetentionDays) * 24 * time.Hour,
		ctx:              ctx,
		cancel:           cancel,
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

	go a.runHistoryCleanup()

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

	a.catchUpPendingCommands()
	go a.listenForCommands()

	return nil
}

// catchUpPendingCommands verwerkt commando's die al "pending" waren vóórdat
// de agent (opnieuw) opstartte. De realtime-subscribe hieronder levert
// alleen wijzigingen vanaf het moment van verbinden — geen geschiedenis —
// dus zonder deze stap zou zo'n commando nooit uitgevoerd worden.
func (a *Agent) catchUpPendingCommands() {
	pending, err := a.pbClient.ListPendingCommands()
	if err != nil {
		log.Printf("[APP] Kon openstaande commando's niet ophalen: %v\n", err)
		return
	}
	for _, cmd := range pending {
		log.Printf("[APP] Openstaand commando gevonden bij opstarten: %s\n", cmd.ID)
		a.handleCommand(cmd)
	}
}

// listenForCommands abonneert zich op de PocketBase "commands"-collectie
// via realtime (SSE) en blijft herverbinden totdat de agent stopt.
func (a *Agent) listenForCommands() {
	for {
		err := a.pbClient.SubscribeCommands(a.ctx, a.handleCommandEvent)
		if a.ctx.Err() != nil {
			return // Stop() is aangeroepen
		}
		log.Printf("[APP] Command-stream verbroken: %v — probeer over 5s opnieuw\n", err)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func (a *Agent) handleCommandEvent(event pocketbase.CommandEvent) {
	if event.EventType != "create" {
		return // alleen nieuwe commando's oppakken, niet onze eigen status-updates erop
	}
	a.handleCommand(event.Record)
}

// handleCommand voert één commando uit via Home Assistant's domein-
// agnostische homeassistant.<action> services (turn_on/turn_off/toggle),
// die werken voor licht, switches, climate, input_boolean, etc. zonder dat
// de agent het specifieke domein van het device hoeft te kennen.
func (a *Agent) handleCommand(cmd pocketbase.Command) {
	if cmd.Status != "pending" {
		return
	}

	device, err := a.pbClient.GetDevice(cmd.Device)
	if err != nil {
		log.Printf("[APP] Commando %s mislukt: kon device niet ophalen: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}
	if device.EntityID == "" {
		err := fmt.Errorf("device %s heeft geen entity_id", device.ID)
		log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	if err := a.haClient.CallService("homeassistant", cmd.Action, device.EntityID, cmd.Payload); err != nil {
		log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	if err := a.pbClient.MarkCommandSent(cmd.ID); err != nil {
		log.Printf("[APP] Kon commando %s niet als 'sent' markeren: %v\n", cmd.ID, err)
		return
	}
	log.Printf("[APP] Commando uitgevoerd: %s %s (commando %s)\n", cmd.Action, device.EntityID, cmd.ID)
}

func (a *Agent) failCommand(commandID string, reason error) {
	if err := a.pbClient.MarkCommandFailed(commandID, reason); err != nil {
		log.Printf("[APP] Kon commando %s niet als 'failed' markeren: %v\n", commandID, err)
	}
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

// runHistoryCleanup verwijdert periodiek geschiedenis ouder dan de
// geconfigureerde retentieperiode, zodat de lokale SQLite-database niet
// onbeperkt blijft groeien.
func (a *Agent) runHistoryCleanup() {
	a.pruneHistory()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		a.pruneHistory()
	}
}

func (a *Agent) pruneHistory() {
	deleted, err := a.history.Prune(a.historyRetention)
	if err != nil {
		log.Printf("[APP] Opruimen lokale geschiedenis mislukt: %v\n", err)
		return
	}
	if deleted > 0 {
		log.Printf("[APP] Lokale geschiedenis opgeruimd: %d oude rijen verwijderd\n", deleted)
	}
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

// forwardZigbeeEvent slaat een Zigbee2MQTT state-update lokaal op en
// vertaalt 'm naar een PocketBase device_state upsert. De lokale write
// gebeurt eerst en altijd — ook voor devices die (nog) niet in PocketBase
// staan, en ongeacht of PocketBase zelf bereikbaar is.
func (a *Agent) forwardZigbeeEvent(event mqtt.ZigbeeEvent) {
	if err := a.history.Record(event.FriendlyName, event.State); err != nil {
		log.Printf("[APP] Lokale geschiedenis schrijven mislukt voor %s: %v\n", event.FriendlyName, err)
	}

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

// forwardHAEvent slaat een HA state_changed event lokaal op en vertaalt
// 'm naar een PocketBase device_state upsert. De lokale write gebeurt
// eerst en altijd — ook voor entities die (nog) niet als device in
// PocketBase staan, en ongeacht of PocketBase zelf bereikbaar is.
// Onbekende entity_ids worden voor de PocketBase-kant gelogd en
// overgeslagen, niet als fout behandeld.
func (a *Agent) forwardHAEvent(event homeassistant.HAEvent) {
	state := map[string]any{
		"state":      event.State,
		"attributes": event.Attributes,
	}

	if err := a.history.Record(event.EntityID, state); err != nil {
		log.Printf("[APP] Lokale geschiedenis schrijven mislukt voor %s: %v\n", event.EntityID, err)
	}

	deviceID, found, err := a.devices.lookup(event.EntityID)
	if err != nil {
		log.Printf("[APP] Device-lookup mislukt voor %s: %v\n", event.EntityID, err)
		return
	}
	if !found {
		log.Printf("[APP] Onbekend device, genegeerd: %s\n", event.EntityID)
		return
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

	a.cancel()

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
	if a.history != nil {
		if err := a.history.Close(); err != nil {
			log.Printf("[APP] Kon lokale geschiedenis niet netjes sluiten: %v\n", err)
		}
	}
}

package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"sandhovius/local-agent/internal/history"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type Agent struct {
	mqttClient    *mqtt.Client
	haClient      *homeassistant.Client
	pbClient      *pocketbase.Client
	history       *history.Store
	devices       *deviceCache
	gatewayName   string
	gatewayIDFile string
	gatewayID     string

	historyRetention time.Duration

	// deviceNames is a snapshot of each device's last-known PocketBase name,
	// keyed by device id. Used to tell a genuine rename apart from any other
	// field update (e.g. the agent's own online/offline flips) on the
	// "devices" collection — see handleDeviceEvent.
	deviceNamesMu sync.Mutex
	deviceNames   map[string]string

	ctx    context.Context
	cancel context.CancelFunc
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client, pbClient *pocketbase.Client, historyStore *history.Store, gatewayName, gatewayIDFile string, historyRetentionDays int) *Agent {
	ctx, cancel := context.WithCancel(context.Background())
	return &Agent{
		mqttClient:       mqttClient,
		haClient:         haClient,
		pbClient:         pbClient,
		history:          historyStore,
		devices:          newDeviceCache(pbClient),
		gatewayName:      gatewayName,
		gatewayIDFile:    gatewayIDFile,
		deviceNames:      make(map[string]string),
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

	devices, err := a.devices.refresh()
	if err != nil {
		log.Printf("[APP] Kon device-cache niet opwarmen: %v\n", err)
	}
	a.warmDeviceNames(devices)

	if err := a.haClient.Connect(); err != nil {
		return err
	} else {
		go a.listenToHAEvents()
	}
	// Wat er veranderde terwijl de agent niet draaide, zit niet in de
	// event-stroom: één keer de actuele stand van elk device ophalen.
	a.reconcileDeviceStates()

	a.catchUpPendingCommands()
	go a.listenForCommands()
	go a.listenForDeviceChanges()
	go a.runHeartbeat()
	go a.runScheduler()
	go a.runWeather()

	return nil
}

// warmDeviceNames snapshots every device's current name before the
// realtime listener starts, so handleDeviceEvent has a baseline to diff
// against and doesn't mistake "first time we see this device" for a
// rename.
func (a *Agent) warmDeviceNames(devices []pocketbase.Device) {
	a.deviceNamesMu.Lock()
	for _, device := range devices {
		a.deviceNames[device.ID] = device.Name
	}
	a.deviceNamesMu.Unlock()
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
	now := time.Now()
	for _, cmd := range pending {
		if commandExpired(cmd, now) {
			log.Printf("[APP] Openstaand commando %s is verlopen (aangemaakt %q)\n", cmd.ID, cmd.Created)
			a.failCommand(cmd.ID, errors.New("verlopen: de box was te lang niet bereikbaar"))
			continue
		}
		log.Printf("[APP] Openstaand commando gevonden: %s\n", cmd.ID)
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

// listenForDeviceChanges abonneert zich op de PocketBase "devices"-
// collectie via realtime (SSE), om een naamswijziging vanuit de
// Sandhovius-omgeving door te zetten naar Home Assistant. Blijft
// herverbinden totdat de agent stopt.
func (a *Agent) listenForDeviceChanges() {
	for {
		err := a.pbClient.SubscribeDevices(a.ctx, a.handleDeviceEvent)
		if a.ctx.Err() != nil {
			return // Stop() is aangeroepen
		}
		log.Printf("[APP] Device-stream verbroken: %v — probeer over 5s opnieuw\n", err)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

// handleDeviceEvent zet een naamswijziging van een device door naar Home
// Assistant's entity registry, zodat de naam overal — Sandhovius,
// PocketBase, HA — gelijk blijft. Het gaat om echte hernoemingen: elke
// andere update (bv. de agent die zelf online/offline bijwerkt) verandert
// de naam niet, en wordt hier genegeerd door tegen de laatst bekende naam
// te vergelijken.
func (a *Agent) handleDeviceEvent(event pocketbase.DeviceEvent) {
	device := event.Record

	if event.EventType == "create" && device.EntityID == "" {
		if err := a.provisionDeviceEntity(device); err != nil {
			log.Printf("[APP] Kon device %s niet klaarzetten: %v\n", device.ID, err)
		}
		return
	}

	a.deviceNamesMu.Lock()
	previousName, seen := a.deviceNames[device.ID]
	a.deviceNames[device.ID] = device.Name
	a.deviceNamesMu.Unlock()

	if event.EventType != "update" || !seen || previousName == device.Name {
		return
	}
	if device.EntityID == "" {
		return
	}

	if err := a.haClient.RenameEntity(device.EntityID, device.Name); err != nil {
		log.Printf("[APP] Kon HA-naam voor %s niet bijwerken: %v\n", device.EntityID, err)
		return
	}
	log.Printf("[APP] HA-naam bijgewerkt: %s -> %q\n", device.EntityID, device.Name)
}

// provisionDeviceEntity maakt automatisch een passende Home Assistant
// helper-entity aan voor een device dat vanuit de Sandhovius-UI is
// toegevoegd zonder zelf een entity_id op te geven — niemand hoeft dus
// zelf iets in Home Assistant te configureren.
//
// light/switch/climate krijgen een input_boolean (aan/uit-relais). Voor
// climate is dat een simpele schakelaar, geen volledige thermostaat met
// eigen meetwaarden — dat vraagt om een generic_thermostat-platform met
// een gekoppelde sensor (zie configuration.yaml), wat hier niet
// automatisch wordt opgezet. sensor krijgt een input_number.
func (a *Agent) provisionDeviceEntity(device pocketbase.Device) error {
	var entityID string
	var err error

	if device.Type == "sensor" {
		entityID, err = a.haClient.CreateInputNumber(device.Name)
	} else {
		entityID, err = a.haClient.CreateInputBoolean(device.Name)
	}
	if err != nil {
		return fmt.Errorf("HA-entity aanmaken: %w", err)
	}

	if err := a.pbClient.SetDeviceEntityID(device.ID, entityID); err != nil {
		return fmt.Errorf("entity_id opslaan: %w", err)
	}

	a.deviceNamesMu.Lock()
	a.deviceNames[device.ID] = device.Name
	a.deviceNamesMu.Unlock()

	// Zorgt dat de nieuwe entity_id meteen in de lookup-cache zit, i.p.v.
	// te wachten op de eerstvolgende lookup-miss-refresh.
	if _, err := a.devices.refresh(); err != nil {
		log.Printf("[APP] Kon device-cache niet verversen na provisioning: %v\n", err)
	}

	log.Printf("[APP] HA-entity aangemaakt voor device %s: %s\n", device.ID, entityID)

	// HA meldt de eerste stand van een nieuwe helper al tijdens het
	// aanmaken — vóórdat hierboven de entity_id is opgeslagen. Dat event is
	// dus als "onbekend device" genegeerd, en er komt pas een volgende als
	// de stand verandert: het device zou op "offline" blijven hangen.
	// Daarom de stand nu zelf ophalen.
	a.syncEntityState(entityID)
	return nil
}

// syncEntityState haalt de actuele stand van één entity op bij Home
// Assistant en verwerkt die als een gewoon state_changed event (lokale
// geschiedenis, device_state, online-status).
func (a *Agent) syncEntityState(entityID string) {
	event, err := a.haClient.GetState(entityID)
	if err != nil {
		log.Printf("[APP] Kon actuele stand niet ophalen voor %s: %v\n", entityID, err)
		return
	}
	a.forwardHAEvent(event)
}

// reconcileDeviceStates brengt elk bekend device in lijn met Home
// Assistant: bij het opstarten en na een herverbinding, want wat er in
// de tussentijd veranderde zit niet in de event-stroom.
func (a *Agent) reconcileDeviceStates() {
	ids := a.devices.entityIDs()
	for _, entityID := range ids {
		a.syncEntityState(entityID)
	}
	log.Printf("[APP] Stand van %d devices afgestemd met Home Assistant\n", len(ids))
}

// handleCommand voert één commando uit via Home Assistant's domein-
// agnostische homeassistant.<action> services (turn_on/turn_off/toggle),
// die werken voor licht, switches, climate, input_boolean, etc. zonder dat
// de agent het specifieke domein van het device hoeft te kennen. set_temperature
// is de uitzondering — die bestaat alleen binnen het climate-domein.
func (a *Agent) handleCommand(cmd pocketbase.Command) {
	if cmd.Status != "pending" {
		return
	}

	if cmd.Action == "run_scene" {
		a.runScene(cmd)
		return
	}

	device, err := a.pbClient.GetDevice(cmd.Device)
	if err != nil {
		log.Printf("[APP] Commando %s mislukt: kon device niet ophalen: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}
	// "provision": opnieuw klaarzetten na een mislukte eerste keer (knop
	// "Opnieuw proberen" in de app). Heeft het device inmiddels al een
	// entity_id, dan is er niets meer te doen.
	if cmd.Action == "provision" {
		if device.EntityID == "" {
			if err := a.provisionDeviceEntity(*device); err != nil {
				log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
				a.failCommand(cmd.ID, err)
				return
			}
		}
		if err := a.pbClient.MarkCommandSent(cmd.ID); err != nil {
			log.Printf("[APP] Kon commando %s niet als 'sent' markeren: %v\n", cmd.ID, err)
			return
		}
		log.Printf("[APP] Device %s opnieuw klaargezet (commando %s)\n", device.ID, cmd.ID)
		return
	}

	if device.EntityID == "" {
		err := fmt.Errorf("device %s heeft geen entity_id", device.ID)
		log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	// set_temperature bestaat niet als domein-agnostische "homeassistant"-
	// service — dat moet naar climate.set_temperature, specifiek voor
	// climate-entities.
	domain := "homeassistant"
	if cmd.Action == "set_temperature" {
		domain = "climate"
	}

	if err := a.haClient.CallService(domain, cmd.Action, device.EntityID, cmd.Payload); err != nil {
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

// sceneActions zijn de enige stappen die een scène mag bevatten: dezelfde
// als losse commando's, zonder toggle (een scène zet een stand, hij draait
// hem niet om).
var sceneActions = map[string]bool{"turn_on": true, "turn_off": true, "set_temperature": true}

// runScene voert een scène uit op verzoek van de app (command "run_scene"):
// één commando, en het maakt niet uit als de telefoon daarna wegvalt.
//
// Alleen scènes van dit huis, en alleen apparaten van dit huis: ook als
// er ooit iets verkeerds in de JSON staat, schakelt deze box nooit
// andermans apparaat.
func (a *Agent) runScene(cmd pocketbase.Command) {
	scene, err := a.pbClient.GetScene(cmd.Scene)
	if err != nil {
		log.Printf("[APP] Scène-commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}
	if scene.House != a.gatewayID {
		err := fmt.Errorf("scène %s hoort niet bij dit huis", scene.ID)
		log.Printf("[APP] Scène-commando %s geweigerd: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	if err := a.executeScene(*scene, a.pbClient.GetDevice); err != nil {
		a.failCommand(cmd.ID, err)
		return
	}
	if err := a.pbClient.MarkCommandSent(cmd.ID); err != nil {
		log.Printf("[APP] Kon scène-commando %s niet als 'sent' markeren: %v\n", cmd.ID, err)
		return
	}
	log.Printf("[APP] Scène %q uitgevoerd: %d stappen (commando %s)\n", scene.Name, len(scene.Actions), cmd.ID)
}

// executeScene voert alle stappen van een scène uit, op de box. Een stap
// die mislukt houdt de rest niet tegen; de fout noemt welke stappen
// misgingen. lookup zoekt een device op: via PocketBase (knop in de app)
// of in de snapshot (schema), zodat een schema ook zonder internet werkt.
func (a *Agent) executeScene(scene pocketbase.Scene, lookup func(id string) (*pocketbase.Device, error)) error {
	var failures []error
	for _, step := range scene.Actions {
		if err := a.runSceneStep(scene.House, step, lookup); err != nil {
			log.Printf("[APP] Scène %q: stap %s op %s mislukt: %v\n", scene.Name, step.Action, step.Device, err)
			failures = append(failures, fmt.Errorf("%s %s: %w", step.Action, step.Device, err))
		}
	}
	return errors.Join(failures...)
}

func (a *Agent) runSceneStep(house string, step pocketbase.SceneAction, lookup func(id string) (*pocketbase.Device, error)) error {
	if !sceneActions[step.Action] {
		return fmt.Errorf("actie %q hoort niet in een scène", step.Action)
	}
	device, err := lookup(step.Device)
	if err != nil {
		return err
	}
	if device.Gateway != house {
		return fmt.Errorf("apparaat hoort niet bij dit huis")
	}
	if device.EntityID == "" {
		return fmt.Errorf("apparaat is (nog) niet klaargezet")
	}
	domain := "homeassistant"
	if step.Action == "set_temperature" {
		domain = "climate"
	}
	return a.haClient.CallService(domain, step.Action, device.EntityID, step.Payload)
}

func (a *Agent) failCommand(commandID string, reason error) {
	if err := a.pbClient.MarkCommandFailed(commandID, reason); err != nil {
		log.Printf("[APP] Kon commando %s niet als 'failed' markeren: %v\n", commandID, err)
	}
}

// registerGateway koppelt deze agent aan zijn houses-record en zet de
// status op "online". De box herkent zijn record aan het ID dat hij bij de
// eerste registratie lokaal opslaat (gatewayIDFile), niet aan de naam: de
// bewoner kan het huis in de app hernoemen zonder dat de box zijn huis
// kwijtraakt. Volgorde:
//  1. ID-bestand aanwezig en het record bestaat → dat record.
//  2. Geen ID-bestand → eenmalige migratie van de oude werkwijze: zoek op
//     GATEWAY_NAME, en sla het gevonden ID op.
//  3. Anders (niets gevonden, of het opgeslagen record is verwijderd) →
//     nieuw record aanmaken en het ID opslaan.
//
// Een PocketBase-fout breekt de registratie af i.p.v. een nieuw record aan
// te maken: "even onbereikbaar" mag nooit een dubbel huis opleveren.
func (a *Agent) registerGateway() error {
	storedID, err := readGatewayID(a.gatewayIDFile)
	if err != nil {
		return err
	}

	var gateway *pocketbase.Gateway
	if storedID != "" {
		gateway, err = a.pbClient.GetGateway(storedID)
		if err != nil {
			return err
		}
		if gateway == nil {
			log.Printf("[APP] Opgeslagen gateway %s bestaat niet meer; er wordt een nieuwe aangemaakt\n", storedID)
		}
	} else {
		gateway, err = a.pbClient.FindGatewayByName(a.gatewayName)
		if err != nil {
			return err
		}
		if gateway != nil {
			log.Printf("[APP] Gateway op naam gevonden (eenmalige migratie): %s (%s)\n", gateway.Name, gateway.ID)
		}
	}

	if gateway == nil {
		gateway, err = a.pbClient.CreateGateway(a.gatewayName)
		if err != nil {
			return err
		}
		log.Printf("[APP] Nieuwe gateway geregistreerd: %s (%s)\n", gateway.Name, gateway.ID)
	} else {
		log.Printf("[APP] Gateway herkend: %s (%s)\n", gateway.Name, gateway.ID)
	}

	if gateway.ID != storedID {
		if err := writeGatewayID(a.gatewayIDFile, gateway.ID); err != nil {
			return err
		}
	}

	a.gatewayID = gateway.ID
	return a.pbClient.SetGatewayStatus(a.gatewayID, "online")
}

// readGatewayID leest het opgeslagen gateway-ID. Een ontbrekend bestand is
// geen fout (eerste start); een onleesbaar bestand wel.
func readGatewayID(path string) (string, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("gateway-ID lezen uit %s: %w", path, err)
	}
	return strings.TrimSpace(string(data)), nil
}

// writeGatewayID schrijft atomisch (tijdelijk bestand + rename), zodat een
// stroomstoring tijdens het schrijven nooit een half ID achterlaat.
func writeGatewayID(path, id string) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(id+"\n"), 0o644); err != nil {
		return fmt.Errorf("gateway-ID opslaan in %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("gateway-ID opslaan in %s: %w", path, err)
	}
	return nil
}

// heartbeatInterval is hoe vaak de agent laat weten dat de box leeft. De
// PWA noemt de box onbereikbaar na drie gemiste slagen (zie
// HEARTBEAT_STALE_MS in frontend/lib/connection.js) — pas die mee aan als
// je dit verandert.
const heartbeatInterval = 30 * time.Second

// runHeartbeat zet de gateway elke heartbeatInterval opnieuw op "online".
// PocketBase ververst last_seen bij elke update, ook als de waarde gelijk
// blijft, dus last_seen wordt zo een hartslag. Alleen een nette Stop()
// zet de status op "offline"; bij stroomuitval of een crash is het
// uitblijven van deze slag het enige signaal dat de PWA krijgt.
func (a *Agent) runHeartbeat() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			if err := a.pbClient.SetGatewayStatus(a.gatewayID, "online"); err != nil {
				log.Printf("[APP] Hartslag naar PocketBase mislukt: %v\n", err)
			}
		}
	}
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

// listenToHAEvents leest events van de HA websocket totdat de agent stopt.
// Bij een verbroken verbinding wordt herverbonden met exponentiële
// backoff (1s tot 30s) i.p.v. in een tight loop te blijven lezen van een
// dode socket — haClient.Connect() doet de volledige handshake opnieuw,
// inclusief de subscribe_events-aanvraag.
func (a *Agent) listenToHAEvents() {
	backoff := 1 * time.Second
	const maxBackoff = 30 * time.Second

	for {
		if a.ctx.Err() != nil {
			return
		}

		event, ok, err := a.haClient.ReadEvent()
		if err != nil {
			log.Printf("[APP] HA-verbinding verbroken: %v — herverbinden over %s\n", err, backoff)
			select {
			case <-a.ctx.Done():
				return
			case <-time.After(backoff):
			}

			if reconnectErr := a.haClient.Connect(); reconnectErr != nil {
				log.Printf("[APP] HA-herverbinden mislukt: %v\n", reconnectErr)
				backoff = min(backoff*2, maxBackoff)
				continue
			}
			log.Println("[APP] HA-verbinding hersteld")
			backoff = 1 * time.Second
			// Events van tijdens de onderbreking zijn weg: haal de actuele
			// stand op i.p.v. te wachten tot elk device weer verandert.
			a.reconcileDeviceStates()
			continue
		}
		backoff = 1 * time.Second

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

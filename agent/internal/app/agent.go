package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"sandhovius/local-agent/internal/box"
	"sandhovius/local-agent/internal/history"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type Agent struct {
	mqttClient *mqtt.Client
	haClient   *homeassistant.Client
	// Thuislocatie voor zon-schema's (home_location.go).
	locMu         sync.Mutex
	loc           *homeLocation
	locAt         time.Time
	pbClient      *pocketbase.Client
	history       *history.Store
	devices       *deviceCache
	boxFile       string // identiteitsbestand (serial, secret, house)
	schedulesFile string // schema-snapshot, zodat schema's zonder PocketBase lopen
	// motion: de bewegingslichten (motion_runner.go); nil in tests die hem
	// niet nodig hebben.
	motion *motionRunner
	// Kleur volgt de dag (adaptive_agent.go).
	adaptive *adaptiveRunner
	// zigbee: wat Zigbee2MQTT op het netwerk heeft (bridge/devices);
	// pairing: koppelen vanuit de app (pairing_runner.go).
	zigbee  *bridgeDirectory
	pairing *pairingRunner
	// helpersFlag: vlagbestand na het eenmalig opruimen van de helpers
	helpersFlag string

	// gatewayID is het houses-record waaraan deze box gekoppeld is (leeg: geen huis). Alleen via house() en
	// setHouse(): scheduler, hartslag en weer lezen het al terwijl de
	// verbindingslus het nog verifieert.
	houseMu   sync.RWMutex
	gatewayID string

	historyRetention time.Duration

	// deviceNames is a snapshot of each device's last-known PocketBase name,
	// keyed by device id. Used to tell a genuine rename apart from any other
	// field update (e.g. the agent's own online/offline flips) on the
	// "devices" collection — see handleDeviceEvent.
	deviceNamesMu sync.Mutex
	deviceNames   map[string]string

	// registered wordt true zodra de box bij PocketBase een huis heeft
	// gekregen; pas daarna mag een herverbinding de herstelstap starten, en
	// alleen dan schrijven hartslag, weer en Stop() naar het huis.
	registered atomic.Bool
	recoverMu  sync.Mutex

	// onConnected is de herstelstap na (her)koppeling aan een huis; tests
	// vervangen hem.
	onConnected func()

	// callService is de Home Assistant-aanroep van commando's en scène-stappen;
	// nil betekent haClient.CallService, tests zetten een nep.
	callService func(domain, service, entityID string, data map[string]any) error

	// handledCommands: commando-ID's die al opgepakt zijn (zie claimCommand).
	handledCommands sync.Map
	// stateClock: laatst doorgestuurde HA-stand per entity (zie state_clock.go).
	stateClock stateClock
	// applyHouseMu: één applyHouse tegelijk (zie house.go).
	applyHouseMu sync.Mutex
	// version: de agentversie, bij het bouwen ingebakken (SetVersion).
	version string

	ctx    context.Context
	cancel context.CancelFunc
}

func New(mqttClient *mqtt.Client, haClient *homeassistant.Client, pbClient *pocketbase.Client, historyStore *history.Store, boxFile string, identity box.Identity, historyRetentionDays int, schedulesFile, motionFile, devicesFile string) *Agent {
	ctx, cancel := context.WithCancel(context.Background())
	a := &Agent{
		mqttClient:       mqttClient,
		haClient:         haClient,
		pbClient:         pbClient,
		history:          historyStore,
		boxFile:          boxFile,
		schedulesFile:    schedulesFile,
		deviceNames:      make(map[string]string),
		historyRetention: time.Duration(historyRetentionDays) * 24 * time.Hour,
		ctx:              ctx,
		cancel:           cancel,
	}
	a.setHouse(identity.House)
	a.onConnected = a.onPocketBaseConnected
	a.devices = newDeviceCache(pbClient, a.house)
	a.motion = newMotionRunner(motionFile, a.switchForMotion, a.reportMotionLight)
	a.adaptive = newAdaptiveRunner(func(entity string, kelvin int) error {
		return a.rawCallHA("light", "turn_on", entity, map[string]any{"color_temp_kelvin": kelvin})
	})
	a.zigbee = newBridgeDirectory()
	a.pairing = newPairingRunner(devicesFile, a.house, a.zigbee, mqttClient.Publish, pbClient, haClient, time.Now)
	a.pairing.inApp = a.devices.addresses
	// in een eigen goroutine: HA en PocketBase, niet onder het slot van de runner
	a.pairing.afterAdd = func(entity string) { go a.syncEntityState(entity) }
	a.helpersFlag = filepath.Join(filepath.Dir(devicesFile), "helpers_removed")
	return a
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

	// Eerst alles wat lokaal kan: het huis uit box.json (bevestigd wordt het
	// zodra PocketBase er is; zonder huis blijft het leeg), de schema's uit
	// de snapshot en Home Assistant. Zo draait de box ook zonder internet.
	go a.runScheduler()

	if err := a.haClient.Connect(); err != nil {
		return err
	}
	go a.listenToHAEvents()
	go func() {
		if err := removeHelpersOnce(a.helpersFlag, a.haClient.DeleteHelpers); err != nil {
			log.Printf("[APP] %v (volgende start opnieuw)\n", err)
		}
	}()
	go a.runMotionClock()
	go a.runAdaptiveClock()

	go a.runPocketBase()
	go a.listenForCommands()
	go a.listenForDeviceChanges()
	go a.listenForHouseChanges()
	go a.listenForPairing()
	go a.runPairingClock()
	go a.runHeartbeat()
	go a.ensureMQTT()
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
	pending, err := a.pbClient.ListPendingCommands(a.house())
	if err != nil {
		log.Printf("[APP] Kon openstaande commando's niet ophalen: %v\n", err)
		return
	}
	for _, cmd := range pending {
		log.Printf("[APP] Openstaand commando gevonden: %s\n", cmd.ID)
		a.handleCommand(cmd)
	}
}

// listenForCommands abonneert zich op de PocketBase "commands"-collectie
// via realtime (SSE) en blijft herverbinden totdat de agent stopt.
func (a *Agent) listenForCommands() {
	for {
		err := a.pbClient.SubscribeCommands(a.ctx, a.onCommandStreamSubscribed, a.handleCommandEvent)
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

// onCommandStreamSubscribed start de herstelstap na een herverbinding.
// Vóór de eerste registratie doet de verbindingslus dat zelf. In een eigen
// goroutine: de stroom-lezer mag niet wachten op Home Assistant.
func (a *Agent) onCommandStreamSubscribed() {
	if a.registered.Load() {
		go a.onConnected()
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
	if device.Gateway != a.house() {
		return // device van een andere box
	}
	a.devices.applyEvent(event.EventType, device)
	if event.EventType == "delete" {
		a.pairing.onDeviceDeleted(device, len(a.devices.partsAt(device.Address)))
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
	if cmd.Status != "pending" || !a.claimCommand(cmd.ID) {
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
	// Als superuser ziet de agent de commando's van álle huizen. Dit is er
	// een voor een andere box: niet uitvoeren en ook niet als mislukt
	// markeren, die box handelt het zelf af.
	if device.Gateway != a.house() {
		return
	}
	if a.failIfExpired(cmd) {
		return
	}
	// "identify": laten knipperen (detail-sheet), via Zigbee2MQTT.
	if cmd.Action == "identify" {
		if err := a.pairing.identify(*device); err != nil {
			log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
			a.failCommand(cmd.ID, err)
			return
		}
		if err := a.pbClient.MarkCommandSent(cmd.ID); err != nil {
			log.Printf("[APP] Kon commando %s niet als 'sent' markeren: %v\n", cmd.ID, err)
		}
		return
	}

	if device.EntityID == "" {
		err := fmt.Errorf("device %s heeft geen entity_id", device.ID)
		log.Printf("[APP] Commando %s mislukt: %v\n", cmd.ID, err)
		a.failCommand(cmd.ID, err)
		return
	}

	// serviceCall kiest de service: set_temperature naar climate, turn_on met
	// een payload op een lamp naar light.turn_on (gecontroleerd), de rest via
	// de domein-agnostische homeassistant-services.
	domain, service, data, err := serviceCall(cmd.Action, device.EntityID, cmd.Payload)
	if err == nil {
		err = a.callHA(domain, service, device.EntityID, data)
	}
	if err != nil {
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
	if scene.House != a.house() {
		return // scène van een andere box: die handelt het zelf af
	}
	if a.failIfExpired(cmd) {
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
	domain, service, data, err := serviceCall(step.Action, device.EntityID, step.Payload)
	if err != nil {
		return err
	}
	return a.callHA(domain, service, device.EntityID, data)
}

// callHA roept een Home Assistant-service aan; tests vervangen callService.
// Kiest een commando of scène zelf een wittint of kleur voor een lamp, dan
// pauzeert "kleur volgt de dag" voor die lamp tot hij uit gaat.
func (a *Agent) callHA(domain, service, entityID string, data map[string]any) error {
	if domain == "light" && service == "turn_on" {
		_, kelvin := data["color_temp_kelvin"]
		_, rgb := data["rgb_color"]
		if kelvin || rgb {
			a.adaptive.manual(entityID)
		}
	}
	return a.rawCallHA(domain, service, entityID, data)
}

// rawCallHA: callHA zonder het pauzeren, voor "kleur volgt de dag" zelf.
func (a *Agent) rawCallHA(domain, service, entityID string, data map[string]any) error {
	if a.callService != nil {
		return a.callService(domain, service, entityID, data)
	}
	return a.haClient.CallService(domain, service, entityID, data)
}

func (a *Agent) failCommand(commandID string, reason error) {
	if err := a.pbClient.MarkCommandFailed(commandID, reason); err != nil {
		log.Printf("[APP] Kon commando %s niet als 'failed' markeren: %v\n", commandID, err)
	}
}

func (a *Agent) house() string {
	a.houseMu.RLock()
	defer a.houseMu.RUnlock()
	return a.gatewayID
}

func (a *Agent) setHouse(id string) {
	a.houseMu.Lock()
	a.gatewayID = id
	a.houseMu.Unlock()
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
			if !a.registered.Load() || a.house() == "" {
				continue // geen huis (of nog niet bevestigd): niets om te melden
			}
			if err := a.pbClient.SetGatewayStatus(a.house(), "online"); err != nil {
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
	if devices, ok := mqtt.ParseBridgeDevices(topic, payload); ok {
		a.zigbee.update(devices)
		return
	}
	if event, ok := mqtt.ParseBridgeEvent(topic, payload); ok {
		a.pairing.onBridgeEvent(event)
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
	// Zigbee2MQTT publiceert op de friendly name; de app kent het adres.
	address, known := a.zigbee.address(event.FriendlyName)
	// Bewegingslicht: vóór alles met PocketBase, dus ook zonder internet.
	if known {
		a.motion.onState(zigbeeKey(address), event.State, time.Now())
	}

	if !a.registered.Load() {
		return // geen huis: alleen de lokale geschiedenis
	}
	if !known {
		log.Printf("[APP] Onbekend Zigbee-apparaat, genegeerd: %s\n", event.FriendlyName)
		return
	}

	// Alleen delen zonder HA-entiteit (sensoren): een lamp of stekker krijgt
	// zijn stand van Home Assistant, in het formaat dat de app leest.
	for _, deviceID := range a.devices.zigbeeStateTargets(address) {
		if err := a.pbClient.UpsertDeviceState(deviceID, event.State); err != nil {
			log.Printf("[APP] PocketBase update mislukt voor %s: %v\n", event.FriendlyName, err)
			continue
		}
		log.Printf("[APP] PocketBase bijgewerkt (zigbee): %s -> %v\n", event.FriendlyName, event.State)
		// Een device dat state stuurt is aantoonbaar online. Echt offline
		// gaan gebeurt alleen via een expliciet availability-bericht.
		if err := a.pbClient.SetDeviceOnline(deviceID, true); err != nil {
			log.Printf("[APP] Kon online-status niet bijwerken voor %s: %v\n", event.FriendlyName, err)
		}
	}
}

// forwardZigbeeAvailability verwerkt een expliciet Zigbee2MQTT
// online/offline-signaal (zigbee2mqtt/<naam>/availability).
func (a *Agent) forwardZigbeeAvailability(avail mqtt.ZigbeeAvailability) {
	address, known := a.zigbee.address(avail.FriendlyName)
	if !known {
		log.Printf("[APP] Onbekend Zigbee-apparaat, genegeerd: %s\n", avail.FriendlyName)
		return
	}
	for _, deviceID := range a.devices.partsAt(address) {
		if err := a.pbClient.SetDeviceOnline(deviceID, avail.Online); err != nil {
			log.Printf("[APP] Kon online-status niet bijwerken voor %s: %v\n", avail.FriendlyName, err)
		}
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
	a.stateClock.mu.Lock()
	defer a.stateClock.mu.Unlock()
	if !a.stateClock.advance(event.EntityID, event.Timestamp) {
		log.Printf("[APP] Oudere stand genegeerd: %s (%s)\n", event.EntityID, event.Timestamp.Format(time.RFC3339Nano))
		return
	}

	state := map[string]any{
		"state":      event.State,
		"attributes": event.Attributes,
	}
	// De tijd van de stand: de PWA gooit hiermee een oudere echo weg.
	if !event.Timestamp.IsZero() {
		state["last_updated"] = event.Timestamp.UTC().Format(time.RFC3339Nano)
	}

	if err := a.history.Record(event.EntityID, state); err != nil {
		log.Printf("[APP] Lokale geschiedenis schrijven mislukt voor %s: %v\n", event.EntityID, err)
	}
	// Bewegingslicht (ook sun.sun) en kleur volgt de dag: vóór alles met
	// PocketBase.
	a.motion.onState(event.EntityID, state, time.Now())
	a.adaptive.onState(event.EntityID, state, time.Now())

	if !a.registered.Load() {
		return // geen huis: alleen de lokale geschiedenis
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

	if a.registered.Load() && a.house() != "" {
		if err := a.pbClient.SetGatewayStatus(a.house(), "offline"); err != nil {
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

// SetHueBridgeHost: het adres van de Hue-bridge als HA hem niet zelf vindt.
func (a *Agent) SetHueBridgeHost(host string) { a.pairing.hueHost = host }

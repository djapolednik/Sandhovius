package app

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

type published struct {
	topic   string
	payload string
}

// fakePairing speelt MQTT, PocketBase en de HA-registry voor de runner.
type fakePairing struct {
	mu         sync.Mutex
	published  []published
	sessions   []map[string]any // UpdatePairingSession-velden, met "id"
	created    []pocketbase.PairingCandidate
	candidates []map[string]any // UpdatePairingCandidate-velden, met "id"
	devices    []pocketbase.NewDevice
	open       []pocketbase.PairingSession
	haDevs     []homeassistant.RegistryDevice
	haEnts     []homeassistant.RegistryEntity
}

func (f *fakePairing) publish(topic string, payload any) error {
	raw, _ := json.Marshal(payload)
	f.mu.Lock()
	f.published = append(f.published, published{topic, string(raw)})
	f.mu.Unlock()
	return nil
}
func (f *fakePairing) UpdatePairingSession(id string, fields map[string]any) error {
	fields["id"] = id
	f.sessions = append(f.sessions, fields)
	return nil
}
func (f *fakePairing) CreatePairingCandidate(p pocketbase.PairingCandidate) (pocketbase.PairingCandidate, error) {
	p.ID = "c" + string(rune('0'+len(f.created)+1))
	f.created = append(f.created, p)
	return p, nil
}
func (f *fakePairing) UpdatePairingCandidate(id string, fields map[string]any) error {
	fields["id"] = id
	f.candidates = append(f.candidates, fields)
	return nil
}
func (f *fakePairing) CreateDevice(d pocketbase.NewDevice) (pocketbase.Device, error) {
	f.devices = append(f.devices, d)
	return pocketbase.Device{ID: "d" + string(rune('0'+len(f.devices))), Address: d.Address, Endpoint: d.Endpoint}, nil
}
func (f *fakePairing) ListOpenPairingSessions(string) ([]pocketbase.PairingSession, error) {
	return f.open, nil
}
func (f *fakePairing) ListDevices() ([]homeassistant.RegistryDevice, error)  { return f.haDevs, nil }
func (f *fakePairing) ListEntities() ([]homeassistant.RegistryEntity, error) { return f.haEnts, nil }

func (f *fakePairing) topics(topic string) []string {
	var out []string
	for _, p := range f.published {
		if p.topic == topic {
			out = append(out, p.payload)
		}
	}
	return out
}

type pairingFixture struct {
	f     *fakePairing
	r     *pairingRunner
	dir   *bridgeDirectory
	now   time.Time
	store string
}

func newPairingFixture(t *testing.T) *pairingFixture {
	t.Helper()
	fx := &pairingFixture{f: &fakePairing{}, dir: newBridgeDirectory(), now: pairT0,
		store: filepath.Join(t.TempDir(), "devices.json")}
	fx.r = newPairingRunner(fx.store, func() string { return "h1" }, fx.dir, fx.f.publish, fx.f, fx.f,
		func() time.Time { return fx.now })
	fx.r.sleep = func(time.Duration) {}
	return fx
}

const permitJoin = "zigbee2mqtt/bridge/request/permit_join"
const deviceRemove = "zigbee2mqtt/bridge/request/device/remove"

func (fx *pairingFixture) start(kind string) {
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: kind, Status: "starting"})
}

func (fx *pairingFixture) join(t *testing.T, ieee, exposes string) {
	t.Helper()
	dev := bridgeDev(t, ieee, exposes)
	fx.dir.update(append(fx.dir.list(), dev))
	fx.r.onBridgeEvent(mqtt.BridgeEvent{Type: "device_joined", IEEE: ieee, FriendlyName: ieee})
	fx.r.onBridgeEvent(mqtt.BridgeEvent{Type: "device_interview", IEEE: ieee, FriendlyName: ieee, Status: "successful", Device: &dev})
}

func (fx *pairingFixture) haKnows(ieee, entity string) {
	fx.f.haDevs = append(fx.f.haDevs, homeassistant.RegistryDevice{ID: "ha-" + ieee, Identifiers: [][]string{{"mqtt", "zigbee2mqtt_" + ieee}}})
	fx.f.haEnts = append(fx.f.haEnts, homeassistant.RegistryEntity{EntityID: entity, DeviceID: "ha-" + ieee})
}

// candidateID zoekt de candidate van een deel: het eerste deel hergebruikt
// het record van "wordt klaargezet" en krijgt zijn endpoint via een update.
func (fx *pairingFixture) candidateID(address, endpoint string) string {
	ends, addrs := map[string]string{}, map[string]string{}
	for _, c := range fx.f.created {
		ends[c.ID], addrs[c.ID] = c.Endpoint, c.Address
	}
	for _, u := range fx.f.candidates {
		if e, ok := u["endpoint"].(string); ok {
			ends[u["id"].(string)] = e
		}
	}
	for id, e := range ends {
		if addrs[id] == address && e == endpoint {
			return id
		}
	}
	return ""
}

func TestSessionOpensPermitJoin(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	if got := fx.f.topics(permitJoin); !reflect.DeepEqual(got, []string{`{"time":240}`}) {
		t.Errorf("permit_join = %v", got)
	}
	if len(fx.f.sessions) != 1 || fx.f.sessions[0]["status"] != "open" ||
		fx.f.sessions[0]["expires"] != pairT0.Add(4*time.Minute).Format("2006-01-02 15:04:05.000Z") {
		t.Errorf("sessie = %v", fx.f.sessions)
	}
	other := newPairingFixture(t)
	other.r.onSession(pocketbase.PairingSession{ID: "s9", House: "h2", Kind: "light", Status: "starting"})
	if len(other.f.published) != 0 || len(other.f.sessions) != 0 {
		t.Errorf("sessie van een ander huis opgepakt: %v %v", other.f.published, other.f.sessions)
	}
}

func TestFoundCandidateWritten(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	if len(fx.f.created) != 1 || fx.f.created[0].Status != "interviewing" || fx.f.created[0].Session != "s1" {
		t.Fatalf("candidates = %+v", fx.f.created)
	}
	last := fx.f.candidates[len(fx.f.candidates)-1]
	want := map[string]any{"id": "c1", "status": "found", "type": "light", "endpoint": "", "model": "ikea_bulb_ws",
		"capabilities": []string{"onoff", "brightness", "color_temp"}}
	if !reflect.DeepEqual(last, want) {
		t.Errorf("bijgewerkt = %v", last)
	}
}

func (fx *pairingFixture) add(id string) {
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: id, Session: "s1", Status: "found", Add: true, Name: "Gang", Room: "r1"})
}

func TestAddCreatesDevice(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.haKnows("0x1", "light.gang")
	fx.add("c1")
	want := []pocketbase.NewDevice{{Gateway: "h1", Room: "r1", Name: "Gang", Type: "light", Source: "zigbee",
		Address: "0x1", EntityID: "light.gang", Model: "ikea_bulb_ws", Capabilities: []string{"onoff", "brightness", "color_temp"}}}
	if !reflect.DeepEqual(fx.f.devices, want) {
		t.Errorf("devices = %+v", fx.f.devices)
	}
	last := fx.f.candidates[len(fx.f.candidates)-1]
	if last["status"] != "added" || last["device"] != "d1" {
		t.Errorf("candidate = %v", last)
	}
	if store, _ := loadDeviceStore(fx.store); !reflect.DeepEqual(store.Owned, []string{"0x1"}) {
		t.Errorf("owned = %+v", store)
	}
}

// Review Focus 4: dubbel tikken op Toevoegen.
func TestAddTwiceCreatesOneDevice(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.haKnows("0x1", "light.gang")
	fx.add("c1")
	fx.add("c1")
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: "c1", Session: "s1", Status: "adding", Add: true})
	if len(fx.f.devices) != 1 {
		t.Errorf("%d devices aangemaakt", len(fx.f.devices))
	}
}

func TestAddWithoutHAEntityFails(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.add("c1")
	if len(fx.f.devices) != 0 {
		t.Fatalf("device zonder entiteit aangemaakt: %+v", fx.f.devices)
	}
	if last := fx.f.candidates[len(fx.f.candidates)-1]; last["status"] != "failed" {
		t.Errorf("candidate = %v", last)
	}
}

func TestSensorNeedsNoEntity(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("sensor")
	fx.join(t, "0x5", "aqara_motion")
	fx.add("c1")
	if len(fx.f.devices) != 1 || fx.f.devices[0].EntityID != "" || fx.f.devices[0].Type != "sensor" {
		t.Errorf("devices = %+v", fx.f.devices)
	}
}

func TestIdentifyBlinks(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: "c1", Session: "s1", Status: "found", Identify: 1})
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: "c1", Session: "s1", Status: "found", Identify: 1}) // zelfde teller
	if got := fx.f.topics("zigbee2mqtt/0x1/set"); !reflect.DeepEqual(got, []string{`{"effect":"blink"}`}) {
		t.Errorf("blink = %v", got)
	}

	plug := newPairingFixture(t)
	plug.start("switch")
	plug.join(t, "0x2", "double_switch")
	plug.r.onCandidate(pocketbase.PairingCandidate{ID: plug.candidateID("0x2", "l1"), Session: "s1", Status: "found", Identify: 1})
	if got := plug.f.topics("zigbee2mqtt/0x2/set"); len(got) != 0 {
		t.Errorf("stekker zonder identify kreeg %v", got)
	}
}

func TestOtherKindHiddenAndRemoved(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x5", "aqara_motion")
	if got := fx.f.topics(deviceRemove); !reflect.DeepEqual(got, []string{`{"id":"0x5"}`}) {
		t.Errorf("remove = %v", got)
	}
	if last := fx.f.candidates[len(fx.f.candidates)-1]; last["status"] != "failed" {
		t.Errorf("candidate niet verborgen: %v", last)
	}
}

func TestCloseRemovesFromNetwork(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.join(t, "0x2", "ikea_bulb_ws")
	fx.haKnows("0x1", "light.gang")
	fx.add("c1")
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: "light", Status: "closed"})
	if got := fx.f.topics(permitJoin); !reflect.DeepEqual(got, []string{`{"time":240}`, `{"time":0}`}) {
		t.Errorf("permit_join = %v", got)
	}
	if got := fx.f.topics(deviceRemove); !reflect.DeepEqual(got, []string{`{"id":"0x2"}`}) {
		t.Errorf("remove = %v", got)
	}
	if store, _ := loadDeviceStore(fx.store); store.Session != nil {
		t.Errorf("sessie na sluiten nog in de store: %+v", store.Session)
	}
}

func TestExpiryClosesSession(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.join(t, "0x1", "ikea_bulb_ws")
	fx.now = pairT0.Add(5 * time.Minute)
	fx.r.tick()
	if got := fx.f.topics(deviceRemove); !reflect.DeepEqual(got, []string{`{"id":"0x1"}`}) {
		t.Errorf("remove = %v", got)
	}
	if last := fx.f.sessions[len(fx.f.sessions)-1]; last["status"] != "closed" {
		t.Errorf("sessie = %v", last)
	}
}

func TestExtendSession(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("light")
	fx.now = pairT0.Add(3 * time.Minute)
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: "light", Status: "open", Extend: true})
	last := fx.f.sessions[len(fx.f.sessions)-1]
	if last["extend"] != false || last["expires"] != fx.now.Add(4*time.Minute).Format("2006-01-02 15:04:05.000Z") {
		t.Errorf("verlengd = %v", last)
	}
	if got := fx.f.topics(permitJoin); len(got) != 2 {
		t.Errorf("permit_join = %v", got)
	}
}

// Review Focus 5: één deel van een dubbele stekker verwijderen.
func TestRemoveOnlyAfterLastPart(t *testing.T) {
	fx := newPairingFixture(t)
	fx.start("switch")
	fx.join(t, "0x2", "double_switch")
	fx.haKnows("0x2", "switch.stekker_l1")
	fx.haKnows("0x2", "switch.stekker_l2")
	fx.add(fx.candidateID("0x2", "l1"))
	fx.add(fx.candidateID("0x2", "l2"))
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Status: "closed"})

	part := pocketbase.Device{ID: "d1", Gateway: "h1", Source: "zigbee", Address: "0x2", Endpoint: "l1"}
	fx.r.onDeviceDeleted(part, 1)
	if got := fx.f.topics(deviceRemove); len(got) != 0 {
		t.Errorf("weggehaald terwijl l2 er nog is: %v", got)
	}
	part.Endpoint = "l2"
	fx.r.onDeviceDeleted(part, 0)
	if got := fx.f.topics(deviceRemove); !reflect.DeepEqual(got, []string{`{"id":"0x2"}`}) {
		t.Errorf("remove = %v", got)
	}
	stranger := pocketbase.Device{ID: "d9", Gateway: "h1", Source: "zigbee", Address: "0x77"}
	fx.r.onDeviceDeleted(stranger, 0)
	if got := fx.f.topics(deviceRemove); len(got) != 1 {
		t.Errorf("onbekend adres weggehaald: %v", got)
	}
}

// Review Focus 2: de agent herstart midden in een sessie.
func TestRestartClosesOpenSession(t *testing.T) {
	fx := newPairingFixture(t)
	if err := (&deviceStore{Owned: []string{"0x1"}, Session: &storedSession{ID: "s1", Joined: []string{"0x1", "0x9"}}}).save(fx.store); err != nil {
		t.Fatal(err)
	}
	fx.r = newPairingRunner(fx.store, func() string { return "h1" }, fx.dir, fx.f.publish, fx.f, fx.f, func() time.Time { return fx.now })
	fx.f.open = []pocketbase.PairingSession{{ID: "s1", House: "h1", Status: "open"}}
	fx.r.recover()
	if got := fx.f.topics(permitJoin); !reflect.DeepEqual(got, []string{`{"time":0}`}) {
		t.Errorf("permit_join = %v", got)
	}
	if got := fx.f.topics(deviceRemove); !reflect.DeepEqual(got, []string{`{"id":"0x9"}`}) {
		t.Errorf("remove = %v (0x1 is toegevoegd en blijft)", got)
	}
	if len(fx.f.sessions) != 1 || fx.f.sessions[0]["status"] != "closed" || fx.f.sessions[0]["id"] != "s1" {
		t.Errorf("sessies = %v", fx.f.sessions)
	}
	if store, _ := loadDeviceStore(fx.store); store.Session != nil || !reflect.DeepEqual(store.Owned, []string{"0x1"}) {
		t.Errorf("store = %+v", store)
	}
}

func TestIdentifyDevice(t *testing.T) {
	fx := newPairingFixture(t)
	fx.dir.update([]mqtt.BridgeDevice{bridgeDev(t, "0x1", "ikea_bulb_ws")})
	if err := fx.r.identify(pocketbase.Device{Source: "zigbee", Address: "0x1"}); err != nil {
		t.Fatal(err)
	}
	if got := fx.f.topics("zigbee2mqtt/0x1/set"); !reflect.DeepEqual(got, []string{`{"effect":"blink"}`}) {
		t.Errorf("blink = %v", got)
	}
	if err := fx.r.identify(pocketbase.Device{Source: "zigbee", Address: "0x404"}); err == nil {
		t.Error("onbekend adres: verwacht een fout")
	}
}

func TestBridgeDirectoryFollowsRename(t *testing.T) {
	d := newBridgeDirectory()
	d.update([]mqtt.BridgeDevice{{IEEE: "0x1", FriendlyName: "Gang"}})
	if a, ok := d.address("Gang"); !ok || a != "0x1" {
		t.Errorf("Gang = %q %v", a, ok)
	}
	d.update([]mqtt.BridgeDevice{{IEEE: "0x1", FriendlyName: "Hal"}})
	if _, ok := d.address("Gang"); ok {
		t.Error("oude naam nog bekend")
	}
	if a, ok := d.address("Hal"); !ok || a != "0x1" {
		t.Errorf("Hal = %q %v", a, ok)
	}
	if !reflect.DeepEqual(d.addresses(), map[string]bool{"0x1": true}) {
		t.Errorf("addresses = %v", d.addresses())
	}
}

func TestDeviceCacheByAddress(t *testing.T) {
	c := newDeviceCache(nil, func() string { return "h1" })
	sensor := pocketbase.Device{ID: "d1", Gateway: "h1", Source: "zigbee", Address: "0x5"}
	lampL1 := pocketbase.Device{ID: "d2", Gateway: "h1", Source: "zigbee", Address: "0x2", Endpoint: "l1", EntityID: "switch.s_l1"}
	lampL2 := pocketbase.Device{ID: "d3", Gateway: "h1", Source: "zigbee", Address: "0x2", Endpoint: "l2", EntityID: "switch.s_l2"}
	for _, d := range []pocketbase.Device{sensor, lampL1, lampL2} {
		c.applyEvent("create", d)
	}
	if got := c.zigbeeStateTargets("0x5"); !reflect.DeepEqual(got, []string{"d1"}) {
		t.Errorf("sensor-doelen = %v", got)
	}
	if got := c.zigbeeStateTargets("0x2"); len(got) != 0 {
		t.Errorf("delen met een HA-entiteit krijgen hun stand van HA: %v", got)
	}
	if got := c.partsAt("0x2"); len(got) != 2 {
		t.Errorf("delen op 0x2 = %v", got)
	}
	c.applyEvent("delete", lampL1)
	if got := c.partsAt("0x2"); !reflect.DeepEqual(got, []string{"d3"}) {
		t.Errorf("na verwijderen = %v", got)
	}
}

func TestMotionSensorByAddress(t *testing.T) {
	snap := &scheduleSnapshot{devices: map[string]pocketbase.Device{
		"s": {ID: "s", Gateway: "h1", Type: "sensor", Source: "zigbee", Address: "0x5"}}}
	r := newMotionRunner("", nil, nil)
	r.applyLocked(snap)
	if id, ok := r.byEntity[zigbeeKey("0x5")]; !ok || id != "s" {
		t.Errorf("sensor op adres: %q %v", id, ok)
	}
}

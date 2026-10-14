package app

import (
	"encoding/json"
	"reflect"
	"testing"

	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/pocketbase"
)

func hueRegistry() ([]homeassistant.RegistryDevice, []homeassistant.RegistryEntity) {
	off := "user"
	devs := []homeassistant.RegistryDevice{
		{ID: "bridge", Name: "Hue Bridge", Model: "BSB002", ConfigEntries: []string{"e1"}},
		{ID: "lamp1", Name: "Woonkamer", Model: "LCA001", ConfigEntries: []string{"e1"}},
		{ID: "lamp2", Name: "Keuken", Model: "LCA001", ConfigEntries: []string{"e1"}},
		{ID: "room", Name: "Woonkamer (kamer)", ConfigEntries: []string{"e1"}},
		{ID: "elders", Name: "Andere integratie", ConfigEntries: []string{"e9"}},
	}
	ents := []homeassistant.RegistryEntity{
		{EntityID: "sensor.lamp1_zigbee", DeviceID: "lamp1"},
		{EntityID: "light.woonkamer", DeviceID: "lamp1"},
		{EntityID: "light.keuken", DeviceID: "lamp2"},
		{EntityID: "light.woonkamer_kamer", DeviceID: "room", DisabledBy: &off},
		{EntityID: "light.elders", DeviceID: "elders"},
	}
	return devs, ents
}

func TestHueCandidates(t *testing.T) {
	devs, ents := hueRegistry()
	got := hueCandidates(devs, ents, []string{"e1"}, map[string]bool{"lamp2": true})
	want := []pocketbase.PairingCandidate{{Source: "hue", Address: "lamp1", Type: "light", Model: "LCA001", Status: "found"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("candidates = %+v", got)
	}
}

func TestHueEntityPrefersLight(t *testing.T) {
	_, ents := hueRegistry()
	if e, ok := hueEntity(ents, "lamp1"); !ok || e != "light.woonkamer" {
		t.Errorf("hueEntity = %q %v", e, ok)
	}
	if _, ok := hueEntity(ents, "bridge"); ok {
		t.Error("de bridge zelf heeft geen lamp")
	}
}

func TestHueCapabilities(t *testing.T) {
	cases := map[string][]string{
		"[\"onoff\"]":                {"onoff"},
		"[\"brightness\"]":           {"onoff", "brightness"},
		"[\"color_temp\",\"xy\"]":    {"onoff", "brightness", "color_temp", "color"},
		"[\"color_temp\"]":           {"onoff", "brightness", "color_temp"},
		"[\"hs\",\"brightness\"]":    {"onoff", "brightness", "color"},
	}
	for modes, want := range cases {
		var m []any
		jsonUnmarshal(t, modes, &m)
		if got := hueLightCapabilities(m); !reflect.DeepEqual(got, want) {
			t.Errorf("%s: %v, verwacht %v", modes, got, want)
		}
	}
}

func startHue(fx *pairingFixture) {
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: "hue", Status: "starting"})
}

func lastSession(fx *pairingFixture) map[string]any { return fx.f.sessions[len(fx.f.sessions)-1] }

func TestHueNotFound(t *testing.T) {
	fx := newPairingFixture(t)
	startHue(fx)
	if s := lastSession(fx); s["status"] != "failed" || s["error"] != "hue_not_found" {
		t.Errorf("sessie = %v", s)
	}
}

func TestHueDiscoveredFlowWaitsForButton(t *testing.T) {
	fx := newPairingFixture(t)
	fx.f.flows = []homeassistant.Flow{{FlowID: "f0", Handler: "met", StepID: "user"}, {FlowID: "f1", Handler: "hue", StepID: "link"}}
	startHue(fx)
	if s := lastSession(fx); s["status"] != "waiting_button" {
		t.Errorf("sessie = %v", s)
	}
	if len(fx.f.started) != 0 {
		t.Errorf("geen nieuwe flow verwacht: %v", fx.f.started)
	}
}

func TestHueManualHostWalksToLink(t *testing.T) {
	fx := newPairingFixture(t)
	fx.r.hueHost = "192.168.1.20"
	fx.f.startRes = []homeassistant.FlowResult{{Type: "form", FlowID: "f1", StepID: "init"}}
	fx.f.submitRes = []homeassistant.FlowResult{
		{Type: "form", FlowID: "f1", StepID: "manual"},
		{Type: "form", FlowID: "f1", StepID: "link"},
	}
	startHue(fx)
	want := []map[string]any{{"flow": "f1", "id": "manual"}, {"flow": "f1", "host": "192.168.1.20"}}
	if !reflect.DeepEqual(fx.f.submitted, want) {
		t.Errorf("ingediend = %v", fx.f.submitted)
	}
	if s := lastSession(fx); s["status"] != "waiting_button" {
		t.Errorf("sessie = %v", s)
	}
}

func pressButton(fx *pairingFixture) {
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: "hue", Status: "waiting_button", ButtonPressed: true})
}

func TestHueButtonNotPressed(t *testing.T) {
	fx := newPairingFixture(t)
	fx.f.flows = []homeassistant.Flow{{FlowID: "f1", Handler: "hue", StepID: "link"}}
	fx.f.submitRes = []homeassistant.FlowResult{{Type: "form", FlowID: "f1", StepID: "link", Errors: map[string]string{"base": "register_failed"}}}
	startHue(fx)
	pressButton(fx)
	s := lastSession(fx)
	if s["status"] != "waiting_button" || s["error"] != "hue_button" || s["button_pressed"] != false {
		t.Errorf("sessie = %v", s)
	}
}

func TestHueLinkedCreatesCandidates(t *testing.T) {
	fx := newPairingFixture(t)
	fx.f.haDevs, fx.f.haEnts = hueRegistry()
	fx.f.modes = map[string][]any{"light.woonkamer": {"color_temp", "xy"}, "light.keuken": {"brightness"}}
	fx.f.flows = []homeassistant.Flow{{FlowID: "f1", Handler: "hue", StepID: "link"}}
	fx.f.submitRes = []homeassistant.FlowResult{{Type: "create_entry", FlowID: "f1", EntryID: "e1"}}
	startHue(fx)
	fx.f.entries = []string{"e1"}
	pressButton(fx)
	if s := lastSession(fx); s["status"] != "open" || s["button_pressed"] != false || s["error"] != "" {
		t.Errorf("sessie = %v", s)
	}
	got := map[string][]string{}
	for _, c := range fx.f.created {
		got[c.Address] = c.Capabilities
	}
	want := map[string][]string{"lamp1": {"onoff", "brightness", "color_temp", "color"}, "lamp2": {"onoff", "brightness"}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("candidates = %v", got)
	}
}

func TestHueAlreadyLinked(t *testing.T) {
	fx := newPairingFixture(t)
	fx.f.haDevs, fx.f.haEnts = hueRegistry()
	fx.f.entries = []string{"e1"}
	startHue(fx)
	if s := lastSession(fx); s["status"] != "open" {
		t.Errorf("sessie = %v", s)
	}
	if len(fx.f.created) != 2 || len(fx.f.started) != 0 {
		t.Errorf("candidates %d, flows gestart %d", len(fx.f.created), len(fx.f.started))
	}
}

func hueLinked(t *testing.T) *pairingFixture {
	t.Helper()
	fx := newPairingFixture(t)
	fx.f.haDevs, fx.f.haEnts = hueRegistry()
	fx.f.entries = []string{"e1"}
	fx.f.modes = map[string][]any{"light.woonkamer": {"brightness"}}
	startHue(fx)
	return fx
}

func hueCandidateID(fx *pairingFixture, address string) string {
	for _, c := range fx.f.created {
		if c.Address == address {
			return c.ID
		}
	}
	return ""
}

func TestHueIdentifyFlashes(t *testing.T) {
	fx := hueLinked(t)
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: hueCandidateID(fx, "lamp1"), Session: "s1", Status: "found", Identify: 1})
	if !reflect.DeepEqual(fx.f.services, []string{`light.turn_on light.woonkamer {"flash":"short"}`}) {
		t.Errorf("services = %v", fx.f.services)
	}
	fx.f.services = nil
	if err := fx.r.identify(pocketbase.Device{Source: "hue", EntityID: "light.keuken"}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(fx.f.services, []string{`light.turn_on light.keuken {"flash":"short"}`}) {
		t.Errorf("services = %v", fx.f.services)
	}
}

func TestHueAddCreatesDevice(t *testing.T) {
	fx := hueLinked(t)
	fx.r.onCandidate(pocketbase.PairingCandidate{ID: hueCandidateID(fx, "lamp1"), Session: "s1", Status: "found", Add: true, Name: "Leeslamp", Room: "r1"})
	want := []pocketbase.NewDevice{{Gateway: "h1", Room: "r1", Name: "Leeslamp", Type: "light", Source: "hue",
		Address: "lamp1", EntityID: "light.woonkamer", Model: "LCA001", Capabilities: []string{"onoff", "brightness"}}}
	if !reflect.DeepEqual(fx.f.devices, want) {
		t.Errorf("devices = %+v", fx.f.devices)
	}
	if store, _ := loadDeviceStore(fx.store); len(store.Owned) != 0 {
		t.Errorf("een Hue-lamp is niet van ons netwerk: %+v", store.Owned)
	}
}

func TestHueCloseRemovesNothing(t *testing.T) {
	fx := hueLinked(t)
	fx.r.onSession(pocketbase.PairingSession{ID: "s1", House: "h1", Kind: "hue", Status: "closed"})
	fx.now = fx.now.Add(pairingWindow * 2)
	fx.r.tick()
	if got := fx.f.topics(deviceRemove); len(got) != 0 {
		t.Errorf("Hue-sessie haalde iets van het netwerk: %v", got)
	}
	if got := fx.f.topics(permitJoin); len(got) != 0 {
		t.Errorf("Hue-sessie opende Zigbee: %v", got)
	}
}

func TestHueExpires(t *testing.T) {
	fx := hueLinked(t)
	fx.now = fx.now.Add(pairingWindow + 1)
	fx.r.tick()
	if s := lastSession(fx); s["status"] != "closed" {
		t.Errorf("sessie = %v", s)
	}
}

func jsonUnmarshal(t *testing.T, s string, v any) {
	t.Helper()
	if err := json.Unmarshal([]byte(s), v); err != nil {
		t.Fatal(err)
	}
}

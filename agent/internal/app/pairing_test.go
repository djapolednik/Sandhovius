package app

import (
	"reflect"
	"testing"
	"time"

	"sandhovius/local-agent/internal/mqtt"
)

var pairT0 = time.Date(2026, 10, 14, 20, 0, 0, 0, time.UTC)

func bridgeDev(t *testing.T, ieee, exposesFile string) mqtt.BridgeDevice {
	t.Helper()
	return mqtt.BridgeDevice{IEEE: ieee, FriendlyName: ieee, Model: exposesFile, Supported: true,
		InterviewCompleted: true, Exposes: loadExposes(t, exposesFile)}
}

func kinds(actions []pairingAction) []string {
	out := []string{}
	for _, a := range actions {
		out = append(out, a.Kind+" "+a.Address)
	}
	return out
}

func only(actions []pairingAction, kind string) []pairingAction {
	var out []pairingAction
	for _, a := range actions {
		if a.Kind == kind {
			out = append(out, a)
		}
	}
	return out
}

func TestJoinThenInterviewIsCandidate(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	acts := e.joined("0x1")
	if len(acts) != 1 || acts[0].Kind != "candidate" || acts[0].Status != "interviewing" || acts[0].Address != "0x1" {
		t.Fatalf("na joined: %+v", acts)
	}
	acts = e.interviewed("0x1", bridgeDev(t, "0x1", "ikea_bulb_ws"), true)
	want := []pairingAction{{Kind: "candidate", Address: "0x1", Status: "found", Model: "ikea_bulb_ws",
		Part: Part{Endpoint: "", Type: "light", Capabilities: []string{"onoff", "brightness", "color_temp"}}}}
	if !reflect.DeepEqual(acts, want) {
		t.Errorf("na interview: %+v", acts)
	}
}

func TestOtherKindRemovedAtOnce(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	e.joined("0x1")
	acts := e.interviewed("0x1", bridgeDev(t, "0x1", "aqara_motion"), true)
	if got := only(acts, "remove"); len(got) != 1 || got[0].Address != "0x1" {
		t.Errorf("verwacht één remove 0x1: %v", kinds(acts))
	}
	if got := only(acts, "candidate"); len(got) != 0 {
		t.Errorf("geen candidate verwacht: %+v", got)
	}
	if got := only(acts, "hide"); len(got) != 1 {
		t.Errorf("de candidate in 'wordt klaargezet' moet weg: %v", kinds(acts))
	}
	if close := only(e.close(), "remove"); len(close) != 0 {
		t.Errorf("bij sluiten nog eens weggehaald: %+v", close)
	}
}

func TestUnsupportedRemoved(t *testing.T) {
	for name, dev := range map[string]mqtt.BridgeDevice{
		"interview mislukt": {IEEE: "0x1"},
		"geen definitie":    {IEEE: "0x1", Supported: false},
		"niets bruikbaars":  {IEEE: "0x1", Supported: true, Exposes: []mqtt.Expose{{Type: "numeric", Name: "linkquality"}}},
	} {
		e := newPairingEngine("light", nil, pairT0)
		e.joined("0x1")
		acts := e.interviewed("0x1", dev, name != "interview mislukt")
		if !reflect.DeepEqual(kinds(acts), []string{"candidate 0x1", "remove 0x1"}) || acts[0].Status != "unsupported" {
			t.Errorf("%s: %+v", name, acts)
		}
	}
}

func TestKnownAddressNeverRemoved(t *testing.T) {
	e := newPairingEngine("light", map[string]bool{"0x9": true}, pairT0)
	if acts := e.joined("0x9"); len(acts) != 0 {
		t.Errorf("bekend adres bij joined: %+v", acts)
	}
	if acts := e.interviewed("0x9", bridgeDev(t, "0x9", "aqara_motion"), true); len(acts) != 0 {
		t.Errorf("bekend adres bij interview: %+v", acts)
	}
	if acts := only(e.close(), "remove"); len(acts) != 0 {
		t.Errorf("bekend adres bij sluiten: %+v", acts)
	}
	if acts := only(e.tick(pairT0.Add(time.Hour)), "remove"); len(acts) != 0 {
		t.Errorf("bekend adres na verlopen: %+v", acts)
	}
}

func TestCloseRemovesNotAdded(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	for _, a := range []string{"0x1", "0x2"} {
		e.joined(a)
		e.interviewed(a, bridgeDev(t, a, "ikea_bulb_ws"), true)
	}
	e.added("0x1", "")
	if got := kinds(e.close()); !reflect.DeepEqual(got, []string{"close_join ", "remove 0x2"}) {
		t.Errorf("bij sluiten: %v", got)
	}
	if got := e.close(); len(got) != 0 {
		t.Errorf("tweede keer sluiten: %v", kinds(got))
	}
}

func TestPartlyAddedKeepsAddress(t *testing.T) {
	e := newPairingEngine("switch", nil, pairT0)
	e.joined("0x1")
	acts := e.interviewed("0x1", bridgeDev(t, "0x1", "double_switch"), true)
	if got := only(acts, "candidate"); len(got) != 2 || got[0].Part.Endpoint != "l1" || got[1].Part.Endpoint != "l2" {
		t.Fatalf("twee delen verwacht: %+v", acts)
	}
	e.added("0x1", "l1")
	if got := only(e.close(), "remove"); len(got) != 0 {
		t.Errorf("deels toegevoegd adres weggehaald: %+v", got)
	}
}

// Review Focus 1: de app gaat dicht; de box sluit zelf na 4 minuten.
func TestPairingExpiresWithoutApp(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	e.joined("0x1")
	e.interviewed("0x1", bridgeDev(t, "0x1", "ikea_bulb_ws"), true)
	if acts := e.tick(pairT0.Add(4 * time.Minute).Add(-time.Second)); len(acts) != 0 {
		t.Errorf("vóór het verlopen: %v", kinds(acts))
	}
	if got := kinds(e.tick(pairT0.Add(4*time.Minute + time.Second))); !reflect.DeepEqual(got, []string{"close_join ", "remove 0x1"}) {
		t.Errorf("na verlopen: %v", got)
	}
	if acts := e.tick(pairT0.Add(10 * time.Minute)); len(acts) != 0 {
		t.Errorf("na sluiten nog acties: %v", kinds(acts))
	}
	if acts := e.joined("0x2"); len(acts) != 0 {
		t.Errorf("joined na sluiten: %v", kinds(acts))
	}
}

// Review Focus 3: twee keer joined en twee keer interviewed.
func TestDuplicateJoinOneCandidate(t *testing.T) {
	e := newPairingEngine("switch", nil, pairT0)
	var all []pairingAction
	all = append(all, e.joined("0x1")...)
	all = append(all, e.joined("0x1")...)
	dev := bridgeDev(t, "0x1", "double_switch")
	all = append(all, e.interviewed("0x1", dev, true)...)
	all = append(all, e.interviewed("0x1", dev, true)...)
	seen := map[string]int{}
	for _, a := range only(all, "candidate") {
		seen[a.Address+"|"+a.Part.Endpoint+"|"+a.Status]++
	}
	want := map[string]int{"0x1||interviewing": 1, "0x1|l1|found": 1, "0x1|l2|found": 1}
	if !reflect.DeepEqual(seen, want) {
		t.Errorf("candidates: %v", seen)
	}
	if got := e.joinedAddresses(); !reflect.DeepEqual(got, []string{"0x1"}) {
		t.Errorf("joinedAddresses = %v", got)
	}
}

func TestInterviewWithoutJoinCounts(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	if got := only(e.interviewed("0x1", bridgeDev(t, "0x1", "ikea_bulb_ws"), true), "candidate"); len(got) != 1 {
		t.Errorf("interview zonder joined: %+v", got)
	}
	if got := kinds(only(e.close(), "remove")); !reflect.DeepEqual(got, []string{"remove 0x1"}) {
		t.Errorf("bij sluiten: %v", got)
	}
}

func TestExtend(t *testing.T) {
	e := newPairingEngine("light", nil, pairT0)
	later := pairT0.Add(3 * time.Minute)
	if got := e.extend(later); !got.Equal(later.Add(4 * time.Minute)) {
		t.Errorf("extend = %v", got)
	}
	if acts := e.tick(pairT0.Add(5 * time.Minute)); len(acts) != 0 {
		t.Errorf("verlengd maar toch dicht: %v", kinds(acts))
	}
	if e.expiresAt() != later.Add(4*time.Minute) {
		t.Errorf("expiresAt = %v", e.expiresAt())
	}
}

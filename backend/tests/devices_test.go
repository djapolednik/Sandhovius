//go:build integration

// Device-identiteit: alleen de box maakt devices (na koppelen), een bewoner
// wijzigt alleen naam, kamer en weergave, en de hook bewaakt de woordenlijst
// van mogelijkheden en "weergeven als lamp".
package tests

import (
	"reflect"
	"testing"
)

const devicesPath = "/api/collections/devices/records"

func TestResidentCannotCreateDevice(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	st, out := p.do(t, w.UserATok, "POST", devicesPath, map[string]any{
		"gateway": w.HouseA, "name": "Nep", "type": "light", "entity_id": "light.nep"})
	if st < 400 {
		t.Fatalf("bewoner maakt een device: %d %v", st, out)
	}
}

func TestBoxCreatesDeviceInOwnHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	body := func(house, room string) map[string]any {
		b := map[string]any{
			"gateway": house, "name": "Gang", "type": "light", "source": "zigbee",
			"address": "0x00158d0001", "entity_id": "light.gang", "model": "LED1836G9",
			"capabilities": []string{"onoff", "brightness"}}
		if room != "" {
			b["room"] = room
		}
		return b
	}
	if st, out := p.do(t, w.BoxATok, "POST", devicesPath, body(w.HouseA, w.roomA)); st != 200 {
		t.Fatalf("box A maakt een device in huis A: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "POST", devicesPath, body(w.HouseB, "")); st < 400 {
		t.Errorf("box A maakt een device in huis B: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "POST", devicesPath, body(w.HouseA, w.roomB)); st < 400 {
		t.Errorf("box A maakt een device met een kamer van huis B: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxNoneTok, "POST", devicesPath, body(w.HouseA, "")); st < 400 {
		t.Errorf("box zonder huis maakt een device: %d %v", st, out)
	}
	b := body(w.HouseA, "")
	b["shown_as"] = "light"
	if st, out := p.do(t, w.BoxATok, "POST", devicesPath, b); st < 400 {
		t.Errorf("box zet shown_as: %d %v", st, out)
	}
}

func TestResidentCannotSetBoxFields(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	path := devicesPath + "/" + w.DevA
	for _, body := range []map[string]any{
		{"address": "0x1"}, {"source": "hue"}, {"type": "sensor"}, {"entity_id": "light.x"},
		{"capabilities": []string{"onoff"}}, {"endpoint": "l1"}, {"model": "X"},
	} {
		before := getRecord(t, p, "devices", w.DevA)
		st, out := p.do(t, w.UserATok, "PATCH", path, body)
		if st < 400 {
			t.Errorf("bewoner zet %v: %d %v", body, st, out)
		}
		if after := getRecord(t, p, "devices", w.DevA); !reflect.DeepEqual(before, after) {
			t.Errorf("bewoner %v: device is gewijzigd", body)
		}
	}
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{"name": "Leeslamp", "room": w.roomA}); st != 200 {
		t.Errorf("bewoner wijzigt naam en kamer: %d %v", st, out)
	}
}

func TestShownAsOnlyOnSwitch(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	plug := p.create(t, "devices", map[string]any{
		"gateway": w.HouseA, "name": "Stekker", "type": "switch", "entity_id": "switch.stekker"})
	if st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+plug, map[string]any{"shown_as": "light"}); st != 200 {
		t.Errorf("stekker als lamp: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+plug, map[string]any{"shown_as": ""}); st != 200 {
		t.Errorf("stekker terug naar stekker: %d %v", st, out)
	}
	st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+w.DevA, map[string]any{"shown_as": "light"})
	if st != 400 || out["code"] != "invalid_shown_as" {
		t.Errorf("shown_as op een lamp: %d %v", st, out)
	}
}

func TestCapabilitiesVocabulary(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	path := devicesPath + "/" + w.DevA
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"capabilities": []string{"onoff", "brightness"}}); st != 200 {
		t.Errorf("box zet geldige mogelijkheden: %d %v", st, out)
	}
	// een radiatorknop (model A): valve hoort bij de woordenlijst
	if st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"capabilities": []string{"heating", "valve", "temperature", "battery"}}); st != 200 {
		t.Errorf("box zet een radiatorknop: %d %v", st, out)
	}
	for _, bad := range []any{[]string{"onoff", "laser"}, map[string]any{"onoff": true}, "onoff"} {
		st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"capabilities": bad})
		if st != 400 || out["code"] != "invalid_capabilities" {
			t.Errorf("mogelijkheden %v: %d %v", bad, st, out)
		}
	}
}

func TestIdentifyCommand(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	cmd := func(action string) (int, map[string]any) {
		return p.do(t, w.UserATok, "POST", "/api/collections/commands/records",
			map[string]any{"device": w.DevA, "action": action, "status": "pending"})
	}
	if st, out := cmd("identify"); st != 200 {
		t.Errorf("identify: %d %v", st, out)
	}
	if st, out := cmd("provision"); st < 400 {
		t.Errorf("provision bestaat nog: %d %v", st, out)
	}
}

// Kleur volgt de dag (spec 2026-10-14-adaptive-light-design.md): alleen een
// lamp met kleurtemperatuur, en alleen de bewoner zet het.
func TestAdaptiveOnlyWithColorTemp(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	white := p.create(t, "devices", map[string]any{
		"gateway": w.HouseA, "name": "Leeslamp", "type": "light", "entity_id": "light.lees",
		"capabilities": []string{"onoff", "brightness", "color_temp"}})
	if st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+white, map[string]any{"adaptive": true}); st != 200 {
		t.Errorf("wit lamp volgt de dag: %d %v", st, out)
	}
	if st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+white, map[string]any{"adaptive": false}); st != 200 {
		t.Errorf("weer uit: %d %v", st, out)
	}
	st, out := p.do(t, w.UserATok, "PATCH", devicesPath+"/"+w.DevA, map[string]any{"adaptive": true})
	if st != 400 || out["code"] != "invalid_adaptive" {
		t.Errorf("lamp zonder kleurtemperatuur: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", devicesPath+"/"+white, map[string]any{"adaptive": true}); st < 400 {
		t.Errorf("box zet adaptive: %d %v", st, out)
	}
}

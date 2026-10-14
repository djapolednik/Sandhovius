package app

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"sandhovius/local-agent/internal/mqtt"
)

func loadExposes(t *testing.T, name string) []mqtt.Expose {
	t.Helper()
	raw, err := os.ReadFile("testdata/exposes/" + name + ".json")
	if err != nil {
		t.Fatal(err)
	}
	var exposes []mqtt.Expose
	if err := json.Unmarshal(raw, &exposes); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	return exposes
}

func TestClassify(t *testing.T) {
	cases := []struct {
		file string
		want []Part
	}{
		{"ikea_bulb_ws", []Part{{"", "light", []string{"onoff", "brightness", "color_temp"}}}},
		{"aqara_motion", []Part{{"", "sensor", []string{"occupancy", "illuminance", "battery"}}}},
		// device_temperature is de chip, geen kamertemperatuur
		{"aqara_contact", []Part{{"", "sensor", []string{"contact", "battery"}}}},
		{"leak", []Part{{"", "sensor", []string{"water_leak", "battery"}}}},
		{"double_switch", []Part{{"l1", "switch", []string{"onoff"}}, {"l2", "switch", []string{"onoff"}}}},
		// Sonoff TRVZB, de exposes uit zigbee-herdsman-converters (sonoff.ts):
		// een kraan herken je aan valve_opening_degree
		{"sonoff_trvzb", []Part{{"", "climate", []string{"heating", "valve", "temperature", "battery"}}}},
		// een wandthermostaat: climate zonder kraan
		{"wall_thermostat", []Part{{"", "climate", []string{"heating", "temperature", "battery"}}}},
	}
	for _, c := range cases {
		if got := classify(loadExposes(t, c.file)); !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: %+v, verwacht %+v", c.file, got, c.want)
		}
	}
}

func TestClassifyUnsupported(t *testing.T) {
	if got := classify(nil); got != nil {
		t.Errorf("geen exposes: %+v", got)
	}
	only := []mqtt.Expose{{Type: "numeric", Name: "linkquality", Property: "linkquality"}}
	if got := classify(only); got != nil {
		t.Errorf("alleen linkquality: %+v", got)
	}
}

func TestClassifyColorLight(t *testing.T) {
	exposes := []mqtt.Expose{{Type: "light", Features: []mqtt.Expose{
		{Type: "binary", Name: "state"}, {Type: "numeric", Name: "brightness"},
		{Type: "composite", Name: "color_xy", Property: "color"},
	}}}
	want := []Part{{"", "light", []string{"onoff", "brightness", "color"}}}
	if got := classify(exposes); !reflect.DeepEqual(got, want) {
		t.Errorf("kleurlamp: %+v", got)
	}
}

// Verwarming volgens model A (spec, "Verwarming"): alleen geteste
// radiatorknoppen. Een wandthermostaat of een niet geteste kraan is niet
// ondersteund; een lamp of sensor blijft gewoon staan.
func TestSupportedParts(t *testing.T) {
	trvzb := classify(loadExposes(t, "sonoff_trvzb"))
	if got := supportedParts("TRVZB", trvzb); !reflect.DeepEqual(got, trvzb) {
		t.Errorf("TRVZB: %+v", got)
	}
	if got := supportedParts("014G2461", trvzb); got != nil {
		t.Errorf("niet geteste kraan: %+v", got)
	}
	if got := supportedParts("TRVZB", classify(loadExposes(t, "wall_thermostat"))); got != nil {
		t.Errorf("wandthermostaat: %+v", got)
	}
	bulb := classify(loadExposes(t, "ikea_bulb_ws"))
	if got := supportedParts("LED1545G12", bulb); !reflect.DeepEqual(got, bulb) {
		t.Errorf("lamp: %+v", got)
	}
}

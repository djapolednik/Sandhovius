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
		{"trv", []Part{{"", "climate", []string{"heating", "temperature", "battery"}}}},
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

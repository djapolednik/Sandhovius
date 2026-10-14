package mqtt

import "testing"

const bridgeDevicesPayload = `[
  {"ieee_address": "0x00124b0000000000", "type": "Coordinator", "friendly_name": "Coordinator",
   "supported": true, "interview_completed": true, "definition": null},
  {"ieee_address": "0x00158d0001", "type": "Router", "friendly_name": "Gang",
   "supported": true, "interview_completed": true,
   "definition": {"model": "LED1836G9", "vendor": "IKEA", "exposes": [
     {"type": "light", "features": [{"type": "binary", "name": "state", "property": "state"}]}]}},
  {"ieee_address": "0x00158d0002", "type": "EndDevice", "friendly_name": "0x00158d0002",
   "supported": false, "interview_completed": false, "definition": null}
]`

func TestParseBridgeDevices(t *testing.T) {
	devs, ok := ParseBridgeDevices("zigbee2mqtt/bridge/devices", []byte(bridgeDevicesPayload))
	if !ok {
		t.Fatal("bridge/devices niet herkend")
	}
	if len(devs) != 2 {
		t.Fatalf("verwacht 2 apparaten zonder coördinator, kreeg %d: %+v", len(devs), devs)
	}
	gang := devs[0]
	if gang.IEEE != "0x00158d0001" || gang.FriendlyName != "Gang" || gang.Model != "LED1836G9" ||
		gang.Vendor != "IKEA" || gang.Type != "Router" || !gang.Supported || !gang.InterviewCompleted {
		t.Errorf("Gang verkeerd gelezen: %+v", gang)
	}
	if len(gang.Exposes) != 1 || gang.Exposes[0].Type != "light" || gang.Exposes[0].Features[0].Name != "state" {
		t.Errorf("exposes verkeerd gelezen: %+v", gang.Exposes)
	}
	if devs[1].Supported || devs[1].Exposes != nil {
		t.Errorf("onbekend apparaat: %+v", devs[1])
	}
	if _, ok := ParseBridgeDevices("zigbee2mqtt/bridge/state", []byte(`{"state":"online"}`)); ok {
		t.Error("bridge/state herkend als bridge/devices")
	}
}

func TestParseBridgeEventInterview(t *testing.T) {
	payload := `{"type": "device_interview", "data": {"friendly_name": "0x00158d0001",
	  "ieee_address": "0x00158d0001", "status": "successful", "supported": true,
	  "definition": {"model": "RTCGQ11LM", "vendor": "Aqara", "exposes": [
	    {"type": "binary", "name": "occupancy", "property": "occupancy"}]}}}`
	ev, ok := ParseBridgeEvent("zigbee2mqtt/bridge/event", []byte(payload))
	if !ok {
		t.Fatal("bridge/event niet herkend")
	}
	if ev.Type != "device_interview" || ev.IEEE != "0x00158d0001" || ev.Status != "successful" {
		t.Errorf("event verkeerd gelezen: %+v", ev)
	}
	if ev.Device == nil || ev.Device.Model != "RTCGQ11LM" || !ev.Device.Supported ||
		len(ev.Device.Exposes) != 1 || ev.Device.Exposes[0].Name != "occupancy" {
		t.Errorf("definitie verkeerd gelezen: %+v", ev.Device)
	}
}

func TestParseBridgeEventJoined(t *testing.T) {
	ev, ok := ParseBridgeEvent("zigbee2mqtt/bridge/event",
		[]byte(`{"type": "device_joined", "data": {"friendly_name": "0x1", "ieee_address": "0x1"}}`))
	if !ok || ev.Type != "device_joined" || ev.IEEE != "0x1" || ev.FriendlyName != "0x1" || ev.Device != nil {
		t.Errorf("device_joined: ok=%v %+v", ok, ev)
	}
	if _, ok := ParseBridgeEvent("zigbee2mqtt/Gang", []byte(`{"type":"device_joined"}`)); ok {
		t.Error("ander topic herkend als bridge/event")
	}
	if _, ok := ParseBridgeEvent("zigbee2mqtt/bridge/event", []byte(`niet json`)); ok {
		t.Error("ongeldige JSON herkend")
	}
}

package app

import (
	"sync"

	"sandhovius/local-agent/internal/mqtt"
)

// bridgeDirectory is de laatste stand van zigbee2mqtt/bridge/devices: welke
// apparaten er op het netwerk zitten, onder welke friendly name. Zigbee2MQTT
// publiceert state op de naam; de app kent een apparaat aan zijn adres, dat
// niet verandert bij hernoemen of opnieuw koppelen.
type bridgeDirectory struct {
	mu     sync.RWMutex
	byName map[string]string
	byAddr map[string]mqtt.BridgeDevice
	order  []string
}

func newBridgeDirectory() *bridgeDirectory {
	return &bridgeDirectory{byName: map[string]string{}, byAddr: map[string]mqtt.BridgeDevice{}}
}

// update vervangt de hele lijst (bridge/devices is altijd volledig).
func (d *bridgeDirectory) update(devices []mqtt.BridgeDevice) {
	byName := make(map[string]string, len(devices))
	byAddr := make(map[string]mqtt.BridgeDevice, len(devices))
	order := make([]string, 0, len(devices))
	for _, dev := range devices {
		byName[dev.FriendlyName] = dev.IEEE
		byAddr[dev.IEEE] = dev
		order = append(order, dev.IEEE)
	}
	d.mu.Lock()
	d.byName, d.byAddr, d.order = byName, byAddr, order
	d.mu.Unlock()
}

func (d *bridgeDirectory) address(name string) (string, bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	a, ok := d.byName[name]
	return a, ok
}

func (d *bridgeDirectory) device(address string) (mqtt.BridgeDevice, bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	dev, ok := d.byAddr[address]
	return dev, ok
}

// addresses: alles wat nu op het netwerk zit (voor een nieuwe koppelsessie).
func (d *bridgeDirectory) addresses() map[string]bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make(map[string]bool, len(d.byAddr))
	for a := range d.byAddr {
		out[a] = true
	}
	return out
}

func (d *bridgeDirectory) list() []mqtt.BridgeDevice {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := make([]mqtt.BridgeDevice, 0, len(d.order))
	for _, a := range d.order {
		out = append(out, d.byAddr[a])
	}
	return out
}

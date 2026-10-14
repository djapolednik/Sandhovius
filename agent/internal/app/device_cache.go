package app

import (
	"errors"
	"sort"
	"sync"

	"sandhovius/local-agent/internal/pocketbase"
)

// deviceCache maps a Home Assistant entity_id to its PocketBase device
// record id. It is populated from PocketBase and refreshed on demand: a
// lookup miss triggers one refresh before giving up, so devices added
// while the agent is already running are still picked up — just not
// instantly.
type deviceCache struct {
	pb *pocketbase.Client
	// house geeft het huis van deze box: alleen zijn devices horen in de
	// cache (entity-ID's komen uit de naam en kunnen tussen huizen botsen).
	house func() string

	mu       sync.RWMutex
	byEntity map[string]string
	// zigbee: de devices met een adres (Zigbee en Hue) op id, om ze op adres
	// te vinden (een meervoudig apparaat heeft meer devices met hetzelfde
	// adres).
	zigbee map[string]pocketbase.Device
}

func newDeviceCache(pb *pocketbase.Client, house func() string) *deviceCache {
	return &deviceCache{
		pb:       pb,
		house:    house,
		byEntity: make(map[string]string),
		zigbee:   make(map[string]pocketbase.Device),
	}
}

// partsAt: de device-id's op een Zigbee-adres, gesorteerd.
func (d *deviceCache) partsAt(address string) []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := []string{}
	for id, dev := range d.zigbee {
		if dev.Source == "zigbee" && dev.Address == address {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// zigbeeStateTargets: de devices op een adres die hun stand uit het
// Zigbee2MQTT-bericht krijgen. Een deel met een HA-entiteit (lamp, stekker,
// thermostaat) krijgt hem van Home Assistant, in het formaat dat de app voor
// bediening leest; alleen een sensor heeft geen entiteit.
func (d *deviceCache) zigbeeStateTargets(address string) []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := []string{}
	for id, dev := range d.zigbee {
		if dev.Source == "zigbee" && dev.Address == address && dev.EntityID == "" {
			out = append(out, id)
		}
	}
	sort.Strings(out)
	return out
}

// meteringTargets: de stekkers op een adres met vermogensmeting (C2). Hun
// stand komt van Home Assistant, hun meting uit het Zigbee2MQTT-bericht.
func (d *deviceCache) meteringTargets(address string) []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := []string{}
	for id, dev := range d.zigbee {
		if dev.Source != "zigbee" || dev.Address != address {
			continue
		}
		for _, c := range dev.Capabilities {
			if c == "power" || c == "energy" {
				out = append(out, id)
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

// refresh herlaadt de cache en geeft de opgehaalde devices terug, zodat de
// agent bij het opstarten niet nog een keer hoeft te vragen.
func (d *deviceCache) refresh() ([]pocketbase.Device, error) {
	house := d.house()
	if house == "" {
		return nil, errors.New("nog geen huis bekend")
	}
	devices, err := d.pb.ListHouseDevices(house)
	if err != nil {
		return nil, err
	}

	byEntity := make(map[string]string, len(devices))
	zigbee := make(map[string]pocketbase.Device)
	for _, dev := range devices {
		if dev.Address != "" {
			zigbee[dev.ID] = dev
		}
		if dev.EntityID == "" {
			continue
		}
		byEntity[dev.EntityID] = dev.ID
	}

	d.mu.Lock()
	d.byEntity = byEntity
	d.zigbee = zigbee
	d.mu.Unlock()
	return devices, nil
}

// clear leegt de cache (huis losgekoppeld of gewisseld). Nil-veilig voor
// tests zonder cache.
func (d *deviceCache) clear() {
	if d == nil {
		return
	}
	d.mu.Lock()
	d.byEntity = make(map[string]string)
	d.zigbee = make(map[string]pocketbase.Device)
	d.mu.Unlock()
}

// entityIDs returns every entity_id the cache currently knows, so the
// agent can reconcile their state with Home Assistant.
func (d *deviceCache) entityIDs() []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	ids := make([]string, 0, len(d.byEntity))
	for id := range d.byEntity {
		ids = append(ids, id)
	}
	return ids
}

// applyEvent houdt de cache bij met de realtime-events van devices: een
// verwijderd device verdwijnt, een nieuw of gewijzigd device komt erin met
// zijn huidige entity. Zonder dit bleef een entity na verwijderen naar het
// oude device wijzen (lookup ververst alleen bij een miss), en weigerde
// PocketBase elke stand van een opnieuw gekoppelde sensor met dezelfde naam.
func (d *deviceCache) applyEvent(action string, device pocketbase.Device) {
	if d == nil || device.Gateway != d.house() {
		return
	}
	d.mu.Lock()
	defer d.mu.Unlock()
	for entity, id := range d.byEntity {
		if id == device.ID {
			delete(d.byEntity, entity)
		}
	}
	if action != "delete" && device.EntityID != "" {
		d.byEntity[device.EntityID] = device.ID
	}
	delete(d.zigbee, device.ID)
	if action != "delete" && device.Address != "" {
		d.zigbee[device.ID] = device
	}
}

// cached zegt wat de cache nu weet, zonder te verversen (voor tests).
func (d *deviceCache) cached(entityID string) (string, bool) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	id, ok := d.byEntity[entityID]
	return id, ok
}

// lookup returns the PocketBase device id for entityID, refreshing the
// cache once from PocketBase if it isn't found yet.
func (d *deviceCache) lookup(entityID string) (deviceID string, found bool, err error) {
	d.mu.RLock()
	id, ok := d.byEntity[entityID]
	d.mu.RUnlock()
	if ok {
		return id, true, nil
	}

	if _, err := d.refresh(); err != nil {
		return "", false, err
	}

	d.mu.RLock()
	id, ok = d.byEntity[entityID]
	d.mu.RUnlock()
	return id, ok, nil
}

// addresses: de adressen van één bron (zigbee/hue) die in de app staan.
func (d *deviceCache) addresses(source string) map[string]bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	out := map[string]bool{}
	for _, dev := range d.zigbee {
		if dev.Source == source {
			out[dev.Address] = true
		}
	}
	return out
}

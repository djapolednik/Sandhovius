package app

import (
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

	mu       sync.RWMutex
	byEntity map[string]string
}

func newDeviceCache(pb *pocketbase.Client) *deviceCache {
	return &deviceCache{
		pb:       pb,
		byEntity: make(map[string]string),
	}
}

// refresh herlaadt de cache en geeft de opgehaalde devices terug, zodat de
// agent bij het opstarten niet nog een keer hoeft te vragen.
func (d *deviceCache) refresh() ([]pocketbase.Device, error) {
	devices, err := d.pb.ListDevices()
	if err != nil {
		return nil, err
	}

	byEntity := make(map[string]string, len(devices))
	for _, dev := range devices {
		if dev.EntityID == "" {
			continue
		}
		byEntity[dev.EntityID] = dev.ID
	}

	d.mu.Lock()
	d.byEntity = byEntity
	d.mu.Unlock()
	return devices, nil
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

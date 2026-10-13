package app

import (
	"errors"
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
}

func newDeviceCache(pb *pocketbase.Client, house func() string) *deviceCache {
	return &deviceCache{
		pb:       pb,
		house:    house,
		byEntity: make(map[string]string),
	}
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

// clear leegt de cache (huis losgekoppeld of gewisseld). Nil-veilig voor
// tests zonder cache.
func (d *deviceCache) clear() {
	if d == nil {
		return
	}
	d.mu.Lock()
	d.byEntity = make(map[string]string)
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

package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// deviceStore staat op schijf (/data/devices.json): welke Zigbee-adressen de
// agent zelf toevoegde (alleen die mag hij later van het netwerk halen), en
// de lopende koppelsessie met de adressen die erin binnenkwamen, zodat een
// herstart midden in een sessie ze kan opruimen.
type deviceStore struct {
	Owned   []string       `json:"owned"`
	Session *storedSession `json:"session,omitempty"`
}

type storedSession struct {
	ID     string   `json:"id"`
	Joined []string `json:"joined"`
}

// loadDeviceStore leest het bestand; ontbreekt het, dan een lege store.
func loadDeviceStore(path string) (*deviceStore, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return &deviceStore{}, nil
	}
	if err != nil {
		return &deviceStore{}, err
	}
	var s deviceStore
	if err := json.Unmarshal(raw, &s); err != nil {
		return &deviceStore{}, err
	}
	return &s, nil
}

// save schrijft via een tijdelijk bestand, zodat een stroomstoring geen half
// bestand achterlaat.
func (s *deviceStore) save(path string) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *deviceStore) owns(address string) bool {
	for _, a := range s.Owned {
		if a == address {
			return true
		}
	}
	return false
}

func (s *deviceStore) addOwned(address string) {
	if !s.owns(address) {
		s.Owned = append(s.Owned, address)
	}
}

func (s *deviceStore) removeOwned(address string) {
	kept := s.Owned[:0]
	for _, a := range s.Owned {
		if a != address {
			kept = append(kept, a)
		}
	}
	s.Owned = kept
}

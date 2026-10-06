// Package box leest en bewaart de identiteit van deze box (/data/box.json):
// serienummer en geheim om bij PocketBase in te loggen, en het huis waaraan
// de box gekoppeld is.
package box

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type Identity struct {
	Serial string `json:"serial"`
	Secret string `json:"secret"`
	House  string `json:"house"`
}

// Load leest het identiteitsbestand. Spaties en regeleindes rond waarden
// (bijvoorbeeld door met de hand bewerken op Windows) worden weggehaald.
func Load(path string) (Identity, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Identity{}, fmt.Errorf("box-identiteit %s lezen: %w", path, err)
	}
	var id Identity
	if err := json.Unmarshal(data, &id); err != nil {
		return Identity{}, fmt.Errorf("box-identiteit %s is geen geldige JSON: %w", path, err)
	}
	id.Serial = strings.TrimSpace(id.Serial)
	id.Secret = strings.TrimSpace(id.Secret)
	id.House = strings.TrimSpace(id.House)
	if id.Serial == "" || id.Secret == "" {
		return Identity{}, fmt.Errorf("box-identiteit %s: serial en secret moeten ingevuld zijn", path)
	}
	return id, nil
}

// SaveHouse zet het huis in het identiteitsbestand en schrijft het atomisch
// (tmp + rename), zodat een crash het bestand nooit half achterlaat.
func SaveHouse(path, house string) error {
	id, err := Load(path)
	if err != nil {
		return err
	}
	id.House = house
	data, err := json.MarshalIndent(id, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("box-identiteit %s schrijven: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("box-identiteit %s vervangen: %w", path, err)
	}
	return nil
}

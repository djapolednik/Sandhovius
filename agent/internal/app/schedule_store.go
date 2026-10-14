package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// snapshotFile is de schema-snapshot zoals hij op schijf staat. house zegt
// van welk huis hij is: na een nieuw houses-record hoort een oud bestand
// niet meer bij deze box.
type snapshotFile struct {
	House     string                `json:"house"`
	SavedAt   string                `json:"saved_at"`
	Schedules []pocketbase.Schedule `json:"schedules"`
	Scenes    []pocketbase.Scene    `json:"scenes"`
	// Ontbreekt in bestanden van vóór de bewegingslichten: dan gewoon leeg.
	MotionLights []pocketbase.MotionLight `json:"motion_lights"`
	Devices      []pocketbase.Device      `json:"devices"`
	// Waar het huis staat, voor zon-schema's als HA bij de start weg is.
	Location *homeLocation `json:"location,omitempty"`
}

// saveSnapshot schrijft de snapshot atomisch (tijdelijk bestand + rename),
// zodat een stroomstoring nooit een half bestand achterlaat.
func saveSnapshot(path, house string, snap *scheduleSnapshot, now time.Time) error {
	file := snapshotFile{
		House:        house,
		SavedAt:      now.Format(time.RFC3339),
		Schedules:    snap.schedules,
		Scenes:       make([]pocketbase.Scene, 0, len(snap.scenes)),
		MotionLights: snap.motionLights,
		Devices:      make([]pocketbase.Device, 0, len(snap.devices)),
		Location:     snap.location,
	}
	for _, scene := range snap.scenes {
		file.Scenes = append(file.Scenes, scene)
	}
	for _, device := range snap.devices {
		file.Devices = append(file.Devices, device)
	}
	data, err := json.Marshal(file)
	if err != nil {
		return fmt.Errorf("schema-snapshot coderen: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("schema-snapshot opslaan in %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("schema-snapshot opslaan in %s: %w", path, err)
	}
	return nil
}

// loadSnapshot leest de snapshot van dit huis. Geen bestand, of een bestand
// van een ander huis, is geen fout: dan is er gewoon niets te laden.
func loadSnapshot(path, house string) (*scheduleSnapshot, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("schema-snapshot lezen uit %s: %w", path, err)
	}
	var file snapshotFile
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, fmt.Errorf("schema-snapshot in %s is onleesbaar: %w", path, err)
	}
	if file.House != house {
		return nil, nil
	}
	snap := &scheduleSnapshot{
		schedules:    file.Schedules,
		scenes:       make(map[string]pocketbase.Scene, len(file.Scenes)),
		motionLights: file.MotionLights,
		devices:      make(map[string]pocketbase.Device, len(file.Devices)),
		location:     file.Location,
	}
	for _, scene := range file.Scenes {
		snap.scenes[scene.ID] = scene
	}
	for _, device := range file.Devices {
		snap.devices[device.ID] = device
	}
	return snap, nil
}

// loadScheduleSnapshot laadt de snapshot uit het bestand bij het opstarten,
// zodat schema's ook lopen als PocketBase er (nog) niet is. Lukt dat niet,
// dan start de scheduler leeg en vult de eerste geslaagde fetch hem.
func (a *Agent) loadScheduleSnapshot() *scheduleSnapshot {
	house := a.house()
	if house == "" {
		return nil
	}
	snap, err := loadSnapshot(a.schedulesFile, house)
	if err != nil {
		log.Printf("[SCHEMA] %v — start zonder opgeslagen schema's\n", err)
		return nil
	}
	if snap == nil {
		log.Printf("[SCHEMA] Geen opgeslagen schema's voor dit huis in %s\n", a.schedulesFile)
		return nil
	}
	log.Printf("[SCHEMA] %d schema's geladen uit %s\n", len(snap.schedules), a.schedulesFile)
	a.rememberLocation(snap.location)
	return snap
}

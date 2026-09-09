package history

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Store is a local, append-only log of every state change the agent has
// seen. It exists independently of PocketBase: writes here never touch
// the network, so local history keeps working even when the cloud is
// unreachable — that's the whole point of it.
type Store struct {
	db *sql.DB
}

func NewStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("history: open %s: %w", path, err)
	}

	// SQLite allows only one writer at a time. Rather than tuning journal
	// modes and adding retry logic, force a single connection so
	// database/sql itself serializes concurrent writers — at a home's
	// event volume this has no measurable cost.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS device_state_history (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_id   TEXT NOT NULL,
			state       TEXT NOT NULL,
			recorded_at DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_history_entity_id ON device_state_history(entity_id);
		CREATE INDEX IF NOT EXISTS idx_history_recorded_at ON device_state_history(recorded_at);
	`); err != nil {
		db.Close()
		return nil, fmt.Errorf("history: migrate schema: %w", err)
	}

	return &Store{db: db}, nil
}

// Record appends one state snapshot for entityID. entityID is whatever
// identifier the source event carried (an HA entity_id or a Zigbee2MQTT
// friendly_name) — deliberately not a PocketBase device id, so this never
// depends on PocketBase being reachable or the device being registered
// there yet.
func (s *Store) Record(entityID string, state map[string]any) error {
	encoded, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("history: encode state for %s: %w", entityID, err)
	}

	_, err = s.db.Exec(
		`INSERT INTO device_state_history (entity_id, state, recorded_at) VALUES (?, ?, ?)`,
		entityID, string(encoded), time.Now().UTC(),
	)
	if err != nil {
		return fmt.Errorf("history: record %s: %w", entityID, err)
	}
	return nil
}

// Prune deletes history rows older than olderThan and returns how many
// rows were removed.
func (s *Store) Prune(olderThan time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-olderThan)
	result, err := s.db.Exec(`DELETE FROM device_state_history WHERE recorded_at < ?`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("history: prune: %w", err)
	}
	return result.RowsAffected()
}

func (s *Store) Close() error {
	return s.db.Close()
}

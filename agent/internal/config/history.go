package config

import (
	"os"
	"strconv"
)

type HistoryConfig struct {
	DBPath        string
	RetentionDays int
}

func loadHistoryConfig() HistoryConfig {
	path := os.Getenv("HISTORY_DB_PATH")
	if path == "" {
		path = "/data/history.db"
	}

	retentionDays := 30
	if raw := os.Getenv("HISTORY_RETENTION_DAYS"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			retentionDays = parsed
		}
	}

	return HistoryConfig{DBPath: path, RetentionDays: retentionDays}
}

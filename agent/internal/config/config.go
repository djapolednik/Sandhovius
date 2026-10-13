package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	MQTT struct {
		Broker string
		Port   string
	}
	HomeAssistant struct {
		URL     string
		RestURL string
		Token   string
	}
	PocketBase struct {
		URL string
	}
	Box struct {
		// File bevat de identiteit van deze box (serial, secret, house).
		File string
	}
	History struct {
		DBPath        string
		RetentionDays int
	}
	Schedules struct {
		// File bewaart de laatste schema-snapshot, zodat schema's ook na
		// een herstart zonder PocketBase lopen.
		File string
	}
	Motion struct {
		// File bewaart welke bewegingslichten welke lamp aanzetten en tot
		// wanneer, zodat een lamp ook na een herstart op tijd uitgaat.
		File string
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func LoadConfig() (*Config, error) {
	var c Config
	c.MQTT.Broker = env("MQTT_BROKER", "localhost")
	c.MQTT.Port = env("MQTT_PORT", "1883")
	c.HomeAssistant.URL = env("HA_URL", "http://localhost:8123")
	c.HomeAssistant.RestURL = env("HA_REST_URL", "http://localhost:8123")
	c.HomeAssistant.Token = os.Getenv("HA_TOKEN")
	c.PocketBase.URL = env("POCKETBASE_URL", "http://localhost:8090")
	c.Box.File = env("BOX_FILE", "/data/box.json")
	c.History.DBPath = env("HISTORY_DB_PATH", "/data/history.db")
	c.Schedules.File = env("SCHEDULES_FILE", "/data/schedules.json")
	c.Motion.File = env("MOTION_FILE", "/data/motion.json")
	c.History.RetentionDays = 30
	if n, err := strconv.Atoi(os.Getenv("HISTORY_RETENTION_DAYS")); err == nil && n > 0 {
		c.History.RetentionDays = n
	}

	if c.HomeAssistant.Token == "" {
		return nil, fmt.Errorf("HA_TOKEN omgevingsvariabele is niet ingesteld in docker-compose.yml")
	}
	return &c, nil
}

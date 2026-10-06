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
		URL           string
		AdminEmail    string
		AdminPassword string
	}
	Gateway struct {
		// Name is alleen de beginnaam van een nieuw huis-record. Daarna kan de
		// bewoner het huis in de app hernoemen; de box herkent zijn record aan
		// het ID in IDFile, niet aan deze naam.
		Name string
		// IDFile bewaart het ID van het houses-record van deze box, zodat de
		// koppeling een herstart en een hernoeming overleeft.
		IDFile string
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
	c.PocketBase.AdminEmail = os.Getenv("POCKETBASE_ADMIN_EMAIL")
	c.PocketBase.AdminPassword = os.Getenv("POCKETBASE_ADMIN_PASSWORD")
	c.Gateway.Name = env("GATEWAY_NAME", "Sandhovius Gateway")
	c.Gateway.IDFile = env("GATEWAY_ID_FILE", "/data/gateway_id")
	c.Box.File = env("BOX_FILE", "/data/box.json")
	c.History.DBPath = env("HISTORY_DB_PATH", "/data/history.db")
	c.Schedules.File = env("SCHEDULES_FILE", "/data/schedules.json")
	c.History.RetentionDays = 30
	if n, err := strconv.Atoi(os.Getenv("HISTORY_RETENTION_DAYS")); err == nil && n > 0 {
		c.History.RetentionDays = n
	}

	for key, v := range map[string]string{
		"HA_TOKEN":                  c.HomeAssistant.Token,
		"POCKETBASE_ADMIN_EMAIL":    c.PocketBase.AdminEmail,
		"POCKETBASE_ADMIN_PASSWORD": c.PocketBase.AdminPassword,
	} {
		if v == "" {
			return nil, fmt.Errorf("%s omgevingsvariabele is niet ingesteld in docker-compose.yml", key)
		}
	}
	return &c, nil
}

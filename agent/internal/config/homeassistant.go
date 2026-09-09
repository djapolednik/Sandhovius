package config

import (
	"fmt"
	"os"
)

type HomeAssistantConfig struct {
	URL   string
	Token string
}

func loadHomeAssistantConfig() (HomeAssistantConfig, error) {
	url := os.Getenv("HA_URL")
	if url == "" {
		url = "http://localhost:8123"
	}
	token := os.Getenv("HA_TOKEN")
	if token == "" {
		return HomeAssistantConfig{}, fmt.Errorf("HA_TOKEN omgevingsvariabele is niet ingesteld in docker-compose.yml")
	}
	return HomeAssistantConfig{
		URL:   url,
		Token: token,
	}, nil
}

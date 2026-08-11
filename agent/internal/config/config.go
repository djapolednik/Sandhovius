package config

import (
	"fmt"
	"os"
)

type Config struct {
	MQTTBroker string
	MQTTPort   string
	HA_URL     string
	HA_Token   string
}

func LoadConfig() (*Config, error) {
	broker := os.Getenv("MQTT_BROKER")
	if broker == "" {
		broker = "localhost"
	}
	port := os.Getenv("MQTT_PORT")
	if port == "" {
		port = "1883"
	}
	url := os.Getenv("HA_URL")
	if url == "" {
		url = "http://localhost:8123"
	}
	token := os.Getenv("HA_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("HA_TOKEN omgevingsvariabele is niet ingesteld in docker-compose.yml")
	}
	return &Config{
		MQTTBroker: broker,
		MQTTPort:   port,
		HA_URL:     url,
		HA_Token:   token,
	}, nil
}

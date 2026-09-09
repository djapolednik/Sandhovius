package config

import "os"

type MQTTConfig struct {
	Broker string
	Port   string
}

func loadMQTTConfig() MQTTConfig {
	broker := os.Getenv("MQTT_BROKER")
	if broker == "" {
		broker = "localhost"
	}
	port := os.Getenv("MQTT_PORT")
	if port == "" {
		port = "1883"
	}
	return MQTTConfig{
		Broker: broker,
		Port:   port,
	}
}

package config

import "os"

type GatewayConfig struct {
	Name string
}

func loadGatewayConfig() GatewayConfig {
	name := os.Getenv("GATEWAY_NAME")
	if name == "" {
		name = "Sandhovius Gateway"
	}
	return GatewayConfig{Name: name}
}

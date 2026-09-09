package config

type Config struct {
	MQTT          MQTTConfig
	HomeAssistant HomeAssistantConfig
	PocketBase    PocketBaseConfig
	Gateway       GatewayConfig
}

func LoadConfig() (*Config, error) {
	mqttCfg := loadMQTTConfig()

	haCfg, err := loadHomeAssistantConfig()
	if err != nil {
		return nil, err
	}

	pbCfg, err := loadPocketBaseConfig()
	if err != nil {
		return nil, err
	}

	gatewayCfg := loadGatewayConfig()

	return &Config{
		MQTT:          mqttCfg,
		HomeAssistant: haCfg,
		PocketBase:    pbCfg,
		Gateway:       gatewayCfg,
	}, nil
}

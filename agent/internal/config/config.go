package config

type Config struct {
	MQTT          MQTTConfig
	HomeAssistant HomeAssistantConfig
	PocketBase    PocketBaseConfig
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

	return &Config{
		MQTT:          mqttCfg,
		HomeAssistant: haCfg,
		PocketBase:    pbCfg,
	}, nil
}

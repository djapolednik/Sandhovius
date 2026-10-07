package app

import (
	"log"

	"sandhovius/local-agent/internal/homeassistant"
)

const (
	mqttBroker = "mosquitto"
	mqttPort   = 1883
)

// ensureMQTT zet de MQTT-integratie in HA aan als die ontbreekt, zodat HA
// met Mosquitto (en dus Zigbee2MQTT) praat. Bestaat hij al, dan gebeurt er
// niets. Een fout wordt alleen gelogd: de rest van de agent draait door.
func (a *Agent) ensureMQTT() {
	ensureMQTT(a.haClient)
}

type mqttSetup interface {
	HasIntegration(domain string) (bool, error)
	AddMQTT(broker string, port int) error
}

func ensureMQTT(ha mqttSetup) {
	exists, err := ha.HasIntegration("mqtt")
	if err != nil {
		log.Printf("[MQTT] Integraties van HA ophalen mislukt: %v\n", err)
		return
	}
	if exists {
		return
	}
	log.Println("[MQTT] Geen MQTT-integratie in HA; die wordt toegevoegd")
	if err := ha.AddMQTT(mqttBroker, mqttPort); err != nil {
		log.Printf("[MQTT] MQTT toevoegen mislukt: %v\n", err)
		return
	}
	log.Println("[MQTT] MQTT-integratie toegevoegd")
}

var _ mqttSetup = (*homeassistant.Client)(nil)

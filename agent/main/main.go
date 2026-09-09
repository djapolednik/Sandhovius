package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sandhovius/local-agent/internal/app"
	"sandhovius/local-agent/internal/config"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

func main() {
	fmt.Println("Sandhovius Local Agent is aan het opstarten...")

	// 1. Configuratie laden
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("[FATAL] Fout bij het laden van de configuratie: %v", err)
	}

	// 2. MQTT Client Websocket
	brokerURL := fmt.Sprintf("%s:%s", cfg.MQTT.Broker, cfg.MQTT.Port)
	mqttClient := mqtt.NewClient(brokerURL, "", "", "sandhovius-local-agent")

	// 3. Home Assistant WebSocket
	haClient := homeassistant.NewClient(cfg.HomeAssistant.URL, cfg.HomeAssistant.Token)

	// 4. PocketBase Client
	pbClient := pocketbase.NewClient(cfg.PocketBase.URL)
	if err := pbClient.Authenticate(cfg.PocketBase.AdminEmail, cfg.PocketBase.AdminPassword); err != nil {
		log.Fatalf("[FATAL] Fout bij het inloggen bij PocketBase: %v", err)
	}

	// 5. De Agent aanmaken
	agent := app.New(mqttClient, haClient, pbClient)

	// 6. Start de agent
	if err := agent.Start(); err != nil {
		log.Fatalf("[FATAL] Fout bij het starten van de agent: %v", err)
	}

	// 7. Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("[SYS] Local Agent is actief. Druk op Ctrl+C of stuur een SIGTERM om te stoppen...")

	// Blokkeer de uitvoering totdat Docker of het systeem wil stoppen
	sig := <-sigChan
	fmt.Printf("\n[SYS] Ontvangen signaal: %s. Agent wordt afgesloten...\n", sig)

	// 8. Alles netjes afsluiten
	agent.Stop()
	fmt.Println("[SYS] Agent is succesvol afgesloten. Tot ziens!")
}

package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sandhovius/local-agent/internal/app"
	"sandhovius/local-agent/internal/config"
	"sandhovius/local-agent/internal/history"
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

	// 2. Lokale geschiedenis (SQLite) — onafhankelijk van alle netwerkclients
	historyStore, err := history.NewStore(cfg.History.DBPath)
	if err != nil {
		log.Fatalf("[FATAL] Fout bij het openen van de lokale geschiedenis: %v", err)
	}

	// 3. MQTT Client Websocket
	brokerURL := fmt.Sprintf("tcp://%s:%s", cfg.MQTT.Broker, cfg.MQTT.Port)
	mqttClient := mqtt.NewClient(brokerURL, "sandhovius-local-agent")

	// 4. Home Assistant WebSocket + REST
	haClient := homeassistant.NewClient(cfg.HomeAssistant.URL, cfg.HomeAssistant.RestURL, cfg.HomeAssistant.Token)

	// 5. PocketBase Client — inloggen gebeurt in de agent zelf, met
	// herhaalpogingen: de box moet ook zonder PocketBase kunnen starten.
	pbClient := pocketbase.NewClient(cfg.PocketBase.URL)
	pbClient.SetCredentials(cfg.PocketBase.AdminEmail, cfg.PocketBase.AdminPassword)

	// 6. De Agent aanmaken
	agent := app.New(mqttClient, haClient, pbClient, historyStore, cfg.Gateway.Name, cfg.Gateway.IDFile, cfg.History.RetentionDays, cfg.Schedules.File)

	// 7. Start de agent
	if err := agent.Start(); err != nil {
		log.Fatalf("[FATAL] Fout bij het starten van de agent: %v", err)
	}

	// 8. Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("[SYS] Local Agent is actief. Druk op Ctrl+C of stuur een SIGTERM om te stoppen...")

	// Blokkeer de uitvoering totdat Docker of het systeem wil stoppen
	sig := <-sigChan
	fmt.Printf("\n[SYS] Ontvangen signaal: %s. Agent wordt afgesloten...\n", sig)

	// 9. Alles netjes afsluiten
	agent.Stop()
	fmt.Println("[SYS] Agent is succesvol afgesloten. Tot ziens!")
}

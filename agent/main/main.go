package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"sandhovius/local-agent/internal/app"
	"sandhovius/local-agent/internal/box"
	"sandhovius/local-agent/internal/config"
	"sandhovius/local-agent/internal/history"
	"sandhovius/local-agent/internal/homeassistant"
	"sandhovius/local-agent/internal/mqtt"
	"sandhovius/local-agent/internal/pocketbase"
)

// version wordt bij het bouwen gezet: -ldflags "-X main.version=..." (zie
// agent/Dockerfile, build-arg AGENT_VERSION). Zonder: "dev".
var version = "dev"

func main() {
	fmt.Printf("Sandhovius Local Agent %s is aan het opstarten...\n", version)

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

	// 5. Box-identiteit: zonder box.json weet de box niet wie hij is.
	identity, err := box.Load(cfg.Box.File)
	if err != nil {
		log.Fatalf("[FATAL] Box-identiteit ontbreekt of is ongeldig (%s): %v", cfg.Box.File, err)
	}

	// 6. PocketBase Client — inloggen gebeurt in de agent zelf, met
	// herhaalpogingen: de box moet ook zonder PocketBase kunnen starten.
	pbClient := pocketbase.NewClient(cfg.PocketBase.URL)
	pbClient.SetCredentials(identity.Serial, identity.Secret)

	// 7. De Agent aanmaken
	agent := app.New(mqttClient, haClient, pbClient, historyStore, cfg.Box.File, identity, cfg.History.RetentionDays, cfg.Schedules.File, cfg.Motion.File)
	agent.SetVersion(version)

	// 8. Start de agent
	if err := agent.Start(); err != nil {
		log.Fatalf("[FATAL] Fout bij het starten van de agent: %v", err)
	}

	// 9. Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("[SYS] Local Agent is actief. Druk op Ctrl+C of stuur een SIGTERM om te stoppen...")

	// Blokkeer de uitvoering totdat Docker of het systeem wil stoppen
	sig := <-sigChan
	fmt.Printf("\n[SYS] Ontvangen signaal: %s. Agent wordt afgesloten...\n", sig)

	// 10. Alles netjes afsluiten
	agent.Stop()
	fmt.Println("[SYS] Agent is succesvol afgesloten. Tot ziens!")
}

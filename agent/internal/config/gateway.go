package config

import "os"

type GatewayConfig struct {
	// Name is alleen de beginnaam van een nieuw huis-record. Daarna kan de
	// bewoner het huis in de app hernoemen; de box herkent zijn record aan
	// het ID in IDFile, niet aan deze naam.
	Name string
	// IDFile bewaart het ID van het houses-record van deze box, zodat de
	// koppeling een herstart en een hernoeming overleeft.
	IDFile string
}

func loadGatewayConfig() GatewayConfig {
	name := os.Getenv("GATEWAY_NAME")
	if name == "" {
		name = "Sandhovius Gateway"
	}
	idFile := os.Getenv("GATEWAY_ID_FILE")
	if idFile == "" {
		idFile = "/data/gateway_id"
	}
	return GatewayConfig{Name: name, IDFile: idFile}
}

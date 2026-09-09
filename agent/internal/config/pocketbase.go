package config

import (
	"fmt"
	"os"
)

type PocketBaseConfig struct {
	URL           string
	AdminEmail    string
	AdminPassword string
}

func loadPocketBaseConfig() (PocketBaseConfig, error) {
	url := os.Getenv("POCKETBASE_URL")
	if url == "" {
		url = "http://localhost:8090"
	}
	email := os.Getenv("POCKETBASE_ADMIN_EMAIL")
	if email == "" {
		return PocketBaseConfig{}, fmt.Errorf("POCKETBASE_ADMIN_EMAIL omgevingsvariabele is niet ingesteld in docker-compose.yml")
	}
	password := os.Getenv("POCKETBASE_ADMIN_PASSWORD")
	if password == "" {
		return PocketBaseConfig{}, fmt.Errorf("POCKETBASE_ADMIN_PASSWORD omgevingsvariabele is niet ingesteld in docker-compose.yml")
	}
	return PocketBaseConfig{
		URL:           url,
		AdminEmail:    email,
		AdminPassword: password,
	}, nil
}

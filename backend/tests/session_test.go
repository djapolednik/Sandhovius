//go:build integration

// Bewoners blijven ingelogd tot ze zelf uitloggen: hun token geldt een jaar
// (de PWA verlengt het elke dag dat de app open gaat). Boxen houden hun eigen
// duur.
package tests

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func tokenExpiry(t *testing.T, token string) time.Time {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("geen JWT: %q", token)
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(raw, &claims); err != nil {
		t.Fatal(err)
	}
	return time.Unix(claims.Exp, 0)
}

func TestResidentTokenLastsAYear(t *testing.T) {
	p := startPB(t)
	newUser(t, p, "bewoner@sandhovius.test")
	left := time.Until(tokenExpiry(t, p.login(t, "users", "bewoner@sandhovius.test", boxPw)))
	if left < 364*24*time.Hour || left > 366*24*time.Hour {
		t.Errorf("bewonerstoken geldt %v, verwacht een jaar", left)
	}

	newBox(t, p, "SH-SESSIE")
	boxLeft := time.Until(tokenExpiry(t, p.login(t, "boxes", "SH-SESSIE", boxPw)))
	if boxLeft > 30*24*time.Hour {
		t.Errorf("boxtoken geldt %v; de box hoort zijn eigen (korte) duur te houden", boxLeft)
	}
}

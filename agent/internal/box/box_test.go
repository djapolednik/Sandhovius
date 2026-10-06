package box

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func schrijf(t *testing.T, inhoud string) string {
	t.Helper()
	pad := filepath.Join(t.TempDir(), "box.json")
	if err := os.WriteFile(pad, []byte(inhoud), 0o600); err != nil {
		t.Fatal(err)
	}
	return pad
}

func TestLoadIdentity(t *testing.T) {
	pad := schrijf(t, `{"serial":"SH-1","secret":"geheim","house":"abc123"}`)
	id, err := Load(pad)
	if err != nil {
		t.Fatal(err)
	}
	if id.Serial != "SH-1" || id.Secret != "geheim" || id.House != "abc123" {
		t.Fatalf("onverwachte identiteit: %+v", id)
	}
}

func TestLoadMissing(t *testing.T) {
	pad := filepath.Join(t.TempDir(), "bestaat-niet.json")
	_, err := Load(pad)
	if err == nil {
		t.Fatal("verwachtte een fout")
	}
	if !strings.Contains(err.Error(), pad) {
		t.Fatalf("fout noemt het pad niet: %v", err)
	}
}

func TestLoadEmptySecret(t *testing.T) {
	pad := schrijf(t, `{"serial":"SH-1","secret":"  ","house":""}`)
	if _, err := Load(pad); err == nil {
		t.Fatal("verwachtte een fout bij leeg geheim")
	}
}

func TestLoadToleratesCRLF(t *testing.T) {
	pad := schrijf(t, "{\r\n  \"serial\": \" SH-1 \",\r\n  \"secret\": \"geheim\\r\\n\",\r\n  \"house\": \" abc \"\r\n}\r\n")
	id, err := Load(pad)
	if err != nil {
		t.Fatal(err)
	}
	if id.Serial != "SH-1" || id.Secret != "geheim" || id.House != "abc" {
		t.Fatalf("niet schoongemaakt: %+v", id)
	}
}

func TestSaveHouseKeepsSecret(t *testing.T) {
	pad := schrijf(t, `{"serial":"SH-1","secret":"geheim","house":""}`)
	if err := SaveHouse(pad, "nieuw"); err != nil {
		t.Fatal(err)
	}
	id, err := Load(pad)
	if err != nil {
		t.Fatal(err)
	}
	if id.Serial != "SH-1" || id.Secret != "geheim" || id.House != "nieuw" {
		t.Fatalf("onverwachte identiteit: %+v", id)
	}
	if _, err := os.Stat(pad + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf(".tmp is blijven staan: %v", err)
	}
}

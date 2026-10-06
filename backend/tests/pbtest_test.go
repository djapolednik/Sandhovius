//go:build integration

// Harnas voor integratietests: start een wegwerp-PocketBase (zelfde versie als
// de dev-stack) met de echte migraties uit ../pb_migrations, in een tijdelijke
// map. Raakt de draaiende dev-stack en zijn data niet.
package tests

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

const pbVersion = "0.40.4"

type pb struct {
	URL        string
	AdminToken string
}

// pbBinary downloadt PocketBase één keer naar .cache/ en geeft het pad terug.
func pbBinary(t *testing.T) string {
	t.Helper()
	exe := "pocketbase"
	if runtime.GOOS == "windows" {
		exe += ".exe"
	}
	dir := filepath.Join(".cache", fmt.Sprintf("%s_%s_%s", pbVersion, runtime.GOOS, runtime.GOARCH))
	bin, err := filepath.Abs(filepath.Join(dir, exe))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(bin); err == nil {
		return bin
	}
	url := fmt.Sprintf("https://github.com/pocketbase/pocketbase/releases/download/v%s/pocketbase_%s_%s_%s.zip",
		pbVersion, pbVersion, runtime.GOOS, runtime.GOARCH)
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("PocketBase downloaden mislukt: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("PocketBase downloaden mislukt: %s geeft %d", url, resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, f := range zr.File {
		if f.Name != exe {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		defer rc.Close()
		tmp := bin + ".tmp"
		out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(out, rc); err != nil {
			out.Close()
			t.Fatal(err)
		}
		out.Close()
		if err := os.Rename(tmp, bin); err != nil {
			t.Fatal(err)
		}
		return bin
	}
	t.Fatalf("%s zit niet in de zip", exe)
	return ""
}

func freePort(t *testing.T) int {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// startPB start een verse PocketBase met een eigen superuser en geeft hem terug.
func startPB(t *testing.T) *pb {
	t.Helper()
	bin := pbBinary(t)
	dir := t.TempDir()
	migrations, err := filepath.Abs("../pb_migrations")
	if err != nil {
		t.Fatal(err)
	}
	const email, password = "test@sandhovius.test", "test-wachtwoord-123"

	if out, err := exec.Command(bin, "superuser", "upsert", email, password,
		"--dir", dir, "--migrationsDir", migrations).CombinedOutput(); err != nil {
		t.Fatalf("superuser aanmaken mislukt: %v\n%s", err, out)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", freePort(t))
	cmd := exec.Command(bin, "serve", "--http", addr, "--dir", dir, "--migrationsDir", migrations)
	var logs bytes.Buffer
	cmd.Stdout, cmd.Stderr = &logs, &logs
	if err := cmd.Start(); err != nil {
		t.Fatalf("PocketBase starten mislukt: %v", err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		if t.Failed() {
			t.Logf("PocketBase-log:\n%s", logs.String())
		}
	})

	p := &pb{URL: "http://" + addr}
	deadline := time.Now().Add(30 * time.Second)
	for {
		resp, err := http.Get(p.URL + "/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				break
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("PocketBase werd niet gezond:\n%s", logs.String())
		}
		time.Sleep(100 * time.Millisecond)
	}
	p.AdminToken = p.login(t, "_superusers", email, password)
	return p
}

// do doet één request; token mag leeg zijn. Geen retry: de aanroeper ziet ook 429.
func (p *pb) do(t *testing.T, token, method, path string, body any) (int, map[string]any) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, p.URL+path, rdr)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

// login geeft een token. PocketBase zet met rateLimits aan ook standaardregels
// aan (bv. *:auth: enkele requests per paar seconden per IP); bij 429 wachten
// we kort en proberen opnieuw (max ~10 s), zodat fixtures achter elkaar kunnen
// inloggen onder de echte config.
func (p *pb) login(t *testing.T, collection, identity, password string) string {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		status, out := p.do(t, "", "POST", "/api/collections/"+collection+"/auth-with-password",
			map[string]any{"identity": identity, "password": password})
		if status == 200 {
			tok, _ := out["token"].(string)
			if tok == "" {
				t.Fatalf("login %s/%s: geen token in antwoord: %v", collection, identity, out)
			}
			return tok
		}
		if status == 429 && time.Now().Before(deadline) {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		t.Fatalf("login %s/%s mislukt: status %d: %v", collection, identity, status, out)
	}
}

// create maakt als superuser een record en geeft het id terug.
func (p *pb) create(t *testing.T, collection string, body map[string]any) string {
	t.Helper()
	// De standaardregel *:create (20 per 5 s) kan een fixture afremmen: bij 429
	// kort wachten en opnieuw (max ~10 s); de limiet zelf blijft aan.
	deadline := time.Now().Add(10 * time.Second)
	var status int
	var out map[string]any
	for {
		status, out = p.do(t, p.AdminToken, "POST", "/api/collections/"+collection+"/records", body)
		if status == 429 && time.Now().Before(deadline) {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		break
	}
	if status != 200 {
		t.Fatalf("create in %s mislukt: status %d: %v", collection, status, out)
	}
	id, _ := out["id"].(string)
	return id
}

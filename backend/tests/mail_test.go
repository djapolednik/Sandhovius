//go:build integration

package tests

import (
	"bufio"
	"fmt"
	"net"
	"strings"
	"sync"
	"testing"
	"time"
)

// smtpCatcher is een minimale SMTP-server die berichten bewaart.
type smtpCatcher struct {
	Port int
	mu   sync.Mutex
	msgs []string
}

func newSMTPCatcher(t *testing.T) *smtpCatcher {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	c := &smtpCatcher{Port: l.Addr().(*net.TCPAddr).Port}
	t.Cleanup(func() { l.Close() })
	go func() {
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			go c.serve(conn)
		}
	}()
	return c
}

func (c *smtpCatcher) serve(conn net.Conn) {
	defer conn.Close()
	r := bufio.NewReader(conn)
	say := func(s string) { fmt.Fprintf(conn, "%s\r\n", s) }
	say("220 test ESMTP")
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			say("250 test")
		case strings.HasPrefix(cmd, "DATA"):
			say("354 go ahead")
			var b strings.Builder
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
				b.WriteString(l)
			}
			c.mu.Lock()
			c.msgs = append(c.msgs, b.String())
			c.mu.Unlock()
			say("250 ok")
		case strings.HasPrefix(cmd, "QUIT"):
			say("221 bye")
			return
		default:
			say("250 ok")
		}
	}
}

// wait wacht tot er n berichten zijn en geeft ze terug.
func (c *smtpCatcher) wait(t *testing.T, n int) []string {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		c.mu.Lock()
		if len(c.msgs) >= n {
			out := append([]string(nil), c.msgs...)
			c.mu.Unlock()
			return out
		}
		c.mu.Unlock()
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("geen %d mail(s) ontvangen", n)
	return nil
}

// decodeMail haalt quoted-printable-vouwen weg, zodat we op tekst kunnen zoeken.
func decodeMail(m string) string {
	m = strings.ReplaceAll(m, "=\r\n", "")
	m = strings.ReplaceAll(m, "=3D", "=")
	return m
}

func mailEnv(port int) map[string]string {
	return map[string]string{
		"SMTP_HOST": "127.0.0.1", "SMTP_PORT": fmt.Sprint(port),
		"APP_URL": "http://pwa.test", "MAIL_FROM": "x@y.z",
	}
}

func settingsOf(t *testing.T, p *pb) map[string]any {
	t.Helper()
	status, out := p.do(t, p.AdminToken, "GET", "/api/settings", nil)
	if status != 200 {
		t.Fatalf("settings: status %d", status)
	}
	return out
}

func TestSMTPFromEnv(t *testing.T) {
	p := startPBEnv(t, mailEnv(2525))
	s := settingsOf(t, p)
	smtp := s["smtp"].(map[string]any)
	meta := s["meta"].(map[string]any)
	if smtp["enabled"] != true || smtp["host"] != "127.0.0.1" || smtp["port"] != float64(2525) {
		t.Errorf("smtp = %v", smtp)
	}
	if meta["appURL"] != "http://pwa.test" || meta["senderAddress"] != "x@y.z" || meta["senderName"] != "Sandhovius" {
		t.Errorf("meta = %v", meta)
	}
}

func TestNoSMTPWithoutEnv(t *testing.T) {
	p := startPB(t)
	if settingsOf(t, p)["smtp"].(map[string]any)["enabled"] != false {
		t.Error("smtp.enabled hoort uit te staan zonder SMTP_HOST")
	}
}

// requestMail vraagt een mail aan; bij 429 (rate limit) kort wachten en opnieuw.
func requestMail(t *testing.T, p *pb, endpoint, email string) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for {
		status, out := p.do(t, "", "POST", "/api/collections/users/"+endpoint, map[string]any{"email": email})
		if status == 204 {
			return
		}
		if status == 429 && time.Now().Before(deadline) {
			time.Sleep(time.Second)
			continue
		}
		t.Fatalf("%s: status %d: %v", endpoint, status, out)
	}
}

func TestMailLanguage(t *testing.T) {
	c := newSMTPCatcher(t)
	p := startPBEnv(t, mailEnv(c.Port))
	const pw = "mail-wachtwoord-123"
	p.create(t, "users", map[string]any{"email": "en@sandhovius.test", "password": pw, "passwordConfirm": pw, "language": "en"})
	p.create(t, "users", map[string]any{"email": "nl@sandhovius.test", "password": pw, "passwordConfirm": pw, "language": "nl"})
	p.create(t, "users", map[string]any{"email": "leeg@sandhovius.test", "password": pw, "passwordConfirm": pw})

	cases := []struct {
		endpoint, email, subject, link string
	}{
		{"request-verification", "en@sandhovius.test", "Confirm your email", "http://pwa.test/bevestig?token="},
		{"request-verification", "nl@sandhovius.test", "Bevestig je e-mailadres", "http://pwa.test/bevestig?token="},
		{"request-verification", "leeg@sandhovius.test", "Bevestig je e-mailadres", "http://pwa.test/bevestig?token="},
		{"request-password-reset", "en@sandhovius.test", "Reset your password", "http://pwa.test/wachtwoord?token="},
		{"request-password-reset", "nl@sandhovius.test", "Wachtwoord opnieuw instellen", "http://pwa.test/wachtwoord?token="},
		{"request-password-reset", "leeg@sandhovius.test", "Wachtwoord opnieuw instellen", "http://pwa.test/wachtwoord?token="},
	}
	// Elke aanvraag apart afwachten zodat het bericht bij de aanvraag hoort.
	for i, tc := range cases {
		requestMail(t, p, tc.endpoint, tc.email)
		msgs := c.wait(t, i+1)
		m := decodeMail(msgs[i])
		if !strings.Contains(m, tc.subject) {
			t.Errorf("%s %s: onderwerp %q ontbreekt in:\n%s", tc.endpoint, tc.email, tc.subject, m)
		}
		if !strings.Contains(m, tc.link) {
			t.Errorf("%s %s: link %q ontbreekt in:\n%s", tc.endpoint, tc.email, tc.link, m)
		}
	}
}

func TestUserLanguageField(t *testing.T) {
	p := startPB(t)
	const pw = "mail-wachtwoord-123"
	id := p.create(t, "users", map[string]any{"email": "taal@sandhovius.test", "password": pw, "passwordConfirm": pw})
	tok := p.login(t, "users", "taal@sandhovius.test", pw)
	if status, out := p.do(t, tok, "PATCH", "/api/collections/users/records/"+id, map[string]any{"language": "en"}); status != 200 {
		t.Errorf("language en: status %d: %v", status, out)
	}
	if status, _ := p.do(t, tok, "PATCH", "/api/collections/users/records/"+id, map[string]any{"language": "de"}); status != 400 {
		t.Errorf("language de: status %d, verwacht 400", status)
	}
}

func TestMailTemplatesDutch(t *testing.T) {
	p := startPB(t)
	status, out := p.do(t, p.AdminToken, "GET", "/api/collections/users", nil)
	if status != 200 {
		t.Fatalf("status %d", status)
	}
	v := out["verificationTemplate"].(map[string]any)
	r := out["resetPasswordTemplate"].(map[string]any)
	if b := v["body"].(string); !strings.Contains(b, "{APP_URL}/bevestig?token={TOKEN}") || strings.Contains(b, "/_/#/") {
		t.Errorf("verificatie-body: %s", b)
	}
	if b := r["body"].(string); !strings.Contains(b, "{APP_URL}/wachtwoord?token={TOKEN}") || strings.Contains(b, "/_/#/") {
		t.Errorf("reset-body: %s", b)
	}
	for _, s := range []any{v["subject"], r["subject"]} {
		if !strings.Contains(s.(string), "Sandhovius") {
			t.Errorf("onderwerp niet Nederlands/Sandhovius: %v", s)
		}
	}
}

//go:build integration

// Rate limits op alles wat mail verstuurt of een account aanmaakt: anders
// kan een script via ons SMTP-account onbeperkt mail sturen. Limieten gaan
// per IP (een huishouden achter één router deelt ze), dus ruim genoeg voor
// een gezin.
package tests

import (
	"fmt"
	"testing"
)

// hits doet n keer dezelfde POST en geeft de statussen terug.
func hits(t *testing.T, p *pb, path string, n int, body func(i int) map[string]any) []int {
	t.Helper()
	var statuses []int
	for i := 0; i < n; i++ {
		st, _ := p.do(t, "", "POST", path, body(i))
		statuses = append(statuses, st)
	}
	return statuses
}

func TestSignupRateLimited(t *testing.T) {
	p := startPB(t)
	st := hits(t, p, "/api/collections/users/records", 11, func(i int) map[string]any {
		email := fmt.Sprintf("u%d@sandhovius.test", i)
		return map[string]any{"email": email, "password": boxPw, "passwordConfirm": boxPw}
	})
	for i, s := range st[:10] {
		if s != 200 {
			t.Fatalf("aanmelding %d: %d, verwacht 200 (%v)", i+1, s, st)
		}
	}
	if st[10] != 429 {
		t.Fatalf("aanmelding 11: %d, verwacht 429", st[10])
	}
}

func TestResendVerificationRateLimited(t *testing.T) {
	p := startPB(t)
	newUser(t, p, "a@sandhovius.test")
	st := hits(t, p, "/api/collections/users/request-verification", 6, func(int) map[string]any {
		return map[string]any{"email": "a@sandhovius.test"}
	})
	for i, s := range st[:5] {
		if s != 204 {
			t.Fatalf("verzoek %d: %d, verwacht 204 (%v)", i+1, s, st)
		}
	}
	if st[5] != 429 {
		t.Fatalf("verzoek 6: %d, verwacht 429", st[5])
	}
}

func TestPasswordResetRateLimited(t *testing.T) {
	p := startPB(t)
	newUser(t, p, "a@sandhovius.test")
	st := hits(t, p, "/api/collections/users/request-password-reset", 6, func(int) map[string]any {
		return map[string]any{"email": "a@sandhovius.test"}
	})
	for i, s := range st[:5] {
		if s != 204 {
			t.Fatalf("verzoek %d: %d, verwacht 204 (%v)", i+1, s, st)
		}
	}
	if st[5] != 429 {
		t.Fatalf("verzoek 6: %d, verwacht 429", st[5])
	}
}

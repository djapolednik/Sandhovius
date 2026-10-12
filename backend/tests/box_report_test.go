//go:build integration

// Een box meldt zijn agentversie via /api/sandhovius/box/report. Alleen
// boxen, alleen hun eigen record, alleen versie en tijd.
package tests

import "testing"

func TestBoxReportsVersion(t *testing.T) {
	p := startPB(t)
	id := newBox(t, p, "SH-V-1")
	tok := p.login(t, "boxes", "SH-V-1", boxPw)

	st, out := p.do(t, tok, "POST", "/api/sandhovius/box/report", map[string]any{"agent_version": "v0.3.1-4-gabc1234"})
	if st != 204 {
		t.Fatalf("report: %d %v", st, out)
	}
	rec := p.boxRecord(t, id)
	if rec["agent_version"] != "v0.3.1-4-gabc1234" {
		t.Errorf("agent_version = %v", rec["agent_version"])
	}
	if s, _ := rec["reported_at"].(string); s == "" {
		t.Error("reported_at is leeg")
	}
	if rec["house"] != "" {
		t.Errorf("house veranderd: %v", rec["house"])
	}
}

func TestBoxReportRejectsOddVersion(t *testing.T) {
	p := startPB(t)
	newBox(t, p, "SH-V-1")
	tok := p.login(t, "boxes", "SH-V-1", boxPw)
	for _, v := range []any{"", "a b", "<script>", 42, "123456789012345678901234567890123456789012345678901234567890xxxxx"} {
		if st, out := p.do(t, tok, "POST", "/api/sandhovius/box/report", map[string]any{"agent_version": v}); st != 400 {
			t.Errorf("versie %v: %d %v, verwacht 400", v, st, out)
		}
	}
}

func TestUserCannotReportVersion(t *testing.T) {
	p := startPB(t)
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	if st, _ := p.do(t, tok, "POST", "/api/sandhovius/box/report", map[string]any{"agent_version": "v1"}); st != 403 && st != 401 {
		t.Errorf("bewoner kon rapporteren: %d", st)
	}
	if st, _ := p.do(t, "", "POST", "/api/sandhovius/box/report", map[string]any{"agent_version": "v1"}); st != 401 {
		t.Errorf("zonder login: %d, verwacht 401", st)
	}
}

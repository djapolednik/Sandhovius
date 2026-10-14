//go:build integration

// E2: de bewoner haalt een apparaat uit de samenvatting op Home
// (devices.summary_hidden); de box mag het niet zetten.
package tests

import "testing"

func TestSummaryHidden(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	path := "/api/collections/devices/records/" + w.DevA
	if st, out := p.do(t, w.UserATok, "PATCH", path, map[string]any{"summary_hidden": true}); st != 200 || out["summary_hidden"] != true {
		t.Fatalf("bewoner haalt de lamp uit de samenvatting: %d %v", st, out)
	}
	if st, _ := p.do(t, w.BoxATok, "PATCH", path, map[string]any{"summary_hidden": false}); st < 400 {
		t.Errorf("box zet summary_hidden: %d", st)
	}
}

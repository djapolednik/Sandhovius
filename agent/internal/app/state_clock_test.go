package app

import (
	"testing"
	"time"
)

func TestStateClockRefusesOlder(t *testing.T) {
	var c stateClock
	t1 := time.Date(2026, 10, 12, 20, 0, 1, 0, time.UTC)
	t2 := t1.Add(250 * time.Millisecond)

	if !c.advance("light.a", t2) {
		t.Fatal("eerste stand moet door")
	}
	// Een reconcile die een oudere stand ophaalde, komt na het nieuwere event.
	if c.advance("light.a", t1) {
		t.Error("oudere stand mag niet door")
	}
	// Dezelfde stand nog een keer (afstemmen na herverbinden) mag wel.
	if !c.advance("light.a", t2) {
		t.Error("gelijke tijd moet door")
	}
	// Per entity: een ander apparaat heeft zijn eigen klok.
	if !c.advance("light.b", t1) {
		t.Error("ander apparaat moet door")
	}
	// Zonder tijd (oude bron) altijd door, en de klok blijft staan.
	if !c.advance("light.a", time.Time{}) || c.advance("light.a", t1) {
		t.Error("zonder tijd: door, en de klok niet terugzetten")
	}
}

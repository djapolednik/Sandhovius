package app

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestHelpersRemovedOnce(t *testing.T) {
	flag := filepath.Join(t.TempDir(), "helpers_removed")
	calls := 0
	del := func() (int, error) { calls++; return 2, nil }

	if err := removeHelpersOnce(flag, del); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatalf("DeleteHelpers %d keer aangeroepen, verwacht 1", calls)
	}
	if _, err := os.Stat(flag); err != nil {
		t.Fatalf("vlag niet geschreven: %v", err)
	}
	if err := removeHelpersOnce(flag, del); err != nil || calls != 1 {
		t.Errorf("tweede start: err=%v, aanroepen=%d", err, calls)
	}
}

func TestHelpersRetryAfterFailure(t *testing.T) {
	flag := filepath.Join(t.TempDir(), "helpers_removed")
	fail := func() (int, error) { return 0, errors.New("HA weg") }
	if err := removeHelpersOnce(flag, fail); err == nil {
		t.Error("verwacht een fout")
	}
	if _, err := os.Stat(flag); err == nil {
		t.Error("vlag geschreven terwijl verwijderen mislukte: de volgende start moet het opnieuw proberen")
	}
}

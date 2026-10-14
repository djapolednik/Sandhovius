package app

import (
	"fmt"
	"log"
	"os"
)

// removeHelpersOnce verwijdert de virtuele apparaten van vóór het koppelen
// (input_boolean- en input_number-helpers in HA) één keer: daarna staat er
// een vlagbestand. Mislukt het, dan geen vlag, zodat de volgende start het
// opnieuw probeert.
func removeHelpersOnce(flagPath string, deleteHelpers func() (int, error)) error {
	if _, err := os.Stat(flagPath); err == nil {
		return nil
	}
	n, err := deleteHelpers()
	if err != nil {
		return fmt.Errorf("helpers verwijderen: %w", err)
	}
	if err := os.WriteFile(flagPath, []byte("ok\n"), 0o600); err != nil {
		return fmt.Errorf("vlag schrijven: %w", err)
	}
	log.Printf("[APP] %d virtuele helpers uit Home Assistant verwijderd\n", n)
	return nil
}

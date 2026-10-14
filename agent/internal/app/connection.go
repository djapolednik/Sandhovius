package app

import (
	"context"
	"log"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// onPocketBaseConnected brengt PocketBase weer bij na een (her)verbinding:
// bij het opstarten en na elke uitval van de command-stroom. Wat er in de
// tussentijd gebeurde zit in geen enkele event-stroom, dus alles één keer
// actief ophalen. Een stap die mislukt houdt de rest niet tegen.
//
// recoverMu zorgt dat twee herstelstappen (verbindingslus en listener op
// hetzelfde moment) na elkaar lopen; handleCommand voert alleen "pending"
// uit, dus een commando dat de eerste al deed slaat de tweede over.
func (a *Agent) onPocketBaseConnected() {
	a.recoverMu.Lock()
	defer a.recoverMu.Unlock()

	// Net losgekoppeld (tussen het laden van "registered" en hier): geen
	// huis meer, dus niets bij te werken. Anders een PATCH op
	// houses/records/ zonder id.
	if a.house() == "" {
		return
	}

	if err := a.pbClient.SetGatewayStatus(a.house(), "online"); err != nil {
		log.Printf("[APP] Gateway online zetten mislukt: %v\n", err)
	}

	devices, err := a.devices.refresh()
	if err != nil {
		log.Printf("[APP] Kon device-cache niet opwarmen: %v\n", err)
	}
	a.warmDeviceNames(devices)

	// Wat er veranderde terwijl PocketBase weg was, zit niet in de
	// event-stroom: één keer de actuele stand van elk device ophalen.
	a.reconcileDeviceStates()

	a.catchUpPendingCommands()

	// Een koppelsessie van vóór een herstart: opruimen.
	a.pairing.recover()
}

// retryWithBackoff probeert attempt tot het lukt, met een wachttijd die
// van minWait verdubbelt tot maxWait. Geeft false als ctx eerder klaar is.
func retryWithBackoff(ctx context.Context, minWait, maxWait time.Duration, attempt func() error) bool {
	wait := minWait
	for {
		err := attempt()
		if err == nil {
			return true
		}
		log.Printf("[APP] PocketBase niet bereikbaar: %v — opnieuw over %s\n", err, wait)
		select {
		case <-ctx.Done():
			return false
		case <-time.After(wait):
		}
		wait = min(wait*2, maxWait)
	}
}

// runPocketBase verbindt met PocketBase zodra het kan: inloggen, het huis
// uit het box-record nemen, en dan de herstelstap. De agent draait
// intussen gewoon lokaal door. Na de eerste keer neemt de command-stroom
// het herverbinden over (onCommandStreamSubscribed).
func (a *Agent) runPocketBase() {
	var record *pocketbase.BoxRecord
	ok := retryWithBackoff(a.ctx, time.Second, 30*time.Second, func() error {
		var err error
		record, err = a.pbClient.Login()
		return err
	})
	if !ok {
		return // Stop() is aangeroepen
	}
	log.Println("[APP] Verbonden met PocketBase")
	a.applyHouse(record.House)
	a.runHouseCheck()
}

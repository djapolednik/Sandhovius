package app

import "log"

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
}

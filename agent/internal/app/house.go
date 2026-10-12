package app

import (
	"log"
	"time"

	"sandhovius/local-agent/internal/box"
	"sandhovius/local-agent/internal/pocketbase"
)

// houseCheckInterval is hoe vaak de box bij PocketBase navraagt aan welk
// huis hij gekoppeld is, met of zonder huis. Normaal komt een claim of een
// loskoppeling binnen een seconde via de realtime-stroom op het eigen
// box-record (listenForHouseChanges); deze ronde is het vangnet als die
// stroom weg is.
const houseCheckInterval = 5 * time.Minute

// applyHouse verwerkt het huis uit het box-record. Geen verandering (en
// leeg, of al verbonden) doet niets. Anders wordt het huis onthouden, ook in
// het identiteitsbestand zodat de box na een herstart zonder PocketBase weet
// bij welk huis hij hoort. Leeg betekent: alleen lokaal draaien. Een huis
// (nieuw, of anders dan eerst) start de herstelstap.
func (a *Agent) applyHouse(house string) {
	// Opstarten, de poll en de stroom kunnen tegelijk hetzelfde huis
	// melden: één tegelijk, anders start de herstelstap meer dan eens.
	a.applyHouseMu.Lock()
	defer a.applyHouseMu.Unlock()
	if house == a.house() && (house == "" || a.registered.Load()) {
		return
	}
	// Loskoppelen: eerst registered uit, dan het huis leeg, zodat hartslag en
	// herstelstap nooit met een leeg huis-ID aan het werk gaan. Claimen of
	// wisselen: eerst het huis, dan registered.
	if house == "" {
		a.registered.Store(false)
	}
	a.setHouse(house)
	// De cache hoort bij het vorige huis; de herstelstap vult hem opnieuw.
	a.devices.clear()
	if err := box.SaveHouse(a.boxFile, house); err != nil {
		log.Printf("[APP] Kon huis niet opslaan in %s: %v\n", a.boxFile, err)
	}
	if house == "" {
		log.Println("[APP] Box heeft geen huis: alleen lokaal")
		return
	}
	a.registered.Store(true)
	log.Printf("[APP] Box hoort bij huis %s\n", house)
	a.onConnected()
}

// runHouseCheck vraagt elke houseCheckInterval het box-record op en past een
// gewijzigd huis toe. Stopt als de agent stopt.
func (a *Agent) runHouseCheck() {
	ticker := time.NewTicker(houseCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.checkHouse()
		}
	}
}

// checkHouse vraagt het box-record op en past het huis toe. Een fout wordt
// gelogd; de volgende ronde of herverbinding probeert het opnieuw.
func (a *Agent) checkHouse() {
	record, err := a.pbClient.RefreshBox()
	if err != nil {
		log.Printf("[APP] Huis van de box opvragen mislukt: %v\n", err)
		return
	}
	a.applyHouse(record.House)
}

// SetVersion zet de agentversie (main krijgt hem bij het bouwen via
// -ldflags). Vóór Start aanroepen.
func (a *Agent) SetVersion(version string) { a.version = version }

// Version is de agentversie; "dev" als hij niet bij het bouwen gezet is.
func (a *Agent) Version() string {
	if a.version == "" {
		return "dev"
	}
	return a.version
}

// reportVersion meldt de agentversie aan PocketBase (box-record:
// agent_version, reported_at). Een fout wordt gelogd; de volgende
// herverbinding meldt opnieuw.
func (a *Agent) reportVersion() {
	if err := a.pbClient.ReportBox(a.Version()); err != nil {
		log.Printf("[APP] Versie melden mislukt: %v\n", err)
	}
}

// listenForHouseChanges volgt het eigen box-record via realtime: koppelen,
// loskoppelen of wisselen komt zo meteen binnen. Bij elke (her)aanmelding
// eerst één keer het record lezen, voor wat er veranderde terwijl de stroom
// weg was, en de agentversie melden (de versie verandert alleen bij een
// herstart, dus dat is vaak genoeg). Blijft herverbinden totdat de agent
// stopt.
func (a *Agent) listenForHouseChanges() {
	onSubscribed := func() {
		a.checkHouse()
		a.reportVersion()
	}
	for {
		err := a.pbClient.SubscribeBox(a.ctx, onSubscribed, func(event pocketbase.BoxEvent) {
			if event.EventType == "update" {
				a.applyHouse(event.Record.House)
			}
		})
		if a.ctx.Err() != nil {
			return // Stop() is aangeroepen
		}
		log.Printf("[APP] Box-stream verbroken: %v — probeer over 5s opnieuw\n", err)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

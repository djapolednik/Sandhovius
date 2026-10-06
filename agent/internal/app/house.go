package app

import (
	"log"
	"time"

	"sandhovius/local-agent/internal/box"
)

// houseCheckInterval is hoe vaak de box bij PocketBase navraagt aan welk
// huis hij gekoppeld is, met of zonder huis: zo volgt hij een claim, een
// loskoppeling of een andere koppeling zonder herstart.
const houseCheckInterval = 5 * time.Minute

// applyHouse verwerkt het huis uit het box-record. Geen verandering (en
// leeg, of al verbonden) doet niets. Anders wordt het huis onthouden, ook in
// het identiteitsbestand zodat de box na een herstart zonder PocketBase weet
// bij welk huis hij hoort. Leeg betekent: alleen lokaal draaien. Een huis
// (nieuw, of anders dan eerst) start de herstelstap.
func (a *Agent) applyHouse(house string) {
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
// gewijzigd huis toe. Een fout wordt gelogd; de volgende ronde probeert het
// opnieuw. Stopt als de agent stopt.
func (a *Agent) runHouseCheck() {
	ticker := time.NewTicker(houseCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			record, err := a.pbClient.RefreshBox()
			if err != nil {
				log.Printf("[APP] Huis van de box opvragen mislukt: %v\n", err)
				continue
			}
			a.applyHouse(record.House)
		}
	}
}

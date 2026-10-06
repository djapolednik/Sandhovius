package app

import (
	"errors"
	"log"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// commandMaxAge is hoe lang een openstaand commando na een uitval nog wordt
// uitgevoerd. De PWA blokkeert schakelen al na 90 s zonder hartslag; wie
// langer geleden tikte, verwacht niet dat de lamp nu alsnog aangaat.
const commandMaxAge = 2 * time.Minute

// pocketbaseTime is hoe PocketBase datums teruggeeft: met een spatie, niet
// met de "T" van RFC 3339.
const pocketbaseTime = "2006-01-02 15:04:05.000Z"

// commandExpired zegt of een openstaand commando te oud is om nog uit te
// voeren. Klaarzetten (provision) is niet tijdgevoelig en verloopt nooit.
// Zonder leesbare created-tijd (records van vóór die migratie) geldt een
// commando als verlopen: dan weten we niet hoe oud het is.
func commandExpired(cmd pocketbase.Command, now time.Time) bool {
	if cmd.Action == "provision" {
		return false
	}
	created, err := time.Parse(pocketbaseTime, cmd.Created)
	if err != nil {
		created, err = time.Parse(time.RFC3339, cmd.Created)
		if err != nil {
			return true
		}
	}
	return now.Sub(created) > commandMaxAge
}

// failIfExpired markeert een te oud commando als mislukt. Geldt voor
// inhalen én realtime: bij een korte uitval blijft de TCP-verbinding soms
// leven en komt een event pas na het herstel binnen. Pas aanroepen na de
// huis-check, anders markeert deze box andermans commando's.
func (a *Agent) failIfExpired(cmd pocketbase.Command) bool {
	if !commandExpired(cmd, time.Now()) {
		return false
	}
	log.Printf("[APP] Commando %s is verlopen (aangemaakt %q)\n", cmd.ID, cmd.Created)
	a.failCommand(cmd.ID, errors.New("verlopen: de box was te lang niet bereikbaar"))
	return true
}

// claimCommand geeft true voor precies één aanroep per commando-ID. Sinds
// de herstelstap ná het subscriben draait, kunnen realtime en inhalen
// hetzelfde nog-"pending" commando tegelijk zien. ponytail: de set groeit
// met één ID per commando; dat is klein, en een herstart leegt hem.
func (a *Agent) claimCommand(id string) bool {
	_, dup := a.handledCommands.LoadOrStore(id, struct{}{})
	return !dup
}

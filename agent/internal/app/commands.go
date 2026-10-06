package app

import (
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

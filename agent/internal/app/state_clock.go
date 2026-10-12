package app

import (
	"sync"
	"time"
)

// stateClock onthoudt per entity de tijd (HA's last_updated) van de laatst
// doorgestuurde stand. Een reconcile (GetState) kan na een nieuwer
// state_changed event aankomen; zonder deze klok zou die oudere stand het
// laatst in PocketBase staan. Zelfde idee als Matter's DataVersion.
type stateClock struct {
	// mu dekt ook het doorsturen zelf (forwardHAEvent): controleren en
	// schrijven moeten samen gebeuren, anders haalt een oudere schrijf-
	// actie een nieuwere alsnog in.
	mu   sync.Mutex
	seen map[string]time.Time
}

// advance zegt of een stand met tijd ts door mag, en schuift de klok op.
// Gelijke tijd mag (opnieuw afstemmen); zonder tijd altijd, de klok blijft
// dan staan. De aanroeper houdt mu vast.
func (c *stateClock) advance(entityID string, ts time.Time) bool {
	if ts.IsZero() {
		return true
	}
	if ts.Before(c.seen[entityID]) {
		return false
	}
	if c.seen == nil {
		c.seen = map[string]time.Time{}
	}
	c.seen[entityID] = ts
	return true
}

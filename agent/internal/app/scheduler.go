package app

import (
	"fmt"
	"log"
	"slices"
	"time"

	// Tijdzone-database in de binary: time.Local en LoadLocation werken dan
	// ook in een kaal image zonder /usr/share/zoneinfo.
	_ "time/tzdata"

	"sandhovius/local-agent/internal/pocketbase"
)

// weekdayKeys vertaalt time.Weekday (zondag = 0) naar de waarden van
// schedules.days.
var weekdayKeys = [...]string{"sun", "mon", "tue", "wed", "thu", "fri", "sat"}

// dueSchedules geeft de schema's die in de minuut van now moeten lopen. Een
// tijd-schema vergelijkt op het lokale "15:04"-label: een tijd die door de
// zomertijd niet bestaat, loopt die nacht dus niet. Een zon-schema loopt op
// de berekende minuut (sun.go), en zonder locatie (loc nil) niet.
func dueSchedules(schedules []pocketbase.Schedule, now time.Time, loc *homeLocation) []pocketbase.Schedule {
	minute := now.Format("15:04")
	day := weekdayKeys[now.Weekday()]
	var due []pocketbase.Schedule
	for _, s := range schedules {
		if !s.Enabled {
			continue
		}
		if isSunTrigger(s) {
			if sunDue(s, now, loc) {
				due = append(due, s)
			}
		} else if s.Time == minute && slices.Contains(s.Days, day) {
			due = append(due, s)
		}
	}
	return due
}

// scheduleSnapshot is alles wat nodig is om schema's en bewegingslichten uit
// te voeren zonder PocketBase: de schema's, scènes, bewegingslichten en
// devices van dit huis.
type scheduleSnapshot struct {
	schedules    []pocketbase.Schedule
	scenes       map[string]pocketbase.Scene
	motionLights []pocketbase.MotionLight
	devices      map[string]pocketbase.Device
	// location: waar het huis staat (HA), voor zon-schema's; nil = onbekend.
	location *homeLocation
	// automations: de routines van dit huis (routine.go).
	automations []pocketbase.Automation
}

func (s *scheduleSnapshot) lookupDevice(id string) (*pocketbase.Device, error) {
	device, ok := s.devices[id]
	if !ok {
		return nil, fmt.Errorf("apparaat bestaat niet (meer)")
	}
	return &device, nil
}

// scheduler is de klok: elke minuut één tick. fetch, run en save zijn
// functies zodat de tests zonder PocketBase, Home Assistant en schijf
// kunnen. save en fresh mogen nil zijn; fresh krijgt elke nieuwe snapshot
// (de bewegingslichten).
type scheduler struct {
	fetch func() (*scheduleSnapshot, error)
	run   func(snap *scheduleSnapshot, s pocketbase.Schedule, now time.Time)
	save  func(snap *scheduleSnapshot) error
	fresh func(snap *scheduleSnapshot)
	// minute krijgt elke minuut de tik, na de schema's (routines; mag nil zijn).
	minute func(snap *scheduleSnapshot, now time.Time)
	// nextRun schrijft next_run van een zon-schema (mag nil zijn).
	nextRun    func(u scheduleUpdate)
	snap       *scheduleSnapshot
	lastMinute string
}

// tick ververst de snapshot (lukt dat niet, dan geldt de vorige) en voert
// uit wat nu aan de beurt is. Elke minuut hooguit één keer.
func (s *scheduler) tick(now time.Time) {
	minute := now.Format("2006-01-02 15:04")
	if minute == s.lastMinute {
		return
	}
	s.lastMinute = minute

	if fresh, err := s.fetch(); err != nil {
		log.Printf("[SCHEMA] Schema's verversen mislukt, laatst bekende worden gebruikt: %v\n", err)
	} else {
		s.snap = fresh
		if s.fresh != nil {
			s.fresh(fresh)
		}
		// Opslaan is bijzaak: een volle schijf mag een schema niet
		// tegenhouden, dus alleen loggen.
		if s.save != nil {
			if err := s.save(fresh); err != nil {
				log.Printf("[SCHEMA] Schema's opslaan mislukt: %v\n", err)
			}
		}
	}
	if s.snap == nil {
		return
	}
	for _, due := range dueSchedules(s.snap.schedules, now, s.snap.location) {
		s.run(s.snap, due, now)
	}
	if s.minute != nil {
		s.minute(s.snap, now)
	}
	// Zodat de app "vandaag om 18:42" kan zeggen. In de snapshot meteen
	// bijwerken: de volgende tik schrijft het dan niet nog eens.
	if s.nextRun != nil {
		for _, u := range nextRunUpdates(s.snap.schedules, now, s.snap.location) {
			s.nextRun(u)
			for i := range s.snap.schedules {
				if s.snap.schedules[i].ID == u.ID {
					s.snap.schedules[i].NextRun = u.NextRun
					if u.LastError != nil {
						s.snap.schedules[i].LastError = *u.LastError
					}
				}
			}
		}
	}
}

// runScheduler tikt op elke minuutgrens tot de agent stopt.
//
// ponytail: een tick die langer dan een minuut duurt (trage HA), slaat de
// volgende minuut over; REST-calls naar PocketBase hebben een timeout van
// 15 s, dus dat gebeurt alleen als Home Assistant zelf hangt.
func (a *Agent) runScheduler() {
	loaded := a.loadScheduleSnapshot()
	// De bewegingslichten uit het bestand gelden meteen, ook zonder
	// PocketBase; daarna geeft elke geslaagde fetch ze opnieuw door.
	a.motion.start(a.house(), loaded)
	a.adaptive.apply(loaded)
	a.routines.start(a.house(), loaded)
	s := &scheduler{
		snap:  loaded,
		fetch: a.fetchScheduleSnapshot,
		run:   a.runSchedule,
		fresh: func(snap *scheduleSnapshot) {
			a.motion.apply(snap)
			a.adaptive.apply(snap)
			a.routines.apply(snap)
		},
		minute: a.routineMinute,
		nextRun: func(u scheduleUpdate) {
			// Op de achtergrond: zonder internet mag het de klok niet ophouden.
			go func() {
				if err := a.pbClient.SetScheduleNextRun(u.ID, u.NextRun, u.LastError); err != nil {
					log.Printf("[SCHEMA] Kon de volgende keer van schema %s niet opslaan: %v\n", u.ID, err)
				}
			}()
		},
		save: func(snap *scheduleSnapshot) error {
			if a.house() == "" {
				return nil // niets om te bewaren zonder huis
			}
			return saveSnapshot(a.schedulesFile, a.house(), snap, time.Now())
		},
	}
	var next time.Time
	for {
		next = nextTick(time.Now(), next)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		// De bedoelde minuut, niet time.Now(): de timer gaat soms een paar
		// ms vóór de grens af, en dan zou het schema pas een minuut later
		// lopen.
		s.tick(next)
	}
}

// nextTick is de eerstvolgende minuutgrens na now, maar altijd later dan
// prev (de vorige tick): wordt de timer een paar ms te vroeg wakker, dan
// komt dezelfde minuut niet nog een keer aan de beurt.
func nextTick(now, prev time.Time) time.Time {
	next := now.Truncate(time.Minute).Add(time.Minute)
	if !next.After(prev) {
		next = prev.Add(time.Minute)
	}
	return next
}

func (a *Agent) fetchScheduleSnapshot() (*scheduleSnapshot, error) {
	house := a.house()
	if house == "" {
		// Geen huis (losgekoppeld): een lege snapshot, zodat schema's van
		// het vorige huis niet blijven lopen. Een fout zou de oude houden.
		return &scheduleSnapshot{}, nil
	}
	schedules, err := a.pbClient.ListSchedules(house)
	if err != nil {
		return nil, err
	}
	scenes, err := a.pbClient.ListScenes(house)
	if err != nil {
		return nil, err
	}
	automations, err := a.pbClient.ListAutomations(house)
	if err != nil {
		return nil, err
	}
	motionLights, err := a.pbClient.ListMotionLights(house)
	if err != nil {
		return nil, err
	}
	devices, err := a.pbClient.ListHouseDevices(house)
	if err != nil {
		return nil, err
	}
	snap := &scheduleSnapshot{
		schedules:    schedules,
		motionLights: motionLights,
		location:     a.homeLocation(),
		automations:  automations,
		scenes:       make(map[string]pocketbase.Scene, len(scenes)),
		devices:      make(map[string]pocketbase.Device, len(devices)),
	}
	for _, scene := range scenes {
		snap.scenes[scene.ID] = scene
	}
	for _, device := range devices {
		snap.devices[device.ID] = device
	}
	return snap, nil
}

// runSchedule voert de scène van een schema uit en meldt het resultaat
// daarna aan PocketBase. Dat melden gebeurt op de achtergrond: zonder
// internet mag het de klok niet ophouden.
func (a *Agent) runSchedule(snap *scheduleSnapshot, s pocketbase.Schedule, now time.Time) {
	var err error
	scene, ok := snap.scenes[s.Scene]
	if !ok {
		err = fmt.Errorf("scène bestaat niet (meer)")
	} else {
		err = a.executeScene(scene, snap.lookupDevice)
	}
	when := s.Time
	if isSunTrigger(s) {
		when = fmt.Sprintf("%s %+d min", s.Trigger, s.OffsetMin)
	}
	if err != nil {
		log.Printf("[SCHEMA] Schema %s (%s) niet helemaal gelukt: %v\n", s.ID, when, err)
	} else {
		log.Printf("[SCHEMA] Scène %q uitgevoerd door schema %s (%s)\n", scene.Name, s.ID, when)
	}
	go func() {
		if markErr := a.pbClient.MarkScheduleRun(s.ID, now, err); markErr != nil {
			log.Printf("[SCHEMA] Kon resultaat van schema %s niet opslaan: %v\n", s.ID, markErr)
		}
	}()
}

package app

import (
	"errors"
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

// dueSchedules geeft de schema's die in de minuut van now moeten lopen.
// Vergelijkt op het lokale "15:04"-label: een tijd die door de zomertijd
// niet bestaat, loopt die nacht dus niet.
func dueSchedules(schedules []pocketbase.Schedule, now time.Time) []pocketbase.Schedule {
	minute := now.Format("15:04")
	day := weekdayKeys[now.Weekday()]
	var due []pocketbase.Schedule
	for _, s := range schedules {
		if s.Enabled && s.Time == minute && slices.Contains(s.Days, day) {
			due = append(due, s)
		}
	}
	return due
}

// scheduleSnapshot is alles wat nodig is om schema's uit te voeren zonder
// PocketBase: de schema's, scènes en devices van dit huis.
type scheduleSnapshot struct {
	schedules []pocketbase.Schedule
	scenes    map[string]pocketbase.Scene
	devices   map[string]pocketbase.Device
}

func (s *scheduleSnapshot) lookupDevice(id string) (*pocketbase.Device, error) {
	device, ok := s.devices[id]
	if !ok {
		return nil, fmt.Errorf("apparaat bestaat niet (meer)")
	}
	return &device, nil
}

// scheduler is de klok: elke minuut één tick. fetch en run zijn functies
// zodat de tests zonder PocketBase en Home Assistant kunnen.
type scheduler struct {
	fetch      func() (*scheduleSnapshot, error)
	run        func(snap *scheduleSnapshot, s pocketbase.Schedule, now time.Time)
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
	}
	if s.snap == nil {
		return
	}
	for _, due := range dueSchedules(s.snap.schedules, now) {
		s.run(s.snap, due, now)
	}
}

// runScheduler tikt op elke minuutgrens tot de agent stopt.
//
// ponytail: een tick die langer dan een minuut duurt (trage HA), slaat de
// volgende minuut over; REST-calls naar PocketBase hebben een timeout van
// 15 s, dus dat gebeurt alleen als Home Assistant zelf hangt.
func (a *Agent) runScheduler() {
	s := &scheduler{fetch: a.fetchScheduleSnapshot, run: a.runSchedule}
	for {
		next := time.Now().Truncate(time.Minute).Add(time.Minute)
		select {
		case <-a.ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		s.tick(time.Now())
	}
}

func (a *Agent) fetchScheduleSnapshot() (*scheduleSnapshot, error) {
	house := a.house()
	if house == "" {
		return nil, errors.New("nog geen huis bekend")
	}
	schedules, err := a.pbClient.ListSchedules(house)
	if err != nil {
		return nil, err
	}
	scenes, err := a.pbClient.ListScenes(house)
	if err != nil {
		return nil, err
	}
	devices, err := a.pbClient.ListHouseDevices(house)
	if err != nil {
		return nil, err
	}
	snap := &scheduleSnapshot{
		schedules: schedules,
		scenes:    make(map[string]pocketbase.Scene, len(scenes)),
		devices:   make(map[string]pocketbase.Device, len(devices)),
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
	if err != nil {
		log.Printf("[SCHEMA] Schema %s (%s) niet helemaal gelukt: %v\n", s.ID, s.Time, err)
	} else {
		log.Printf("[SCHEMA] Scène %q uitgevoerd door schema %s (%s)\n", scene.Name, s.ID, s.Time)
	}
	go func() {
		if markErr := a.pbClient.MarkScheduleRun(s.ID, now, err); markErr != nil {
			log.Printf("[SCHEMA] Kon resultaat van schema %s niet opslaan: %v\n", s.ID, markErr)
		}
	}()
}

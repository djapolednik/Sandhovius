package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"slices"
	"sync"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// routineRunner zet de routine-motor (routine.go) in de agent: standen uit de
// event-stroom, de klok van de scheduler, uitvoeren via scène-stappen, en wie
// welke lamp bezit op schijf. Alles komt uit het schema-snapshot, dus het
// werkt zonder PocketBase. Een nil-runner doet niets.
type routineRunner struct {
	mu       sync.Mutex
	engine   *routineEngine
	house    string
	devices  map[string]pb.Device // device-id → device
	scenes   map[string]pb.Scene
	byEntity map[string]string // entity_id of zigbee-sleutel → device-id
	file     string
	saved    string
	// members en presence (lid → rij): de stand voor thuis/weg, uit het
	// snapshot en realtime samengevoegd (de nieuwste rij per lid wint).
	members  []string
	presence map[string]pb.Presence

	// step voert één apparaatstap uit, scene een hele scène, report meldt
	// het resultaat aan PocketBase. Functies, zodat tests zonder HA kunnen.
	step   func(house string, action pb.SceneAction, lookup func(string) (*pb.Device, error)) error
	scene  func(scene pb.Scene, lookup func(string) (*pb.Device, error)) error
	report func(routine string, err error)

	// Meldingen (notify.go): push verstuurt één bericht (nil = meldingen
	// uit), gone ruimt een aanmelding op die de pushdienst niet meer kent.
	notifier *notifier
	pushKey  string
	push     func(m pushMessage) error
	gone     func(subscription string)
}

type routineFile struct {
	House  string                          `json:"house"`
	Owners map[string]map[string]time.Time `json:"owners"`
}

func newRoutineRunner(file string) *routineRunner {
	return &routineRunner{
		engine:   newRoutineEngine(),
		devices:  map[string]pb.Device{},
		scenes:   map[string]pb.Scene{},
		byEntity: map[string]string{},
		presence: map[string]pb.Presence{},
		notifier: newNotifier(),
		file:     file,
	}
}

// start: bij het opstarten, met het snapshot uit het bestand (mag nil zijn),
// en het eigenaarschap van vóór de herstart.
func (r *routineRunner) start(house string, snap *scheduleSnapshot) {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.house = house
	r.applyLocked(snap, time.Now()) // de eerste stand start niets
	if owners := r.loadLocked(house); owners != nil {
		r.engine.restore(owners)
	}
}

func (r *routineRunner) apply(snap *scheduleSnapshot) {
	if r == nil {
		return
	}
	r.mu.Lock()
	res := r.applyLocked(snap, time.Now())
	r.saveLocked()
	work := r.prepareLocked(res)
	r.mu.Unlock()
	r.execute(work)
}

// setPushKey: de publieke sleutel van deze box; alleen aanmeldingen met deze
// sleutel krijgen meldingen.
func (r *routineRunner) setPushKey(key string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.pushKey = key
	r.notifier.key = key
}

// applyLocked: een nieuw snapshot. Thuis/weg kan daarin veranderd zijn (als
// de realtime-melding gemist werd), dus er kan een routine uit komen.
func (r *routineRunner) applyLocked(snap *scheduleSnapshot, now time.Time) routineResult {
	if snap == nil {
		snap = &scheduleSnapshot{}
	}
	r.devices, r.scenes, r.byEntity = map[string]pb.Device{}, map[string]pb.Scene{}, map[string]string{}
	for id, d := range snap.devices {
		r.devices[id] = d
		if d.EntityID != "" {
			r.byEntity[d.EntityID] = id
		}
		if d.Source == "zigbee" && d.Address != "" && d.EntityID == "" {
			r.byEntity[zigbeeKey(d.Address)] = id
		}
	}
	for id, s := range snap.scenes {
		r.scenes[id] = s
	}
	r.engine.setRoutines(snap.automations)
	r.engine.setLocation(snap.location)
	r.notifier.set(r.pushKey, snap.subscriptions, snap.notifyRules)
	r.members = snap.members
	for _, row := range snap.presence {
		r.mergePresenceLocked(row)
	}
	for user := range r.presence {
		if !slices.Contains(r.members, user) {
			delete(r.presence, user)
		}
	}
	return r.engine.setPresence(r.members, r.presenceRowsLocked(), now)
}

// mergePresenceLocked: een rij, tenzij er al een nieuwere is.
func (r *routineRunner) mergePresenceLocked(row pb.Presence) {
	if have, ok := r.presence[row.User]; ok && have.Updated > row.Updated {
		return
	}
	r.presence[row.User] = row
}

func (r *routineRunner) presenceRowsLocked() []pb.Presence {
	rows := make([]pb.Presence, 0, len(r.presence))
	for _, row := range r.presence {
		rows = append(rows, row)
	}
	return rows
}

// onPresence: een realtime-melding op presence. Een verwijderde rij = thuis.
func (r *routineRunner) onPresence(event pb.PresenceEvent, now time.Time) {
	if r == nil {
		return
	}
	row := event.Record
	r.mu.Lock()
	if row.House != r.house {
		r.mu.Unlock()
		return
	}
	if event.EventType == "delete" {
		delete(r.presence, row.User)
	} else {
		r.mergePresenceLocked(row)
	}
	res := r.engine.setPresence(r.members, r.presenceRowsLocked(), now)
	work := r.prepareLocked(res)
	r.mu.Unlock()
	r.execute(work)
}

// onState: een stand van HA (entity_id) of Zigbee2MQTT (zigbee-sleutel).
func (r *routineRunner) onState(entity string, state map[string]any, now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	id, ok := r.byEntity[entity]
	if !ok {
		r.mu.Unlock()
		return
	}
	res := r.engine.onDevice(id, state, now)
	r.saveLocked()
	work := r.prepareLocked(res)
	if device, ok := r.devices[id]; ok && len(res.Events) > 0 {
		work.messages = r.notifier.onDevice(device, res.Events, !r.engine.someoneHome(), now)
	}
	r.mu.Unlock()
	r.execute(work)
}

// tick: elke minuut, vanuit de scheduler.
func (r *routineRunner) tick(now time.Time) {
	if r == nil {
		return
	}
	r.mu.Lock()
	res := r.engine.tick(now)
	r.saveLocked()
	work := r.prepareLocked(res)
	r.mu.Unlock()
	r.execute(work)
}

type routineWork struct {
	res     routineResult
	house   string
	devices map[string]pb.Device
	scenes  map[string]pb.Scene
	// messages: meldingen bij een gebeurtenis (lek, rook, Meld dit).
	messages []pushMessage
	// notify: per routine en per actie-index de berichten van "Stuur een
	// melding", onder de lock bepaald.
	notify map[string]map[int][]pushMessage
}

func (r *routineRunner) prepareLocked(res routineResult) routineWork {
	w := routineWork{res: res, house: r.house, devices: r.devices, scenes: r.scenes, notify: map[string]map[int][]pushMessage{}}
	for _, run := range res.Runs {
		for i, a := range run.Actions {
			if a.Kind != "notify" {
				continue
			}
			if w.notify[run.Routine] == nil {
				w.notify[run.Routine] = map[int][]pushMessage{}
			}
			w.notify[run.Routine][i] = r.notifier.forRoutine(a.Text, a.Users)
		}
	}
	return w
}

// sendAll verstuurt berichten; een verlopen aanmelding wordt opgeruimd. De
// fout zegt hoeveel er niet lukten (nil als alles lukte of er niets was).
func (r *routineRunner) sendAll(messages []pushMessage) error {
	if r.push == nil || len(messages) == 0 {
		return nil
	}
	failed := 0
	for _, m := range messages {
		err := r.push(m)
		switch {
		case errors.Is(err, errSubscriptionGone):
			log.Printf("[MELDING] Aanmelding %s bestaat niet meer, opruimen\n", m.Sub.ID)
			if r.gone != nil {
				go r.gone(m.Sub.ID)
			}
		case err != nil:
			failed++
			log.Printf("[MELDING] Naar aanmelding %s mislukt: %v\n", m.Sub.ID, err)
		}
	}
	if failed > 0 {
		return fmt.Errorf("%d van %d meldingen niet verstuurd", failed, len(messages))
	}
	return nil
}

// execute buiten de lock: een trage Home Assistant mag de event-stroom niet
// ophouden. Een routine meldt "gedeeltelijk gelukt" als last_error zegt welke
// stap niet lukte.
func (r *routineRunner) execute(w routineWork) {
	lookup := func(id string) (*pb.Device, error) {
		d, ok := w.devices[id]
		if !ok {
			return nil, fmt.Errorf("apparaat bestaat niet (meer)")
		}
		return &d, nil
	}
	if err := r.sendAll(w.messages); err != nil {
		log.Printf("[MELDING] %v\n", err)
	}
	for _, run := range w.res.Runs {
		var failures []error
		for i, a := range run.Actions {
			var err error
			switch a.Kind {
			case "notify":
				err = r.sendAll(w.notify[run.Routine][i])
			case "device":
				err = r.step(w.house, pb.SceneAction{Device: a.Device, Action: a.Action, Payload: a.Payload}, lookup)
			case "scene":
				scene, ok := w.scenes[a.Scene]
				if !ok {
					err = fmt.Errorf("scène bestaat niet (meer)")
				} else {
					err = r.scene(scene, lookup)
				}
			default:
				err = fmt.Errorf("onbekende actie %q", a.Kind)
			}
			if err != nil {
				failures = append(failures, fmt.Errorf("%s %s%s: %w", a.Kind, a.Device, a.Scene, err))
			}
		}
		err := errors.Join(failures...)
		if err != nil {
			log.Printf("[ROUTINE] %s niet helemaal gelukt: %v\n", run.Routine, err)
		} else {
			log.Printf("[ROUTINE] %s uitgevoerd\n", run.Routine)
		}
		if r.report != nil {
			r.report(run.Routine, err)
		}
	}
	for _, off := range w.res.Offs {
		err := r.step(w.house, pb.SceneAction{Device: off.Device, Action: "turn_off"}, lookup)
		if err != nil {
			log.Printf("[ROUTINE] %s uit (routine %s) mislukt: %v\n", off.Device, off.Routine, err)
		} else {
			log.Printf("[ROUTINE] %s uit (routine %s, daarna uit)\n", off.Device, off.Routine)
		}
	}
}

// entities: de apparaten waarvan de motor de stand moet weten (starters en
// lampen met daarna uit), voor het afstemmen bij het opstarten.
func (r *routineRunner) entities() []string {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []string
	add := func(id string) {
		if d, ok := r.devices[id]; ok && d.EntityID != "" && !slices.Contains(out, d.EntityID) {
			out = append(out, d.EntityID)
		}
	}
	for _, rt := range r.engine.routines {
		add(rt.Starter.Device)
		for _, a := range rt.Actions {
			add(a.Device)
		}
	}
	return out
}

func (r *routineRunner) saveLocked() {
	if r.file == "" || r.house == "" {
		return
	}
	data, err := json.Marshal(routineFile{House: r.house, Owners: r.engine.owned()})
	if err != nil || string(data) == r.saved {
		return
	}
	tmp := r.file + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Printf("[ROUTINE] Opslaan in %s mislukt: %v\n", tmp, err)
		return
	}
	if err := os.Rename(tmp, r.file); err != nil {
		log.Printf("[ROUTINE] Opslaan in %s mislukt: %v\n", r.file, err)
		return
	}
	r.saved = string(data)
}

func (r *routineRunner) loadLocked(house string) map[string]map[string]time.Time {
	if r.file == "" || house == "" {
		return nil
	}
	data, err := os.ReadFile(r.file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		log.Printf("[ROUTINE] %s lezen mislukt: %v\n", r.file, err)
		return nil
	}
	var file routineFile
	if err := json.Unmarshal(data, &file); err != nil || file.House != house {
		return nil
	}
	return file.Owners
}

// routineNextRuns: voor routines op tijd of zon wat next_run (of de fout
// no_location bij de zon) moet worden, als dat veranderde.
func routineNextRuns(routines []pb.Automation, now time.Time, loc *homeLocation) []scheduleUpdate {
	var out []scheduleUpdate
	for _, rt := range routines {
		if !rt.Enabled {
			continue
		}
		var s pb.Schedule
		switch rt.Starter.Kind {
		case "sun":
			s = starterSchedule(rt.Starter)
		case "time":
			s = pb.Schedule{Trigger: "time", Time: rt.Starter.Time, Days: rt.Starter.Days, Enabled: true}
		default:
			continue
		}
		s.ID, s.NextRun, s.LastError = rt.ID, rt.NextRun, rt.LastError
		if s.Trigger == "time" {
			next := ""
			if at, ok := nextTimeRun(s, now); ok {
				next = at.UTC().Format(pb.DateLayout)
			}
			if next != s.NextRun {
				out = append(out, scheduleUpdate{ID: s.ID, NextRun: next})
			}
			continue
		}
		out = append(out, nextRunUpdates([]pb.Schedule{s}, now, loc)...)
	}
	return out
}

// nextTimeRun: de eerstvolgende keer na now dat een vaste tijd loopt.
func nextTimeRun(s pb.Schedule, now time.Time) (time.Time, bool) {
	for i := 0; i <= 7; i++ {
		day := now.AddDate(0, 0, i)
		at, err := time.ParseInLocation("2006-01-02 15:04", day.Format("2006-01-02")+" "+s.Time, now.Location())
		if err == nil && at.After(now) && slices.Contains(s.Days, weekdayKeys[day.Weekday()]) {
			return at, true
		}
	}
	return time.Time{}, false
}

// routineMinute: de minuuttik van de scheduler. Routines op tijd of zon, lampen
// waarvan de tijd om is, en next_run voor de app.
func (a *Agent) routineMinute(snap *scheduleSnapshot, now time.Time) {
	a.routines.tick(now)
	for _, u := range routineNextRuns(snap.automations, now, snap.location) {
		for i := range snap.automations {
			if snap.automations[i].ID == u.ID {
				snap.automations[i].NextRun = u.NextRun
				if u.LastError != nil {
					snap.automations[i].LastError = *u.LastError
				}
			}
		}
		go func(u scheduleUpdate) {
			if err := a.pbClient.SetAutomationNextRun(u.ID, u.NextRun, u.LastError); err != nil {
				log.Printf("[ROUTINE] Kon de volgende keer van %s niet opslaan: %v\n", u.ID, err)
			}
		}(u)
	}
}

// reportRoutine meldt het resultaat aan PocketBase, op de achtergrond.
func (a *Agent) reportRoutine(routine string, err error) {
	now := time.Now()
	go func() {
		if markErr := a.pbClient.MarkAutomationRun(routine, now, err); markErr != nil {
			log.Printf("[ROUTINE] Kon resultaat van %s niet opslaan: %v\n", routine, markErr)
		}
	}()
}

// syncRoutines: bij het opstarten de stand ophalen van de HA-apparaten waar
// routines naar kijken, zodat de eerste melding daarna als overgang telt. Een
// Zigbee-sensor zonder HA-entiteit leert zijn stand bij zijn eerste melding.
func (a *Agent) syncRoutines() {
	for _, entity := range a.routines.entities() {
		event, err := a.haClient.GetState(entity)
		if err != nil {
			log.Printf("[ROUTINE] Stand van %s ophalen mislukt: %v\n", entity, err)
			continue
		}
		a.routines.onState(entity, map[string]any{"state": event.State, "attributes": event.Attributes}, time.Now())
	}
}

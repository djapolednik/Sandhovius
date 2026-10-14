package app

import (
	"slices"
	"time"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// Routines (spec 2026-10-14-routines-design.md): als dit gebeurt, alleen als,
// doe dat, en eventueel daarna uit. Een pure motor zoals motion.go: hij krijgt
// standen van apparaten en de klok, en zegt welke routines lopen en welke
// lampen weer uit moeten. Het uitvoeren, de klok en het opslaan op schijf doet
// de agent (routine_runner.go). Niet veilig voor gelijktijdig gebruik.
//
// Eigenaarschap zoals bewegingslicht: "daarna uit" doet alleen uit wat de
// routine zelf aanzette. Een lamp die al aan stond blijft van de bewoner; een
// lamp die tussendoor uit gaat is van niemand meer.

const (
	// chainWindow: zolang na een actie van een routine start een verandering
	// van dat apparaat geen routine. De ketting stopt na één stap.
	chainWindow = 10 * time.Second
)

type routineRun struct {
	Routine string
	Actions []pb.AutomationAction
}

type routineOff struct {
	Routine string
	Device  string
}

type routineResult struct {
	Runs []routineRun
	Offs []routineOff
}

// deviceSeen: de laatst bekende stand van een apparaat, voor overgangen.
type deviceSeen struct {
	on, contact, motion, leak, smoke *bool
	temperature                      *float64
}

type routineEngine struct {
	routines map[string]pb.Automation // alleen ingeschakelde
	loc      *homeLocation
	seen     map[string]*deviceSeen
	// owners: lamp → routine → uit-tijd.
	owners map[string]map[string]time.Time
	// quiet: apparaat → tot wanneer een verandering geen routine start.
	quiet map[string]time.Time
	// lastRun: routine → de minuut waarin hij liep (één keer per minuut).
	lastRun map[string]string
}

func newRoutineEngine() *routineEngine {
	return &routineEngine{
		routines: map[string]pb.Automation{},
		seen:     map[string]*deviceSeen{},
		owners:   map[string]map[string]time.Time{},
		quiet:    map[string]time.Time{},
		lastRun:  map[string]string{},
	}
}

func (e *routineEngine) setRoutines(list []pb.Automation) {
	e.routines = map[string]pb.Automation{}
	for _, r := range list {
		if r.Enabled {
			e.routines[r.ID] = r
		}
	}
	for d, owners := range e.owners {
		for id := range owners {
			if _, ok := e.routines[id]; !ok {
				delete(owners, id)
			}
		}
		if len(owners) == 0 {
			delete(e.owners, d)
		}
	}
}

func (e *routineEngine) setLocation(loc *homeLocation) { e.loc = loc }

func boolPtr(b bool) *bool                { return &b }
func floatPtr(f float64) *float64         { return &f }
func changedTo(prev *bool, now bool) bool { return prev != nil && *prev != now }

// onDevice: een nieuwe stand van een apparaat (device-id). Overgangen starten
// routines; een lamp die uit gaat is van niemand meer.
func (e *routineEngine) onDevice(device string, state map[string]any, now time.Time) routineResult {
	s := e.seen[device]
	if s == nil {
		s = &deviceSeen{}
		e.seen[device] = s
	}
	happened := map[string]bool{} // gebeurtenissen van deze melding
	var crossed func(r pb.AutomationStarter) bool

	if v, ok := state["state"].(string); ok && v != "" {
		on := lampIsOn(state)
		if changedTo(s.on, on) {
			happened[map[bool]string{true: "on", false: "off"}[on]] = true
		}
		s.on = boolPtr(on)
		if !on {
			delete(e.owners, device)
		}
	}
	if v, ok := firstBool(state, "occupancy", "motion"); ok {
		if changedTo(s.motion, v) {
			happened[map[bool]string{true: "motion", false: "no_motion"}[v]] = true
		}
		s.motion = boolPtr(v)
	}
	// Zigbee2MQTT: contact true = dicht.
	if v, ok := state["contact"].(bool); ok {
		if changedTo(s.contact, v) {
			happened[map[bool]string{true: "closed", false: "open"}[v]] = true
		}
		s.contact = boolPtr(v)
	}
	if v, ok := state["water_leak"].(bool); ok {
		if v && changedTo(s.leak, v) {
			happened["leak"] = true
		}
		s.leak = boolPtr(v)
	}
	if v, ok := state["smoke"].(bool); ok {
		if v && changedTo(s.smoke, v) {
			happened["smoke"] = true
		}
		s.smoke = boolPtr(v)
	}
	if v, ok := state["temperature"].(float64); ok {
		prev := s.temperature
		crossed = func(r pb.AutomationStarter) bool {
			if prev == nil {
				return false
			}
			if r.Event == "above" {
				return *prev <= r.Value && v > r.Value
			}
			return *prev >= r.Value && v < r.Value
		}
		s.temperature = floatPtr(v)
	}

	var res routineResult
	if until, ok := e.quiet[device]; ok && now.Before(until) {
		return res // een verandering door een routine: geen ketting
	}
	for _, r := range e.sorted() {
		st := r.Starter
		if st.Device != device {
			continue
		}
		fire := false
		switch {
		case st.Kind == "device":
			fire = happened[st.To]
		case st.Kind == "sensor" && (st.Event == "above" || st.Event == "below"):
			fire = crossed != nil && crossed(st)
		case st.Kind == "sensor":
			fire = happened[st.Event]
		}
		if fire {
			e.run(r, now, &res)
		}
	}
	return res
}

// tick: elke minuut. Routines op tijd of zon, en lampen waarvan de tijd om is.
func (e *routineEngine) tick(now time.Time) routineResult {
	var res routineResult
	minute := now.Format("15:04")
	day := weekdayKeys[now.Weekday()]
	for _, r := range e.sorted() {
		st := r.Starter
		switch st.Kind {
		case "time":
			if st.Time == minute && slices.Contains(st.Days, day) {
				e.run(r, now, &res)
			}
		case "sun":
			if sunDue(starterSchedule(st), now, e.loc) {
				e.run(r, now, &res)
			}
		}
	}
	for device, owners := range e.owners {
		last, routine, running := time.Time{}, "", false
		for id, until := range owners {
			if until.After(now) {
				running = true
				break
			}
			if until.After(last) {
				last, routine = until, id
			}
		}
		if running {
			continue
		}
		delete(e.owners, device)
		e.quiet[device] = now.Add(chainWindow)
		res.Offs = append(res.Offs, routineOff{Routine: routine, Device: device})
	}
	return res
}

// starterSchedule: een zon-starter als schema, zodat sun.go hem kan plannen.
func starterSchedule(st pb.AutomationStarter) pb.Schedule {
	return pb.Schedule{Trigger: st.Event, OffsetMin: st.OffsetMin, Days: st.Days, Enabled: true}
}

// run: als de voorwaarden kloppen en hij deze minuut nog niet liep, loopt de
// routine. Lampen die hij aanzet en die uit stonden worden van hem.
func (e *routineEngine) run(r pb.Automation, now time.Time, res *routineResult) {
	minute := now.Format("2006-01-02 15:04")
	if e.lastRun[r.ID] == minute || !e.conditionsHold(r, now) {
		return
	}
	e.lastRun[r.ID] = minute
	for _, a := range r.Actions {
		if a.Kind != "device" {
			continue
		}
		e.quiet[a.Device] = now.Add(chainWindow)
		if a.Action != "turn_on" || r.OffAfter <= 0 {
			continue
		}
		until := now.Add(time.Duration(r.OffAfter) * time.Minute)
		if owners, owned := e.owners[a.Device]; owned {
			owners[r.ID] = until // al van een routine: mede-eigenaar
			continue
		}
		if s := e.seen[a.Device]; s != nil && s.on != nil && *s.on {
			continue // stond al aan: van de bewoner
		}
		e.owners[a.Device] = map[string]time.Time{r.ID: until}
	}
	res.Runs = append(res.Runs, routineRun{Routine: r.ID, Actions: r.Actions})
}

func (e *routineEngine) conditionsHold(r pb.Automation, now time.Time) bool {
	for _, c := range r.Conditions {
		switch c.Kind {
		case "dark":
			if !e.dark(now) {
				return false
			}
		case "days":
			if !slices.Contains(c.Days, weekdayKeys[now.Weekday()]) {
				return false
			}
		case "between":
			t := now.Format("15:04")
			inside := c.From <= t && t < c.To
			if c.From > c.To { // over middernacht
				inside = t >= c.From || t < c.To
			}
			if !inside {
				return false
			}
		default:
			return false // onbekend: liever niet dan verkeerd
		}
	}
	return true
}

// dark: tussen zonsondergang en zonsopkomst. Zonder locatie telt het als
// donker, zoals bij bewegingslicht.
func (e *routineEngine) dark(now time.Time) bool {
	if e.loc == nil {
		return true
	}
	rise, set, ok := sunTimes(now, e.loc.Lat, e.loc.Lon)
	if !ok {
		return true
	}
	return now.Before(rise) || !now.Before(set)
}

// sorted: de routines op id, zodat de volgorde vast is (tests, logs).
func (e *routineEngine) sorted() []pb.Automation {
	ids := make([]string, 0, len(e.routines))
	for id := range e.routines {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	out := make([]pb.Automation, 0, len(ids))
	for _, id := range ids {
		out = append(out, e.routines[id])
	}
	return out
}

// owned: een kopie van wie wat bezit, om op schijf te zetten.
func (e *routineEngine) owned() map[string]map[string]time.Time {
	out := make(map[string]map[string]time.Time, len(e.owners))
	for d, owners := range e.owners {
		out[d] = make(map[string]time.Time, len(owners))
		for id, until := range owners {
			out[d][id] = until
		}
	}
	return out
}

// restore: het eigenaarschap van vóór een herstart. Een lamp met een
// eigenaar brandt: de routine zette hem aan en hij ging niet uit.
func (e *routineEngine) restore(owned map[string]map[string]time.Time) {
	for d, owners := range owned {
		for id, until := range owners {
			if _, ok := e.routines[id]; !ok {
				continue
			}
			if e.owners[d] == nil {
				e.owners[d] = map[string]time.Time{}
			}
			e.owners[d][id] = until
			e.seen[d] = &deviceSeen{on: boolPtr(true)}
		}
	}
}

func firstBool(state map[string]any, keys ...string) (bool, bool) {
	for _, k := range keys {
		if v, ok := state[k].(bool); ok {
			return v, true
		}
	}
	return false, false
}

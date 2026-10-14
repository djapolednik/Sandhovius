package app

import (
	"math"
	"slices"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// homeLocation is waar het huis staat (uit Home Assistant), voor de zon.
type homeLocation struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// sunTimes geeft zonsopkomst en -ondergang op de kalenderdag van day (in de
// tijdzone van day), volgens de zonsopkomstvergelijking van NOAA: nauwkeurig
// op ongeveer een minuut. ok is false als de zon die dag niet opkomt of niet
// ondergaat (poolgebied). Puur, zonder Home Assistant: zo lopen zon-schema's
// ook als HA even weg is (spec 2026-10-14-sun-schedules-design.md).
func sunTimes(day time.Time, lat, lon float64) (rise, set time.Time, ok bool) {
	const rad = math.Pi / 180
	y, m, d := day.Date()
	noon := time.Date(y, m, d, 12, 0, 0, 0, time.UTC)
	jd := float64(noon.Unix())/86400 + 2440587.5

	n := math.Round(jd - 2451545.0 + 0.0008)
	jStar := n - lon/360
	mean := math.Mod(357.5291+0.98560028*jStar, 360)
	center := 1.9148*math.Sin(mean*rad) + 0.0200*math.Sin(2*mean*rad) + 0.0003*math.Sin(3*mean*rad)
	lambda := math.Mod(mean+center+180+102.9372, 360)
	transit := 2451545.0 + jStar + 0.0053*math.Sin(mean*rad) - 0.0069*math.Sin(2*lambda*rad)
	sinDecl := math.Sin(lambda*rad) * math.Sin(23.4397*rad)
	cosDecl := math.Cos(math.Asin(sinDecl))
	cosHour := (math.Sin(-0.833*rad) - math.Sin(lat*rad)*sinDecl) / (math.Cos(lat*rad) * cosDecl)
	if cosHour < -1 || cosHour > 1 {
		return time.Time{}, time.Time{}, false
	}
	hour := math.Acos(cosHour) / rad
	fromJD := func(j float64) time.Time {
		return time.Unix(0, int64((j-2440587.5)*86400*float64(time.Second))).In(day.Location())
	}
	return fromJD(transit - hour/360), fromJD(transit + hour/360), true
}

// isSunTrigger: zonsopkomst of zonsondergang (anders een vaste tijd).
func isSunTrigger(s pocketbase.Schedule) bool {
	return s.Trigger == "sunrise" || s.Trigger == "sunset"
}

// sunRunAt is de minuut waarop een zon-schema loopt dat hoort bij de
// kalenderdag van day: de opkomst of ondergang van die dag plus de
// verschuiving, op de minuut naar beneden. Kan na middernacht vallen (laat
// in juni, 2 uur na zonsondergang); het hoort dan nog bij day.
func sunRunAt(s pocketbase.Schedule, day time.Time, loc *homeLocation) (time.Time, bool) {
	if loc == nil || !isSunTrigger(s) {
		return time.Time{}, false
	}
	rise, set, ok := sunTimes(day, loc.Lat, loc.Lon)
	if !ok {
		return time.Time{}, false
	}
	at := rise
	if s.Trigger == "sunset" {
		at = set
	}
	return at.Add(time.Duration(s.OffsetMin) * time.Minute).Truncate(time.Minute), true
}

// sunDue: loopt dit zon-schema in de minuut van now? Gekeken wordt naar de
// zon van vandaag en van gisteren (een verschuiving over middernacht); de dag
// van het schema is de dag van de zon.
func sunDue(s pocketbase.Schedule, now time.Time, loc *homeLocation) bool {
	minute := now.Truncate(time.Minute)
	for _, back := range []int{0, -1} {
		day := now.AddDate(0, 0, back)
		at, ok := sunRunAt(s, day, loc)
		if ok && at.Equal(minute) && slices.Contains(s.Days, weekdayKeys[day.Weekday()]) {
			return true
		}
	}
	return false
}

// nextSunRun: de eerstvolgende keer na now dat een zon-schema loopt, binnen
// een week en een dag.
func nextSunRun(s pocketbase.Schedule, now time.Time, loc *homeLocation) (time.Time, bool) {
	for i := -1; i <= 8; i++ {
		day := now.AddDate(0, 0, i)
		at, ok := sunRunAt(s, day, loc)
		if ok && at.After(now) && slices.Contains(s.Days, weekdayKeys[day.Weekday()]) {
			return at, true
		}
	}
	return time.Time{}, false
}

// scheduleUpdate: wat de box op een schema schrijft zodat de app "vandaag om
// 18:42" kan zeggen. LastError nil = laten staan.
type scheduleUpdate struct {
	ID        string
	NextRun   string
	LastError *string
}

const noLocation = "no_location"

// nextRunUpdates: voor elk ingeschakeld zon-schema waarvan next_run (of de
// fout no_location) niet meer klopt, wat er geschreven moet worden. Zonder
// locatie: geen next_run en no_location; komt de locatie terug, dan gaat die
// fout weer weg.
func nextRunUpdates(schedules []pocketbase.Schedule, now time.Time, loc *homeLocation) []scheduleUpdate {
	var out []scheduleUpdate
	for _, s := range schedules {
		if !s.Enabled || !isSunTrigger(s) {
			continue
		}
		u := scheduleUpdate{ID: s.ID}
		if loc == nil {
			if s.NextRun == "" && s.LastError == noLocation {
				continue
			}
			e := noLocation
			u.LastError = &e
			out = append(out, u)
			continue
		}
		if next, ok := nextSunRun(s, now, loc); ok {
			u.NextRun = next.UTC().Format(pocketbase.DateLayout)
		}
		if s.LastError == noLocation {
			e := ""
			u.LastError = &e
		} else if u.NextRun == s.NextRun {
			continue
		}
		out = append(out, u)
	}
	return out
}

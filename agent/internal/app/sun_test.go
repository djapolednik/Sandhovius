package app

import (
	"errors"
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

// Amsterdam; referentietijden uit de Python-bibliotheek astral (3.2).
var amsterdamHome = &homeLocation{Lat: 52.3676, Lon: 4.9041}

func TestSunTimes(t *testing.T) {
	loc := amsterdam(t)
	cases := []struct{ date, rise, set string }{
		{"2026-03-20", "06:43:29", "18:53:11"},
		{"2026-06-21", "05:18:23", "22:06:01"},
		{"2026-10-14", "08:04:00", "18:47:50"},
		{"2026-10-25", "07:23:38", "17:24:23"}, // dag van de wintertijd
		{"2026-12-21", "08:48:28", "16:28:25"},
		{"2027-03-28", "07:25:17", "20:06:45"}, // dag van de zomertijd
	}
	for _, c := range cases {
		day, _ := time.ParseInLocation("2006-01-02", c.date, loc)
		rise, set, ok := sunTimes(day, amsterdamHome.Lat, amsterdamHome.Lon)
		if !ok {
			t.Fatalf("%s: geen opkomst of ondergang", c.date)
		}
		for _, p := range []struct {
			name string
			got  time.Time
			want string
		}{{"opkomst", rise, c.rise}, {"ondergang", set, c.set}} {
			want, _ := time.ParseInLocation("2006-01-02 15:04:05", c.date+" "+p.want, loc)
			if d := p.got.Sub(want); d < -2*time.Minute || d > 2*time.Minute {
				t.Errorf("%s %s: %s, verwacht %s", c.date, p.name, p.got.In(loc).Format("15:04:05"), p.want)
			}
		}
	}
}

func TestSunTimesPolarDay(t *testing.T) {
	day := time.Date(2026, 6, 21, 0, 0, 0, 0, time.UTC)
	if _, _, ok := sunTimes(day, 80, 15); ok {
		t.Error("op 80° noord gaat de zon in juni niet onder")
	}
}

func sunSchedule(id, trigger string, offset int, days ...string) pocketbase.Schedule {
	return pocketbase.Schedule{ID: id, Trigger: trigger, OffsetMin: offset, Days: days, Enabled: true}
}

func TestDueSunSchedules(t *testing.T) {
	loc := amsterdam(t)
	// Woensdag 14 oktober 2026: ondergang ~18:47, opkomst ~08:04. De minuut
	// komt uit sunTimes zelf (die is hierboven getoetst); hier gaat het om
	// het plannen.
	day := time.Date(2026, 10, 14, 0, 0, 0, 0, loc)
	rise, set, _ := sunTimes(day, amsterdamHome.Lat, amsterdamHome.Lon)
	rise, set = rise.Truncate(time.Minute), set.Truncate(time.Minute)
	at := func(hm string) time.Time {
		switch hm {
		case "18:47":
			return set
		case "18:48":
			return set.Add(time.Minute)
		case "07:34":
			return rise.Add(-30 * time.Minute)
		case "19:47":
			return set.Add(time.Hour)
		}
		t.Fatalf("onbekende tijd %s", hm)
		return time.Time{}
	}
	cases := []struct {
		name string
		s    pocketbase.Schedule
		now  time.Time
		due  bool
	}{
		{"bij zonsondergang", sunSchedule("a", "sunset", 0, "wed"), at("18:47"), true},
		{"een minuut later niet", sunSchedule("a", "sunset", 0, "wed"), at("18:48"), false},
		{"30 min voor zonsopkomst", sunSchedule("b", "sunrise", -30, "wed"), at("07:34"), true},
		{"1 uur na zonsondergang", sunSchedule("c", "sunset", 60, "wed"), at("19:47"), true},
		{"andere dag", sunSchedule("d", "sunset", 0, "thu"), at("18:47"), false},
		{"uit", pocketbase.Schedule{ID: "e", Trigger: "sunset", Days: []string{"wed"}}, at("18:47"), false},
	}
	for _, c := range cases {
		got := len(dueSchedules([]pocketbase.Schedule{c.s}, c.now, amsterdamHome)) == 1
		if got != c.due {
			t.Errorf("%s: due = %v, verwacht %v", c.name, got, c.due)
		}
	}
	// zonder locatie loopt een zon-schema nooit, een tijd-schema wel
	if got := dueSchedules([]pocketbase.Schedule{sunSchedule("a", "sunset", 0, "wed")}, at("18:47"), nil); len(got) != 0 {
		t.Errorf("zonder locatie: %v", got)
	}
	if got := dueSchedules([]pocketbase.Schedule{schedule("t", set.Format("15:04"), "wed")}, at("18:47"), nil); len(got) != 1 {
		t.Errorf("tijd-schema zonder locatie: %v", got)
	}
}

// Op 21 juni gaat de zon om 22:06 onder; 2 uur later is het al 22 juni. Het
// schema hoort bij de dag van de ondergang (zondag), niet bij de dag erna.
func TestDueSunScheduleAfterMidnight(t *testing.T) {
	loc := amsterdam(t)
	s := []pocketbase.Schedule{sunSchedule("laat", "sunset", 120, "sun")}
	count := 0
	start := time.Date(2026, 6, 21, 18, 0, 0, 0, loc) // zondag
	for m := 0; m < 12*60; m++ {
		now := start.Add(time.Duration(m) * time.Minute)
		if len(dueSchedules(s, now, amsterdamHome)) == 1 {
			count++
			if now.Day() != 22 || now.Hour() != 0 {
				t.Errorf("liep om %s", now.Format("2006-01-02 15:04"))
			}
		}
	}
	if count != 1 {
		t.Errorf("liep %d keer, verwacht 1", count)
	}
}

func TestNextRunUpdates(t *testing.T) {
	loc := amsterdam(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, loc) // woensdag
	sunset := sunSchedule("a", "sunset", 0, "wed", "thu")
	tomorrow := sunSchedule("b", "sunrise", 0, "thu")
	timed := schedule("t", "23:00", "wed")
	off := pocketbase.Schedule{ID: "o", Trigger: "sunset", Days: []string{"wed"}}

	got := nextRunUpdates([]pocketbase.Schedule{sunset, tomorrow, timed, off}, now, amsterdamHome)
	if len(got) != 2 {
		t.Fatalf("updates: %+v", got)
	}
	_, setWed, _ := sunTimes(now, amsterdamHome.Lat, amsterdamHome.Lon)
	riseThu, _, _ := sunTimes(now.AddDate(0, 0, 1), amsterdamHome.Lat, amsterdamHome.Lon)
	want := map[string]string{
		"a": setWed.Truncate(time.Minute).UTC().Format(pocketbase.DateLayout),
		"b": riseThu.Truncate(time.Minute).UTC().Format(pocketbase.DateLayout),
	}
	for _, u := range got {
		if u.NextRun != want[u.ID] || u.LastError != nil {
			t.Errorf("%s: next_run %q, verwacht %q (%v)", u.ID, u.NextRun, want[u.ID], u.LastError)
		}
	}

	// al bijgewerkt: niets te doen
	sunset.NextRun = want["a"]
	if got := nextRunUpdates([]pocketbase.Schedule{sunset}, now, amsterdamHome); len(got) != 0 {
		t.Errorf("al bijgewerkt: %+v", got)
	}

	// zonder locatie: geen next_run en de fout no_location, één keer
	got = nextRunUpdates([]pocketbase.Schedule{sunset}, now, nil)
	if len(got) != 1 || got[0].NextRun != "" || got[0].LastError == nil || *got[0].LastError != "no_location" {
		t.Fatalf("zonder locatie: %+v", got)
	}
	sunset.NextRun, sunset.LastError = "", "no_location"
	if got := nextRunUpdates([]pocketbase.Schedule{sunset}, now, nil); len(got) != 0 {
		t.Errorf("no_location al gezet: %+v", got)
	}
	// locatie weer bekend: de fout gaat weg
	got = nextRunUpdates([]pocketbase.Schedule{sunset}, now, amsterdamHome)
	if len(got) != 1 || got[0].LastError == nil || *got[0].LastError != "" || got[0].NextRun != want["a"] {
		t.Errorf("locatie terug: %+v", got)
	}
}

// De klok schrijft next_run één keer, niet elke minuut opnieuw.
func TestTickWritesNextRunOnce(t *testing.T) {
	loc := amsterdam(t)
	snap := &scheduleSnapshot{
		schedules: []pocketbase.Schedule{sunSchedule("a", "sunset", 0, "wed")},
		location:  amsterdamHome,
	}
	fetched := false
	var writes []scheduleUpdate
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) {
			if fetched {
				return nil, errors.New("PocketBase weg")
			}
			fetched = true
			return snap, nil
		},
		run:     func(*scheduleSnapshot, pocketbase.Schedule, time.Time) {},
		nextRun: func(u scheduleUpdate) { writes = append(writes, u) },
	}
	s.tick(time.Date(2026, 10, 14, 12, 0, 0, 0, loc))
	s.tick(time.Date(2026, 10, 14, 12, 1, 0, 0, loc))
	if len(writes) != 1 || writes[0].ID != "a" || writes[0].NextRun == "" {
		t.Errorf("writes = %+v", writes)
	}
}

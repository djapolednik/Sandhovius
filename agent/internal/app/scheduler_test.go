package app

import (
	"errors"
	"testing"
	"time"

	"sandhovius/local-agent/internal/pocketbase"
)

func amsterdam(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Amsterdam")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func schedule(id, at string, days ...string) pocketbase.Schedule {
	return pocketbase.Schedule{ID: id, Time: at, Days: days, Enabled: true}
}

func TestDueSchedules(t *testing.T) {
	loc := amsterdam(t)
	// Maandag 4 oktober 2027, 23:00.
	now := time.Date(2027, 10, 4, 23, 0, 30, 0, loc)

	cases := []struct {
		name string
		s    pocketbase.Schedule
		due  bool
	}{
		{"juiste dag en tijd", schedule("a", "23:00", "mon", "tue"), true},
		{"andere dag", schedule("b", "23:00", "tue"), false},
		{"andere minuut", schedule("c", "23:01", "mon"), false},
		{"uitgeschakeld", pocketbase.Schedule{ID: "d", Time: "23:00", Days: []string{"mon"}, Enabled: false}, false},
	}
	for _, c := range cases {
		got := len(dueSchedules([]pocketbase.Schedule{c.s}, now, nil)) == 1
		if got != c.due {
			t.Errorf("%s: due = %v, want %v", c.name, got, c.due)
		}
	}
}

// In de nacht van 28 maart 2027 springt de klok van 02:00 naar 03:00: een
// schema op 02:30 bestaat die nacht niet, 03:30 loopt precies één keer.
func TestDueSchedulesSpringForward(t *testing.T) {
	loc := amsterdam(t)
	count := map[string]int{}
	s := []pocketbase.Schedule{schedule("half3", "02:30", "sun"), schedule("halfvier", "03:30", "sun")}
	start := time.Date(2027, 3, 28, 0, 0, 0, 0, loc)
	for m := 0; m < 5*60; m++ {
		for _, d := range dueSchedules(s, start.Add(time.Duration(m)*time.Minute), nil) {
			count[d.ID]++
		}
	}
	if count["half3"] != 0 || count["halfvier"] != 1 {
		t.Errorf("counts = %v, want half3=0 halfvier=1", count)
	}
}

func TestTickRunsEachMinuteOnce(t *testing.T) {
	loc := amsterdam(t)
	runs := 0
	snap := &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}}
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) { return snap, nil },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
	s.tick(time.Date(2027, 10, 4, 23, 0, 40, 0, loc))
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

func TestTickUsesLastSnapshotWhenFetchFails(t *testing.T) {
	loc := amsterdam(t)
	snap := &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}}
	fail := false
	runs := 0
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) {
			if fail {
				return nil, errors.New("pocketbase weg")
			}
			return snap, nil
		},
		run: func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	s.tick(time.Date(2027, 10, 4, 22, 59, 0, 0, loc)) // snapshot opgehaald
	fail = true
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc)) // fetch faalt, draait toch
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

func TestTickWithoutAnySnapshotDoesNothing(t *testing.T) {
	loc := amsterdam(t)
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) { return nil, errors.New("pocketbase weg") },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { t.Error("run zonder snapshot") },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
}

func TestTickSavesOnlyAfterSuccessfulFetch(t *testing.T) {
	loc := amsterdam(t)
	snap := &scheduleSnapshot{}
	fail := false
	saves := 0
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) {
			if fail {
				return nil, errors.New("pocketbase weg")
			}
			return snap, nil
		},
		run:  func(*scheduleSnapshot, pocketbase.Schedule, time.Time) {},
		save: func(*scheduleSnapshot) error { saves++; return nil },
	}
	s.tick(time.Date(2027, 10, 4, 22, 59, 0, 0, loc))
	fail = true
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
	if saves != 1 {
		t.Errorf("saves = %d, want 1", saves)
	}
}

func TestTickRunsWhenSaveFails(t *testing.T) {
	loc := amsterdam(t)
	snap := &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}}
	runs := 0
	s := &scheduler{
		fetch: func() (*scheduleSnapshot, error) { return snap, nil },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
		save:  func(*scheduleSnapshot) error { return errors.New("schijf vol") },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

func TestTickUsesSnapshotFromFile(t *testing.T) {
	loc := amsterdam(t)
	runs := 0
	s := &scheduler{
		snap:  &scheduleSnapshot{schedules: []pocketbase.Schedule{schedule("a", "23:00", "mon")}},
		fetch: func() (*scheduleSnapshot, error) { return nil, errors.New("pocketbase weg") },
		run:   func(*scheduleSnapshot, pocketbase.Schedule, time.Time) { runs++ },
	}
	s.tick(time.Date(2027, 10, 4, 23, 0, 0, 0, loc))
	if runs != 1 {
		t.Errorf("runs = %d, want 1", runs)
	}
}

// De timer kan een paar milliseconden vóór de minuutgrens afgaan (wandklok
// en monotone klok lopen in de Docker-VM iets uit elkaar). De volgende tick
// is dan toch de minuut ná de vorige, niet dezelfde nog een keer.
func TestNextTick(t *testing.T) {
	loc := amsterdam(t)
	at := func(h, m, s, ms int) time.Time { return time.Date(2027, 10, 4, h, m, s, ms*1e6, loc) }
	cases := []struct {
		name      string
		now, prev time.Time
		want      time.Time
	}{
		{"timer een paar ms te vroeg", at(16, 19, 59, 997), at(16, 20, 0, 0), at(16, 21, 0, 0)},
		{"timer op tijd", at(16, 20, 0, 4), at(16, 20, 0, 0), at(16, 21, 0, 0)},
		{"tick duurde langer dan een minuut", at(16, 21, 10, 0), at(16, 20, 0, 0), at(16, 22, 0, 0)},
		{"eerste tick na opstarten", at(16, 19, 9, 0), time.Time{}, at(16, 20, 0, 0)},
	}
	for _, c := range cases {
		if got := nextTick(c.now, c.prev); !got.Equal(c.want) {
			t.Errorf("%s: nextTick = %s, want %s", c.name, got.Format("15:04:05.000"), c.want.Format("15:04:05.000"))
		}
	}
}

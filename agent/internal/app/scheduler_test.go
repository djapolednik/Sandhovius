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
		got := len(dueSchedules([]pocketbase.Schedule{c.s}, now)) == 1
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
		for _, d := range dueSchedules(s, start.Add(time.Duration(m)*time.Minute)) {
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

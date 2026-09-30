package app

import (
	"testing"
	"time"

	"sandhovius/local-agent/internal/homeassistant"
)

func TestBuildWeatherSkipsPastHoursAndCaps(t *testing.T) {
	now := time.Date(2026, 9, 30, 14, 20, 0, 0, time.UTC)
	var hourly []homeassistant.Forecast
	for h := 12; h < 40; h++ {
		at := time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC).Add(time.Duration(h) * time.Hour)
		hourly = append(hourly, homeassistant.Forecast{Datetime: at.Format(time.RFC3339), Condition: "cloudy", Temperature: float64(h)})
	}
	low := 15.5
	daily := make([]homeassistant.Forecast, 7)
	for i := range daily {
		daily[i] = homeassistant.Forecast{Datetime: "2026-10-01T10:00:00+00:00", Condition: "rainy", Temperature: 20, TempLow: &low}
	}
	state := homeassistant.HAEvent{State: "partlycloudy", Attributes: map[string]interface{}{"temperature": 25.6}}

	got, ok := buildWeather(state, hourly, daily, now)
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got.Condition != "partlycloudy" || got.Temperature == nil || *got.Temperature != 25.6 {
		t.Errorf("current = %q %v, want partlycloudy 25.6", got.Condition, got.Temperature)
	}
	if len(got.Hours) != weatherHourCount {
		t.Fatalf("hours = %d, want %d", len(got.Hours), weatherHourCount)
	}
	if got.Hours[0].Temperature != 14 {
		t.Errorf("first hour = %v, want the running hour (14:00)", got.Hours[0].Temperature)
	}
	if len(got.Days) != weatherDayCount || got.Days[0].Low == nil || *got.Days[0].Low != 15.5 {
		t.Errorf("days = %+v, want %d days with low 15.5", got.Days, weatherDayCount)
	}
}

func TestBuildWeatherUnavailableKeepsLastKnown(t *testing.T) {
	for _, s := range []string{"unavailable", "unknown", ""} {
		if _, ok := buildWeather(homeassistant.HAEvent{State: s}, nil, nil, time.Now()); ok {
			t.Errorf("state %q: ok = true, want false", s)
		}
	}
}

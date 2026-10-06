package app

import (
	"log"
	"time"

	"sandhovius/local-agent/internal/homeassistant"
)

// weatherInterval: Met.no ververst ongeveer elk uur; elk half uur ophalen
// is ruim vaak genoeg en de PocketBase-schrijfactie blijft zeldzaam.
const weatherInterval = 30 * time.Minute

// Het weer zoals de PWA het leest (houses.weather). Klein gehouden: de
// huidige stand, de komende uren en de komende dagen.
type weatherPayload struct {
	Condition   string        `json:"condition"`
	Temperature *float64      `json:"temperature"`
	Hours       []weatherHour `json:"hours"`
	Days        []weatherDay  `json:"days"`
}

type weatherHour struct {
	Time          string   `json:"time"`
	Condition     string   `json:"condition"`
	Temperature   float64  `json:"temperature"`
	Precipitation *float64 `json:"precipitation"`
}

type weatherDay struct {
	Date          string   `json:"date"`
	Condition     string   `json:"condition"`
	High          float64  `json:"high"`
	Low           *float64 `json:"low"`
	Precipitation *float64 `json:"precipitation"`
}

const (
	weatherHourCount = 12
	weatherDayCount  = 5
)

// buildWeather vormt de stand en voorspellingen van HA om tot wat de PWA
// nodig heeft. Uren die al voorbij zijn vallen weg (HA begint bij het
// lopende uur). ok is false als HA het weer zelf niet weet
// (unavailable/unknown, bv. omdat de box geen internet heeft): dan laat
// de agent het laatst bekende weer staan, met zijn oude tijd.
func buildWeather(state homeassistant.HAEvent, hourly, daily []homeassistant.Forecast, now time.Time) (weatherPayload, bool) {
	if state.State == "" || state.State == "unavailable" || state.State == "unknown" {
		return weatherPayload{}, false
	}
	payload := weatherPayload{Condition: state.State, Hours: []weatherHour{}, Days: []weatherDay{}}
	if t, ok := state.Attributes["temperature"].(float64); ok {
		payload.Temperature = &t
	}

	currentHour := now.Truncate(time.Hour)
	for _, f := range hourly {
		at, err := time.Parse(time.RFC3339, f.Datetime)
		if err != nil || at.Before(currentHour) {
			continue
		}
		payload.Hours = append(payload.Hours, weatherHour{
			Time: f.Datetime, Condition: f.Condition, Temperature: f.Temperature, Precipitation: f.Precipitation,
		})
		if len(payload.Hours) == weatherHourCount {
			break
		}
	}
	for _, f := range daily {
		payload.Days = append(payload.Days, weatherDay{
			Date: f.Datetime, Condition: f.Condition, High: f.Temperature, Low: f.TempLow, Precipitation: f.Precipitation,
		})
		if len(payload.Days) == weatherDayCount {
			break
		}
	}
	return payload, true
}

// runWeather haalt het weer bij start en daarna elke weatherInterval op
// uit HA en zet het op het huis. Het weer is bijzaak: elke fout wordt
// alleen gelogd, en zonder weer-entiteit in HA doet dit niets.
func (a *Agent) runWeather() {
	a.updateWeather()
	ticker := time.NewTicker(weatherInterval)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.updateWeather()
		}
	}
}

func (a *Agent) updateWeather() {
	entityID, err := a.haClient.FindWeatherEntity()
	if err != nil {
		log.Printf("[WEER] Weer-entiteit zoeken mislukt: %v\n", err)
		return
	}
	if entityID == "" {
		return
	}
	state, err := a.haClient.GetState(entityID)
	if err != nil {
		log.Printf("[WEER] Stand van %s ophalen mislukt: %v\n", entityID, err)
		return
	}
	hourly, err := a.haClient.GetForecasts(entityID, "hourly")
	if err != nil {
		log.Printf("[WEER] %v\n", err)
	}
	daily, err := a.haClient.GetForecasts(entityID, "daily")
	if err != nil {
		log.Printf("[WEER] %v\n", err)
	}

	now := time.Now()
	payload, ok := buildWeather(state, hourly, daily, now)
	if !ok {
		log.Printf("[WEER] %s is %q; laatst bekende weer blijft staan\n", entityID, state.State)
		return
	}
	house := a.house()
	if house == "" {
		return // nog geen huis: het volgende halfuur opnieuw
	}
	if err := a.pbClient.SetHouseWeather(house, payload, now); err != nil {
		log.Printf("[WEER] %v\n", err)
	}
}

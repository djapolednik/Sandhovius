package homeassistant

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Forecast is one entry of a weather forecast, hourly or daily. Temperature
// is the (high) temperature; TempLow is only set on daily entries.
type Forecast struct {
	Datetime      string   `json:"datetime"`
	Condition     string   `json:"condition"`
	Temperature   float64  `json:"temperature"`
	TempLow       *float64 `json:"templow"`
	Precipitation *float64 `json:"precipitation"`
}

// FindWeatherEntity returns the first weather.* entity Home Assistant
// knows (the Met.no integration makes "weather.forecast_<home>"), or ""
// when there is none.
func (c *Client) FindWeatherEntity() (string, error) {
	req, err := http.NewRequest("GET", c.restURL+"/api/states", nil)
	if err != nil {
		return "", fmt.Errorf("ha: build states request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ha: list states: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ha: list states returned %d: %s", resp.StatusCode, body)
	}

	var states []struct {
		EntityID string `json:"entity_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&states); err != nil {
		return "", fmt.Errorf("ha: decode states: %w", err)
	}
	for _, s := range states {
		if strings.HasPrefix(s.EntityID, "weather.") {
			return s.EntityID, nil
		}
	}
	return "", nil
}

// GetForecasts calls weather.get_forecasts for one entity. kind is
// "hourly" or "daily". The forecast is not a state attribute (anymore);
// HA only returns it as a service response.
func (c *Client) GetForecasts(entityID, kind string) ([]Forecast, error) {
	encoded, err := json.Marshal(map[string]string{"entity_id": entityID, "type": kind})
	if err != nil {
		return nil, fmt.Errorf("ha: encode forecast request: %w", err)
	}
	url := c.restURL + "/api/services/weather/get_forecasts?return_response"
	req, err := http.NewRequest("POST", url, bytes.NewReader(encoded))
	if err != nil {
		return nil, fmt.Errorf("ha: build forecast request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ha: get %s forecast of %s: %w", kind, entityID, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ha: %s forecast of %s returned %d: %s", kind, entityID, resp.StatusCode, body)
	}

	var body struct {
		ServiceResponse map[string]struct {
			Forecast []Forecast `json:"forecast"`
		} `json:"service_response"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("ha: decode %s forecast of %s: %w", kind, entityID, err)
	}
	return body.ServiceResponse[entityID].Forecast, nil
}

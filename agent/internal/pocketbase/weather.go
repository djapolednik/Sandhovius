package pocketbase

import (
	"fmt"
	"time"
)

// SetHouseWeather writes the latest weather to the house record, with the
// moment the box fetched it. The PWA shows that moment, so a forecast that
// stopped updating (the box has no internet) is never mistaken for a
// fresh one.
func (c *Client) SetHouseWeather(houseID string, weather any, at time.Time) error {
	err := c.doAuthed(
		"PATCH",
		"/api/collections/houses/records/"+houseID,
		map[string]any{"weather": weather, "weather_updated": at.UTC().Format(DateLayout)},
		nil,
	)
	if err != nil {
		return fmt.Errorf("pocketbase: set weather of house %s: %w", houseID, err)
	}
	return nil
}

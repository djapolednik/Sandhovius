package pocketbase

import (
	"fmt"
	"net/url"
)

// PushSubscription is een apparaat waarop iemand meldingen aanzette
// (collectie push_subscriptions, spec 2026-10-14-notifications-design.md).
// Key is de publieke VAPID-sleutel waarmee de app aanmeldde.
type PushSubscription struct {
	ID       string `json:"id"`
	House    string `json:"house"`
	User     string `json:"user"`
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
	Key      string `json:"key"`
	Language string `json:"language"`
}

// NotificationRule is Meld dit: een sensor, een gebeurtenis (open, motion) en
// voor wie, met de voorwaarden niemand thuis en tussen From en To.
type NotificationRule struct {
	ID         string `json:"id"`
	House      string `json:"house"`
	User       string `json:"user"`
	Device     string `json:"device"`
	Event      string `json:"event"`
	NobodyHome bool   `json:"nobody_home"`
	From       string `json:"from"`
	To         string `json:"to"`
	Enabled    bool   `json:"enabled"`
}

// ListPushSubscriptions geeft de aanmeldingen van één huis.
func (c *Client) ListPushSubscriptions(houseID string) ([]PushSubscription, error) {
	var resp struct {
		Items []PushSubscription `json:"items"`
	}
	path := "/api/collections/push_subscriptions/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list push subscriptions: %w", err)
	}
	return resp.Items, nil
}

// DeletePushSubscription ruimt een aanmelding op die de pushdienst niet meer
// kent (404/410).
func (c *Client) DeletePushSubscription(id string) error {
	if err := c.doAuthed("DELETE", "/api/collections/push_subscriptions/records/"+url.PathEscape(id), nil, nil); err != nil {
		return fmt.Errorf("pocketbase: delete push subscription: %w", err)
	}
	return nil
}

// ListNotificationRules geeft de Meld dit-regels van één huis.
func (c *Client) ListNotificationRules(houseID string) ([]NotificationRule, error) {
	var resp struct {
		Items []NotificationRule `json:"items"`
	}
	path := "/api/collections/notification_rules/records?perPage=500&filter=" + url.QueryEscape("house='"+houseID+"'")
	if err := c.doAuthed("GET", path, nil, &resp); err != nil {
		return nil, fmt.Errorf("pocketbase: list notification rules: %w", err)
	}
	return resp.Items, nil
}

// HousePushKey leest de publieke VAPID-sleutel op het huis.
func (c *Client) HousePushKey(houseID string) (string, error) {
	var house struct {
		PushKey string `json:"push_key"`
	}
	if err := c.doAuthed("GET", "/api/collections/houses/records/"+url.PathEscape(houseID), nil, &house); err != nil {
		return "", fmt.Errorf("pocketbase: house push key: %w", err)
	}
	return house.PushKey, nil
}

// SetHousePushKey zet de publieke VAPID-sleutel van deze box op het huis.
func (c *Client) SetHousePushKey(houseID, key string) error {
	if err := c.doAuthed("PATCH", "/api/collections/houses/records/"+url.PathEscape(houseID), map[string]any{"push_key": key}, nil); err != nil {
		return fmt.Errorf("pocketbase: set house push key: %w", err)
	}
	return nil
}

// ClimatePresets zijn de klimaatstanden van het huis (F2), in graden; 0 = de
// standaard van de app (Comfort 20, Eco 17, Slaap 16).
type ClimatePresets struct {
	Comfort float64 `json:"climate_comfort"`
	Eco     float64 `json:"climate_eco"`
	Sleep   float64 `json:"climate_sleep"`
}

// HouseClimatePresets leest de klimaatstanden van het huis.
func (c *Client) HouseClimatePresets(houseID string) (ClimatePresets, error) {
	var presets ClimatePresets
	if err := c.doAuthed("GET", "/api/collections/houses/records/"+url.PathEscape(houseID), nil, &presets); err != nil {
		return ClimatePresets{}, fmt.Errorf("pocketbase: house climate presets: %w", err)
	}
	return presets, nil
}

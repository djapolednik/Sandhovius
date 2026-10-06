package pocketbase

import "testing"

func TestPendingCommandsFilter(t *testing.T) {
	got, err := pendingCommandsFilter("abc123")
	want := "status='pending' && (device.gateway='abc123' || scene.house='abc123')"
	if err != nil || got != want {
		t.Errorf("filter = %q, %v; want %q", got, err, want)
	}
}

// Record-ID's zijn [a-z0-9]; alles daarbuiten zou de filter kunnen breken.
func TestPendingCommandsFilterRejectsOddHouseID(t *testing.T) {
	for _, house := range []string{"", "abc' || 1=1 || '", "ABC-123"} {
		if _, err := pendingCommandsFilter(house); err == nil {
			t.Errorf("huis %q geaccepteerd", house)
		}
	}
}

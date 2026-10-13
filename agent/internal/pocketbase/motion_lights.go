package pocketbase

// MotionLight zet lampen aan bij beweging op een sensor en, OffAfter minuten
// na de laatste beweging, weer uit (collectie motion_lights). Sensor en
// Devices zijn device-id's van hetzelfde huis.
type MotionLight struct {
	ID       string   `json:"id"`
	House    string   `json:"house"`
	Sensor   string   `json:"sensor"`
	Devices  []string `json:"devices"`
	OnlyDark bool     `json:"only_dark"`
	OffAfter int      `json:"off_after"`
	Enabled  bool     `json:"enabled"`
}

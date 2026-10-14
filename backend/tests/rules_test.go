//go:build integration

// Regeltests: een box bereikt alleen zijn eigen huis, en binnen dat huis alleen
// de velden die de agent echt schrijft. Beveiligingskritisch: een fout hier laat
// de box van de ene klant bij het huis van een andere klant.
package tests

import (
	"bufio"
	"encoding/json"
	"net/http"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

type world struct {
	UserA, UserATok              string
	HouseA, HouseB               string
	DevA, DevB                   string
	StateA, StateB               string
	CmdA, CmdB                   string
	SceneA, SceneB               string
	SchedA, SchedB               string
	BoxATok, BoxBTok, BoxNoneTok string
	roomA, roomB                 string
}

// fixture bouwt twee huizen (A van bewoner A, B van bewoner B), met per huis
// een device, device_state, wachtend commando, scène, schema en kamer, plus
// box A (huis A), box B (huis B) en een box zonder huis.
func fixture(t *testing.T, p *pb) world {
	t.Helper()
	var w world
	w.UserA = newUser(t, p, "a@sandhovius.test")
	userB := newUser(t, p, "b@sandhovius.test")
	w.HouseA = p.create(t, "houses", map[string]any{"name": "Huis A", "members": []string{w.UserA}, "admins": []string{w.UserA}})
	w.HouseB = p.create(t, "houses", map[string]any{"name": "Huis B", "members": []string{userB}, "admins": []string{userB}})
	w.roomA = p.create(t, "rooms", map[string]any{"house": w.HouseA, "name": "Kamer A", "order": 1})
	w.roomB = p.create(t, "rooms", map[string]any{"house": w.HouseB, "name": "Kamer B", "order": 1})
	dev := func(house, name string) string {
		return p.create(t, "devices", map[string]any{
			"gateway": house, "entity_id": "light." + name, "name": name, "type": "light", "online": true})
	}
	w.DevA, w.DevB = dev(w.HouseA, "a"), dev(w.HouseB, "b")
	state := func(d string) string {
		return p.create(t, "device_state", map[string]any{"device": d, "state": map[string]any{"on": false}})
	}
	w.StateA, w.StateB = state(w.DevA), state(w.DevB)
	cmd := func(d string) string {
		return p.create(t, "commands", map[string]any{"device": d, "action": "turn_on", "status": "pending"})
	}
	w.CmdA, w.CmdB = cmd(w.DevA), cmd(w.DevB)
	scene := func(h, name string) string {
		return p.create(t, "scenes", map[string]any{"house": h, "name": name, "order": 1, "actions": []any{}})
	}
	w.SceneA, w.SceneB = scene(w.HouseA, "Scène A"), scene(w.HouseB, "Scène B")
	sched := func(h, s string) string {
		return p.create(t, "schedules", map[string]any{
			"house": h, "scene": s, "time": "23:00", "days": []string{"mon"}, "enabled": true})
	}
	w.SchedA, w.SchedB = sched(w.HouseA, w.SceneA), sched(w.HouseB, w.SceneB)

	boxHouse := func(serial, house string) {
		body := map[string]any{"serial": serial, "password": boxPw, "passwordConfirm": boxPw}
		if house != "" {
			body["house"] = house
		}
		p.create(t, "boxes", body)
	}
	boxHouse("SH-A", w.HouseA)
	boxHouse("SH-B", w.HouseB)
	boxHouse("SH-NONE", "")

	w.UserATok = p.login(t, "users", "a@sandhovius.test", boxPw)
	w.BoxATok = p.login(t, "boxes", "SH-A", boxPw)
	w.BoxBTok = p.login(t, "boxes", "SH-B", boxPw)
	w.BoxNoneTok = p.login(t, "boxes", "SH-NONE", boxPw)
	return w
}

// de zes collecties die een box (deels) mag zien
var boxCollections = []string{"houses", "devices", "device_state", "commands", "scenes", "schedules"}

func (w world) idsA() map[string]string {
	return map[string]string{
		"houses": w.HouseA, "devices": w.DevA, "device_state": w.StateA,
		"commands": w.CmdA, "scenes": w.SceneA, "schedules": w.SchedA,
	}
}

func (w world) idsB() map[string]string {
	return map[string]string{
		"houses": w.HouseB, "devices": w.DevB, "device_state": w.StateB,
		"commands": w.CmdB, "scenes": w.SceneB, "schedules": w.SchedB,
	}
}

func listIDs(t *testing.T, p *pb, token, collection string) []string {
	t.Helper()
	status, out := p.do(t, token, "GET", "/api/collections/"+collection+"/records?perPage=200", nil)
	if status != 200 {
		t.Fatalf("list %s: status %d: %v", collection, status, out)
	}
	items, _ := out["items"].([]any)
	ids := []string{}
	for _, it := range items {
		ids = append(ids, it.(map[string]any)["id"].(string))
	}
	sort.Strings(ids)
	return ids
}

func getRecord(t *testing.T, p *pb, collection, id string) map[string]any {
	t.Helper()
	status, out := p.do(t, p.AdminToken, "GET", "/api/collections/"+collection+"/records/"+id, nil)
	if status != 200 {
		t.Fatalf("get %s/%s: status %d: %v", collection, id, status, out)
	}
	return out
}

func TestBoxReadsOnlyOwnHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	for _, c := range boxCollections {
		ids := listIDs(t, p, w.BoxATok, c)
		if len(ids) != 1 || ids[0] != w.idsA()[c] {
			t.Errorf("box A ziet in %s %v, verwacht alleen %s", c, ids, w.idsA()[c])
		}
		status, out := p.do(t, w.BoxATok, "GET", "/api/collections/"+c+"/records/"+w.idsB()[c], nil)
		if status != 404 {
			t.Errorf("box A leest %s van huis B: status %d (verwacht 404): %v", c, status, out)
		}
	}
	// rooms zijn voor de box dicht
	if ids := listIDs(t, p, w.BoxATok, "rooms"); len(ids) != 0 {
		t.Errorf("box A ziet kamers: %v", ids)
	}
}

func TestBoxWithoutHouseSeesNothing(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	for _, c := range append([]string{"rooms"}, boxCollections...) {
		if ids := listIDs(t, p, w.BoxNoneTok, c); len(ids) != 0 {
			t.Errorf("box zonder huis ziet in %s %v", c, ids)
		}
	}
	for c, id := range w.idsA() {
		status, _ := p.do(t, w.BoxNoneTok, "GET", "/api/collections/"+c+"/records/"+id, nil)
		if status != 404 {
			t.Errorf("box zonder huis leest %s: status %d (verwacht 404)", c, status)
		}
	}
	// een toegestaan veld, zodat alleen de regel (niet de validatie) het tegenhoudt
	for c, body := range allowedPatches() {
		before := getRecord(t, p, c, w.idsA()[c])
		status, out := p.do(t, w.BoxNoneTok, "PATCH", "/api/collections/"+c+"/records/"+w.idsA()[c], body)
		if status < 400 {
			t.Errorf("box zonder huis mag %s van A wijzigen: %d %v", c, status, out)
		}
		if after := getRecord(t, p, c, w.idsA()[c]); !reflect.DeepEqual(before, after) {
			t.Errorf("%s van A is gewijzigd door box zonder huis", c)
		}
	}
}

func allowedPatches() map[string]map[string]any {
	return map[string]map[string]any{
		"houses":       {"select": "offline"},
		"devices":      {"online": false},
		"device_state": {"state": map[string]any{"on": true}},
		"commands":     {"status": "sent"},
		"schedules":    {"last_error": "x"},
	}
}

func TestBoxCannotTouchOtherHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	for c, body := range allowedPatches() {
		before := getRecord(t, p, c, w.idsB()[c])
		status, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/"+c+"/records/"+w.idsB()[c], body)
		if status < 400 {
			t.Errorf("box A mag %s van B wijzigen: %d %v", c, status, out)
		}
		if after := getRecord(t, p, c, w.idsB()[c]); !reflect.DeepEqual(before, after) {
			t.Errorf("%s van B is gewijzigd door box A", c)
		}
	}
	status, out := p.do(t, w.BoxATok, "POST", "/api/collections/device_state/records",
		map[string]any{"device": w.DevB, "state": map[string]any{"on": true}})
	if status < 400 {
		t.Errorf("box A mag device_state voor een device van B aanmaken: %d %v", status, out)
	}
}

func TestBoxWritesAllowedFields(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	when := "2031-01-02 03:04:05.000Z"
	patches := []struct {
		collection, id string
		body           map[string]any
	}{
		{"houses", w.HouseA, map[string]any{"select": "offline"}},
		{"houses", w.HouseA, map[string]any{"weather": map[string]any{"condition": "sunny"}}},
		{"houses", w.HouseA, map[string]any{"weather_updated": when}},
		{"devices", w.DevA, map[string]any{"entity_id": "light.nieuw"}},
		{"devices", w.DevA, map[string]any{"online": false}},
		{"device_state", w.StateA, map[string]any{"state": map[string]any{"on": true}}},
		{"device_state", w.StateA, map[string]any{"updated_at": when}},
		{"commands", w.CmdA, map[string]any{"status": "sent"}},
		{"commands", w.CmdA, map[string]any{"error": "kapot"}},
		{"schedules", w.SchedA, map[string]any{"last_run": when}},
		{"schedules", w.SchedA, map[string]any{"last_error": "kapot"}},
		{"schedules", w.SchedA, map[string]any{"next_run": when}},
	}
	for _, c := range patches {
		status, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/"+c.collection+"/records/"+c.id, c.body)
		if status != 200 {
			t.Errorf("box A mag %s %v niet schrijven: %d %v", c.collection, c.body, status, out)
		}
	}
	// alles in één keer, zoals de agent soms doet
	status, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/houses/records/"+w.HouseA,
		map[string]any{"select": "online", "weather": map[string]any{}, "weather_updated": when})
	if status != 200 {
		t.Errorf("houses met alle box-velden tegelijk: %d %v", status, out)
	}
	devA2 := p.create(t, "devices", map[string]any{
		"gateway": w.HouseA, "entity_id": "light.a2", "name": "a2", "type": "light"})
	status, out = p.do(t, w.BoxATok, "POST", "/api/collections/device_state/records",
		map[string]any{"device": devA2, "state": map[string]any{"on": true}})
	if status != 200 {
		t.Errorf("box A mag device_state voor een eigen device niet aanmaken: %d %v", status, out)
	}
}

// otherValueOverrides: velden met een patroon waarvoor een generieke waarde niet past.
var otherValueOverrides = map[string]any{"schedules.time": "07:45", "schedules.trigger": "sunset", "schedules.offset_min": 30}

// allowedFields zijn de velden die een box mag schrijven (Global Constraints).
var allowedFields = map[string][]string{
	"houses":       {"select", "weather", "weather_updated", "push_key"},
	"devices":      {"entity_id", "online", "source", "address", "endpoint", "capabilities", "model"},
	"device_state": {"state", "updated_at"},
	"commands":     {"status", "error"},
	"schedules":    {"last_run", "last_error", "next_run"},
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// otherValue geeft een waarde die PocketBase bij validatie zou accepteren en die
// verschilt van de huidige, zodat een mislukte PATCH echt aan de regel ligt.
func otherValue(t *testing.T, p *pb, collection string, f map[string]any, cur any) any {
	t.Helper()
	name, _ := f["name"].(string)
	if v, ok := otherValueOverrides[collection+"."+name]; ok {
		return v
	}
	maxSelect, _ := f["maxSelect"].(float64)
	multi := maxSelect > 1
	has := func(list any, v string) bool {
		switch c := list.(type) {
		case string:
			return c == v
		case []any:
			for _, x := range c {
				if x == v {
					return true
				}
			}
		}
		return false
	}
	switch f["type"] {
	case "text":
		return "andere-waarde"
	case "bool":
		b, _ := cur.(bool)
		return !b
	case "number":
		n, _ := cur.(float64)
		return n + 1
	case "json":
		return map[string]any{"andere": "waarde"}
	case "date":
		return "2031-01-02 03:04:05.000Z"
	case "select":
		vals, _ := f["values"].([]any)
		for _, v := range vals {
			if s := v.(string); !has(cur, s) {
				if multi {
					return []string{s}
				}
				return s
			}
		}
	case "relation":
		target, _ := f["collectionId"].(string)
		status, out := p.do(t, p.AdminToken, "GET", "/api/collections/"+target+"/records?perPage=200", nil)
		if status != 200 {
			t.Fatalf("relatiedoel %s van %s.%s niet te lezen: %d", target, collection, name, status)
		}
		items, _ := out["items"].([]any)
		for _, it := range items {
			id := it.(map[string]any)["id"].(string)
			if !has(cur, id) {
				if multi {
					return []string{id}
				}
				return id
			}
		}
	}
	t.Fatalf("geen testwaarde voor %s.%s (type %v): breid otherValue uit", collection, name, f["type"])
	return nil
}

func TestBoxCannotWriteOtherFields(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	ids := w.idsA()
	ids["rooms"] = w.roomA
	for _, c := range append([]string{"rooms"}, boxCollections...) {
		status, col := p.do(t, p.AdminToken, "GET", "/api/collections/"+c, nil)
		if status != 200 {
			t.Fatalf("schema %s: %d", c, status)
		}
		fields, _ := col["fields"].([]any)
		tested := 0
		for _, raw := range fields {
			f := raw.(map[string]any)
			name, _ := f["name"].(string)
			if f["system"] == true || f["type"] == "autodate" || contains(allowedFields[c], name) {
				continue
			}
			tested++
			path := "/api/collections/" + c + "/records/" + ids[c]
			orig := getRecord(t, p, c, ids[c])
			other := otherValue(t, p, c, f, orig[name])

			// bewijs dat de waarde geldig is: de superuser mag haar zetten; daarna terug
			if st, out := p.do(t, p.AdminToken, "PATCH", path, map[string]any{name: other}); st != 200 {
				t.Fatalf("%s.%s: testwaarde %v is ongeldig (superuser %d): %v", c, name, other, st, out)
			}
			if st, out := p.do(t, p.AdminToken, "PATCH", path, map[string]any{name: orig[name]}); st != 200 {
				t.Fatalf("%s.%s: herstellen mislukt (%d): %v", c, name, st, out)
			}
			before := getRecord(t, p, c, ids[c])

			st, out := p.do(t, w.BoxATok, "PATCH", path, map[string]any{name: other})
			after := getRecord(t, p, c, ids[c])
			if !reflect.DeepEqual(before, after) {
				t.Errorf("%s.%s: box A heeft het veld gewijzigd (status %d): %v -> %v", c, name, st, before[name], after[name])
			}
			if st < 400 {
				t.Errorf("%s.%s: box A kreeg status %d (verwacht >= 400): %v", c, name, st, out)
			}
		}
		if tested == 0 {
			t.Errorf("%s: geen enkel veld getest", c)
		}
	}
}

func TestBoxCannotCreateOrDelete(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	bodies := map[string]map[string]any{
		"houses":   {"name": "Nep", "members": []string{w.UserA}, "admins": []string{w.UserA}},
		// devices: een box maakt na koppelen een device in zijn eigen huis; zie
		// TestBoxCreatesDeviceInOwnHouse (devices_test.go)
		"commands": {"device": w.DevA, "action": "turn_on", "status": "pending"},
		"scenes":   {"house": w.HouseA, "name": "Nep", "order": 1, "actions": []any{}},
		"schedules": {"house": w.HouseA, "scene": w.SceneA, "time": "08:00",
			"days": []string{"mon"}, "enabled": true},
		"rooms": {"house": w.HouseA, "name": "Nep", "order": 1},
	}
	for c, body := range bodies {
		before := listIDs(t, p, p.AdminToken, c)
		status, out := p.do(t, w.BoxATok, "POST", "/api/collections/"+c+"/records", body)
		if status < 400 {
			t.Errorf("box A mag in %s aanmaken: %d %v", c, status, out)
		}
		if after := listIDs(t, p, p.AdminToken, c); len(after) != len(before) {
			t.Errorf("%s: er is een record bijgekomen", c)
		}
	}
	for c, id := range w.idsA() {
		status, out := p.do(t, w.BoxATok, "DELETE", "/api/collections/"+c+"/records/"+id, nil)
		if status < 400 {
			t.Errorf("box A mag %s verwijderen: %d %v", c, status, out)
		}
		getRecord(t, p, c, id) // moet er nog zijn
	}
}

func TestUserRulesUnchanged(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)
	for _, c := range []string{"houses", "devices", "device_state", "commands", "scenes", "schedules", "rooms"} {
		ids := listIDs(t, p, w.UserATok, c)
		want := w.idsA()[c]
		if c == "rooms" {
			want = w.roomA
		}
		if len(ids) != 1 || ids[0] != want {
			t.Errorf("bewoner A ziet in %s %v, verwacht alleen %s", c, ids, want)
		}
	}
	if status, out := p.do(t, w.UserATok, "GET", "/api/collections/boxes/records", nil); status == 200 {
		if items, _ := out["items"].([]any); len(items) != 0 {
			t.Errorf("bewoner ziet boxen: %v", out)
		}
	}
	status, out := p.do(t, w.UserATok, "POST", "/api/collections/commands/records",
		map[string]any{"device": w.DevA, "action": "turn_off", "status": "pending"})
	if status != 200 {
		t.Errorf("bewoner A mag geen command op eigen device maken: %d %v", status, out)
	}
	status, out = p.do(t, w.UserATok, "POST", "/api/collections/commands/records",
		map[string]any{"device": w.DevB, "action": "turn_off", "status": "pending"})
	if status < 400 {
		t.Errorf("bewoner A mag een command op device van B maken: %d %v", status, out)
	}
}

func TestRealtimeOnlyOwnHouse(t *testing.T) {
	p := startPB(t)
	w := fixture(t, p)

	req, _ := http.NewRequest("GET", p.URL+"/api/realtime", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	type event struct{ name, data string }
	events := make(chan event, 32)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		var name string
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event:"):
				name = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
			case strings.HasPrefix(line, "data:"):
				events <- event{name, strings.TrimSpace(strings.TrimPrefix(line, "data:"))}
			}
		}
	}()
	next := func(d time.Duration) (event, bool) {
		select {
		case e := <-events:
			return e, true
		case <-time.After(d):
			return event{}, false
		}
	}

	e, ok := next(3 * time.Second)
	if !ok || e.name != "PB_CONNECT" {
		t.Fatalf("geen PB_CONNECT: %v %v", e, ok)
	}
	var conn struct {
		ClientID string `json:"clientId"`
	}
	_ = json.Unmarshal([]byte(e.data), &conn)
	status, out := p.do(t, w.BoxATok, "POST", "/api/realtime",
		map[string]any{"clientId": conn.ClientID, "subscriptions": []string{"commands"}})
	if status != 204 {
		t.Fatalf("subscribe mislukt: %d %v", status, out)
	}

	cmdA := p.create(t, "commands", map[string]any{"device": w.DevA, "action": "turn_off", "status": "pending"})
	e, ok = next(3 * time.Second)
	if !ok {
		t.Fatal("box A kreeg geen event voor een command in eigen huis")
	}
	var rec struct {
		Record struct{ ID string } `json:"record"`
	}
	_ = json.Unmarshal([]byte(e.data), &rec)
	if rec.Record.ID != cmdA {
		t.Fatalf("verkeerd event: %s", e.data)
	}

	p.create(t, "commands", map[string]any{"device": w.DevB, "action": "turn_off", "status": "pending"})
	if e, ok := next(2 * time.Second); ok {
		t.Fatalf("box A kreeg een event van huis B: %s", e.data)
	}
}

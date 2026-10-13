//go:build integration

// Regels van motion_lights (spec 2026-10-13-motion-light-design): leden van
// het huis beheren ze, sensor en lampen komen uit dat huis, last_run en
// last_error schrijft alleen de box.
package tests

import "testing"

type motionWorld struct {
	world
	SensorA, SensorB, Lamp2A string
	MemberTok, OutsiderTok   string
}

func motionFixture(t *testing.T, p *pb) motionWorld {
	t.Helper()
	w := motionWorld{world: fixture(t, p)}
	sensor := func(house, name string) string {
		return p.create(t, "devices", map[string]any{
			"gateway": house, "entity_id": "binary_sensor." + name, "name": name, "type": "sensor", "online": true})
	}
	w.SensorA, w.SensorB = sensor(w.HouseA, "gang_a"), sensor(w.HouseB, "gang_b")
	w.Lamp2A = p.create(t, "devices", map[string]any{
		"gateway": w.HouseA, "entity_id": "light.a2", "name": "a2", "type": "light", "online": true})
	member, memberTok := newUserToken(t, p, "huisgenoot@sandhovius.test")
	addMember(t, p, w.HouseA, member)
	w.MemberTok = memberTok
	w.OutsiderTok = p.login(t, "users", "b@sandhovius.test", boxPw)
	return w
}

func (w motionWorld) rule(extra map[string]any) map[string]any {
	body := map[string]any{
		"house": w.HouseA, "sensor": w.SensorA, "devices": []string{w.DevA},
		"only_dark": true, "off_after": 3, "enabled": true,
	}
	for k, v := range extra {
		body[k] = v
	}
	return body
}

func createMotionLight(t *testing.T, p *pb, token string, body map[string]any) (int, map[string]any) {
	t.Helper()
	return p.do(t, token, "POST", "/api/collections/motion_lights/records", body)
}

func TestMotionLightMembersManageTheirHouse(t *testing.T) {
	p := startPB(t)
	w := motionFixture(t, p)

	st, out := createMotionLight(t, p, w.UserATok, w.rule(nil))
	if st != 200 {
		t.Fatalf("beheerder maakt een bewegingslicht: %d %v", st, out)
	}
	id := out["id"].(string)

	// Een huisgenoot (geen beheerder) richt het huis in, ook dit.
	if st, out := createMotionLight(t, p, w.MemberTok, w.rule(map[string]any{"devices": []string{w.Lamp2A}})); st != 200 {
		t.Errorf("huisgenoot maakt een bewegingslicht: %d %v", st, out)
	}
	if st, out := p.do(t, w.MemberTok, "PATCH", "/api/collections/motion_lights/records/"+id,
		map[string]any{"off_after": 10, "devices": []string{w.DevA, w.Lamp2A}, "only_dark": false}); st != 200 {
		t.Errorf("huisgenoot wijzigt: %d %v", st, out)
	}

	// Een buitenstaander ziet en raakt niets.
	if st, out := p.do(t, w.OutsiderTok, "GET", "/api/collections/motion_lights/records", nil); st != 200 || out["totalItems"].(float64) != 0 {
		t.Errorf("buitenstaander ziet de lijst: %d %v", st, out)
	}
	if st, _ := p.do(t, w.OutsiderTok, "GET", "/api/collections/motion_lights/records/"+id, nil); st != 404 {
		t.Errorf("buitenstaander ziet het record: %d", st)
	}
	if st, _ := p.do(t, w.OutsiderTok, "PATCH", "/api/collections/motion_lights/records/"+id, map[string]any{"enabled": false}); st < 400 {
		t.Errorf("buitenstaander wijzigt: %d", st)
	}
	if st, _ := p.do(t, w.OutsiderTok, "DELETE", "/api/collections/motion_lights/records/"+id, nil); st < 400 {
		t.Errorf("buitenstaander verwijdert: %d", st)
	}
	if st, _ := p.do(t, w.MemberTok, "DELETE", "/api/collections/motion_lights/records/"+id, nil); st != 204 {
		t.Errorf("huisgenoot verwijdert: %d", st)
	}
}

func TestMotionLightOnlyDevicesOfTheHouse(t *testing.T) {
	p := startPB(t)
	w := motionFixture(t, p)

	refused := []map[string]any{
		w.rule(map[string]any{"sensor": w.SensorB}),
		w.rule(map[string]any{"devices": []string{w.DevB}}),
		w.rule(map[string]any{"devices": []string{w.DevA, w.DevB}}),
		w.rule(map[string]any{"house": w.HouseB}),
	}
	for _, body := range refused {
		if st, out := createMotionLight(t, p, w.UserATok, body); st < 400 {
			t.Errorf("aanmaken met iets uit huis B: %v gaf %d %v", body, st, out)
		}
	}

	st, out := createMotionLight(t, p, w.UserATok, w.rule(nil))
	if st != 200 {
		t.Fatalf("aanmaken: %d %v", st, out)
	}
	id := out["id"].(string)
	for _, body := range []map[string]any{
		{"sensor": w.SensorB},
		{"devices": []string{w.DevA, w.DevB}},
		{"devices+": w.DevB},
		{"+devices": w.DevB},
		{"house": w.HouseB},
	} {
		patchRefused(t, p, w.UserATok, "motion_lights", id, body, "bewoner A")
	}
}

func TestMotionLightBoxFieldsAreTheBoxes(t *testing.T) {
	p := startPB(t)
	w := motionFixture(t, p)

	for _, body := range []map[string]any{
		w.rule(map[string]any{"last_run": "2026-10-13 20:00:00.000Z"}),
		w.rule(map[string]any{"last_error": "x"}),
	} {
		if st, out := createMotionLight(t, p, w.UserATok, body); st < 400 {
			t.Errorf("bewoner zet een box-veld bij aanmaken: %d %v", st, out)
		}
	}
	st, out := createMotionLight(t, p, w.UserATok, w.rule(nil))
	if st != 200 {
		t.Fatalf("aanmaken: %d %v", st, out)
	}
	id := out["id"].(string)
	patchRefused(t, p, w.UserATok, "motion_lights", id, map[string]any{"last_error": "x"}, "bewoner A")

	// Box A leest zijn eigen huis en schrijft alleen last_run en last_error.
	if st, out := p.do(t, w.BoxATok, "GET", "/api/collections/motion_lights/records", nil); st != 200 || out["totalItems"].(float64) != 1 {
		t.Errorf("box A ziet zijn bewegingslicht niet: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxBTok, "GET", "/api/collections/motion_lights/records", nil); st != 200 || out["totalItems"].(float64) != 0 {
		t.Errorf("box B ziet huis A: %d %v", st, out)
	}
	if st, out := p.do(t, w.BoxATok, "PATCH", "/api/collections/motion_lights/records/"+id,
		map[string]any{"last_run": "2026-10-13 20:00:00.000Z", "last_error": ""}); st != 200 {
		t.Errorf("box A schrijft last_run: %d %v", st, out)
	}
	for _, body := range []map[string]any{
		{"enabled": false}, {"off_after": 30}, {"only_dark": false},
		{"devices": []string{w.Lamp2A}}, {"sensor": w.SensorA}, {"house": w.HouseB},
	} {
		patchRefused(t, p, w.BoxATok, "motion_lights", id, body, "box A")
	}
	patchRefused(t, p, w.BoxBTok, "motion_lights", id, map[string]any{"last_error": "x"}, "box B")
	if st, _ := createMotionLight(t, p, w.BoxATok, w.rule(nil)); st < 400 {
		t.Errorf("box A maakt een bewegingslicht: %d", st)
	}
	if st, _ := p.do(t, w.BoxATok, "DELETE", "/api/collections/motion_lights/records/"+id, nil); st < 400 {
		t.Errorf("box A verwijdert: %d", st)
	}
}

func TestMotionLightValues(t *testing.T) {
	p := startPB(t)
	w := motionFixture(t, p)
	for _, body := range []map[string]any{
		w.rule(map[string]any{"off_after": 0}),
		w.rule(map[string]any{"off_after": 61}),
		w.rule(map[string]any{"off_after": 2.5}),
		w.rule(map[string]any{"devices": []string{}}),
		w.rule(map[string]any{"sensor": ""}),
	} {
		if st, out := createMotionLight(t, p, w.UserATok, body); st != 400 {
			t.Errorf("ongeldig %v: %d %v (verwacht 400)", body, st, out)
		}
	}
	if st, out := createMotionLight(t, p, w.UserATok, w.rule(map[string]any{"off_after": 60, "devices": []string{w.DevA, w.Lamp2A}})); st != 200 {
		t.Errorf("60 minuten en twee lampen: %d %v", st, out)
	}
}

// Een verwijderde sensor neemt zijn bewegingslichten mee; een verwijderde
// lamp valt alleen uit de lijst.
func TestMotionLightCascade(t *testing.T) {
	p := startPB(t)
	w := motionFixture(t, p)
	st, out := createMotionLight(t, p, w.UserATok, w.rule(map[string]any{"devices": []string{w.DevA, w.Lamp2A}}))
	if st != 200 {
		t.Fatalf("aanmaken: %d %v", st, out)
	}
	id := out["id"].(string)
	if st, out := p.do(t, p.AdminToken, "DELETE", "/api/collections/devices/records/"+w.Lamp2A, nil); st != 204 {
		t.Fatalf("lamp verwijderen: %d %v", st, out)
	}
	if devices := getRecord(t, p, "motion_lights", id)["devices"].([]any); len(devices) != 1 || devices[0] != w.DevA {
		t.Errorf("na lamp weg: devices = %v", devices)
	}
	// Ook de laatste lamp mag weg: het apparaat verwijderen mag nooit
	// vastlopen op een bewegingslicht. Dat blijft staan zonder lampen.
	if st, out := p.do(t, p.AdminToken, "DELETE", "/api/collections/devices/records/"+w.DevA, nil); st != 204 {
		t.Fatalf("laatste lamp verwijderen: %d %v", st, out)
	}
	if devices, _ := getRecord(t, p, "motion_lights", id)["devices"].([]any); len(devices) != 0 {
		t.Errorf("na laatste lamp weg: devices = %v", devices)
	}
	if st, out := p.do(t, p.AdminToken, "DELETE", "/api/collections/devices/records/"+w.SensorA, nil); st != 204 {
		t.Fatalf("sensor verwijderen: %d %v", st, out)
	}
	if st, _ := p.do(t, p.AdminToken, "GET", "/api/collections/motion_lights/records/"+id, nil); st != 404 {
		t.Errorf("na sensor weg bestaat het bewegingslicht nog: %d", st)
	}
}

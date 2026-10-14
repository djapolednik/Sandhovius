package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/hkdf"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// decryptPush ontsleutelt een Web Push-bericht zoals een browser (RFC 8291,
// aes128gcm), om te bewijzen dat de ontvanger het kan lezen.
func decryptPush(t *testing.T, body []byte, browser *ecdh.PrivateKey, authSecret []byte) string {
	t.Helper()
	salt, idLen := body[:16], int(body[20])
	serverPub, ciphertext := body[21:21+idLen], body[21+idLen:]
	peer, err := ecdh.P256().NewPublicKey(serverPub)
	if err != nil {
		t.Fatalf("sleutel van de box: %v", err)
	}
	shared, _ := browser.ECDH(peer)
	read := func(secret, salt, info []byte, n int) []byte {
		out := make([]byte, n)
		io.ReadFull(hkdf.New(sha256.New, secret, salt, info), out)
		return out
	}
	info := append(append([]byte("WebPush: info\x00"), browser.PublicKey().Bytes()...), serverPub...)
	ikm := read(shared, authSecret, info, 32)
	cek := read(ikm, salt, []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce := read(ikm, salt, []byte("Content-Encoding: nonce\x00"), 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		t.Fatalf("ontsleutelen: %v", err)
	}
	end := len(plain) - 1
	for end >= 0 && plain[end] == 0 {
		end--
	}
	return string(plain[:end]) // zonder het scheidingsteken 0x02 en opvulling
}

// Meldingen (spec 2026-10-14-notifications-design.md).

func sub(id, user, lang string) pb.PushSubscription {
	return pb.PushSubscription{ID: id, User: user, Key: "KEY", Language: lang, Endpoint: "https://push.test/" + id}
}

func bodies(ms []pushMessage) []string {
	out := []string{}
	for _, m := range ms {
		out = append(out, m.Sub.ID+": "+m.Body)
	}
	slices.Sort(out)
	return out
}

func TestNotifyLeakAndSmokeAlways(t *testing.T) {
	n := newNotifier()
	n.set("KEY", []pb.PushSubscription{sub("a", "sanne", "nl"), sub("b", "tom", "en"), {ID: "oud", User: "tom", Key: "OUDE"}}, nil)
	ms := n.onDevice(pb.Device{ID: "sink", Name: "Gootsteenkastje"}, map[string]bool{"leak": true}, false, routineT0)
	if got := bodies(ms); !slices.Equal(got, []string{"a: Lekkage bij Gootsteenkastje", "b: Leak at Gootsteenkastje"}) {
		t.Errorf("lek: %v", got)
	}
	if !ms[0].Urgent {
		t.Errorf("lek is niet dringend")
	}
	// zonder sleutel (nog geen sleutel): niets
	n.set("", n.subs, nil)
	if ms := n.onDevice(pb.Device{ID: "sink", Name: "x"}, map[string]bool{"smoke": true}, false, routineT0); len(ms) != 0 {
		t.Errorf("zonder sleutel: %v", bodies(ms))
	}
}

func TestNotifyMeldDitConditionsAndCooldown(t *testing.T) {
	n := newNotifier()
	rules := []pb.NotificationRule{
		{ID: "r1", User: "sanne", Device: "door", Event: "open", Enabled: true, NobodyHome: true},
		{ID: "r2", User: "tom", Device: "door", Event: "open", Enabled: true, From: "22:00", To: "07:00"},
		{ID: "r3", User: "tom", Device: "door", Event: "open", Enabled: false},
	}
	n.set("KEY", []pb.PushSubscription{sub("a", "sanne", "nl"), sub("b", "tom", "nl")}, rules)
	door := pb.Device{ID: "door", Name: "Voordeur"}
	open := map[string]bool{"open": true}
	night := time.Date(2026, 10, 14, 23, 0, 0, 0, time.Local)
	day := time.Date(2026, 10, 14, 14, 0, 0, 0, time.Local)

	if got := bodies(n.onDevice(door, open, false, day)); len(got) != 0 {
		t.Errorf("overdag, iemand thuis: %v", got)
	}
	if got := bodies(n.onDevice(door, open, true, day)); !slices.Equal(got, []string{"a: Voordeur is open"}) {
		t.Errorf("overdag, niemand thuis: %v", got)
	}
	if got := bodies(n.onDevice(door, open, true, day.Add(5*time.Minute))); len(got) != 0 {
		t.Errorf("binnen 10 minuten nog eens: %v", got)
	}
	if got := bodies(n.onDevice(door, open, false, night)); !slices.Equal(got, []string{"b: Voordeur is open"}) {
		t.Errorf("'s nachts (over middernacht): %v", got)
	}
	if got := bodies(n.onDevice(door, map[string]bool{"closed": true}, true, night.Add(time.Hour))); len(got) != 0 {
		t.Errorf("dicht: %v", got)
	}
}

func TestNotifyRoutineRecipients(t *testing.T) {
	n := newNotifier()
	n.set("KEY", []pb.PushSubscription{sub("a", "sanne", "nl"), sub("b", "tom", "nl"), sub("c", "tom", "en")}, nil)
	if got := bodies(n.forRoutine("Wasmachine klaar", nil)); len(got) != 3 {
		t.Errorf("iedereen: %v", got)
	}
	if got := bodies(n.forRoutine("Deur", []string{"tom"})); !slices.Equal(got, []string{"b: Deur", "c: Deur"}) {
		t.Errorf("alleen tom: %v", got)
	}
}

func TestPushKeysOnDisk(t *testing.T) {
	path := filepath.Join(t.TempDir(), "push.json")
	first, err := loadOrCreatePushKeys(path)
	if err != nil || first.Public == "" || first.Private == "" {
		t.Fatalf("maken: %+v %v", first, err)
	}
	again, err := loadOrCreatePushKeys(path)
	if err != nil || again != first {
		t.Errorf("tweede keer een andere sleutel: %v", err)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Errorf("bestand leesbaar voor anderen: %v", info.Mode())
	}
}

// Een nep-pushdienst: hij ontvangt een versleuteld bericht met een
// VAPID-handtekening, en antwoordt 201 of 410.
func TestPushSenderAgainstFakeService(t *testing.T) {
	keys, err := loadOrCreatePushKeys(filepath.Join(t.TempDir(), "push.json"))
	if err != nil {
		t.Fatal(err)
	}
	var got []*http.Request
	var bodiesSeen [][]byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		got = append(got, r)
		bodiesSeen = append(bodiesSeen, body)
		if strings.HasSuffix(r.URL.Path, "/weg") {
			w.WriteHeader(http.StatusGone)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	// De sleutels van een "browser".
	browser, _ := ecdh.P256().GenerateKey(rand.Reader)
	authSecret := make([]byte, 16)
	rand.Read(authSecret)
	enc := base64.RawURLEncoding.EncodeToString
	s := pb.PushSubscription{ID: "a", Endpoint: srv.URL + "/ok", P256dh: enc(browser.PublicKey().Bytes()), Auth: enc(authSecret)}

	sender := &pushSender{keys: keys, subject: "noreply@sandhovius.local", client: srv.Client()}
	if err := sender.send(pushMessage{Sub: s, Body: "Lekkage bij Gootsteenkastje", Urgent: true}); err != nil {
		t.Fatalf("versturen: %v", err)
	}
	r := got[0]
	if r.Header.Get("Content-Encoding") != "aes128gcm" || !strings.HasPrefix(r.Header.Get("Authorization"), "vapid t=") ||
		!strings.Contains(r.Header.Get("Authorization"), "k="+keys.Public) {
		t.Errorf("koppen: %v", r.Header)
	}
	if r.Header.Get("Urgency") != "high" || r.Header.Get("TTL") != "86400" {
		t.Errorf("urgentie/ttl: %q %q", r.Header.Get("Urgency"), r.Header.Get("TTL"))
	}
	if strings.Contains(string(bodiesSeen[0]), "Lekkage") {
		t.Errorf("tekst onversleuteld verstuurd")
	}
	if plain := decryptPush(t, bodiesSeen[0], browser, authSecret); plain != `{"title":"Sandhovius","body":"Lekkage bij Gootsteenkastje"}` {
		t.Errorf("ontsleuteld: %q", plain)
	}

	s.Endpoint = srv.URL + "/weg"
	if err := sender.send(pushMessage{Sub: s, Body: "x"}); !errors.Is(err, errSubscriptionGone) {
		t.Errorf("410: %v", err)
	}
}

func TestRunnerSendsAndCleansUp(t *testing.T) {
	r := newRoutineRunner(filepath.Join(t.TempDir(), "automations.json"))
	r.step = func(string, pb.SceneAction, func(string) (*pb.Device, error)) error { return nil }
	var sent []string
	var reports []string
	gone := make(chan string, 1)
	r.push = func(m pushMessage) error {
		sent = append(sent, m.Sub.ID+": "+m.Body)
		if m.Sub.ID == "weg" {
			return errSubscriptionGone
		}
		return nil
	}
	r.gone = func(id string) { gone <- id }
	r.report = func(id string, err error) {
		if err != nil {
			id += " met fout"
		}
		reports = append(reports, id)
	}
	r.setPushKey("KEY")
	notifyRoutine := pb.Automation{ID: "r1", Enabled: true,
		Starter: pb.AutomationStarter{Kind: "sensor", Device: "door", Event: "open"},
		Actions: []pb.AutomationAction{{Kind: "notify", Text: "Deur open", Users: []string{"sanne"}}}}
	r.start("huis", &scheduleSnapshot{
		automations: []pb.Automation{notifyRoutine},
		devices: map[string]pb.Device{
			"sink": {ID: "sink", Name: "Gootsteenkastje", Source: "zigbee", Address: "0x2", Type: "sensor"},
			"door": {ID: "door", Name: "Voordeur", Source: "zigbee", Address: "0x1", Type: "sensor"},
		},
		subscriptions: []pb.PushSubscription{sub("a", "sanne", "nl"), sub("weg", "tom", "nl")},
	})
	now := routineT0
	r.onState(zigbeeKey("0x2"), map[string]any{"water_leak": false}, now)
	r.onState(zigbeeKey("0x2"), map[string]any{"water_leak": true}, now.Add(time.Second))
	slices.Sort(sent)
	if !slices.Equal(sent, []string{"a: Lekkage bij Gootsteenkastje", "weg: Lekkage bij Gootsteenkastje"}) {
		t.Errorf("lek: %v", sent)
	}
	select {
	case id := <-gone:
		if id != "weg" {
			t.Errorf("opgeruimd: %s", id)
		}
	case <-time.After(time.Second):
		t.Errorf("verlopen aanmelding niet opgeruimd")
	}
	sent = nil
	r.onState(zigbeeKey("0x1"), map[string]any{"contact": true}, now)
	r.onState(zigbeeKey("0x1"), map[string]any{"contact": false}, now.Add(time.Minute))
	if !slices.Equal(sent, []string{"a: Deur open"}) || !slices.Equal(reports, []string{"r1"}) {
		t.Errorf("routine-melding: %v %v", sent, reports)
	}
}

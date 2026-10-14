package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"slices"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	pb "sandhovius/local-agent/internal/pocketbase"
)

// Meldingen (spec 2026-10-14-notifications-design.md): de box beslist en
// verstuurt zelf Web Push. notifier is puur: hij krijgt gebeurtenissen en
// zegt welke berichten naar welke aanmelding gaan. Versturen doet pushSender.
// Niet veilig voor gelijktijdig gebruik (de routine-runner houdt de lock).

// notifyCooldown: hooguit één melding per Meld dit-regel per zoveel tijd, zodat
// een gang met beweging geen reeks meldingen geeft.
const notifyCooldown = 10 * time.Minute

type pushMessage struct {
	Sub    pb.PushSubscription
	Body   string
	Urgent bool // lek en rook: hoog, en langer bewaard
}

type notifier struct {
	key   string // de publieke VAPID-sleutel van deze box
	subs  []pb.PushSubscription
	rules []pb.NotificationRule
	last  map[string]time.Time // regel → laatste melding
}

func newNotifier() *notifier {
	return &notifier{last: map[string]time.Time{}}
}

func (n *notifier) set(key string, subs []pb.PushSubscription, rules []pb.NotificationRule) {
	n.key, n.subs, n.rules = key, subs, rules
}

// to: de aanmeldingen van deze leden (nil = iedereen), met de sleutel van nu.
// Een aanmelding met een oude sleutel (een vervangen box) slaat hij over: de
// app meldt dan opnieuw aan.
func (n *notifier) to(users []string) []pb.PushSubscription {
	var out []pb.PushSubscription
	for _, s := range n.subs {
		if n.key == "" || s.Key != n.key {
			continue
		}
		if users != nil && !slices.Contains(users, s.User) {
			continue
		}
		out = append(out, s)
	}
	return out
}

// onDevice: wat er met een apparaat gebeurde (de overgangen uit de
// routinemotor). Lek en rook gaan altijd naar iedereen; open en beweging
// alleen via Meld dit, als de voorwaarden kloppen.
func (n *notifier) onDevice(device pb.Device, happened map[string]bool, nobodyHome bool, now time.Time) []pushMessage {
	var out []pushMessage
	for _, event := range []string{"leak", "smoke"} {
		if !happened[event] {
			continue
		}
		for _, s := range n.to(nil) {
			out = append(out, pushMessage{Sub: s, Body: notifyText(s.Language, event, device.Name), Urgent: true})
		}
	}
	for _, r := range n.rules {
		if !r.Enabled || r.Device != device.ID || !happened[r.Event] {
			continue
		}
		if r.NobodyHome && !nobodyHome {
			continue
		}
		if r.From != "" && !between(r.From, r.To, now) {
			continue
		}
		if last, ok := n.last[r.ID]; ok && now.Sub(last) < notifyCooldown {
			continue
		}
		subs := n.to([]string{r.User})
		if len(subs) == 0 {
			continue
		}
		n.last[r.ID] = now
		for _, s := range subs {
			out = append(out, pushMessage{Sub: s, Body: notifyText(s.Language, r.Event, device.Name)})
		}
	}
	return out
}

// forRoutine: de actie "Stuur een melding" van een routine.
func (n *notifier) forRoutine(text string, users []string) []pushMessage {
	if len(users) == 0 {
		users = nil
	}
	var out []pushMessage
	for _, s := range n.to(users) {
		out = append(out, pushMessage{Sub: s, Body: text})
	}
	return out
}

// between: of now (lokale tijd, TZ=Europe/Amsterdam zoals de schema's) tussen
// from en to valt, ook over middernacht.
func between(from, to string, now time.Time) bool {
	t := now.Format("15:04")
	if from <= to {
		return from <= t && t < to
	}
	return t >= from || t < to
}

// De teksten: kort en zonder meetwaarden (spec, Privacy). Taal van de
// aanmelding; Nederlands als die onbekend is.
var notifyTexts = map[string]map[string]string{
	"nl": {"leak": "Lekkage bij %s", "smoke": "Rook bij %s", "open": "%s is open", "motion": "Beweging bij %s"},
	"en": {"leak": "Leak at %s", "smoke": "Smoke at %s", "open": "%s is open", "motion": "Motion at %s"},
}

func notifyText(language, event, name string) string {
	texts, ok := notifyTexts[language]
	if !ok {
		texts = notifyTexts["nl"]
	}
	return fmt.Sprintf(texts[event], name)
}

// ---- de sleutel ----

// pushKeys: het VAPID-sleutelpaar van deze box. Het privédeel verlaat de box
// nooit (niet in PocketBase, niet in een log).
type pushKeys struct {
	Private string `json:"private"`
	Public  string `json:"public"`
}

// loadOrCreatePushKeys leest het sleutelpaar, of maakt er één bij de eerste
// start (alleen leesbaar voor de agent).
func loadOrCreatePushKeys(path string) (pushKeys, error) {
	var keys pushKeys
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, &keys); err == nil && keys.Private != "" && keys.Public != "" {
			return keys, nil
		}
		return pushKeys{}, fmt.Errorf("pushsleutel in %s is onleesbaar", path)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return pushKeys{}, fmt.Errorf("pushsleutel lezen: %w", err)
	}
	keys.Private, keys.Public, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return pushKeys{}, fmt.Errorf("pushsleutel maken: %w", err)
	}
	data, _ = json.Marshal(keys)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return pushKeys{}, fmt.Errorf("pushsleutel opslaan: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return pushKeys{}, fmt.Errorf("pushsleutel opslaan: %w", err)
	}
	return keys, nil
}

// ---- versturen ----

// errSubscriptionGone: de pushdienst kent de aanmelding niet meer (404/410);
// de aanroeper ruimt hem op.
var errSubscriptionGone = errors.New("aanmelding bestaat niet meer")

type pushSender struct {
	keys    pushKeys
	subject string // contact in de VAPID-token (PUSH_SUBJECT)
	client  webpush.HTTPClient
}

type pushPayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func (p *pushSender) send(m pushMessage) error {
	payload, _ := json.Marshal(pushPayload{Title: "Sandhovius", Body: m.Body})
	opts := &webpush.Options{
		HTTPClient:      p.client,
		Subscriber:      p.subject,
		VAPIDPublicKey:  p.keys.Public,
		VAPIDPrivateKey: p.keys.Private,
		TTL:             3600,
		Urgency:         webpush.UrgencyNormal,
	}
	if m.Urgent {
		opts.TTL, opts.Urgency = 24*3600, webpush.UrgencyHigh
	}
	sub := &webpush.Subscription{Endpoint: m.Sub.Endpoint, Keys: webpush.Keys{P256dh: m.Sub.P256dh, Auth: m.Sub.Auth}}
	resp, err := webpush.SendNotification(payload, sub, opts)
	if err != nil {
		return fmt.Errorf("melding versturen: %w", err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return errSubscriptionGone
	case resp.StatusCode >= 300:
		return fmt.Errorf("pushdienst antwoordde %d", resp.StatusCode)
	}
	return nil
}

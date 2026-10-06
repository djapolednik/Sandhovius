//go:build integration

// Claim- en release-endpoint: een bewoner koppelt een box met de code van de
// sticker. Alles hier draait tegen een wegwerp-PocketBase met de echte hooks.
package tests

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"strings"
	"sync"
	"testing"
)

// normalizeCode is de afspraak uit de constraints: hoofdletters, spaties en
// streepjes weg, O -> 0, I en L -> 1.
func normalizeCode(s string) string {
	s = strings.ToUpper(s)
	return strings.NewReplacer(" ", "", "-", "", "O", "0", "I", "1", "L", "1").Replace(s)
}

func codeHash(code string) string {
	h := sha256.Sum256([]byte(normalizeCode(code)))
	return hex.EncodeToString(h[:])
}

// newCodedBox maakt een box met claimcode en geeft het id terug.
func newCodedBox(t *testing.T, p *pb, serial, code string) string {
	t.Helper()
	return p.create(t, "boxes", map[string]any{
		"serial": serial, "password": boxPw, "passwordConfirm": boxPw,
		"claim_code_hash": codeHash(code),
	})
}

// verifiedUser maakt een bevestigde bewoner en geeft id en token terug.
func verifiedUser(t *testing.T, p *pb, email string) (string, string) {
	t.Helper()
	id := p.create(t, "users", map[string]any{
		"email": email, "password": boxPw, "passwordConfirm": boxPw, "verified": true})
	return id, p.login(t, "users", email, boxPw)
}

func (p *pb) claim(t *testing.T, token string, body map[string]any) (int, map[string]any) {
	t.Helper()
	return p.do(t, token, "POST", "/api/sandhovius/claim", body)
}

func (p *pb) boxRecord(t *testing.T, id string) map[string]any {
	t.Helper()
	st, out := p.do(t, p.AdminToken, "GET", "/api/collections/boxes/records/"+id, nil)
	if st != 200 {
		t.Fatalf("box lezen: %d %v", st, out)
	}
	return out
}

func (p *pb) houseRecord(t *testing.T, id string) map[string]any {
	t.Helper()
	st, out := p.do(t, p.AdminToken, "GET", "/api/collections/houses/records/"+id, nil)
	if st != 200 {
		t.Fatalf("huis lezen: %d %v", st, out)
	}
	return out
}

func (p *pb) boxIDBySerial(t *testing.T, serial string) string {
	t.Helper()
	st, out := p.do(t, p.AdminToken, "GET", "/api/collections/boxes/records?filter=serial%3D%22"+serial+"%22", nil)
	items, _ := out["items"].([]any)
	if st != 200 || len(items) != 1 {
		t.Fatalf("box zoeken: %d %v", st, out)
	}
	return items[0].(map[string]any)["id"].(string)
}

func TestClaimNewHouse(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	uid, tok := verifiedUser(t, p, "claim@sandhovius.test")

	st, out := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "k7qm 2xrp 9dtw", "house_name": "Villa"})
	if st != 200 {
		t.Fatalf("claim: %d %v", st, out)
	}
	hid, _ := out["house"].(string)
	if hid == "" {
		t.Fatalf("geen house in antwoord: %v", out)
	}
	h := p.houseRecord(t, hid)
	if h["user"] != uid || h["name"] != "Villa" || h["claimed_at"] == "" {
		t.Fatalf("huis klopt niet: %v", h)
	}
	if box := p.boxRecord(t, p.boxIDBySerial(t, "SH-C-1")); box["house"] != hid {
		t.Fatalf("box hoort bij %v, verwacht %v", box["house"], hid)
	}
	btok := p.login(t, "boxes", "SH-C-1", boxPw)
	st, list := p.do(t, btok, "GET", "/api/collections/houses/records", nil)
	items, _ := list["items"].([]any)
	if st != 200 || len(items) != 1 {
		t.Fatalf("box ziet huizen: %d %v", st, list)
	}
}

func TestClaimDefaultHouseName(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tok := verifiedUser(t, p, "claim@sandhovius.test")
	st, out := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim: %d %v", st, out)
	}
	if h := p.houseRecord(t, out["house"].(string)); h["name"] != "Thuis" {
		t.Fatalf("standaardnaam: %v", h["name"])
	}
}

func TestClaimWrongCodeAndUnknownSerialLookTheSame(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tok := verifiedUser(t, p, "claim@sandhovius.test")

	st1, o1 := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "AAAA-AAAA-AAAA"})
	st2, o2 := p.claim(t, tok, map[string]any{"serial": "SH-NOPE", "code": "AAAA-AAAA-AAAA"})
	b1, _ := json.Marshal(o1)
	b2, _ := json.Marshal(o2)
	if st1 != 400 || st2 != 400 || string(b1) != string(b2) || o1["message"] != "Deze code klopt niet" {
		t.Fatalf("verschillend: %d %s / %d %s", st1, b1, st2, b2)
	}
	t.Logf("400-body: %s", b1)
	if p.boxRecord(t, id)["house"] != "" {
		t.Fatal("box mag niet gekoppeld zijn")
	}
}

func TestClaimBoxWithoutHashCanNeverBeClaimed(t *testing.T) {
	p := startPB(t)
	p.create(t, "boxes", map[string]any{"serial": "SH-OLD", "password": boxPw, "passwordConfirm": boxPw})
	_, tok := verifiedUser(t, p, "claim@sandhovius.test")
	for _, code := range []string{"", "----", "K7QM-2XRP-9DTW"} {
		st, out := p.claim(t, tok, map[string]any{"serial": "SH-OLD", "code": code})
		if st != 400 || out["message"] != "Deze code klopt niet" {
			t.Fatalf("code %q: %d %v", code, st, out)
		}
	}
}

func TestClaimRequiresVerified(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	p.create(t, "users", map[string]any{"email": "u@sandhovius.test", "password": boxPw, "passwordConfirm": boxPw})
	tok := p.login(t, "users", "u@sandhovius.test", boxPw)
	st, out := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 403 || out["message"] != "Bevestig eerst je e-mailadres" {
		t.Fatalf("onbevestigd: %d %v", st, out)
	}
	t.Logf("403-body: %v", out)
	st, _ = p.claim(t, "", map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 401 && st != 403 {
		t.Fatalf("gast: %d", st)
	}
	// een box mag niet claimen
	newBox(t, p, "SH-OTHER")
	btok := p.login(t, "boxes", "SH-OTHER", boxPw)
	st, _ = p.claim(t, btok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 401 && st != 403 {
		t.Fatalf("box: %d", st)
	}
}

func TestClaimAlreadyClaimed(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")
	st, out := p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim A: %d %v", st, out)
	}
	houseA := out["house"].(string)

	st, out = p.claim(t, tokB, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 409 || out["message"] != "Deze box is al gekoppeld" {
		t.Fatalf("claim B: %d %v", st, out)
	}
	t.Logf("409-body: %v", out)
	// B met een verkeerde code krijgt gewoon 400: geen lek over de status
	st, _ = p.claim(t, tokB, map[string]any{"serial": "SH-C-1", "code": "AAAA-AAAA-AAAA"})
	if st != 400 {
		t.Fatalf("B verkeerde code: %d", st)
	}
	// dezelfde gebruiker mag zijn eigen huis opnieuw koppelen
	st, out = p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW", "replace_house": houseA})
	if st != 200 || out["house"] != houseA {
		t.Fatalf("claim A opnieuw: %d %v", st, out)
	}
	if p.boxRecord(t, id)["house"] != houseA {
		t.Fatal("box hoort bij huis A")
	}
}

// Serienummers staan in hoofdletters; wie ze klein overtikt moet ook kunnen koppelen.
func TestClaimLowercaseSerial(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tok := verifiedUser(t, p, "claim@sandhovius.test")
	st, out := p.claim(t, tok, map[string]any{"serial": "  sh-c-1 ", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim met kleine letters: %d %v", st, out)
	}
	if p.boxRecord(t, id)["house"] != out["house"] {
		t.Fatal("box hoort bij het nieuwe huis")
	}
}

// Nog een keer op "Box koppelen" (time-out, dubbel tikken) na een gelukte
// claim: dezelfde gebruiker krijgt zijn huis terug, een ander blijft 409.
func TestClaimRetryAfterSuccess(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	uid, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")
	body := map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW", "house_name": "Villa"}
	st, out := p.claim(t, tokA, body)
	if st != 200 {
		t.Fatalf("claim: %d %v", st, out)
	}
	h := out["house"].(string)

	st, out = p.claim(t, tokA, body)
	if st != 200 || out["house"] != h {
		t.Fatalf("opnieuw met house_name: %d %v, verwacht 200 %s", st, out, h)
	}
	// Ook met een ander eigen huis als replace_house: de box blijft waar hij is.
	other := p.create(t, "houses", map[string]any{"user": uid, "name": "Zomerhuis"})
	st, out = p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW", "replace_house": other})
	if st != 200 || out["house"] != h {
		t.Fatalf("opnieuw met ander eigen huis: %d %v, verwacht 200 %s", st, out, h)
	}
	st, out = p.claim(t, tokB, body)
	if st != 409 || out["message"] != "Deze box is al gekoppeld" {
		t.Fatalf("andere gebruiker: %d %v", st, out)
	}
	if p.boxRecord(t, id)["house"] != h {
		t.Fatal("box hoort bij het eerste huis te blijven")
	}
	_, list := p.do(t, p.AdminToken, "GET", "/api/collections/houses/records", nil)
	if items, _ := list["items"].([]any); len(items) != 2 {
		t.Fatalf("verwacht 2 huizen (Villa en Zomerhuis), kreeg %d", len(items))
	}
}

func TestClaimReplace(t *testing.T) {
	p := startPB(t)
	b1 := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	b2 := newCodedBox(t, p, "SH-C-2", "AAAA-BBBB-CCCC")
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	st, out := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim 1: %d %v", st, out)
	}
	h := out["house"].(string)
	st, out = p.claim(t, tok, map[string]any{"serial": "SH-C-2", "code": "AAAA-BBBB-CCCC", "replace_house": h})
	if st != 200 || out["house"] != h {
		t.Fatalf("claim 2: %d %v", st, out)
	}
	if p.boxRecord(t, b2)["house"] != h || p.boxRecord(t, b1)["house"] != "" {
		t.Fatalf("boxen: 1=%v 2=%v", p.boxRecord(t, b1)["house"], p.boxRecord(t, b2)["house"])
	}
}

func TestClaimReplaceOtherUsersHouse(t *testing.T) {
	p := startPB(t)
	b1 := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	b2 := newCodedBox(t, p, "SH-C-2", "AAAA-BBBB-CCCC")
	_, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")
	_, out := p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	hA := out["house"].(string)

	st, out := p.claim(t, tokB, map[string]any{"serial": "SH-C-2", "code": "AAAA-BBBB-CCCC", "replace_house": hA})
	if st != 404 {
		t.Fatalf("verwacht 404, kreeg %d %v", st, out)
	}
	t.Logf("404-body: %v", out)
	if p.boxRecord(t, b1)["house"] != hA || p.boxRecord(t, b2)["house"] != "" {
		t.Fatal("niets mag veranderd zijn")
	}
	if p.houseRecord(t, hA)["claimed_at"] == "" {
		t.Fatal("huis A hoort gekoppeld te blijven")
	}
	// ook met een huis dat niet bestaat
	st, _ = p.claim(t, tokB, map[string]any{"serial": "SH-C-2", "code": "AAAA-BBBB-CCCC", "replace_house": "nietbestaand1x"})
	if st != 404 {
		t.Fatalf("onbekend huis: %d", st)
	}
}

func TestClaimConcurrent(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")

	statuses := make([]int, 2)
	var wg sync.WaitGroup
	for i, tok := range []string{tokA, tokB} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses[i], _ = p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
		}()
	}
	wg.Wait()
	ok, conflict := 0, 0
	for _, s := range statuses {
		switch s {
		case 200:
			ok++
		case 409:
			conflict++
		}
	}
	if ok != 1 || conflict != 1 {
		t.Fatalf("statussen %v: precies één 200 en één 409 verwacht", statuses)
	}
	if p.boxRecord(t, id)["house"] == "" {
		t.Fatal("box moet een huis hebben")
	}
}

func TestReleaseByOwner(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")
	_, out := p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	h := out["house"].(string)

	st, out := p.do(t, tokA, "POST", "/api/sandhovius/release", map[string]any{"house": h})
	if st != 200 {
		t.Fatalf("release: %d %v", st, out)
	}
	if p.boxRecord(t, id)["house"] != "" || p.houseRecord(t, h)["claimed_at"] != "" {
		t.Fatalf("box moet vrij zijn en claimed_at leeg: %v / %v", p.boxRecord(t, id), p.houseRecord(t, h))
	}
	st, out = p.claim(t, tokB, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("nieuwe claim: %d %v", st, out)
	}
}

func TestReleaseByOther(t *testing.T) {
	p := startPB(t)
	id := newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tokA := verifiedUser(t, p, "a@sandhovius.test")
	_, tokB := verifiedUser(t, p, "b@sandhovius.test")
	_, out := p.claim(t, tokA, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	h := out["house"].(string)

	st, _ := p.do(t, tokB, "POST", "/api/sandhovius/release", map[string]any{"house": h})
	if st != 404 {
		t.Fatalf("verwacht 404, kreeg %d", st)
	}
	if p.boxRecord(t, id)["house"] != h || p.houseRecord(t, h)["claimed_at"] == "" {
		t.Fatal("box moet gekoppeld blijven")
	}
	st, _ = p.do(t, "", "POST", "/api/sandhovius/release", map[string]any{"house": h})
	if st != 401 && st != 403 {
		t.Fatalf("gast: %d", st)
	}
}

func TestClaimRateLimited(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	var last int
	var body map[string]any
	for i := 0; i < 11; i++ {
		last, body = p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "AAAA-AAAA-AAAA"})
	}
	if last != 429 {
		t.Fatalf("11e claim: %d %v, verwacht 429", last, body)
	}
	t.Logf("429-body: %v", body)
}

func TestClaimCodeHashNeverExposed(t *testing.T) {
	p := startPB(t)
	newCodedBox(t, p, "SH-C-1", "K7QM-2XRP-9DTW")
	hash := codeHash("K7QM-2XRP-9DTW")
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	st, out := p.claim(t, tok, map[string]any{"serial": "SH-C-1", "code": "K7QM-2XRP-9DTW"})
	if st != 200 {
		t.Fatalf("claim: %d %v", st, out)
	}
	check := func(what string, v any) {
		b, _ := json.Marshal(v)
		if strings.Contains(string(b), "claim_code_hash") || strings.Contains(string(b), hash) {
			t.Errorf("%s lekt de hash: %s", what, b)
		}
	}
	check("claim-antwoord", out)
	btok := p.login(t, "boxes", "SH-C-1", boxPw)
	for _, c := range []string{"boxes", "houses"} {
		for who, token := range map[string]string{"bewoner": tok, "box": btok} {
			_, list := p.do(t, token, "GET", "/api/collections/"+c+"/records", nil)
			check(who+" list "+c, list)
		}
	}
	_, login := p.do(t, "", "POST", "/api/collections/boxes/auth-with-password",
		map[string]any{"identity": "SH-C-1", "password": boxPw})
	check("box-login", login)
	// filteren op het veld mag niets opleveren
	_, list := p.do(t, btok, "GET", "/api/collections/boxes/records?filter=claim_code_hash%3D%22"+hash+"%22", nil)
	if items, _ := list["items"].([]any); len(items) > 0 {
		t.Errorf("filter op hash geeft resultaat: %v", list)
	}
}

func TestNormalizationVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/claim_codes.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []struct{ Input, Normalized, Sha256 string }
	if err := json.Unmarshal(raw, &vectors); err != nil || len(vectors) < 6 {
		t.Fatalf("vectoren: %v (%d)", err, len(vectors))
	}
	p := startPB(t)
	_, tok := verifiedUser(t, p, "a@sandhovius.test")
	for i, v := range vectors {
		if normalizeCode(v.Input) != v.Normalized || codeHash(v.Input) != v.Sha256 {
			t.Fatalf("Go-helper wijkt af voor %q", v.Input)
		}
		serial := "SH-V-" + string(rune('A'+i))
		p.create(t, "boxes", map[string]any{
			"serial": serial, "password": boxPw, "passwordConfirm": boxPw, "claim_code_hash": v.Sha256})
		if st, out := p.claim(t, tok, map[string]any{"serial": serial, "code": v.Input}); st != 200 {
			t.Errorf("vector %q: %d %v", v.Input, st, out)
		}
	}
}

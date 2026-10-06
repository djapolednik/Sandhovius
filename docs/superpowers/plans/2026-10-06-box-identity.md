# Box-identiteit — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De agent logt in als zijn eigen `boxes`-record in plaats van als PocketBase-superuser, en mag via de regels alleen bij zijn eigen huis.

**Architecture:** Nieuwe auth-collectie `boxes` (serial + geheim + `house`), een box-tak in de regels van zes collecties, en een integratietest die de regels tegen een tijdelijke PocketBase-binary bewijst. De agent leest `/data/box.json`, haalt zijn huis uit het auth-record en controleert elke 5 minuten of het huis veranderde (claim, vervanging, loskoppelen). `scripts/provision-box.py` maakt boxen aan.

**Tech Stack:** PocketBase 0.40.4 (JS-migraties), Go (agent + integratietest), Python 3 (provisioning).

**Spec:** `docs/superpowers/specs/2026-10-06-box-identity-design.md`

## Global Constraints

- `B` = `@request.auth.collectionName = "boxes"`, `H` = `@request.auth.house`. Bestaande bewonersregels blijven; box-tak erbij met `(<bestaand>) || (<box>)`.
- Box mag bijwerken, alleen deze velden: `houses`: `select`, `weather`, `weather_updated` · `devices`: `entity_id`, `online` · `device_state`: `state`, `updated_at` · `commands`: `status`, `error` · `schedules`: `last_run`, `last_error`. Box maakt alleen `device_state` aan. `scenes` alleen lezen, `rooms` niets.
- `boxes`: identity-veld `serial` (uniek, verplicht), relatie `house` (optioneel, max 1). List/view `id = @request.auth.id`; create/update/delete superuser. Alleen password-auth.
- Boxgeheim: 32 willekeurige bytes, base64. `box.json` = `{"serial","secret","house"}`, modus 0600, atomisch (tmp + rename).
- `BOX_FILE` standaard `/data/box.json`; ontbreekt of kapot → agent stopt met een duidelijke fout.
- Huis-check-interval zonder of met huis: 5 minuten (`houseCheckInterval`).
- PocketBase-versie in de test: 0.40.4.
- Na elke taak: `cd agent && go vet ./... && go test ./...` groen; vanaf Task 1 ook `cd backend/tests && go test -tags integration ./...`.
- Logregels/commentaar Nederlands, in de stijl van de bestaande code. Commits klein, branch `box-identity`, eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Geen echte apparaten schakelen; dev-data herstellen na handmatige tests.

## Review Focus

1. **Rate limits zetten ook de standaardregels van PocketBase aan** (`*:auth`, `*:create`, `/api/`): de bewoner-login in de PWA en de agent moeten daaronder gewoon blijven werken. Test in Task 1 (bewoner logt 2× achter elkaar in) en handmatig in Task 6.
2. **Box zonder huis na een herstart** (`box.json` zonder `house`, PocketBase onbereikbaar): agent draait lokaal, geen snapshot, geen crash. Test in Task 5.
3. **Huis gewist terwijl de agent draait** (box losgekoppeld): agent stopt met hartslag en PocketBase-schrijven, de snapshot van het oude huis gaat niet meer naar het oude huis. Test in Task 5.
4. **Bewonersregels worden niet ruimer**: bewoner A ziet niets van huis B en geen `boxes`, ook niet na de herschreven regels. Test in Task 2.
5. **Een `box.json` met CRLF of spaties** (met de hand bewerkt op Windows): moet gewoon laden. Test in Task 3.

---

### Task 1: `boxes`-collectie, testharnas en rate limit

**Files:**
- Create: `backend/pb_migrations/1790700000_add_boxes.js`
- Create: `backend/tests/go.mod` (module `sandhovius/backend-tests`, Go-versie gelijk aan `agent/go.mod`)
- Create: `backend/tests/pbtest_test.go` (harnas, build-tag `integration`)
- Create: `backend/tests/boxes_test.go` (build-tag `integration`)
- Modify: `.gitignore` (`backend/tests/.cache/`)

**Interfaces:**
- Produces (harnas, in `pbtest_test.go`):
  - `func startPB(t *testing.T) *pb` — downloadt `pocketbase_0.40.4_<goos>_<goarch>.zip` van `https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/` naar `backend/tests/.cache/` (eenmalig), maakt een superuser met `superuser upsert` in een `t.TempDir()`, start `serve --http 127.0.0.1:<vrije poort> --dir <tmp> --migrationsDir ../pb_migrations`, wacht op `/api/health`, stopt via `t.Cleanup`.
  - `type pb struct{ URL, AdminToken string }`
  - `func (p *pb) do(t *testing.T, token, method, path string, body any) (status int, out map[string]any)`
  - `func (p *pb) login(t *testing.T, collection, identity, password string) string` (token, `t.Fatal` bij fout)
  - `func (p *pb) create(t *testing.T, collection string, body map[string]any) string` (superuser, geeft id)

- [ ] **Step 1: Failing tests** in `boxes_test.go`:
  - `TestBoxLogsInWithSerial`: superuser maakt `boxes` `{serial:"SH-T-1", password:"geheim-123456", passwordConfirm:…}`; `login("boxes","SH-T-1",…)` geeft een token; het record in het antwoord heeft `house == ""`.
  - `TestBoxSeesOnlyItself`: twee boxen; box 1 `GET /api/collections/boxes/records` → precies 1 item (zichzelf).
  - `TestUserCannotSeeBoxes`: bewoner (collectie `users`) → `GET boxes/records` geeft 0 items of 403.
  - `TestBoxCannotUpdateItself`: box 1 `PATCH boxes/records/<eigen id>` `{house:"x"}` → status ≥ 400.
  - `TestClaimedAtIsPlainDate`: superuser maakt een huis; `claimed_at` is leeg.
  - `TestBoxLoginRateLimited`: 11 foute logins op `boxes` binnen een minuut → minstens één 429.
  - `TestUserLoginStillWorksWithRateLimits`: bewoner logt 2× direct na elkaar in → beide 200.
- [ ] **Step 2: Draaien, moet falen.** `cd backend/tests && go test -tags integration ./...` → FAIL (collectie `boxes` bestaat niet).
- [ ] **Step 3: Migratie.** `new Collection({ type: "auth", name: "boxes", … })` met de regels uit Global Constraints, `passwordAuth: { enabled: true, identityFields: ["serial"] }`, OAuth2/OTP/MFA uit, unieke index op `serial`, relatie `house` → `houses`. `claimed_at`: `autodate` verwijderen en `DateField` met dezelfde naam toevoegen. Rate limits: `app.settings()`, `rateLimits.enabled = true`, regel `{ label: "boxes:auth", audience: "@guest", duration: 60, maxRequests: 10 }` erbij (bestaande standaardregels laten staan), `app.save(settings)`. Down maakt alles ongedaan. Typen controleren in `pb_data/types.d.ts` (`PasswordAuthConfig`, `RateLimitRule`).
- [ ] **Step 4: Draaien, moet slagen.** Zelfde commando → PASS.
- [ ] **Step 5: Commit.** `Backend: boxes auth collection, rate limit on box logins`

---

### Task 2: Box-regels per collectie

**Files:**
- Create: `backend/pb_migrations/1790710000_box_rules.js`
- Create: `backend/tests/rules_test.go` (build-tag `integration`)

**Interfaces:**
- Consumes: harnas uit Task 1.
- Produces: `func fixture(t *testing.T, p *pb) world` met `type world struct { UserA, UserATok, HouseA, HouseB, DevA, DevB, StateA, StateB, CmdA, CmdB, SceneA, SceneB, SchedA, SchedB, BoxATok, BoxBTok, BoxNoneTok string }` — twee huizen (A van bewoner A, B van bewoner B), per huis 1 device, 1 device_state, 1 pending device-command, 1 scène, 1 schema; box A (huis A), box B (huis B), box zonder huis.

- [ ] **Step 1: Failing tests** in `rules_test.go`:
  - `TestBoxReadsOnlyOwnHouse`: box A `GET` list op `houses`, `devices`, `device_state`, `commands`, `scenes`, `schedules` → alleen ids van huis A; `GET …/records/<id van B>` → 404.
  - `TestBoxWithoutHouseSeesNothing`: box-zonder-huis list op dezelfde zes → 0 items; `PATCH` op een record van A → ≥ 400.
  - `TestBoxCannotTouchOtherHouse`: box A `PATCH` op houses/devices/device_state/commands/schedules van B → ≥ 400; box A `POST device_state` met `device: DevB` → ≥ 400.
  - `TestBoxWritesAllowedFields`: box A `PATCH` met elk toegestaan veld (Global Constraints) op het record van A → 200; `POST device_state` voor een nieuw device van A → 200.
  - `TestBoxCannotWriteOtherFields`: per collectie: haal de velden op via superuser (`GET /api/collections/<naam>`), sla systeem-/autodate-velden en de toegestane lijst over; voor elk overgebleven veld een `PATCH` door box A met een geldige andere waarde → het record (gelezen door superuser) is daarna onveranderd. Vangt ook velden die later worden toegevoegd.
  - `TestBoxCannotCreateOrDelete`: box A `POST` op houses/devices/commands/scenes/schedules en `DELETE` op een device van A → ≥ 400.
  - `TestUserRulesUnchanged` (Review Focus 4): bewoner A list op houses/devices/commands/scenes/schedules → alleen A; maakt een command op DevA aan → 200, op DevB → ≥ 400.
  - `TestRealtimeOnlyOwnHouse`: box A opent `/api/realtime`, subscribet op `commands`; superuser maakt een command in A en daarna in B; binnen 3 s komt alleen het event van A.
- [ ] **Step 2: Draaien, moet falen.** → FAIL (box ziet niets / mag niets).
- [ ] **Step 3: Migratie.** Per collectie de huidige regel lezen en `"(" + oud + ") || (" + box + ")"` zetten (null-regels: alleen de box-tak); de originele strings als constanten in de migratie zodat `down` ze terugzet. Box-takken: lezen `B && id = H` (houses), `B && gateway = H` (devices), `B && device.gateway = H` (device_state), `B && (device.gateway = H || scene.house = H)` (commands), `B && house = H` (scenes, schedules). Update-takken: zelfde scope `&&` `@request.body.<veld>:isset = false` voor de verboden velden uit de spec. `device_state` create: `B && @request.body.device.gateway = H`.
- [ ] **Step 4: Draaien, moet slagen.**
- [ ] **Step 5: Commit.** `Backend: rules let a box reach only its own house`

---

### Task 3: `box.json` en config

**Files:**
- Create: `agent/internal/box/box.go`, `agent/internal/box/box_test.go`
- Modify: `agent/internal/config/config.go` (`Box.File` erbij; de oude velden blijven tot Task 5, zodat de build groen blijft)

**Interfaces:**
- Produces:
  - `type Identity struct { Serial string \`json:"serial"\`; Secret string \`json:"secret"\`; House string \`json:"house"\` }`
  - `func Load(path string) (Identity, error)` — fout als bestand ontbreekt, onleesbaar is, of `serial`/`secret` leeg zijn; spaties/regeleindes rond waarden worden weggehaald.
  - `func SaveHouse(path, house string) error` — leest het bestand, zet `house`, schrijft atomisch met 0600.
  - `cfg.Box.File` (env `BOX_FILE`, standaard `/data/box.json`).

- [ ] **Step 1: Failing tests:** `TestLoadIdentity` (roundtrip), `TestLoadMissing` (fout noemt het pad), `TestLoadEmptySecret` (fout), `TestLoadToleratesCRLF` (bestand met `\r\n` en een waarde `" SH-1 "` → `Serial == "SH-1"`; Review Focus 5), `TestSaveHouseKeepsSecret` (na `SaveHouse` zijn serial/secret gelijk, house nieuw, geen `.tmp` over).
- [ ] **Step 2: Draaien, moet falen.** `cd agent && go test ./internal/box` → FAIL.
- [ ] **Step 3: Implementeren** + config.
- [ ] **Step 4: Draaien, moet slagen.** `cd agent && go vet ./... && go test ./...` PASS.
- [ ] **Step 5: Commit.** `Agent: box identity file and config`

---

### Task 4: PocketBase-client logt in als box

**Files:**
- Modify: `agent/internal/pocketbase/auth.go`, `agent/internal/app/connection.go` (alleen de aanroep: `if _, err := a.pbClient.Login(); …`)
- Create: `agent/internal/pocketbase/auth_test.go`

**Interfaces:**
- Produces:
  - `type BoxRecord struct { ID string \`json:"id"\`; Serial string \`json:"serial"\`; House string \`json:"house"\` }`
  - `func (c *Client) SetCredentials(serial, secret string)`
  - `func (c *Client) Login() (*BoxRecord, error)` — `POST /api/collections/boxes/auth-with-password` `{identity: serial, password: secret}`; bewaart token.
  - `func (c *Client) RefreshBox() (*BoxRecord, error)` — `POST /api/collections/boxes/auth-refresh` (via `doAuthed`, dus opnieuw inloggen bij 401); bewaart nieuw token.
  - `Authenticate` verdwijnt (geen aanroepers). De gateway-functies in `gateways.go` blijven tot Task 5. Let op: tot Task 6 kan de draaiende dev-agent na een rebuild niet inloggen (`main.go` geeft nog het admin-e-mailadres); niet herbouwen tussen Task 4 en 6.

- [ ] **Step 1: Failing tests** (httptest-server): `TestLoginAsBox` (pad is `/api/collections/boxes/auth-with-password`, body-identity is de serial, record.House komt terug, volgende request draagt het token), `TestRefreshBoxReturnsHouse` (pad `…/boxes/auth-refresh`, nieuw token wordt gebruikt), `TestRefreshBoxReloginsOn401` (eerste refresh 401 → login → refresh slaagt).
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren;** `doAuthed` roept bij 401 `Login()` aan en negeert het record.
- [ ] **Step 4: Draaien;** `go test ./internal/pocketbase` PASS.
- [ ] **Step 5: Commit.** `Agent: log in to PocketBase as the box, not the superuser`

---

### Task 5: Huis uit het box-record

**Files:**
- Modify: `agent/internal/app/agent.go` (registratie weg; `New`-parameters), `agent/internal/app/connection.go`, `agent/main/main.go`, `agent/internal/pocketbase/gateways.go`, `agent/internal/config/config.go`
- Create: `agent/internal/app/house.go`, `agent/internal/app/house_test.go`

**Interfaces:**
- Consumes: `box.Load`, `box.SaveHouse` (Task 3); `Client.Login`, `Client.RefreshBox` (Task 4).
- Produces:
  - `New(mqtt, ha, pb, history, boxFile string, identity box.Identity, historyRetentionDays int, schedulesFile string) *Agent` (vervangt `gatewayName, gatewayIDFile`).
  - `const houseCheckInterval = 5 * time.Minute`
  - `func (a *Agent) applyHouse(house string)` — geen verandering en (leeg of al `registered`) → niets; anders `setHouse`, `box.SaveHouse(a.boxFile, house)` (fout alleen loggen), leeg → `registered.Store(false)` + log "geen huis: alleen lokaal"; niet leeg → `registered.Store(true)` + `a.onConnected()`.
  - Veld `onConnected func()` op `Agent`, in `New` gezet op `a.onPocketBaseConnected` (tests vervangen het).
  - `runPocketBase`: `retryWithBackoff(… Login …)` → `applyHouse(record.House)` → daarna elke `houseCheckInterval` `RefreshBox()` → `applyHouse` (fout loggen, doorgaan).
  - `Start`: `setHouse(identity.House)` i.p.v. `readGatewayID`.
  - Hartslag, weer en `Stop()` schrijven alleen bij `registered.Load()` (vervangt de `house() == ""`-checks; lost ook "Stop blokkeert offline" uit de vorige review op).
  - Weg: `registerGateway`, `readGatewayID`, `writeGatewayID`, `gatewayName`, `gatewayIDFile`; in `gateways.go` `GetGateway`, `FindGatewayByName`, `CreateGateway`; in config `PocketBase.AdminEmail/AdminPassword`, `Gateway.Name/IDFile` en hun verplicht-check.

- [ ] **Step 1: Failing tests** in `house_test.go` (Agent met `onConnected` als teller, `boxFile` in `t.TempDir()` met een geldige `box.json`):
  - `TestApplyHouseClaim`: van `""` naar `"h1"` → `house()=="h1"`, `registered`, `onConnected` 1×, `box.json` heeft `house "h1"`.
  - `TestApplyHouseSameIsNoop`: twee keer `"h1"` → `onConnected` 1×.
  - `TestApplyHouseDetach` (Review Focus 3): `"h1"` → `""` → `registered` false, `house()==""`, `box.json` house leeg.
  - `TestApplyHouseSwitch`: `"h1"` → `"h2"` → `onConnected` 2×, `house()=="h2"`.
  - `TestApplyHouseFirstConnectWithStoredHouse`: agent gestart met `setHouse("h1")` uit `box.json`, `registered` false; `applyHouse("h1")` → `registered`, `onConnected` 1× (eerste verbinding na offline start).
  - `TestStartWithoutHouseOffline` (Review Focus 2): `box.json` zonder house; `loadScheduleSnapshot()` geeft nil en panikeert niet.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** (`house.go` voor `applyHouse` + de check-lus; `connection.go`, `agent.go`, `main.go` aanpassen; `main.go` stopt met een fout als `box.Load` faalt).
- [ ] **Step 4: Verifiëren.** `cd agent && go vet ./... && go test ./...` PASS; `grep -rn "registerGateway\|gateway_id\|AdminEmail" agent` → niets.
- [ ] **Step 5: Commit.** `Agent: take the house from the box record, follow claims and detaches`

---

### Task 6: Provisioning, dev-omgeving en docs

**Files:**
- Create: `scripts/provision-box.py`
- Modify: `docker-compose.yml` (agent: `POCKETBASE_ADMIN_*`, `GATEWAY_NAME` + commentaar weg; `BOX_FILE` niet nodig, standaard)
- Modify: `CLAUDE.md` (status, belangrijke bestanden, volgende stap 3 → spec B)
- Local only (niet committen): `scripts/seed.py`

**Interfaces:**
- Produces: `scripts/provision-box.py --serial <s> [--house <id>] [--out <pad>]` — superuser uit `.env` (`POCKETBASE_ADMIN_*`, URL uit `POCKETBASE_URL` of `http://localhost:8090`), maakt `boxes`-record met `secrets.token_bytes(32)` base64 als wachtwoord, schrijft `box.json` (0600) naar `--out` (standaard `./box.json`), print alleen de serial en het record-id. Bestaande serial → fout, geen overschrijven.

- [ ] **Step 1: Script schrijven** in de stijl van `scripts/screenshot.py` (stdlib only, `urllib`).
- [ ] **Step 2: Dev-box overzetten.** `scripts/provision-box.py --serial SH-DEV-0001 --house 45lpedg4nbwbmgv --out <scratch>/box.json`; `docker cp` naar `sandhovius-agent:/data/box.json`; compose aanpassen; `docker compose up -d --build agent`. Verwacht in de log: inloggen als box, "Verbonden met PocketBase", stand van 9 devices afgestemd. Daarna `/data/gateway_id` verwijderen en het scratch-`box.json` wissen.
- [ ] **Step 3: Handmatig controleren.** PWA (http://localhost:3000) inloggen en een helper schakelen (`input_boolean.spiegellamp`, terug naar uit) → werkt (Review Focus 1); met het box-token via curl `GET /api/collections/houses/records` → alleen het eigen huis; PocketBase stoppen en agent herstarten → offline start met het huis uit `box.json`, schema-snapshot geladen.
- [ ] **Step 4: `scripts/seed.py` (lokaal) bijwerken:** het huis maakt het script nu zelf aan (superuser, gekoppeld aan de testgebruiker), daarna `provision-box.py --house <id>` en `docker cp` van `box.json` naar de agent. Niet in git (`.git/info/exclude`).
- [ ] **Step 5: CLAUDE.md bijwerken** en committen: `Scripts: provision a box; dev stack logs in as a box`

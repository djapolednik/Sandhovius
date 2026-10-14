# Apparaten koppelen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bewoners koppelen echte Zigbee- en Hue-apparaten vanuit de app; de virtuele HA-helpers verdwijnen en een device krijgt een stevige identiteit (adres, endpoint, mogelijkheden).

**Architecture:** De PWA opent een `pairing_sessions`-record; de agent volgt sessies en `pairing_candidates` via realtime, opent Zigbee2MQTT voor koppelen (of rondt de HA-Hue-flow af), schrijft gevonden apparaten als candidates en maakt bij "toevoegen" zelf het device. Een pure koppelmotor (`pairing.go`) beslist wat er van het netwerk gaat; een runner doet de I/O, zoals `motion.go`/`motion_runner.go`.

**Tech Stack:** Go (agent), PocketBase 0.40.4 (JS-migraties en hooks, Go-integratietests), Next.js 16 PWA (JS, `node --test`), Zigbee2MQTT 2.x over MQTT, Home Assistant REST + websocket, Python (`paho-mqtt`) voor de nep-Zigbee.

**Spec:** `docs/superpowers/specs/2026-10-14-device-pairing-design.md`

## Global Constraints

- Begin: vanaf `main`: `git switch -c feat/device-pairing`. Kleine commits met de bestaande prefixen (`PocketBase:`, `Hooks:`, `Agent:`, `Scripts:`, `PWA:`, `Docs:`), zonder Co-Authored-By of "Generated with".
- Vóór elke commit de relevante checks uit `CLAUDE.md`: `cd agent && go vet ./... && go test ./...`; `cd backend/tests && go test -tags integration ./...`; `cd frontend && npm run lint && node --test lib/*.test.js && npx next build`; `python -m unittest discover -s scripts -p "test_*.py"`.
- PocketBase blijft 0.40.4. Geen nieuwe dependencies (Go stdlib, bestaande npm-pakketten, `paho-mqtt`).
- `devices.source`: `zigbee` / `hue`. `devices.type`: `light` / `switch` / `sensor` / `climate`. `devices.shown_as`: leeg of `light`, alleen als `type = switch`.
- `capabilities`-woordenlijst, verbatim: `onoff`, `brightness`, `color_temp`, `color`, `heating`, `valve`, `occupancy`, `contact`, `water_leak`, `smoke`, `temperature`, `humidity`, `illuminance`, `battery`.
- `pairing_sessions.kind`: `light` / `switch` / `sensor` / `climate` / `hue`; `status`: `starting` / `open` / `waiting_button` / `closed` / `failed`. `pairing_candidates.status`: `interviewing` / `found` / `unsupported` / `adding` / `added` / `failed`.
- Koppelen: `permit_join` `{"time": 240}`, sessie 4 minuten, één open sessie per huis. Sluiten: `{"time": 0}`.
- Regel: **wat op het Zigbee-netwerk zit, staat in de app.** De agent haalt alleen adressen weg die in de lopende sessie binnenkwamen of die hij zelf toevoegde; nooit een onbekend adres; nooit Hue-lampen.
- Zigbee2MQTT: `contact: true` = **dicht**.
- Copy: Nederlands is de referentie, Engels (Brits) onder dezelfde sleutel in `frontend/messages/{nl,en}.json`; zinsletters, geen middelpunten; foutcodes van de box als `errors.codes.<code>`. Real Light Rule: een sensor gloeit nooit; een stekker met `shown_as = light` gloeit warm.
- Een echte Hue-lamp schakelen tijdens een test: vooraf zeggen.

## Review Focus

1. **De app gaat dicht midden in een sessie** (telefoon weg, app gesloten): de box sluit na 4 minuten zelf, zet `permit_join` dicht en haalt niet toegevoegde adressen weg → test in Task 6 (`TestPairingExpiresWithoutApp`).
2. **De agent herstart midden in een sessie:** na het opstarten sluit hij open sessies van zijn huis en haalt de adressen uit `/data/devices.json` (`session.joined`) weg die niet zijn toegevoegd → test in Task 7 (`TestRestartClosesOpenSession`).
3. **Hetzelfde apparaat meldt zich twee keer** (`device_joined` daarna `device_announce`, of een tweede `device_interview`): één candidate per adres+endpoint → test in Task 6 (`TestDuplicateJoinOneCandidate`).
4. **Dubbel tikken op Toevoegen:** `add` komt twee keer binnen; er ontstaat één device → test in Task 7 (`TestAddTwiceCreatesOneDevice`).
5. **Eén deel van een dubbele stekker verwijderen:** het adres blijft op het netwerk tot het laatste record weg is → test in Task 7 (`TestRemoveOnlyAfterLastPart`).

---

### Task 1: PocketBase — device-model en harde overgang

**Files:**
- Create: `backend/pb_migrations/1790840000_device_identity.js`
- Create: `backend/pb_hooks/devices.pb.js`
- Test: `backend/tests/devices_test.go`

**Interfaces:**
- Produces: `devices`-velden `source` (select), `address` (text), `endpoint` (text), `capabilities` (json), `model` (text), `shown_as` (select `light`, maxSelect 1); command-actie `identify` (en `provision` weg).

- [ ] **Step 1: Write the failing tests** in `devices_test.go` (patroon van `rules_test.go`, `startPB`, `p.create`, `p.do`):
  - `TestResidentCannotCreateDevice`: een lid `POST /api/collections/devices/records` → 403/400.
  - `TestBoxCreatesDeviceInOwnHouse`: box-token maakt een device met `gateway` = eigen huis → 200; met een ander huis → geweigerd.
  - `TestResidentCannotSetBoxFields`: lid `PATCH` met `address`, `source`, `type`, `entity_id`, `capabilities`, `endpoint` of `model` → geweigerd; met `name`, `room` → 200.
  - `TestShownAsOnlyOnSwitch`: `shown_as: "light"` op een `switch` → 200; op een `sensor` → 400.
  - `TestCapabilitiesVocabulary`: box zet `["onoff","brightness"]` → 200; `["onoff","laser"]` → 400.
  - `TestIdentifyCommand`: lid maakt `{device, action: "identify", status: "pending"}` → 200; `action: "provision"` → 400.
- [ ] **Step 2: Run** `cd backend/tests && go test -tags integration -run 'Device|ShownAs|Capabilities|Identify' ./...` → FAIL.
- [ ] **Step 3: Write the migration.** Velden erbij; resident-`createRule` van `devices` wordt de box-regel alleen (`BOX && @request.body.gateway = H`, zie `1790710000_box_rules.js`); resident-`updateRule` krijgt `forbid([...])` op de box-velden (patroon van `houses` in `1790760000_house_members.js`), de box-`updateRule` verbiedt `shown_as`; `commands.action` = `["turn_on","turn_off","toggle","set_temperature","run_scene","identify"]`. Daarna de harde overgang: alle `devices` verwijderen (cascade neemt `device_state`, favorieten, bewegingslichten mee) en van elke scène `actions` op `[]` zetten. Een `down` die velden en regels terugzet (data niet).
- [ ] **Step 4: Write `devices.pb.js`:** `onRecordCreateRequest`/`onRecordUpdateRequest` op `devices`: `capabilities` moet een array zijn met alleen woorden uit de lijst (foutcode `invalid_capabilities`); `shown_as` niet leeg terwijl `type != "switch"` → `invalid_shown_as`.
- [ ] **Step 5: Run** the tests → PASS, en de hele integratiesuite → PASS (bestaande tests die als lid een device aanmaken, maken het nu als box of via de superuser; pas die setup aan).
- [ ] **Step 6: Commit** `PocketBase: device identity, box-only devices, hard cut`

### Task 2: PocketBase — koppelsessies en candidates

**Files:**
- Create: `backend/pb_migrations/1790850000_pairing.js`
- Create: `backend/pb_hooks/pairing.pb.js`
- Test: `backend/tests/pairing_test.go`

**Interfaces:**
- Produces: collecties `pairing_sessions` (`house`, `kind`, `status`, `expires`, `error`, `created_by`, `extend`, `button_pressed`) en `pairing_candidates` (`session`, `source`, `address`, `endpoint`, `type`, `capabilities`, `model`, `status`, `identify` number, `name`, `room`, `add` bool, `device`), velden en waarden zoals in de spec.

- [ ] **Step 1: Write the failing tests:**
  - `TestMemberStartsSession`: lid maakt `{house, kind: "light", status: "starting"}` → 200, `created_by` = lid (door de hook gezet).
  - `TestOneOpenSessionPerHouse`: tweede sessie terwijl de eerste `starting`/`open`/`waiting_button` is → 400 `session_open`; na `closed` → 200.
  - `TestMemberSessionFields`: lid mag `status: "closed"`, `extend: true`, `button_pressed: true` zetten; `status: "open"` of `expires` → geweigerd.
  - `TestBoxWritesCandidates`: box maakt een candidate in een sessie van zijn huis → 200; lid maakt er een → geweigerd.
  - `TestMemberCandidateFields`: lid mag `identify`, `name`, `room`, `add` zetten; `status`, `address`, `device` → geweigerd; `room` uit een ander huis → geweigerd.
  - `TestOtherHouseSeesNothing`: lid van een ander huis ziet geen sessie of candidate.
- [ ] **Step 2: Run** `go test -tags integration -run 'Session|Candidate|OtherHouse' ./...` → FAIL.
- [ ] **Step 3: Write the migration** (resident-regels `house.members.id ?= @request.auth.id` / `session.house.members…`, box-regels via `BOX` en `H` zoals `1790710000_box_rules.js`; rate limit `pairing_sessions:create` 10 per minuut, ingelogd).
- [ ] **Step 4: Write `pairing.pb.js`:** bij create `created_by` = auth en weigeren als er een sessie met `status` in `starting`/`open`/`waiting_button` in hetzelfde huis is.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `PocketBase: pairing sessions and candidates`

### Task 3: Agent — Zigbee2MQTT-bridge lezen en apparaten indelen

**Files:**
- Create: `agent/internal/mqtt/bridge.go`, `agent/internal/mqtt/bridge_test.go`
- Create: `agent/internal/app/classify.go`, `agent/internal/app/classify_test.go`
- Create: `agent/internal/app/testdata/exposes/{ikea_bulb_ws,aqara_motion,aqara_contact,leak,double_switch,trv}.json` (de `definition.exposes` zoals Zigbee2MQTT 2.x ze publiceert)

**Interfaces:**
- Produces:
  ```go
  // package mqtt
  type Expose struct { Type, Name, Property, Endpoint string; Features []Expose }
  type BridgeDevice struct {
      IEEE, FriendlyName, Model, Vendor, Type string // Type: Coordinator|Router|EndDevice
      Supported, InterviewCompleted bool
      Exposes []Expose
  }
  type BridgeEvent struct {
      Type   string // device_joined | device_interview | device_announce | device_leave
      IEEE, FriendlyName, Status string // Status bij device_interview: started|successful|failed
      Device *BridgeDevice // bij device_interview successful, uit data.definition
  }
  func ParseBridgeDevices(topic string, payload []byte) ([]BridgeDevice, bool) // zigbee2mqtt/bridge/devices
  func ParseBridgeEvent(topic string, payload []byte) (BridgeEvent, bool)     // zigbee2mqtt/bridge/event

  // package app
  type Part struct { Endpoint, Type string; Capabilities []string }
  func classify(exposes []mqtt.Expose) []Part // nil = niet ondersteund
  ```

- [ ] **Step 1: Write the failing tests.** `bridge_test.go`: een `bridge/devices`-payload met coördinator + twee apparaten → twee niet-coördinatoren met IEEE, naam, model; een `device_interview` successful → `Device.Exposes` gevuld; een ander topic → `false`. `classify_test.go`, per testdatabestand:
  - `ikea_bulb_ws` → `[{"" light [onoff brightness color_temp]}]`
  - `aqara_motion` → `[{"" sensor [occupancy illuminance battery]}]`
  - `aqara_contact` → `[{"" sensor [contact battery]}]` (`device_temperature` telt niet als `temperature`)
  - `leak` → `[{"" sensor [water_leak battery]}]`
  - `double_switch` → `[{"l1" switch [onoff]} {"l2" switch [onoff]}]`
  - `trv` → `[{"" climate [heating temperature battery]}]`
  - lege exposes → `nil`
- [ ] **Step 2: Run** `cd agent && go test ./internal/mqtt/ ./internal/app/ -run 'Bridge|Classify'` → FAIL.
- [ ] **Step 3: Implement.** `classify`: een `light`-expose (features `state`, `brightness`, `color_temp`, `color_xy`/`color_hs` → `onoff`, `brightness`, `color_temp`, `color`) wordt een lamp-deel per endpoint; `switch` → `switch` [`onoff`]; `climate` → `climate` [`heating`, `temperature`] (`local_temperature`); anders, als er sensor-eigenschappen zijn (`occupancy`, `contact`, `water_leak`, `smoke`, `temperature`, `humidity`, `illuminance`/`illuminance_lux`), één `sensor`-deel. `battery` gaat bij elk deel als het apparaat hem heeft. Mogelijkheden in de volgorde van de woordenlijst; delen gesorteerd op endpoint.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Agent: read the Zigbee2MQTT bridge and classify devices`

### Task 4: Agent — PocketBase-client voor devices en koppelen

**Files:**
- Modify: `agent/internal/pocketbase/devices.go`, `agent/internal/pocketbase/realtime.go`
- Create: `agent/internal/pocketbase/pairing.go`, `agent/internal/pocketbase/pairing_test.go`

**Interfaces:**
- Produces:
  ```go
  // Device krijgt: Source, Address, Endpoint, Model, ShownAs, Room string; Capabilities []string
  type NewDevice struct { Gateway, Room, Name, Type, Source, Address, Endpoint, EntityID, Model string; Capabilities []string }
  func (c *Client) CreateDevice(d NewDevice) (Device, error)

  type PairingSession struct { ID, House, Kind, Status string; Expires time.Time; Extend, ButtonPressed bool }
  type PairingCandidate struct {
      ID, Session, Source, Address, Endpoint, Type, Model, Status, Name, Room, Device string
      Capabilities []string; Identify int; Add bool
  }
  type PairingEvent struct { Action string; Session *PairingSession; Candidate *PairingCandidate }
  func (c *Client) ListOpenPairingSessions(houseID string) ([]PairingSession, error) // status starting|open|waiting_button
  func (c *Client) UpdatePairingSession(id string, fields map[string]any) error
  func (c *Client) CreatePairingCandidate(p PairingCandidate) (PairingCandidate, error)
  func (c *Client) UpdatePairingCandidate(id string, fields map[string]any) error
  func (c *Client) SubscribePairing(ctx context.Context, onSubscribed func(), handler func(PairingEvent)) error
  ```

- [ ] **Step 1: Write the failing tests** (httptest-server zoals `commands_test.go`): `CreateDevice` post de velden met `capabilities` als JSON-array; `ListOpenPairingSessions` filtert op huis en de drie open standen; `SubscribePairing` levert een `PairingEvent` met `Session` voor een `pairing_sessions`-bericht en met `Candidate` voor een `pairing_candidates`-bericht.
- [ ] **Step 2: Run** `go test ./internal/pocketbase/ -run 'Pairing|CreateDevice'` → FAIL.
- [ ] **Step 3: Implement.** `SubscribePairing` gebruikt één SSE-verbinding met twee topics (`subscribeRealtime(clientID, []string{"pairing_sessions","pairing_candidates"})`), met dezelfde keepalive als `subscribeCollection`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Agent: PocketBase client for pairing and device identity`

### Task 5: Agent — HA-registry en config-flows

**Files:**
- Modify: `agent/internal/homeassistant/registry.go`, `agent/internal/homeassistant/integrations.go`
- Test: `agent/internal/homeassistant/registry_test.go`, `integrations_test.go`

**Interfaces:**
- Produces:
  ```go
  type RegistryDevice struct { ID, Name, Model, Manufacturer string; Identifiers [][]string; ConfigEntries []string }
  type RegistryEntity struct { EntityID, DeviceID, Platform string }
  func (c *Client) ListDevices() ([]RegistryDevice, error)   // ws config/device_registry/list
  func (c *Client) ListEntities() ([]RegistryEntity, error)  // ws config/entity_registry/list
  func ZigbeeEntity(devs []RegistryDevice, ents []RegistryEntity, ieee, domain, endpoint string) (string, bool)
  type Flow struct { FlowID, Handler, StepID string }
  type FlowResult struct { Type, FlowID, StepID, Reason, EntryID string; Errors map[string]string }
  func (c *Client) ListFlows() ([]Flow, error)                              // GET /api/config/config_entries/flow
  func (c *Client) StartFlow(handler string, data map[string]any) (FlowResult, error)
  func (c *Client) SubmitFlow(flowID string, data map[string]any) (FlowResult, error)
  func (c *Client) ConfigEntryIDs(domain string) ([]string, error)          // GET /api/config/config_entries/entry?domain=
  func (c *Client) DeleteHelpers() (int, error)                             // input_boolean/list + delete, input_number/list + delete
  ```

- [ ] **Step 1: Write the failing tests.** `ZigbeeEntity` (puur): een device met identifier `["mqtt","zigbee2mqtt_0x01"]` en entiteiten `light.gang`, `sensor.gang_battery` → `("light.gang", true)` voor domain `light`; bij endpoint `l2` en entiteiten `switch.stekker_l1`/`switch.stekker_l2` → `switch.stekker_l2`; onbekend adres → `false`. `ListFlows`/`SubmitFlow` tegen een httptest-server; `SubmitFlow` geeft `Errors` door.
- [ ] **Step 2: Run** `go test ./internal/homeassistant/` → FAIL.
- [ ] **Step 3: Implement** (websocket via `dialAuthed`, REST via `postJSON`; `AddMQTT` gaat `StartFlow`/`SubmitFlow` gebruiken).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Agent: Home Assistant registry and config flow helpers`

### Task 6: Agent — de koppelmotor (puur)

**Files:**
- Create: `agent/internal/app/pairing.go`, `agent/internal/app/pairing_test.go`

**Interfaces:**
- Consumes: `Part`, `classify` (Task 3), `mqtt.BridgeDevice`.
- Produces:
  ```go
  type pairingAction struct {
      Kind    string // "candidate" | "remove" | "close_join"
      Address string
      Part    Part
      Model   string
      Status  string // bij "candidate": interviewing|found|unsupported
  }
  func newPairingEngine(kind string, known map[string]bool, now time.Time) *pairingEngine // known = adressen al op het netwerk; sessie 4 min
  func (e *pairingEngine) joined(ieee string) []pairingAction
  func (e *pairingEngine) interviewed(ieee string, dev mqtt.BridgeDevice, ok bool) []pairingAction
  func (e *pairingEngine) added(ieee, endpoint string)
  func (e *pairingEngine) extend(now time.Time) time.Time // nieuwe vervaltijd
  func (e *pairingEngine) tick(now time.Time) []pairingAction // na verlopen: close
  func (e *pairingEngine) close() []pairingAction
  func (e *pairingEngine) joinedAddresses() []string
  ```

- [ ] **Step 1: Write the failing tests:**
  - `TestJoinThenInterviewIsCandidate`: sessie `light`, `joined("0x1")` → candidate `interviewing`; `interviewed` met een lamp → candidate `found`.
  - `TestOtherKindRemovedAtOnce`: sessie `light`, een bewegingssensor geïnterviewd → precies één `remove 0x1`, geen candidate.
  - `TestUnsupportedRemoved`: `interviewed(..., ok=false)` of `classify` = nil → candidate `unsupported` + `remove`.
  - `TestKnownAddressNeverRemoved`: een adres uit `known` dat `device_joined`/announce stuurt → geen acties, ook niet bij `close()`.
  - `TestCloseRemovesNotAdded`: twee lampen gevonden, één `added` → `close()` geeft `close_join` en `remove` alleen voor de andere.
  - `TestPartlyAddedKeepsAddress`: `double_switch`, alleen `l1` toegevoegd → geen `remove` bij `close()`.
  - `TestPairingExpiresWithoutApp` (Review Focus 1): `tick(now+4m+1s)` → `close_join` + `remove` van niet toegevoegde adressen; daarna geen acties meer.
  - `TestDuplicateJoinOneCandidate` (Review Focus 3): twee keer `joined` en twee keer `interviewed` voor hetzelfde adres → één candidate per endpoint.
  - `TestExtend`: `extend(t)` geeft `t+4m`.
- [ ] **Step 2: Run** `go test ./internal/app/ -run 'Pairing|Join|Close|Extend|Kind|Unsupported|Known|Partly|Duplicate'` → FAIL.
- [ ] **Step 3: Implement** (geen I/O, geen klok: `now` komt binnen).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Agent: pairing engine`

### Task 7: Agent — Zigbee koppelen, opzoeken op adres, weghalen en knipperen

**Files:**
- Create: `agent/internal/app/pairing_runner.go`, `agent/internal/app/pairing_runner_test.go`
- Create: `agent/internal/app/device_store.go`, `agent/internal/app/device_store_test.go` (`/data/devices.json`)
- Create: `agent/internal/app/bridge_directory.go` (friendly name ↔ adres uit `bridge/devices`)
- Modify: `agent/internal/app/agent.go` (`handleMQTTMessage`, `forwardZigbeeEvent`, `forwardZigbeeAvailability`, `handleDeviceEvent`, starten van de runner, command `identify`), `agent/internal/app/device_cache.go` (`byAddress`), `agent/internal/app/connection.go` (`onPocketBaseConnected`), `agent/internal/config/` (`DEVICES_FILE`, standaard `/data/devices.json`), `docker-compose.yml`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  ```go
  type deviceStore struct { Owned []string; Session *storedSession } // storedSession{ID string; Joined []string}
  func loadDeviceStore(path string) (*deviceStore, error); func (s *deviceStore) save(path string) error
  func (d *deviceCache) lookupAddress(address string) ([]string, error) // device-ids met dit adres (meer bij endpoints)
  ```
  De runner krijgt zijn I/O als functievelden (zoals `callService`), zodat de tests nep-functies zetten: `publish(topic string, payload any) error`, `pb` (de calls uit Task 4), `ha` (`ListDevices`, `ListEntities`, `CallService`).

- [ ] **Step 1: Write the failing tests** (nep-MQTT en nep-PocketBase, patroon `motion_runner_test.go`):
  - `TestSessionOpensPermitJoin`: sessie-event `starting` → publish `zigbee2mqtt/bridge/request/permit_join` `{"time":240}`, sessie `open` met `expires`.
  - `TestFoundCandidateWritten`: `device_joined` + `device_interview` → `CreatePairingCandidate` met type, mogelijkheden, model.
  - `TestAddCreatesDevice`: candidate-event met `add: true` → `CreateDevice` met `address`, `endpoint`, `entity_id` (uit `ZigbeeEntity`), naam en kamer; candidate `added` met `device`.
  - `TestAddTwiceCreatesOneDevice` (Review Focus 4): twee events met `add: true` → één `CreateDevice` (status `adding` blokkeert).
  - `TestIdentifyBlinks`: `identify` omhoog bij een lamp → publish `zigbee2mqtt/<naam>/set` `{"effect":"blink"}`; bij een stekker zonder identify-expose → niets.
  - `TestCloseRemovesFromNetwork`: sessie `closed` → `permit_join` `{"time":0}` en `bridge/request/device/remove` `{"id":"0x…"}` voor het niet toegevoegde adres.
  - `TestRemoveOnlyAfterLastPart` (Review Focus 5): twee devices met hetzelfde eigen adres; delete-event van de eerste → geen remove; van de tweede → remove; een delete van een adres dat niet in `Owned` staat → geen remove.
  - `TestRestartClosesOpenSession` (Review Focus 2): `devices.json` met `Session{Joined: ["0x9"]}` en een open sessie in PocketBase → bij `onPocketBaseConnected`: sessie `closed`, `permit_join` dicht, `0x9` weg (niet toegevoegd).
  - `TestZigbeeStateByAddress`: na `bridge/devices` met `Gang` = `0x1` komt `zigbee2mqtt/Gang` binnen bij de device-ids van `0x1`; na een hernoeming in `bridge/devices` ook onder de nieuwe naam.
  - `TestIdentifyCommand`: command `identify` op een Zigbee-lamp → dezelfde blink-publish.
- [ ] **Step 2: Run** `go test ./internal/app/ -run 'Session|Candidate|Add|Identify|Close|Remove|Restart|StateByAddress'` → FAIL.
- [ ] **Step 3: Implement.** De runner houdt per open sessie één `pairingEngine` (alleen sessies van het eigen huis), een klok van 15 s voor `tick`, en schrijft `Session.Joined` en `Owned` naar de store bij elke wijziging. `handleMQTTMessage` stuurt `bridge/devices` naar de directory en `bridge/event` naar de runner. `forwardZigbeeEvent` en `forwardZigbeeAvailability` zoeken via directory → `lookupAddress`. Zonder huis of zonder PocketBase: geen sessies (koppelen vraagt de app).
- [ ] **Step 4: Run** → PASS; `go vet ./...` schoon.
- [ ] **Step 5: Commit** `Agent: pair Zigbee devices from the app`

### Task 8: Agent — Philips Hue koppelen

**Files:**
- Create: `agent/internal/app/hue.go`, `agent/internal/app/hue_test.go`
- Modify: `agent/internal/app/pairing_runner.go`, `agent/internal/config/` (`HUE_BRIDGE_HOST`, leeg standaard), `docker-compose.yml` (`HUE_BRIDGE_HOST=${HUE_BRIDGE_HOST:-}`)

**Interfaces:**
- Consumes: `ListFlows`, `StartFlow`, `SubmitFlow`, `ConfigEntryIDs`, `ListDevices`, `ListEntities` (Task 5).
- Produces:
  ```go
  // puur: één candidate per Hue-lamp of -sensor die nog niet in de app staat;
  // Address = HA-device-id, Source = "hue"
  func hueCandidates(devs []homeassistant.RegistryDevice, ents []homeassistant.RegistryEntity, entryIDs []string, inApp map[string]bool) []pocketbase.PairingCandidate
  // het light.* (of binary_sensor.* / sensor.*) van dat device; de runner roept hem aan bij toevoegen
  func hueEntity(ents []homeassistant.RegistryEntity, deviceID string) (string, bool)
  ```
  Mogelijkheden van een Hue-lamp komen uit `supported_color_modes` van zijn state (`GetState`): `brightness` → `onoff, brightness`, `color_temp` → `+ color_temp`, `xy`/`hs` → `+ color`.

- [ ] **Step 1: Bekijk de echte flow** tegen de dev-HA (`curl` met `HA_TOKEN` uit `.env`, de waarde niet printen): start `POST /api/config/config_entries/flow {"handler":"hue"}` met en zonder host, dien de link-stap in zónder op de knop te drukken, en noteer de stap-ids en de foutcode als commentaar bovenaan `hue.go`. Dit sluit het open punt uit de spec.
- [ ] **Step 2: Write the failing tests:** `hueCandidates` slaat devices over die al in de app staan en geeft lampen `type: light`; `hueEntity` kiest het `light.*` boven een `sensor.*` van hetzelfde device; runner: sessie `hue` zonder ontdekte flow en zonder `HUE_BRIDGE_HOST` → `failed`, foutcode `hue_not_found`; met flow → `waiting_button`; `button_pressed` met de "niet gedrukt"-fout → terug naar `waiting_button`, `error` = `hue_button`; gelukt (of al een config-entry `hue`) → candidates en status `open`; `identify` → `CallService("light","turn_on", id, {"flash":"short"})`; sessie dicht → geen enkele `device/remove`.
- [ ] **Step 3: Run** `go test ./internal/app/ -run Hue` → FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `Agent: pair Philips Hue through the local bridge`

### Task 9: Agent — helpers en `provision` weg

**Files:**
- Modify: `agent/internal/app/agent.go` (weg: `provisionDeviceEntity`, de provision-tak in `handleCommand`, het automatisch klaarzetten bij een nieuw device), `agent/internal/homeassistant/registry.go` (weg: `CreateInputBoolean`, `CreateInputNumber`, `createHelper`), `agent/internal/app/connection.go`
- Test: `agent/internal/app/agent_test.go` of bestaande tests aanpassen

- [ ] **Step 1: Write the failing test** `TestHelpersRemovedOnce`: zonder vlagbestand `/data/helpers_removed` roept de start `DeleteHelpers` aan en schrijft de vlag; met de vlag niet.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** en verwijder de dode code en hun tests.
- [ ] **Step 4: Run** `cd agent && go vet ./... && go test ./...` → PASS.
- [ ] **Step 5: Commit** `Agent: drop virtual helpers`

### Task 10: Scripts — nep-Zigbee2MQTT

**Files:**
- Create: `scripts/fakezigbee.py` (pure functies), `scripts/fake-zigbee.py` (MQTT-lus), `scripts/test_fakezigbee.py`
- Delete: `scripts/fake-lights.py`, `scripts/fakelights.py`, `scripts/test_fakelights.py`

**Interfaces:**
- Produces (in `fakezigbee.py`): `make_device(kind: str, n: int) -> dict` (kinds `light`, `plug2`, `motion`, `contact`, `leak`; IEEE `0xfa4e0000000000NN`, friendly name = IEEE), `bridge_devices(devices) -> list`, `joined_event(dev)`, `interview_event(dev)`, `discovery(dev) -> list[tuple[str, dict]]` (z2m-stijl topics met `device.identifiers = ["zigbee2mqtt_<ieee>"]`), `apply_set(state, payload) -> dict`. CLI: `python scripts/fake-zigbee.py [--host --port]`; laten binnenkomen met `mosquitto_pub -t fake/zigbee/join -m '{"kind":"light"}'`, alleen als `permit_join` open is.

- [ ] **Step 1: Write the failing tests:** `make_device("plug2", 1)` heeft twee `switch`-exposes met endpoint `l1`/`l2`; `discovery` van een lamp geeft één `light`-config met de juiste identifier; `apply_set({"state":"OFF"}, {"state":"ON","brightness":128})`; `joined_event`/`interview_event` hebben de vorm die `ParseBridgeEvent` (Task 3) leest.
- [ ] **Step 2: Run** `python -m unittest scripts.test_fakezigbee` (of `discover`) → FAIL.
- [ ] **Step 3: Implement**, inclusief `permit_join` (antwoord op `bridge/response/permit_join`, timer), `device/remove` (weg uit `bridge/devices`, discovery leeg publiceren) en `set` (stand terugsturen; `effect: blink` loggen).
- [ ] **Step 4: Run** → PASS. Handmatig: stack + script, in de app een lamp koppelen; zie de agent-log `[KOPPELEN]`.
- [ ] **Step 5: Commit** `Scripts: fake Zigbee2MQTT bridge for pairing`

### Task 11: PWA — helpers in `lib/`

**Files:**
- Create: `frontend/lib/pairing.js`, `frontend/lib/pairing.test.js`, `frontend/lib/sensors.js`, `frontend/lib/sensors.test.js`, `frontend/lib/devices.js`, `frontend/lib/devices.test.js`
- Modify: `frontend/lib/home.js` (+ test), `frontend/messages/nl.json`, `frontend/messages/en.json`

**Interfaces:**
- Produces:
  ```js
  export const PAIRING_KINDS = ['light', 'switch', 'sensor', 'climate']
  export function visibleCandidates(candidates)        // status interviewing|found|adding|unsupported, op created
  export function secondsLeft(expires, nowMs)          // ≥ 0
  export function doneLine({ t }, added)               // "Je 3 lampen zijn klaar", per soort; gemengd: "Je 3 apparaten zijn klaar"
  export const READING_ORDER = ['smoke', 'water_leak', 'contact', 'occupancy', 'temperature', 'humidity', 'illuminance']
  export function primaryReading(capabilities, state)  // { capability, value } | null; nooit battery
  export function readingText({ t, locale }, reading)  // "Dicht"/"Open", "Droog"/"Lek", "Geen rook"/"Rook", "Beweging"/"Geen beweging", "21,5°", "55%"
  export function alarmKind(device, state)             // 'smoke' | 'leak' | null
  export function displayType(device)                  // shown_as || type
  export function partState(device, state)             // endpoint "l1": state_l1 → state, brightness_l1 → brightness …
  // home.js: ATTENTION_ORDER = { smoke: 0, leak: 1, offline: 2, battery: 3 } (setup weg)
  ```

- [ ] **Step 1: Write the failing tests** in beide talen (`messages.testkit.js`): `primaryReading(['occupancy','temperature','battery'], {occupancy:true, temperature:21.5})` → occupancy; `readingText` van `{contact, true}` → "Dicht" / "Closed"; `{water_leak, true}` → "Lek" / "Leak"; `alarmKind` met `smoke:true` → `'smoke'`; `displayType({type:'switch', shown_as:'light'})` → `'light'`; `partState({endpoint:'l2'}, {state_l1:'ON', state_l2:'OFF'}).state` → `'OFF'`; `doneLine` met 3 lampen → "Je 3 lampen zijn klaar"; `sortAttention` zet `smoke` vóór `offline`.
- [ ] **Step 2: Run** `cd frontend && node --test lib/*.test.js` → FAIL.
- [ ] **Step 3: Implement**, en de sleutels `pairing.*` (soorten, uitleg per soort uit de spec, Hue-tekst, hulp "Hij knippert niet" / "Ik zie mijn lamp niet", "Het kan even duren…", "Dit apparaat kennen we nog niet…"), `sensors.*`, `home.attention.smoke` / `leak` en `errors.codes.{session_open,hue_not_found,hue_button,invalid_capabilities,invalid_shown_as,zigbee_unavailable}`.
- [ ] **Step 4: Run** → PASS (inclusief `messages.test.js`: dezelfde sleutels, geldige ICU).
- [ ] **Step 5: Commit** `PWA: pairing, sensor reading and device helpers`

### Task 12: PWA — de koppelsheet

**Files:**
- Create: `frontend/components/PairingSheet.js`
- Delete: `frontend/components/AddDeviceModal.js`
- Modify: `frontend/app/page.js` (start met "+": sessie maken, realtime op `pairing_sessions` en `pairing_candidates` van het huis, sluiten bij het sluiten van de sheet; weg: provision-retry, `kind: 'setup'` in Let op, "Niet klaargezet"), `frontend/components/DeviceCard.js`, `frontend/components/DeviceSettingsModal.js` (provision-UI weg), `frontend/app/styles/components.css`

**Interfaces:**
- Consumes: Task 11; collecties uit Task 2.
- Produces: `<PairingSheet house rooms defaultRoom session candidates onStart(kind) onClose() onExtend() onButtonPressed() onIdentify(candidate) onAdd(candidate, {name, room}) />` (page.js houdt de state, zoals bij de andere sheets).

- [ ] **Step 1: Implement** de vijf stappen uit de spec (soort of Hue → uitleg + "Zoeken…" met `secondsLeft` en **Langer zoeken** → gevonden rijen met **Laat knipperen**, "Wordt klaargezet" bij `interviewing` (dashed, spinner), hulpknoppen → naam en kamer → `doneLine` + **Nog een toevoegen**). Box onbereikbaar: "+" uitgeschakeld met de bestaande reden. Een `failed`-sessie toont `errors.codes.<error>`.
- [ ] **Step 2: Verify** `npm run lint` (0 errors), `npx next build`; met de stack + `fake-zigbee.py`: een lamp en een `plug2` koppelen, een bewegingssensor in een lamp-sessie verschijnt níet en is daarna weg uit `bridge/devices`; screenshots licht/donker, telefoon en breed (`scripts/screenshot.py`).
- [ ] **Step 3: Commit** `PWA: add real devices through a pairing sheet`

### Task 13: PWA — tegel, detail-sheet en Let op

**Files:**
- Modify: `frontend/components/DeviceCard.js`, `frontend/components/DeviceSettingsModal.js`, `frontend/app/page.js` (Let op: `alarmKind`), `frontend/lib/home.js` (`houseSummary` telt `displayType === 'light'` als lamp)

- [ ] **Step 1: Implement:** tegels gebruiken `displayType` (een stekker als lamp: lampicoon, warme gloed, geen helderheid) en `partState` (endpoints); de sensorlezing komt uit `primaryReading`/`readingText`; de detail-sheet krijgt **Laat knipperen** (command `identify`) en bij `type = switch` de schakelaar **Weergeven als lamp** (`shown_as`, zichzelf opslaand met "Opgeslagen"); Let op toont lek en rook bovenaan ("Lekkage in de keuken", "Rook in de gang").
- [ ] **Step 2: Verify:** lint, `node --test lib/*.test.js`, build; met `mosquitto_pub -t zigbee2mqtt/<ieee> -m '{"water_leak":true}'` verschijnt "Lekkage" bovenaan Home; de stekker als lamp telt mee in "2 lampen aan". Screenshots.
- [ ] **Step 3: Commit** `PWA: sensor words, leak and smoke in Let op, plug shown as lamp`

### Task 14: Docs en eindcontrole

**Files:**
- Modify: `docs/status.md`, `docs/codebase.md`, `backend_explained.md`, `DESIGN.md` (toevoegen van een apparaat, Not-Broken-Yet in de koppellijst, Let op-volgorde, stekker als lamp), `docs/development.md` (`fake-zigbee.py` vervangt `fake-lights.py`, `HUE_BRIDGE_HOST`), `docs/superpowers/specs/2026-10-14-device-pairing-design.md` (status: gebouwd), `docs/superpowers/plans/2026-10-14-feature-roadmap.md` (A0 en A2 gebouwd)

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Run** alle checks uit Global Constraints → PASS.
- [ ] **Step 3: Handmatig met Hue** (vooraf zeggen dat er echte lampen schakelen): `HUE_BRIDGE_HOST` in `.env`, een Hue-sessie, knop indrukken, één lamp toevoegen, laten knipperen, aan en uit; daarna de lamp weer in de stand van ervoor.
- [ ] **Step 4: Commit** `Docs: device pairing` en `git switch main && git merge --ff-only feat/device-pairing`.

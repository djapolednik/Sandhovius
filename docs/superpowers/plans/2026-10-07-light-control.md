# Lampen dimmen en kleuren — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lampen dimmen, warm/koel wit en een kleur geven vanuit de detail-sheet, met de stand en een gloed in de echte kleur op de tegel, en scènes die de huidige stand van een lamp kunnen vastleggen.

**Architecture:** `turn_on` krijgt een gecontroleerde payload die de agent naar `light.turn_on` stuurt (ook vanuit scènes). Wat een lamp kan, leest de PWA uit de HA-attributen in `device_state`. De agent zet de MQTT-integratie in HA op als die ontbreekt; `scripts/fake-lights.py` levert drie gesimuleerde Zigbee-lampen via MQTT-discovery om zonder hardware te testen.

**Tech Stack:** Go (agent), Home Assistant REST/config flow, Python + paho-mqtt (testlampen), Next.js 16 (PWA, `node --test`).

**Spec:** `docs/superpowers/specs/2026-10-07-light-control-design.md`

## Global Constraints

- Payload van `turn_on` voor lampen: alleen `brightness_pct` (geheel getal 1–100), `color_temp_kelvin` (geheel getal 1500–9000), `rgb_color` (drie gehele getallen 0–255); `color_temp_kelvin` en `rgb_color` sluiten elkaar uit. Zonder payload: `homeassistant.turn_on` zoals nu.
- Foutteksten (Nederlands): "Deze lamp kan niet dimmen of kleuren" (payload op een niet-`light.*`), "Ongeldige helderheid", "Ongeldige kleurtemperatuur", "Ongeldige kleur", "Kies wit of kleur, niet allebei", "Onbekende instelling: <sleutel>".
- Capabilities uit `supported_color_modes`: dimmen = alles behalve alleen `onoff`; wit = `color_temp`; kleur = een van `hs`, `rgb`, `xy`, `rgbw`, `rgbww`.
- Tegelstand: "Aan · 60%" (procent = `round(brightness / 255 * 100)`, minimaal 1) als de lamp kan dimmen; anders "Aan".
- Gloed: kelvin 2200 → `--lamp-glow` (amber), 6500 → neutraal wit, lineair daartussen; RGB iets gedesatureerd; dekking schaalt met helderheid (bij 1% nog zichtbaar, bij 100% gelijk aan nu). Icoon in dezelfde kleur, terugval op `lamp-icon` als contrast < 3:1 met de icooncirkel (licht en donker thema).
- Kleurstalen: rood, oranje, geel, groen, blauw, paars + "Meer kleuren" (`<input type="color">`). Pillenbalk "Wit / Kleur" alleen als de lamp beide kan.
- Schuif-commando's: hooguit één per 400 ms tijdens slepen, het laatste bij loslaten.
- Scènes: per lamp Aan / Uit / Zoals nu; "Zoals nu" alleen bij een lamp die kan dimmen of kleuren én aan staat.
- MQTT-integratie: broker `mosquitto`, poort 1883; bestaat hij al, dan niets doen; fout = loggen en doordraaien.
- Testlampen: "Testlamp dimbaar" (`brightness`), "Testlamp wit" (`color_temp`, 2200–6500K), "Testlamp kleur" (`color_temp` + `rgb`); discovery op `homeassistant/light/sandhovius_test_<n>/config`, JSON-schema. Alleen deze lampen schakelen bij handmatige tests; daarna verwijderen.
- UI: lees `DESIGN.md` vóór UI-werk; Nederlandse copy, zinsletters; nieuwe UI in `frontend/components/`, logica in `frontend/lib/` met tests.
- Na elke taak groen: `cd agent && go vet ./... && go test ./...`, `cd frontend && node --test lib/*.test.js && npx next build`, `cd backend/tests && go test -tags integration ./...`, `python -m unittest discover -s scripts -p "test_*.py"`. Frontend in Docker: `docker compose build --no-cache frontend && docker compose up -d frontend` (zie `docs/development.md`).
- Branch `light-control`; commits eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Een lamp die uit staat en een schuif krijgt** gaat aan met die waarde (geen commando dat niets doet). Test in Task 5.
2. **Een scène met "Zoals nu" voor een lamp die intussen is verwijderd of geen kleur meer meldt** voert de andere stappen uit en meldt deze ene stap als mislukt. Test in Task 1 (agent) en Task 6 (sheet toont "Zoals nu" niet meer zonder opgeslagen stand).
3. **Snel slepen** geeft geen commando-storm (rate limit `commands:create` 100 per 5 s) en eindigt op de losgelaten waarde. Test in Task 5.
4. **Een RGB-kleur met weinig contrast** (donkerblauw, zwart-achtig) laat het icoon leesbaar. Test in Task 4.
5. **Een lamp die HA als `unavailable` meldt of zonder attributen** toont geen schuiven en geen kapotte gloed. Test in Task 4.

---

### Task 1: Agent — gecontroleerde `light.turn_on`

**Files:**
- Create: `agent/internal/app/light.go`, `agent/internal/app/light_test.go`
- Modify: `agent/internal/app/agent.go` (`handleCommand` en `runSceneStep` gebruiken `serviceCall`)

**Interfaces:**
- Produces: `func serviceCall(action, entityID string, payload map[string]any) (domain, service string, data map[string]any, err error)` — `set_temperature` → `climate`; `turn_on` met niet-lege payload → valideert en geeft `light`, `turn_on`, schone data; anders `homeassistant`, action, payload ongewijzigd.

- [ ] **Step 1: Failing tests** (table): geen payload → `homeassistant/turn_on`; `brightness_pct: 60` op `light.x` → `light/turn_on` met `{brightness_pct: 60}`; JSON-getallen als `float64` (60.0) worden geaccepteerd en als geheel getal doorgegeven; 0, 101, 60.5 → "Ongeldige helderheid"; kelvin 1499/9001 → "Ongeldige kleurtemperatuur"; `rgb_color` met 2 of 4 waarden, -1, 256, niet-getallen → "Ongeldige kleur"; kelvin + rgb samen → "Kies wit of kleur, niet allebei"; sleutel `effect` → "Onbekende instelling: effect"; payload op `input_boolean.x` → "Deze lamp kan niet dimmen of kleuren"; `set_temperature` ongewijzigd naar `climate`.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** en `handleCommand` + `runSceneStep` erop laten leunen (fout → `failCommand` met de tekst, resp. de scène-stap faalt en de rest gaat door). Test (Review Focus 2): `executeScene` met een stap met ongeldige payload en een geldige stap → fout bevat de ongeldige, de geldige is via een nep-`CallService` aangeroepen (gebruik een kleine interface of functieveld voor de HA-aanroep als die er niet is — kies het minst ingrijpende).
- [ ] **Step 4: Draaien, moet slagen.**
- [ ] **Step 5: Commit.** `Agent: dim and colour lights through light.turn_on`

---

### Task 2: Agent — MQTT-integratie in Home Assistant

**Files:**
- Create: `agent/internal/homeassistant/integrations.go`, `agent/internal/homeassistant/integrations_test.go`
- Modify: `agent/internal/app/agent.go` of `weather.go` (aanroep bij het starten, na de HA-verbinding)

**Interfaces:**
- Produces: `func (c *Client) HasIntegration(domain string) (bool, error)` (`GET /api/config/config_entries/entry`); `func (c *Client) AddMQTT(broker string, port int) error` (config flow `handler: "mqtt"`, het formulier invullen met broker en poort, eventuele vervolgstappen leeg afronden — volg `AddWeather`); `func (a *Agent) ensureMQTT()`.

- [ ] **Step 1: Failing tests** (httptest-nep-HA): `HasIntegration("mqtt")` true/false op basis van de entry-lijst; `AddMQTT("mosquitto", 1883)` start de flow met `handler: "mqtt"` en stuurt `broker: "mosquitto"`, `port: 1883` in de formulierstap; een flow-fout geeft een fout terug.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren.** Controleer de echte formuliervelden van de MQTT-flow tegen je dev-HA (`POST /api/config/config_entries/flow {"handler":"mqtt"}` laat het schema zien; daarna de flow afbreken met `DELETE …/flow/<id>`). `ensureMQTT`: bestaat niet → `AddMQTT`; fout loggen, doordraaien.
- [ ] **Step 4: Draaien;** daarna live: `docker compose up -d --build agent` → HA heeft integratie `mqtt` (`GET /api/config/config_entries/entry`), agent-log meldt het toevoegen; een tweede start voegt niets toe.
- [ ] **Step 5: Commit.** `Agent: set up MQTT in Home Assistant when it is missing`

---

### Task 3: Testlampen (`scripts/fake-lights.py`)

**Files:**
- Create: `scripts/fake-lights.py`, `scripts/fakelights.py` (pure state-logica), `scripts/test_fakelights.py`
- Modify: `scripts/requirements.txt` (`paho-mqtt`, vaste versie)

**Interfaces:**
- Produces: `fakelights.LIGHTS` (de drie definities), `fakelights.discovery_config(light) -> dict`, `fakelights.apply(state, command) -> state` (JSON-schema-commando's van HA: `state`, `brightness` 0–255, `color_temp` (mireds) of `color_temp_kelvin`, `color: {r,g,b}`, `color_mode`); CLI `python scripts/fake-lights.py [--host localhost --port 1883] [--remove]` (`--remove` publiceert lege discovery-configs zodat HA de lampen weghaalt).

- [ ] **Step 1: Failing tests:** discovery-config bevat `schema: "json"`, de juiste `supported_color_modes`, `min/max_kelvin` voor de witlamp, unieke `unique_id`; `apply` zet aan/uit, helderheid, kelvin (en mireds → kelvin), rgb, en de `color_mode` die erbij hoort; ongeldige commando's laten de stand ongemoeid.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren;** het script publiceert discovery (retained), luistert op de command-topics en publiceert de nieuwe stand op het state-topic (retained).
- [ ] **Step 4: Verifiëren;** `pip install -r scripts/requirements.txt`, script starten (achtergrond), HA toont `light.testlamp_dimbaar`, `light.testlamp_wit`, `light.testlamp_kleur` met de juiste `supported_color_modes`; `light.turn_on` met `brightness_pct: 40` via de HA-API → state-attribuut `brightness` ≈ 102. Maak via de superuser drie `devices` (type `light`, `gateway` = `45lpedg4nbwbmgv`, kamer Woonkamer, `entity_id` = de drie lampen) — noteer hun ids voor opruimen in Task 7.
- [ ] **Step 5: Commit.** `Scripts: three simulated Zigbee lights over MQTT for testing`

---

### Task 4: PWA — rekenwerk en tegel

**Files:**
- Create: `frontend/lib/light.js`, `frontend/lib/light.test.js`
- Modify: `frontend/components/DeviceCard.js` (stand + gloed), `frontend/app/styles/devices.css` (gloed via CSS-variabelen)

**Interfaces:**
- Produces: `capabilities(attributes) -> {dim, white, colour, minKelvin, maxKelvin}`; `percentFromBrightness(b) -> number|null`; `kelvinToRgb(k) -> [r,g,b]`; `glowFor(attributes) -> {color: 'rgb(...)' | null, strength: 0..1}` (null-kleur = de standaard `--lamp-glow`); `iconColorFor(rgb, theme) -> string|null` (null = terugval op `lamp-icon`); `lightStateText(state) -> string`.

- [ ] **Step 1: Failing tests:** capabilities voor `['onoff']`, `['brightness']`, `['color_temp']`, `['color_temp','hs']`, `undefined`/`unavailable` (Review Focus 5: alles false); procent (255 → 100, 1 → 1, 128 → 50, null → null); `kelvinToRgb(2200)` warm (r > g > b), `kelvinToRgb(6500)` ≈ wit; `glowFor` sterkte bij helderheid 3 > 0 en < 0.3, bij 255 = 1; `iconColorFor([10,10,60], 'dark')` → null, `iconColorFor([255,170,60], 'dark')` → kleur (Review Focus 4); `lightStateText` "Aan · 60%", "Aan", "Uit".
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** (lees `DESIGN.md` Lamp Warm, tile glow, Real Light Rule); `DeviceCard` zet `--glow-color`/`--glow-strength` op een aan-staande lamp en gebruikt `lightStateText`; de CSS gebruikt ze met de bestaande gloed als terugval.
- [ ] **Step 4: Verifiëren;** tests + build; met `fake-lights.py` actief en de testlampen op verschillende standen (via HA-API): screenshots Kamers 1440 en 500, licht en donker — gloed in de juiste kleur/sterkte, "Aan · 40%".
- [ ] **Step 5: Commit.** `PWA: brightness on the tile and a glow in the lamp's real colour`

---

### Task 5: PWA — bediening in de detail-sheet

**Files:**
- Create: `frontend/components/LightControls.js`
- Modify: `frontend/components/DeviceSettingsModal.js` (onder "Stand"), `frontend/app/page.js` (`setLight(device, payload)` + doorgeven), `frontend/lib/light.js` (+ tests), styles

**Interfaces:**
- Consumes: `capabilities`, `percentFromBrightness`, `kelvinToRgb` (Task 4).
- Produces: `light.payloadFor({brightnessPct?, kelvin?, rgb?}) -> payload` (alleen de gezette sleutels, afgerond); `light.throttle(fn, ms) -> {call(value), flush()}` (leading + trailing, laatste waarde wint); `page.js` `setLight(device, payload)` maakt een `turn_on`-command met payload, met hetzelfde optimistische `_pending` als aan/uit en een lokale stand-patch.

- [ ] **Step 1: Failing tests:** `payloadFor` (afronden, alleen gezette sleutels, nooit kelvin en rgb samen — de laatst gekozen wint); `throttle` met nep-klok: 10 aanroepen in 1 s met 400 ms → hooguit 4 doorgegeven, laatste waarde altijd als laatste (Review Focus 3); `flush` stuurt de laatste meteen.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** (lees `DESIGN.md`): Helderheid-schuif, pillenbalk Wit/Kleur (alleen als beide), Wit-schuif binnen min/max kelvin met verloopbaan, zes stalen + "Meer kleuren"; native `<input type="range">` met `aria-valuetext` ("60 procent", "2700 kelvin"); uitgeschakeld als offline/box onbereikbaar. Een schuif op een lamp die uit staat stuurt `turn_on` met de waarde (Review Focus 1). Bij loslaten `flush`.
- [ ] **Step 4: Verifiëren;** tests + build + Docker; handmatig met de testlampen: dimmen, wit, kleur, "Meer kleuren", lamp uit → schuif → gaat aan; HA-stand klopt (API); snel slepen geeft geen 429 (agent-log, PocketBase); screenshots van de sheet (1440, 500, licht/donker).
- [ ] **Step 5: Commit.** `PWA: dim, white and colour controls in the light's detail sheet`

---

### Task 6: PWA — scènes met "Zoals nu"

**Files:**
- Create: `frontend/lib/sceneChoices.js`, `frontend/lib/sceneChoices.test.js`
- Modify: `frontend/components/SceneModal.js` (keuzes uit de lib; modus `current`), `frontend/components/ScenesView.js` en/of `HomeScenes.js` (beschrijving "Staande lamp 40%")

**Interfaces:**
- Produces: `choicesFromActions(actions, devices) -> choices` en `actionsFromChoices(choices, devices) -> actions` (verhuisd uit `SceneModal.js`, gedrag ongewijzigd voor aan/uit/thermostaat) plus modus `current` met `choice.payload`; `currentPayload(device) -> payload|null` (uit `device_state`: `brightness_pct` + `color_temp_kelvin` of `rgb_color` volgens `color_mode`; null als de lamp uit staat of niets kan); `describeLightStep(payload) -> string` ("40%, warm wit", "40%, kleur").

- [ ] **Step 1: Failing tests:** bestaande gedragingen (aan, uit, thermostaat, overslaan) blijven gelijk; `turn_on` met payload → modus `current` met die payload terug uit `choicesFromActions`; `actionsFromChoices` met `current` → `turn_on` + payload; `currentPayload` voor een gedimde witte lamp, een gekleurde lamp, een lamp die uit staat (null), een `onoff`-lamp (null); `describeLightStep`.
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren;** "Zoals nu" alleen tonen als `currentPayload(device)` niet null is óf de scène al een opgeslagen payload voor die lamp heeft (dan de opgeslagen beschrijving tonen); bij kiezen de huidige payload vastleggen.
- [ ] **Step 4: Verifiëren;** tests + build + Docker; handmatig: testlamp kleur op 40% oranje, scène "Test kleur" met "Zoals nu", lamp uit, scène uitvoeren → lamp weer 40% oranje (HA-API); scènetegel toont de beschrijving; scène daarna verwijderen.
- [ ] **Step 5: Commit.** `PWA: scenes remember a light's brightness and colour ("Zoals nu")`

---

### Task 7: Docs en opruimen

**Files:**
- Modify: `DESIGN.md` (tegel: stand en gloed in echte kleur; detail-sheet lampbediening; scène "Zoals nu"), `docs/status.md`, `docs/codebase.md` (`light.go`, `integrations.go`, `LightControls`, `lib/light.js`, `lib/sceneChoices.js`, `scripts/fake-lights.py`), `docs/development.md` (testlampen starten/stoppen), `backend_explained.md` (§11 commandopad: payload naar `light.turn_on`; MQTT-integratie)

- [ ] **Step 1: Docs bijwerken** zoals hierboven.
- [ ] **Step 2: Opruimen:** testdevices (Task 3) verwijderen, `fake-lights.py --remove`, script stoppen, testscènes weg. De MQTT-integratie in HA blijft (hoort er straks bij).
- [ ] **Step 3: Alle suites groen; commit** `Docs: dimming and colour in DESIGN, status and codebase`.

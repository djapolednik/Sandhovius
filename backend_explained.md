# Sandhovius Backend — Uitleg per onderdeel

Dit document legt uit hoe de Sandhovius-backend in elkaar zit: de Docker-stack, het PocketBase-schema, en de Go Local Agent. Het is geschreven zodat je het geheel kan navertellen — elk onderdeel bevat niet alleen *wat* het doet, maar ook *waarom* het zo gebouwd is.

## Inhoudsopgave

1. [Architectuur op hoofdlijnen](#1-architectuur-op-hoofdlijnen)
2. [De Docker-stack](#2-de-docker-stack)
3. [PocketBase: schema en rechten](#3-pocketbase-schema-en-rechten)
4. [De Go Agent: opbouw](#4-de-go-agent-opbouw)
5. [Datastroom: device → PocketBase](#5-datastroom-device--pocketbase)
6. [Online/offline-tracking](#6-onlineoffline-tracking)
7. [Gateway-zelfregistratie](#7-gateway-zelfregistratie)
8. [Lokale geschiedenis (SQLite)](#8-lokale-geschiedenis-sqlite)
9. [Het commandopad: PocketBase → device](#9-het-commandopad-pocketbase--device)
10. [Resilience: reconnects en race conditions](#10-resilience-reconnects-en-race-conditions)
11. [Bekende gaten / nog te bouwen](#11-bekende-gaten--nog-te-bouwen)

---

## 1. Architectuur op hoofdlijnen

```
┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│ Zigbee2MQTT │──┐   │Home Assistant│──┐   │                │
└─────────────┘  │   └──────────────┘  │   │                │
                  ▼                     ▼   │                │
              ┌────────┐          ┌─────────┴──┐             │
              │Mosquitto│◄────────┤  Go Agent   │             │
              └────────┘  MQTT    │  (dit doc)  │             │
                                   └──────┬─────┘             │
                                          │ REST + SSE         │
                                          ▼                    │
                                   ┌─────────────┐             │
                                   │ PocketBase  │◄────────────┘
                                   └─────────────┘   (later: PWA)
```

De Go Agent is het middelpunt: hij **leest** state van Home Assistant (via websocket) en Zigbee2MQTT (via MQTT), schrijft dat naar **PocketBase** (de cloud/database-laag) én naar een **lokale SQLite-database** (onafhankelijke geschiedenis), en **luistert** op PocketBase voor commando's die hij vervolgens bij Home Assistant uitvoert.

Twee dingen zijn bewust dubbel opgezet, niet uit slordigheid maar voor betrouwbaarheid:
- **HA + Zigbee2MQTT als aparte inputs**: zelfde soort data (state changes), twee onafhankelijke bronnen. Als Home Assistant herstart, blijft Zigbee-data via MQTT gewoon binnenkomen.
- **PocketBase + lokale SQLite als aparte outputs**: PocketBase geeft één "huidige status" per device (voor de cloud/PWA), lokaal wordt *alles* bijgehouden, ook als PocketBase onbereikbaar is.

---

## 2. De Docker-stack

Gedefinieerd in `docker-compose.yml`, vijf services op één Docker-netwerk (`sandhovius-net`):

| Service | Image | Rol |
|---|---|---|
| `mosquitto` | `eclipse-mosquitto:2` | MQTT-broker — centrale berichtenbus tussen Zigbee2MQTT en de agent |
| `homeassistant` | `ghcr.io/home-assistant/home-assistant:stable` | State management, Zigbee-coördinatie, entity's |
| `zigbee2mqtt` | `koenkk/zigbee2mqtt:latest` | Vertaalt Zigbee-radioverkeer naar MQTT-berichten (vereist een echte USB Zigbee-coordinator; in deze dev-omgeving niet aanwezig) |
| `pocketbase` | `ghcr.io/muchobien/pocketbase:latest` | De backend-database + auth + realtime API |
| `agent` | eigen build (`agent/Dockerfile`) | De Go Local Agent — dit hele document |

Elke service met blijvende state heeft een eigen named volume (`mosquitto_data`, `ha_config`, `z2m_data`, `pocketbase_data`, `agent_data`), zodat een `docker compose up` een container mag vervangen zonder data te verliezen.

**Secrets** (`HA_TOKEN`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`) staan niet in `docker-compose.yml` zelf, maar worden via `${VAR}`-substitutie uit een lokaal, niet-gecommit `.env`-bestand gehaald (`.env.example` documenteert welke variabelen nodig zijn).

---

## 3. PocketBase: schema en rechten

### Collecties

| Collectie | Doel | Belangrijkste velden |
|---|---|---|
| `users` | PocketBase's ingebouwde auth-collectie | `email`, `password` |
| `gateways` | Eén rij per fysieke gateway (N100) | `user` (eigenaar), `name`, `select` (online/offline/error status), `claimed_at`, `last_seen` |
| `devices` | Eén rij per fysiek device | `gateway` (relatie), `entity_id` (HA entity_id of Zigbee friendly_name), `name`, `type`, `online` |
| `device_state` | **Huidige** state per device — één rij, overschreven | `device` (relatie), `state` (JSON), `updated_at` |
| `commands` | Instructies van de PWA richting een device | `device` (relatie), `action` (turn_on/turn_off/toggle), `payload` (JSON), `status` (pending/sent/failed), `error` |

De relatie-keten is: `gateways` ← `devices` ← `device_state` / `commands`. Elk device hoort bij precies één gateway; elke gateway bij precies één gebruiker.

### Waarom `device_state` maar één rij per device heeft

Bewuste ontwerpkeuze: PocketBase houdt alleen de **laatste** bekende state per device bij (upsert, geen geschiedenis-log). De volledige geschiedenis van elke state-change zit lokaal op de gateway (zie [§8](#8-lokale-geschiedenis-sqlite)) — dat past bij het uitgangspunt "sensordata blijft lokaal, cloud is voor gemak, niet voor opslag".

### API-rules: wie mag wat

```
users:         list/view/update/delete → alleen jezelf (id = @request.auth.id)
gateways:      list/view                → user = @request.auth.id
devices:       list/view                → gateway.user = @request.auth.id
device_state:  list/view                → device.gateway.user = @request.auth.id
commands:      list/view/create         → device.gateway.user = @request.auth.id
               create ook alleen als    → status = "pending"
```

Alles wat hier **niet** genoemd staat (create/update/delete op gateways/devices/device_state, en update/delete op commands) staat op `null` — PocketBase's manier van zeggen "alleen superusers". De Go Agent authenticeert altijd als superuser (met een los admin-account, niet via de `users`-collectie), dus die rules raken de agent nooit. Een ingelogde PWA-gebruiker kan **wel** zijn eigen data lezen en commando's aanmaken, maar kan nergens rechtstreeks in schrijven wat normaal alleen de agent zou moeten doen (device_state, gateway-status, device.online).

Dit is bewust minimaal: precies genoeg opengezet om een read-only dashboard + commando's te laten werken, niets meer. Zie [§11](#11-bekende-gaten--nog-te-bouwen) voor wat er nog ontbreekt richting een volwaardige PWA.

---

## 4. De Go Agent: opbouw

De agent is één Go-module (`agent/`, module `sandhovius/local-agent`) opgedeeld in packages, elk met een duidelijke verantwoordelijkheid:

```
agent/
├── main/main.go              — entrypoint: config laden, alle clients bouwen, agent starten
└── internal/
    ├── config/                — omgevingsvariabelen inlezen, per dependency één bestand
    │   ├── config.go              (aggregeert alles)
    │   ├── mqtt.go, homeassistant.go, pocketbase.go, gateway.go, history.go
    ├── mqtt/                  — generieke MQTT-transport + Zigbee2MQTT-specifieke parsing
    │   ├── client.go              (paho-wrapper, reconnect-bestendig)
    │   └── event.go               (topic/payload → ZigbeeEvent / ZigbeeAvailability)
    ├── homeassistant/         — HA websocket (lezen) + HA REST (commando's uitvoeren)
    │   ├── client.go, event.go, service.go
    ├── pocketbase/            — alles wat met PocketBase praat
    │   ├── client.go               (generieke authenticated HTTP-laag)
    │   ├── auth.go                 (inloggen, automatisch opnieuw bij 401)
    │   ├── devices.go, gateways.go, device_state.go, commands.go
    │   └── realtime.go             (SSE-subscription voor commando's)
    ├── history/               — lokale SQLite, onafhankelijk van PocketBase
    │   └── store.go
    └── app/                   — de orkestratie: verbindt alle bovenstaande packages
        ├── agent.go
        └── device_cache.go
```

**Waarom deze opdeling?** Elk package kent alleen zijn eigen protocol (MQTT, HA-websocket, HA-REST, PocketBase-REST, SQLite) en weet niets van de andere. `app/agent.go` is de enige plek die ze allemaal samenbrengt — een event van de ene kant vertalen naar een actie aan de andere kant. Dat maakt elk stuk apart te begrijpen en te testen.

---

## 5. Datastroom: device → PocketBase

Twee onafhankelijke paden komen op hetzelfde punt samen.

### Pad A: Home Assistant

1. `homeassistant/client.go` opent een websocket naar HA, authenticeert, en abonneert op `state_changed`-events
2. `homeassistant/event.go` parseert elk ruw bericht **type-veilig** (geneste Go-structs die de JSON-vorm volgen, i.p.v. handmatig door een `map[string]interface{}` graven) naar een `HAEvent{EntityID, State, Attributes, Timestamp}`. Berichten die geen relevante state_changed-event zijn (bv. de subscribe-bevestiging) worden er hier al uitgefilterd
3. `app/agent.go`'s `forwardHAEvent()` ontvangt dit event

### Pad B: Zigbee2MQTT

1. `mqtt/client.go` verbindt met Mosquitto en abonneert op `zigbee2mqtt/#`
2. `mqtt/event.go` parseert het topic: `zigbee2mqtt/<naam>` → een state-update (`ZigbeeEvent`), `zigbee2mqtt/<naam>/availability` → een online/offline-signaal (`ZigbeeAvailability`), en alles anders (bridge-status, etc.) wordt genegeerd
3. `app/agent.go`'s `forwardZigbeeEvent()` ontvangt dit event

### Waarom dit geen overbodige verdubbeling is

In een echte deployment loopt Zigbee-data normaal óók via Home Assistant (via HA's eigen MQTT-discovery), dus het is een terechte vraag waarom Pad B naast Pad A bestaat in plaats van alles gewoon via Home Assistant te laten lopen. De reden: **Home Assistant is de instabielste schakel in de stack** — hij herstart vaker dan Mosquitto/Zigbee2MQTT (updates, add-on-wijzigingen, HACS). Met alleen Pad A zou Zigbee-tracking stilvallen zodra HA herstart, ook al draaien Mosquitto en Zigbee2MQTT prima door. Met Pad B ernaast blijft Zigbee-data binnenkomen ongeacht de staat van HA specifiek.

De prijs daarvoor is bewust geaccepteerd: in een deployment waar een Zigbee-device via beide paden binnenkomt, wordt dezelfde state-change twee keer naar PocketBase geschreven (onschadelijk dankzij de upsert-logica in stap 4 hieronder, maar wel dubbel verkeer), en `devices.entity_id` moet dan met twee verschillende naamconventies kunnen matchen (HA-stijl, bv. `light.woonkamer_lamp`, vs. Zigbee `friendly_name`) — precies het type mismatch dat eerder al voor verwarring zorgde toen een testdevice de verkeerde entity_id had. Dit is een expliciete, heroverwogen keuze, geen toevalligheid.

### Wat beide forward-functies vervolgens doen

1. **Eerst, altijd**: de ruwe state wordt naar lokale SQLite geschreven (`history.Record`) — dit gebeurt vóórdat er iets met PocketBase geprobeerd wordt, en ongeacht of dat lukt (zie [§8](#8-lokale-geschiedenis-sqlite))
2. **Device-lookup**: de `entity_id`/`friendly_name` wordt via de `deviceCache` (`app/device_cache.go`) vertaald naar een PocketBase `device.id`. Deze cache wordt bij opstarten opgewarmd en ververst zichzelf automatisch bij een cache-miss ("misschien is dit device net toegevoegd") — één keer, niet in een loop
3. Als het device **onbekend** is: loggen en stoppen, geen fout. Zoveel entity's in een huis (bv. `sun.sun`, systeeminterne sensoren) horen niet bij een fysiek device en worden bewust genegeerd voor PocketBase — maar staan wél al in de lokale geschiedenis van stap 1
4. Als het device **bekend** is: `pocketbase.UpsertDeviceState(deviceID, state)` — kijkt of er al een rij bestaat voor dit device, en doet een PATCH (bestaand) of POST (nieuw), zodat er precies één rij per device blijft staan

---

## 6. Online/offline-tracking

Elk device heeft een `online`-veld in PocketBase. De regel (bewust gekozen, geen timeout-mechanisme):

- **`online = true`** bij *elk* event van dat device — het sturen van data is op zich al bewijs van leven
- **`online = false`** *alleen* bij een expliciet offline-signaal:
  - Home Assistant: state `"unavailable"`
  - Zigbee2MQTT: een bericht op `zigbee2mqtt/<naam>/availability` met `{"state":"offline"}`

Een device dat gewoon stil is (geen data, maar ook geen expliciet offline-signaal) blijft dus "online" staan totdat zo'n signaal komt. Dat is een bewuste, eenvoudige eerste versie — een timeout-gebaseerde aanvulling ("geen bericht in X minuten = offline") is een mogelijke vervolgstap, nog niet gebouwd.

---

## 7. Gateway-zelfregistratie

Bij het opstarten (`Agent.Start()` → `registerGateway()`) zoekt de agent zijn eigen `gateways`-record op naam (`GATEWAY_NAME`-omgevingsvariabele). Bestaat het nog niet, dan maakt de agent het zelf aan — geen handmatige provisioning-stap nodig, wat aansluit bij het "zero-setup"-uitgangspunt. Daarna wordt de status meteen op `"online"` gezet.

Bij een nette shutdown (`Stop()`) wordt de status teruggezet naar `"offline"`. `last_seen` wordt door PocketBase zelf bijgewerkt (het `autodate`-veld staat op `onUpdate: true`) — de agent hoeft dat nooit zelf te zetten.

---

## 8. Lokale geschiedenis (SQLite)

`internal/history/store.go` is een kleine, op zichzelf staande SQLite-database (`modernc.org/sqlite`, een pure-Go implementatie — geen CGO nodig, dus geen extra complexiteit in de Docker-build).

**De kern van het ontwerp: onafhankelijkheid.** De write naar lokale geschiedenis gebeurt in `forwardHAEvent`/`forwardZigbeeEvent` *voordat* er iets met PocketBase geprobeerd wordt, en gebruikt de rauwe `entity_id`/`friendly_name` als sleutel — niet het PocketBase `device.id`. Dat betekent:
- Lokale geschiedenis blijft werken als PocketBase onbereikbaar is (geen internet)
- Lokale geschiedenis bevat óók events van devices die nog niet als "device" in PocketBase geregistreerd staan

Dit is precies de kernbelofte uit het project: 100% lokale betrouwbaarheid, ongeacht de cloud-verbinding.

Eén tabel, `device_state_history` (`entity_id`, `state` als JSON-tekst, `recorded_at`), met een index op beide kolommen. Een achtergrondtaak (`runHistoryCleanup`, elk uur) ruimt rijen ouder dan `HISTORY_RETENTION_DAYS` (standaard 30) op, zodat de database op de N100 niet onbeperkt blijft groeien.

---

## 9. Het commandopad: PocketBase → device

Dit is de omgekeerde richting: een gebruiker doet iets in de (toekomstige) PWA, en dat moet uiteindelijk een echt device aansturen.

```
PWA schrijft record  →  PocketBase "commands"  →  agent (realtime SSE)  →  HA service-call  →  echt device
                                                                                                      │
                                                                          state_changed-event ◄───────┘
                                                                                   │
                                                                          (Pad A hierboven, opnieuw)
```

1. Een ingelogde gebruiker maakt een `commands`-record aan (`status: "pending"`) voor een device dat hij zelf bezit (afgedwongen door de `createRule`)
2. De agent luistert **realtime** mee via PocketBase's SSE-endpoint (`pocketbase/realtime.go`) — geen polling. Zodra een nieuw commando verschijnt, komt dat binnen ~1 seconde binnen
3. `app/agent.go`'s `handleCommand()` haalt het device op (voor de `entity_id`), en roept Home Assistant's **domein-agnostische** services aan: `homeassistant.turn_on` / `turn_off` / `toggle`. Deze meta-services werken voor licht, switches, climate, input_booleans etc. zonder dat de agent per device-type andere logica nodig heeft
4. Het commando wordt gemarkeerd als `"sent"` of `"failed"` (met foutmelding), zodat de PWA feedback kan tonen
5. De service-call verandert de échte state in Home Assistant → HA stuurt daarover een `state_changed`-event → dat komt via **Pad A** uit §5 gewoon weer bij PocketBase terecht. De cirkel is rond: het "nieuwe" device_state-record ontstaat niet apart, maar via hetzelfde pad als elke andere state-update

**Waarom ook een catch-up-stap nodig is:** de realtime-subscription levert alleen wijzigingen vanaf het moment van verbinden — geen geschiedenis. Als de agent een tijdje offline was terwijl er al een commando klaarstond, zou dat commando anders nooit uitgevoerd worden. Daarom doet `catchUpPendingCommands()` bij elke start eerst een eenmalige query naar alle nog openstaande (`status: pending`) commando's.

**Bewuste scope-keuze:** commando's gaan nu alleen via Home Assistant, niet rechtstreeks via een Zigbee2MQTT `.../set`-topic. Reden: er is in deze omgeving geen echte Zigbee-hardware om dat tegen te verifiëren, en in de praktijk lopen Zigbee2MQTT-devices meestal toch via Home Assistant's eigen MQTT-integratie.

---

## 10. Resilience: reconnects en race conditions

Drie concrete problemen zijn tijdens de bouw gevonden (niet in theorie, maar door daadwerkelijk verbindingen te verbreken en te kijken wat er gebeurde) en opgelost:

### Race condition in `UpsertDeviceState`
De "kijk of het al bestaat, dan PATCH, anders POST"-logica was niet atomisch. Twee events voor hetzelfde (nog onbekende) device die snel na elkaar binnenkwamen, konden allebei "bestaat nog niet" zien en allebei een eigen rij aanmaken. **Fix**: een `sync.Mutex` (`upsertMu`) op de PocketBase-client die de hele check-en-schrijf-sequentie serialiseert. Omdat de agent de enige schrijver naar `device_state` is, sluit dit de race volledig af.

### HA-websocket: geen reconnect
Bij een verbroken verbinding bleef de agent in een tight loop lezen van een dode socket — geen backoff, tientallen foutregels per seconde, en de container crashte uiteindelijk (bewezen: `RestartCount` liep op tot 4). **Fix**: een expliciete reconnect-loop met exponentiële backoff (1s tot 30s), die bij elke poging `Connect()` opnieuw aanroept — dat doet meteen ook de volledige HA-handshake + het opnieuw abonneren op events.

### MQTT: stille dataverlies na broker-herstart
Paho's standaard sessiegedrag (`CleanSession: true`) vergeet topic-subscriptions bij een reconnect. Na een herstart van Mosquitto bleef de agent gewoon "gezond" draaien — geen enkele foutmelding — maar ontving stilzwijgend niets meer. **Fix**: de MQTT-client onthoudt zelf alle `Subscribe()`-aanroepen en abonneert opnieuw op alles via een `OnConnect`-handler, die paho aanroept bij zowel de eerste verbinding als elke automatische reconnect.

Alle drie zijn na de fix opnieuw getest door de betreffende container daadwerkelijk te herstarten en te bevestigen dat de agent zonder crash of dataverlies herstelt.

---

## 11. Bekende gaten / nog te bouwen

Voor de volledigheid — dit document beschrijft wat er ís, niet wat er *nog niet* is, maar deze lijst hoort erbij voor een eerlijk beeld:

- **Geen echte Zigbee-hardware getest.** Alle Zigbee2MQTT-paden zijn geverifieerd door berichten te simuleren via `mosquitto_pub`, nooit tegen een echte Zigbee-coordinator/device.
- **Geen Headscale/mesh-tunnel.** De cloud-backend draait nog niet op een echte VPS; remote toegang buiten het lokale netwerk bestaat nog niet. Het ontwerp hiervoor is uitgedacht maar bewust nog niet geïmplementeerd, in afwachting van een echte Scaleway-VPS.
- **Geen directe Zigbee2MQTT `.../set`-commandopad** — zie §9.
- **Geen geautomatiseerde testsuite.** Alles is tot nu toe handmatig/live geverifieerd tegen de draaiende stack; er zijn geen `_test.go`-bestanden in de repository.
- **PWA-frontend bestaat nog niet.** De backend is er klaar voor (leesrechten + commandopad staan), maar er is nog geen Next.js-project gestart.
- **Timeout-gebaseerde offline-detectie ontbreekt** — zie §6.

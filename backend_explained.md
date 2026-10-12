# Sandhovius Backend — Uitleg per onderdeel

Dit document legt uit hoe de Sandhovius-backend in elkaar zit: de Docker-stack,
het PocketBase-schema met zijn regels en hooks, en de Go Local Agent. Elk
onderdeel beschrijft niet alleen *wat* het doet, maar ook *waarom* het zo
gebouwd is. Bijgewerkt tot en met de claim-flow (2026-10-06).

Voor de stap-voor-stap flow van een nieuwe box: `docs/box-aanmelden.md`.
Ontwerpkeuzes in detail: `docs/superpowers/specs/`.

## Inhoudsopgave

1. [Architectuur op hoofdlijnen](#1-architectuur-op-hoofdlijnen)
2. [De Docker-stack](#2-de-docker-stack)
3. [PocketBase: schema](#3-pocketbase-schema)
4. [PocketBase: regels, hooks en rate limits](#4-pocketbase-regels-hooks-en-rate-limits)
5. [De Go Agent: opbouw](#5-de-go-agent-opbouw)
6. [Box-identiteit en het huis van de box](#6-box-identiteit-en-het-huis-van-de-box)
7. [Starten en herstellen zonder PocketBase](#7-starten-en-herstellen-zonder-pocketbase)
8. [Datastroom: device → PocketBase](#8-datastroom-device--pocketbase)
9. [Online/offline en de hartslag](#9-onlineoffline-en-de-hartslag)
10. [Lokale geschiedenis (SQLite)](#10-lokale-geschiedenis-sqlite)
11. [Het commandopad: PocketBase → device](#11-het-commandopad-pocketbase--device)
12. [Scènes, schema's en weer](#12-scènes-schemas-en-weer)
13. [Resilience: reconnects en race conditions](#13-resilience-reconnects-en-race-conditions)
14. [Testen](#14-testen)
15. [Bekende gaten / nog te bouwen](#15-bekende-gaten--nog-te-bouwen)

---

## 1. Architectuur op hoofdlijnen

```
┌─────────────┐   ┌──────────────┐
│ Zigbee2MQTT │   │Home Assistant│
└──────┬──────┘   └──────┬───────┘
       │ MQTT            │ websocket + REST
       ▼                 ▼
  ┌──────────┐     ┌────────────┐   lokale SQLite-geschiedenis,
  │Mosquitto │◄───►│  Go Agent  │── /data/box.json, /data/schedules.json
  └──────────┘     └─────┬──────┘
                         │ REST + SSE, ingelogd als box
                         ▼
                   ┌────────────┐   hooks: claim/release, mail
                   │ PocketBase │── Mailpit (dev) / SMTP (later)
                   └─────┬──────┘
                         │ REST + realtime, ingelogd als bewoner
                         ▼
                   ┌────────────┐
                   │  PWA (Next)│
                   └────────────┘
```

De Go Agent draait op de box (N100) en is het middelpunt: hij **leest** state
van Home Assistant en Zigbee2MQTT, schrijft die naar **PocketBase** (de
cloudlaag waar de app mee praat) én naar een **lokale SQLite-database**, en
**voert commando's uit** die bewoners in de app geven. PocketBase draait nu
lokaal in Docker; in fase 3 komt het op Scaleway en verandert alleen het adres.

Twee dingen zijn bewust dubbel, voor betrouwbaarheid:
- **HA + Zigbee2MQTT als aparte inputs**: als Home Assistant herstart, blijft
  Zigbee-data via MQTT binnenkomen.
- **PocketBase + lokale SQLite als aparte outputs**: PocketBase houdt één
  "huidige stand" per device bij voor de app; lokaal wordt *alles* bewaard, ook
  zonder internet.

---

## 2. De Docker-stack

`docker-compose.yml`, één netwerk (`sandhovius-net`), containers `sandhovius-*`:

| Service | Image | Rol |
|---|---|---|
| `mosquitto` | `eclipse-mosquitto:2` | MQTT-broker tussen Zigbee2MQTT en de agent |
| `homeassistant` | `ghcr.io/home-assistant/home-assistant:stable` | State management; apparaten uit de app worden HA-helpers (`input_boolean`/`input_number`) |
| `zigbee2mqtt` | `koenkk/zigbee2mqtt:latest` | Zigbee-radio ↔ MQTT (vereist een echte USB-coordinator; in dev afwezig) |
| `agent` | eigen build (`agent/Dockerfile`) | De Go Local Agent |
| `pocketbase` | `ghcr.io/muchobien/pocketbase:0.40.4` | Database, auth, realtime API, hooks. **Vastgepind**: de beveiliging leunt op gedrag dat tests op 0.40.4 vastleggen |
| `mailpit` | `axllent/mailpit:v1.21.8` | Vangt alle mail in dev op; zichtbaar op http://localhost:8025 |
| `frontend` | eigen build (`frontend/`) | De PWA (Next.js 16), http://localhost:3000 |

Elke service met blijvende state heeft een named volume (`pocketbase_data`,
`agent_data`, `ha_config`, …), zodat een container vervangen mag worden zonder
dataverlies. `docker compose down -v` wist ze wél.

`backend/pb_migrations/` en `backend/pb_hooks/` zijn als volume in de
PocketBase-container gekoppeld: migraties draaien bij het starten; nieuwe of
gewijzigde hooks vragen op Windows soms een `docker compose restart pocketbase`.

**Secrets** staan niet in `docker-compose.yml` maar in een lokaal `.env`
(`HA_TOKEN`, `POCKETBASE_ADMIN_EMAIL`/`_PASSWORD` voor PocketBase zelf en de
scripts). De agent heeft **geen** superuser-gegevens meer: hij logt in met zijn
eigen identiteit uit `/data/box.json` (§6). Mail komt uit env-variabelen op de
`pocketbase`-service (`SMTP_HOST`, `SMTP_PORT`, `APP_URL`, `MAIL_FROM`, …).

---

## 3. PocketBase: schema

Het schema staat als code in `backend/pb_migrations/`: een snapshot als
startpunt plus kleine migraties per wijziging. Een verse database bouwt zich bij
het starten helemaal op.

| Collectie | Soort | Doel | Belangrijkste velden |
|---|---|---|---|
| `users` | auth | Bewoners; token geldt een jaar (de PWA verlengt het dagelijks, dus ingelogd tot je zelf uitlogt; wachtwoord wijzigen maakt alle tokens ongeldig) | `email`, `verified`, `language` (`nl`/`en`, taal van e-mails) |
| `boxes` | auth | Eén per fysieke box | `serial` (login), wachtwoord = boxgeheim, `house`, `claim_code_hash` (verborgen) |
| `houses` | base | Eén per huis | `members` en `admins` (meervoudige relaties naar `users`; beheerders zijn altijd ook lid, er is altijd minstens één), `name`, `select` (online/offline), `claimed_at`, `last_seen` (autodate = hartslag), `weather`, `weather_updated` |
| `rooms` | base | Kamers | `house`, `name`, `order` |
| `devices` | base | Apparaten | `gateway` (= huis), `entity_id`, `name`, `type`, `online`, `room` |
| `favorites` | base | Favorieten op Home, per persoon | `user`, `device` (cascade), `order`; uniek op (user, device) |
| `invitations` | base | Uitnodigingen voor een huis | `house` (cascade), `email` (kleine letters), `role` (`admin`/`member`), `invited_by`, `house_name`, `inviter_name`, `expires` (+7 dagen), `created`; uniek op (house, email) |
| `device_state` | base | **Huidige** stand per device (één rij, overschreven) | `device`, `state` (JSON), `updated_at` |
| `commands` | base | Opdrachten van de app | `device` óf `scene`, `action`, `payload`, `status` (pending/sent/failed), `error`, `created`, `updated` |
| `scenes` | base | Scènes | `house`, `name`, `order`, `actions` (JSON) |
| `schedules` | base | Schema's voor scènes | `house`, `scene`, `time` ("HH:MM"), `days`, `enabled`, `last_run`, `last_error` |

Relaties: `users` ↔ `houses` (via `members`/`admins`) ← `rooms`/`devices`/`scenes`/`schedules`;
`devices` ← `device_state`/`commands`/`favorites`. Een box hoort bij hooguit één huis
(`boxes.house`), een bewoner kan lid van meerdere huizen zijn en een huis
heeft meerdere leden (spec: `docs/superpowers/specs/2026-10-07-household-design.md`).

**Waarom `device_state` maar één rij per device heeft**: PocketBase houdt
alleen de laatste stand bij; de volledige geschiedenis blijft lokaal op de box
(§10) — "sensordata blijft lokaal, de cloud is voor gemak".

**Waarom `state.last_updated` erin staat**: de agent schrijft HA's
`last_updated` mee in de JSON (geen eigen kolom, dus geen migratie). Een
afstemming (`GetState`) kan na een nieuwer `state_changed`-event binnenkomen;
de agent onthoudt per entity de laatst doorgestuurde tijd en schrijft nooit
een oudere stand (`stateClock`, controleren en schrijven onder één lock). De
PWA gooit een echo weg die ouder is dan wat hij al heeft (`lib/inflight.js`).
Zelfde idee als Matter's DataVersion. Het Zigbee2MQTT-pad heeft (nog) geen tijd;
zonder tijd geldt de stand altijd.

---

## 4. PocketBase: regels, hooks en rate limits

### Regels: twee soorten ingelogden

Elke regel heeft een **bewonerstak** en een **box-tak**:

```
bewoner: @request.auth.collectionName = "users" && (…members.id ?= @request.auth.id)
box:     @request.auth.collectionName = "boxes" && @request.auth.house != ""
         && (… = @request.auth.house)
```

- Elk lid bedient het huis (`members.id ?= …`; op PocketBase 0.40.4 matcht
  `members ?= …` zonder `.id` nooit). Alleen een beheerder (`admins.id ?= …`)
  hernoemt het huis. Niemand zet `members`/`admins` met een gewone PATCH, ook
  een beheerder niet: dat gaat via `household.pb.js`, dat de invariant bewaakt.
- Favorieten: alleen je eigen, en alleen voor apparaten van je eigen huizen.
  Uitnodigingen: zichtbaar voor de beheerders van het huis en voor de
  genodigde (`email = @request.auth.email:lower`, alleen bevestigd); aanmaken
  alleen als beheerder met `invited_by` = jezelf; niet wijzigbaar.
- De bewonerstak eist expliciet `users`; zonder die check matchte een gast
  (lege `auth.id`) huizen zonder eigenaar.
- De box-tak eist een huis; zonder huis ziet en schrijft een box niets (hij
  draait dan alleen lokaal).
- Een box mag alleen de velden schrijven die de agent nodig heeft (bijv. bij
  `devices` alleen `entity_id` en `online`; bij `commands` alleen `status` en
  `error`). Een integratietest probeert elk ander veld, ook velden die later
  bijkomen.
- Realtime volgt dezelfde regels: een box krijgt alleen events van zijn eigen
  huis, een bewoner alleen van zijn eigen huizen.
- `boxes` is voor bewoners onzichtbaar; `claim_code_hash` is ook voor de box
  zelf verborgen. `claimed_at` kan alleen de server zetten.

### Hooks (`backend/pb_hooks/`)

- **`claim.pb.js`** — `POST /api/sandhovius/claim` en `/release`, alleen voor
  ingelogde bewoners met een bevestigd e-mailadres. Volgorde: bevestigd →
  code (hash van de genormaliseerde code, constante-tijd vergelijking) →
  beheerder van `replace_house` → al gekoppeld (lid van dat huis: 200). Alles in één transactie, zodat
  bij twee gelijktijdige claims precies één wint. Onbekend serienummer en foute
  code geven exact dezelfde 400. Details: `docs/box-aanmelden.md`.
- **`mail.pb.js` + `mail_texts.js`** — zet bij het starten de app-naam
  ("Sandhovius") en, als `SMTP_HOST` gezet is, SMTP, afzender en `appURL` uit
  env. Bevestigings-, reset- en inlogmeldingsmails gaan in de taal van het
  account (`users.language`, standaard Nederlands); links wijzen naar de PWA
  (`/bevestig`, `/wachtwoord`). Ook de uitnodigingsmail (taal van de
  uitnodiger, naam en huisnaam geëscaped, link `/uitnodiging`).
- **`household.pb.js`** — lidmaatschap, elk in één transactie, voor ingelogde
  bewoners. Wie geen lid of beheerder is krijgt 404.
  - Bij een nieuwe uitnodiging (alleen als de aanvrager beheerder is): e-mail
    in kleine letters, al lid → 400 "Al lid van dit huis", oude uitnodiging
    voor hetzelfde adres vervangen, `expires`, `house_name`, `inviter_name`;
    daarna de mail (mislukt die, dan blijft de uitnodiging en gaat de fout naar
    het log).
  - `GET /api/sandhovius/houses/{id}/members` — leden met naam, e-mail en rol.
  - `POST /api/sandhovius/invitations/{id}/accept` — ander adres 404,
    onbevestigd 403, verlopen 410; daarna lid (en beheerder bij rol admin).
  - `PATCH` / `DELETE /api/sandhovius/houses/{id}/members/{user}` — rol
    wijzigen (beheerder) en verwijderen (beheerder) of verlaten (jezelf);
    de laatste beheerder → 409. Verlaten ruimt je favorieten in dat huis op.

### Rate limits

Aan sinds de box-identiteit, per IP: PocketBase-standaarden (`*:auth` 2 per
3 s, `*:create` 20 per 5 s, `/api/` 300 per 10 s) plus `boxes:auth` 10 per
minuut, `commands:create`/`device_state:create` 100 per 5 s (anders breekt
"Alles uit" bij veel apparaten) en `/api/sandhovius/claim` en `/release` elk
10 per minuut, en `invitations:create` 20 per uur per ingelogde gebruiker.
Padlabels matchen exact. Achter een proxy (fase 3) moet
PocketBase de echte client-IP kennen, anders delen alle clients één emmer.

---

## 5. De Go Agent: opbouw

Eén Go-module (`agent/`, module `sandhovius/local-agent`):

```
agent/
├── main/main.go          — config + box.json laden, clients bouwen, agent starten
└── internal/
    ├── box/              — /data/box.json lezen en het huis bijwerken (atomisch, 0600)
    ├── config/           — omgevingsvariabelen (BOX_FILE, SCHEDULES_FILE, …)
    ├── mqtt/             — MQTT-transport + Zigbee2MQTT-parsing
    ├── homeassistant/    — websocket (events), REST (services, state), registry (helpers), weer
    ├── pocketbase/       — REST-client, inloggen als box, realtime (SSE), per collectie een bestand
    ├── history/          — lokale SQLite-geschiedenis
    └── app/              — de orkestratie
        ├── agent.go          start/stop, HA- en MQTT-events, commando's, hartslag
        ├── connection.go     verbindingslus met backoff + herstelstap
        ├── house.go          huis uit het box-record, controle elke 5 minuten
        ├── device_cache.go   entity_id → device-id, alleen van het eigen huis
        ├── commands.go       verlopen en claimen van commando's
        ├── scheduler.go + schedule_store.go   schema-klok en snapshot op schijf
        └── weather.go        weer uit HA naar houses.weather
```

`app/mqtt.go` zet bij de start de MQTT-integratie van Home Assistant zelf op
(`ensureMQTT`, via `homeassistant/integrations.go`): als HA hem nog niet heeft,
doorloopt de agent de config-flow naar de lokale broker; mislukt dat, dan
wordt de flow afgebroken.
Zo zien lampen die zich via MQTT-discovery aanmelden direct HA.

Elk package kent alleen zijn eigen protocol; `app/` is de enige plek die ze
samenbrengt.

---

## 6. Box-identiteit en het huis van de box

- Elke box heeft een eigen record in `boxes`. Bij het klaarmaken schrijft
  `scripts/provision-box.py` `/data/box.json` (`serial`, `secret`). Zonder
  geldig `box.json` stopt de agent met een duidelijke fout: een box zonder
  identiteit is een productiefout.
- De agent logt in via `boxes/auth-with-password` en haalt zijn huis uit het
  antwoord. Het laatst bekende huis bewaart hij in `box.json`, zodat hij ook
  zonder internet weet bij welk huis zijn schema's horen.
- Elke 5 minuten (`houseCheckInterval`) ververst hij zijn record
  (`auth-refresh`) en volgt een verandering:
  - **claim** (geen huis → huis): herstelstap, PocketBase-werk begint;
  - **loskoppelen** (huis → geen): eerst `registered` uit, dan huis leeg;
    hartslag, weer, schrijfacties, device-cache en schema's van het oude huis
    stoppen meteen;
  - **wissel** (ander huis): cache leeg, herstelstap voor het nieuwe huis.
- Een box hoort bij een huis, niet andersom: een kapotte box vervangen houdt
  kamers, apparaten, scènes en schema's. Het huis is van de bewoner.

---

## 7. Starten en herstellen zonder PocketBase

`Start()` begint met alles wat lokaal kan: MQTT, opruimen van de geschiedenis,
het huis uit `box.json`, de schema-snapshot uit `/data/schedules.json` en Home
Assistant. Daarna logt `runPocketBase` in met exponentiële backoff (1 s → 30 s).
Zonder internet blijft de box dus automatiseren.

Na de eerste verbinding en na elke herverbinding van de command-stroom draait
de **herstelstap** (`onPocketBaseConnected`, één tegelijk): huis online zetten,
device-cache verversen, de stand van elk device met HA afstemmen en
openstaande commando's inhalen. Realtime-stromen abonneren pas als de box
ingelogd is, zodat er nooit een anoniem abonnement ontstaat.

---

## 8. Datastroom: device → PocketBase

**Pad A — Home Assistant**: websocket, `state_changed`-events, type-veilig
geparsed (`homeassistant/event.go`), naar `forwardHAEvent`.

**Pad B — Zigbee2MQTT**: `zigbee2mqtt/<naam>` (stand) en
`…/availability` (online/offline), naar `forwardZigbeeEvent`.

Waarom beide: HA is de instabielste schakel; zonder Pad B zou Zigbee-tracking
stilvallen als HA herstart. De prijs (soms dubbel schrijven, twee
naamconventies) is bewust geaccepteerd.

Beide doen daarna:
1. **Eerst, altijd**: lokaal naar SQLite (§10), vóór en los van PocketBase.
2. Alleen als de box bij een huis hoort: device opzoeken in de cache (alleen
   devices van het eigen huis; entity-ID's komen uit de naam en kunnen tussen
   huizen botsen), onbekende entity's negeren, `device_state` upserten en
   `online` bijwerken. Het HA-pad slaat een stand over die ouder is dan de
   laatst doorgestuurde (zie §3, `last_updated`).

---

## 9. Online/offline en de hartslag

- **Device**: `online = true` bij elk event; `false` alleen bij een expliciet
  signaal (HA `unavailable`, Zigbee `offline`). Een stil device blijft dus
  "online"; een timeout ontbreekt nog.
- **Box/huis**: elke 30 s zet de agent `houses.select = online`; PocketBase
  werkt daarbij `last_seen` bij. De app noemt de box onbereikbaar na 90 s
  stilte en blokkeert dan schakelen. Bij een nette stop gaat de status naar
  `offline`.

---

## 10. Lokale geschiedenis (SQLite)

`internal/history/store.go` (`modernc.org/sqlite`, pure Go): één tabel
`device_state_history` (`entity_id`, `state` als JSON, `recorded_at`). De write
gebeurt vóór alles wat met PocketBase te maken heeft en met de rauwe
`entity_id` als sleutel — dus ook zonder internet en ook voor entity's die geen
device in de app zijn. Elk uur worden rijen ouder dan `HISTORY_RETENTION_DAYS`
(standaard 30) opgeruimd.

---

## 11. Het commandopad: PocketBase → device

```
app maakt record  →  commands (pending)  →  agent (realtime SSE)  →  HA-service  →  device
                                                                                   │
                                                  state_changed-event ◄────────────┘ → Pad A
```

1. Een bewoner maakt een command aan: óf voor één device, óf `run_scene` voor
   één scène (nooit een mix). De regels dwingen af dat het zijn eigen huis is.
2. De agent hoort het realtime, of bij het inhalen na een (her)start.
3. Controles, in volgorde: is het device/de scène van **dit** huis (anders
   negeren — dat is een commando voor een andere box); is het **verlopen**
   (ouder dan 2 minuten, behalve `provision`; dan `failed` "verlopen")? Elk
   commando wordt maar één keer opgepakt, ook als realtime en inhalen hetzelfde
   zien.
4. Uitvoeren via HA's domein-agnostische `homeassistant.turn_on/turn_off/toggle`
   (of `climate.set_temperature`). Een `turn_on` met payload op een lamp
   (`brightness_pct`, `color_temp_kelvin`, `rgb_color`) gaat naar
   `light.turn_on`, na controle van de sleutels en waarden (`serviceCall` in
   `app/light.go`); een ongeldige payload geeft `failed` met een Nederlandse
   reden. Daarna wordt het commando `sent`, of `failed` met reden.
5. De nieuwe stand komt via Pad A terug: geen apart schrijfpad.

Waarom verlopen: bij een korte uitval kan de realtime-verbinding blijven
leven en een commando minuten te laat afleveren; een tik van lang geleden mag
geen lamp meer aanzetten.

---

## 12. Scènes, schema's en weer

- **Scènes**: `run_scene` voert alle stappen op de box uit; een mislukte stap
  houdt de rest niet tegen. Alleen apparaten van het eigen huis.
- **Schema's**: de agent klokt zelf. Elke minuut haalt hij schema's, scènes en
  devices van zijn huis op, bewaart dat als snapshot in `/data/schedules.json`
  en voert uit wat aan de beurt is — zonder PocketBase uit de laatste snapshot.
  Gemiste runs worden niet ingehaald. Tijden in `Europe/Amsterdam`. Zonder huis
  is de snapshot leeg, zodat een losgekoppelde box geen schema's van de vorige
  eigenaar draait.
- **Weer**: elk half uur uit HA (Met.no) naar `houses.weather`; alleen de box
  mag dat schrijven.

---

## 13. Resilience: reconnects en race conditions

Gevonden door verbindingen echt te verbreken, niet in theorie:
- **`UpsertDeviceState`** was check-then-act; een mutex serialiseert het.
- **HA-websocket**: reconnect-lus met backoff (1–30 s) in plaats van een tight
  loop die de container liet crashen.
- **MQTT**: abonnementen worden na elke reconnect opnieuw gezet (anders stil
  dataverlies).
- **PocketBase weg**: lokaal blijft alles draaien; herstelstap bij terugkeer
  (§7).
- **Schema-klok**: de timer gaat soms enkele ms vóór de minuutgrens af; de
  klok tikt daarom de bedoelde minuut, niet `time.Now()`.

---

## 14. Testen

- **Agent**: `cd agent && go vet ./... && go test ./...` (unit-tests per
  package; geen `-race` op Windows zonder gcc).
- **PocketBase-regels en hooks**: `cd backend/tests && go test -tags integration ./...`
  start een tijdelijke PocketBase 0.40.4 met de echte migraties en hooks en
  bewijst o.a. dat box A niets van huis B ziet of wijzigt, dat body-modifiers
  geen omweg zijn, dat gasten niets zien, de claim-flow (incl. gelijktijdige
  claims), de mails per taal, en het huishouden (rollen per huis,
  favorieten per persoon, uitnodigen, accepteren, laatste beheerder).
- **Scripts**: `python -m unittest discover -s scripts -p "test_*.py"`.
- **PWA**: `cd frontend && node --test lib/*.test.js && npx next build`.
- Eén set testvectoren voor de claimcode (`backend/tests/testdata/claim_codes.json`)
  houdt Python, de hook en de app gelijk.

---

## 15. Bekende gaten / nog te bouwen

- **Fase 3**: PocketBase en Headscale op Scaleway, HTTPS, een echte
  SMTP-provider en `APP_URL`, `trustedProxy` voor de rate limits, rate limits
  op aanmelden en mail opnieuw sturen, versleuteling van de PocketBase-
  instellingen (het SMTP-wachtwoord staat daar).
- **Geen echte Zigbee-hardware getest**; Zigbee-paden zijn gesimuleerd met
  `mosquitto_pub`.
- **Geen direct Zigbee2MQTT `…/set`-commandopad**: commando's gaan via HA.
- **Geen timeout-gebaseerde offline-detectie** voor devices (§9).
- **Een dode realtime-verbinding** valt pas na ~3 minuten TCP-keepalive op; een
  idle-timeout hoort bij fase 3.
- **Commando's verlopen op de klok van de box**; met een server op Scaleway
  beter de serverklok gebruiken.
- **Uit een huis gehaald worden** door een ander komt niet live binnen
  (realtime stuurt niets naar wie de regel niet meer haalt). De PWA haalt
  alles opnieuw op zodra de server iets op huisdata weigert (`pb.afterSend`)
  of als je na 30 s terugkomt in de app, en meldt dan "Je hebt geen toegang
  meer tot …". Tot die tijd zie je de laatst bekende stand.
- **Wachttijd na koppelen** tot ~5 minuten door de controle van de box; kan
  later via realtime op het eigen box-record.

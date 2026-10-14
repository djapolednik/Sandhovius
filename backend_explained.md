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
8. [Datastroom: device → PocketBase](#8-datastroom-device--pocketbase) en [koppelen](#8b-koppelen-een-echt-apparaat-toevoegen)
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
| `homeassistant` | `ghcr.io/home-assistant/home-assistant:stable` | State management en bediening; Zigbee-apparaten via MQTT-discovery van Zigbee2MQTT, Philips Hue via de lokale `hue`-integratie |
| `zigbee2mqtt` | `koenkk/zigbee2mqtt:latest` | Zigbee-radio ↔ MQTT (vereist een echte USB-coordinator; in dev afwezig, dan `scripts/fake-zigbee.py`) |
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
| `boxes` | auth | Eén per fysieke box | `serial` (login), wachtwoord = boxgeheim, `house`, `claim_code_hash` (verborgen), `agent_version` + `reported_at` (alleen via `box.pb.js`) |
| `houses` | base | Eén per huis | `members` en `admins` (meervoudige relaties naar `users`; beheerders zijn altijd ook lid, er is altijd minstens één), `name`, `select` (online/offline), `claimed_at`, `last_seen` (autodate = hartslag), `weather`, `weather_updated` |
| `rooms` | base | Kamers | `house`, `name`, `order` |
| `devices` | base | Apparaten; alleen de box maakt ze (bij koppelen) | `gateway` (= huis), `name`, `room`, `shown_as` (bewoner: `light` of leeg, alleen bij `type = switch`); box: `type` (`light`/`switch`/`sensor`/`climate`), `source` (`zigbee`/`hue`), `address` (IEEE-adres of HA-device-id, nooit de naam), `endpoint` (`l1`, `l2` … bij een meervoudig apparaat), `entity_id` (HA-hoofdentiteit; leeg bij een sensor), `capabilities` (JSON, vaste woordenlijst), `model`, `online`; bewoner ook: `adaptive` (kleur volgt de dag, alleen bij `color_temp`) |
| `pairing_sessions` | base | Een koppelsessie: de box zoekt | `house`, `kind` (`light`/`switch`/`sensor`/`climate`/`hue`), `status` (`starting`/`open`/`waiting_button`/`closed`/`failed`), `expires`, `error` (foutcode), `created_by`, `extend`, `button_pressed` |
| `pairing_candidates` | base | Wat de box in een sessie vond | `session`, `address`, `endpoint`, `type`, `capabilities`, `model`, `source`, `status` (`interviewing`/`found`/`unsupported`/`adding`/`added`/`failed`), `identify` (teller: laten knipperen), `name`, `room`, `add`, `device` |
| `favorites` | base | Favorieten op Home, per persoon | `user`, `device` (cascade), `order`; uniek op (user, device) |
| `invitations` | base | Uitnodigingen voor een huis | `house` (cascade), `email` (kleine letters), `role` (`admin`/`member`), `invited_by`, `house_name`, `inviter_name`, `expires` (+7 dagen), `created`; uniek op (house, email) |
| `device_state` | base | **Huidige** stand per device (één rij, overschreven) | `device`, `state` (JSON), `updated_at` |
| `commands` | base | Opdrachten van de app | `device` óf `scene`, `action`, `payload`, `status` (pending/sent/failed), `error`, `created`, `updated` |
| `scenes` | base | Scènes | `house`, `name`, `order`, `actions` (JSON) |
| `schedules` | base | Schema's voor scènes | `house`, `scene`, `trigger` (`time`/`sunrise`/`sunset`), `time` ("HH:MM", leeg bij zon), `offset_min` (−120 … 120, negatief = ervoor), `days`, `enabled`; box: `last_run`, `last_error`, `next_run` |
| `motion_lights` | base | Bewegingslicht: lampen aan bij beweging | `house`, `sensor`, `devices` (max 10), `only_dark`, `off_after` (1–60 min), `enabled`, `last_run`, `last_error` |
| `automations` | base | Routines: als dit, alleen als, doe dat | `house`, `name` (max 80, leeg = de app maakt een zin), `enabled`, `starter` (JSON, één), `conditions` (JSON, max 5), `actions` (JSON, 1–10), `off_after` (0/1/5/15/30/60 min); box: `last_run`, `last_error`, `next_run` |

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
  `devices` de identiteit, mogelijkheden en `online`, nooit `name`, `room` of
  `shown_as`; bij `commands` alleen `status` en `error`). Andersom mag een
  bewoner geen device aanmaken en geen box-veld zetten: "geen neplamp" geldt
  in de regels, niet alleen in de UI. Bij koppelen schrijft een lid alleen
  `status = closed`, `extend` en `button_pressed` op de sessie, en `identify`,
  `name`, `room` (uit hetzelfde huis) en `add` op een candidate. Een integratietest probeert elk ander veld, ook velden die later
  bijkomen.
- Realtime volgt dezelfde regels: een box krijgt alleen events van zijn eigen
  huis, een bewoner alleen van zijn eigen huizen.
- `boxes` is voor bewoners onzichtbaar; `claim_code_hash` is ook voor de box
  zelf verborgen. `claimed_at` kan alleen de server zetten.

### Hooks (`backend/pb_hooks/`)

**Foutantwoorden zijn codes, geen zinnen.** Elke fout die de app kan tonen
heeft de vorm van PocketBase plus `code` en `params`:
`{status, code, params, message, data}`, bv. `{status: 409, code:
"box_linked_elsewhere", params: {house: "Villa"}}`. De app maakt er de zin
van in de taal van de bewoner (`errors.codes.<code>` in
`frontend/messages/*.json`); `message` is een korte Engelse diagnose en komt
nooit op het scherm. Niet in `data`: daar zet PocketBase veldfouten per
veldnaam. Een nieuwe fout = een code hier, een tekst in beide
berichtenbestanden. Om dezelfde reden zijn `commands.error` en
`schedules.last_error` (van de agent) diagnose voor de ontwikkelaar: de app
toont ze nooit, alleen óf er een fout is. Spec:
`docs/superpowers/specs/2026-10-13-app-language-design.md`.

- **`claim.pb.js`** — `POST /api/sandhovius/claim` en `/release`, alleen voor
  ingelogde bewoners met een bevestigd e-mailadres. Volgorde: bevestigd →
  code (HMAC-SHA256 van de genormaliseerde code met `CLAIM_CODE_KEY` uit env,
  constante-tijd vergelijking; zonder sleutel 503, nooit een kale hash) →
  beheerder van `replace_house` → al gekoppeld (lid van dat huis: 200). Alles in één transactie, zodat
  bij twee gelijktijdige claims precies één wint. Onbekend serienummer en foute
  code geven exact dezelfde 400. Details: `docs/box-aanmelden.md`.
- **`box.pb.js`** — `POST /api/sandhovius/box/report`, alleen voor boxen: zet
  `agent_version` (alleen `[0-9A-Za-z._+-]`, max 64) en `reported_at` op het
  eigen record. Een box mag zijn record niet zelf bijwerken (dan kon hij zijn
  huis zetten); deze route raakt alleen die twee velden. De agent meldt zich
  bij elke (her)verbinding van de box-stroom, ook zonder huis, dus
  `reported_at` = laatste keer dat de box verbond. Te zien in het
  PocketBase-dashboard (bewoners zien boxen niet).
- **`mail.pb.js` + `mail_texts.js`** — zet bij het starten de app-naam
  ("Sandhovius") en, als `SMTP_HOST` gezet is, SMTP, afzender en `appURL` uit
  env. Bevestigings-, reset- en inlogmeldingsmails gaan in de taal van het
  account (`users.language`, standaard Nederlands); links wijzen naar de PWA
  (`/bevestig`, `/wachtwoord`). Ook de uitnodigingsmail (taal van de
  uitnodiger, naam en huisnaam geëscaped, link `/uitnodiging`).
- **`household.pb.js`** — lidmaatschap, elk in één transactie, voor ingelogde
  bewoners. Wie geen lid of beheerder is krijgt 404.
  - Bij een nieuwe uitnodiging (alleen als de aanvrager beheerder is): e-mail
    in kleine letters, al lid → 400 `already_member` (een `e.json` zonder
    `e.next()`: een `BadRequestError` kan geen code meegeven), oude uitnodiging
    voor hetzelfde adres vervangen, `expires`, `house_name`, `inviter_name`;
    daarna de mail (mislukt die, dan blijft de uitnodiging en gaat de fout naar
    het log).
  - `GET /api/sandhovius/houses/{id}/members` — leden met naam, e-mail en rol.
  - `POST /api/sandhovius/invitations/{id}/accept` — ander adres 404
    `invitation_not_found`, onbevestigd 403 `email_not_verified`, verlopen 410
    `invitation_expired`; daarna lid (en beheerder bij rol admin).
  - `PATCH` / `DELETE /api/sandhovius/houses/{id}/members/{user}` — rol
    wijzigen (beheerder) en verwijderen (beheerder) of verlaten (jezelf);
    de laatste beheerder → 409 `last_admin` (account verwijderen als enige
    beheerder: 409 `last_admin_of_house` met `params.house`). Verlaten ruimt je
    favorieten in dat huis op.

- **`devices.pb.js` + `device_rules.js`** — `capabilities` alleen woorden uit
  de woordenlijst (`invalid_capabilities`), `shown_as` alleen bij een stekker
  (`invalid_shown_as`). De regels kunnen niet in JSON kijken; daarom een hook.
- **`automations.pb.js` + `automation_rules.js`** — de gesloten lijst van
  routines: soorten starter, voorwaarde en actie, apparaten en scènes uit het
  eigen huis, een sensor die de gebeurtenis kan meten (`contact` voor open),
  alleen lampen en stopcontacten schakelen, grenzen (temperatuur 0–40°, max
  10 acties, 5 voorwaarden). Fout: 400 `invalid_automation` met `params.part`
  (`starter`/`conditions`/`actions`/`off_after`). De box en de superuser
  slaan de controle over; de agent controleert zelf ook.
- **`pairing.pb.js`** — zet `created_by` op de bewoner en weigert een tweede
  open sessie in hetzelfde huis (400 `session_open`): twee telefoons die
  tegelijk zoeken zouden elkaars vondsten zien of weghalen. De app neemt een
  eigen open sessie van daarnet over (zelfde soort) of sluit hem.

### Rate limits

Aan sinds de box-identiteit, per IP: PocketBase-standaarden (`*:auth` 2 per
3 s, `*:create` 20 per 5 s, `/api/` 300 per 10 s) plus `boxes:auth` 10 per
minuut, `commands:create`/`device_state:create` 100 per 5 s (anders breekt
"Alles uit" bij veel apparaten) en `/api/sandhovius/claim` en `/release` elk
10 per minuut, `invitations:create` 20 per uur per ingelogde gebruiker, en
alles wat mail stuurt of een account maakt: `users:create` 10 per uur,
`users:requestVerification` en `users:requestPasswordReset` elk 5 per 10
minuten (migratie `1790820000_mail_rate_limits.js`). De app zegt bij een 429
"wacht even", geen vaste tijd.
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
    ├── homeassistant/    — websocket (events), REST (services, state), registry (entiteit bij een Zigbee-adres), config-flows, weer
    ├── pocketbase/       — REST-client, inloggen als box, realtime (SSE), per collectie een bestand
    ├── history/          — lokale SQLite-geschiedenis
    └── app/              — de orkestratie
        ├── agent.go          start/stop, HA- en MQTT-events, commando's, hartslag
        ├── connection.go     verbindingslus met backoff + herstelstap
        ├── house.go          huis uit het box-record: realtime + controle elke 5 minuten
        ├── device_cache.go   entity_id/adres → device-id, alleen van het eigen huis
        ├── pairing.go + pairing_runner.go   de koppelmotor (puur) en de I/O eromheen (§8b)
        ├── classify.go       Zigbee2MQTT-exposes → type, endpoints, mogelijkheden
        ├── bridge_directory.go + device_store.go   naam → adres; zelf toegevoegde adressen op schijf
        ├── hue.go            Philips Hue via de HA-config-flow
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
- Hij volgt zijn eigen record via realtime (`listenForHouseChanges`,
  abonnement op `boxes`; de view-regel laat alleen zijn eigen record door) en
  leest het bij elke (her)aanmelding één keer (`checkHouse`). Als vangnet elke
  5 minuten (`houseCheckInterval`) `auth-refresh`. `applyHouse` draait onder
  een mutex: stroom, poll en opstarten kunnen tegelijk melden. Een verandering:
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
`…/availability` (online/offline), naar `forwardZigbeeEvent`. De naam wordt
eerst een IEEE-adres (uit het retained `zigbee2mqtt/bridge/devices`); de app
kent alleen het adres, want een naam verandert bij hernoemen of opnieuw
koppelen. Pad B schrijft alleen de stand van delen zonder HA-entiteit
(sensoren); een lamp of stekker krijgt zijn stand van HA, per endpoint.

Waarom beide: HA is de instabielste schakel; zonder Pad B zou Zigbee-tracking
stilvallen als HA herstart. De prijs (soms dubbel schrijven, twee
naamconventies) is bewust geaccepteerd.

Beide doen daarna:
1. **Eerst, altijd**: lokaal naar SQLite (§10), vóór en los van PocketBase.
2. De bewegingslichten krijgen de stand (§12), ook zonder PocketBase.
3. Alleen als de box bij een huis hoort: device opzoeken in de cache (alleen
   devices van het eigen huis; entity-ID's komen uit de naam en kunnen tussen
   huizen botsen; realtime create/update/delete van devices houden hem bij,
   zodat een opnieuw gekoppelde sensor met dezelfde naam niet naar het
   verwijderde device wijst), onbekende entity's negeren, `device_state` upserten en
   `online` bijwerken. Het HA-pad slaat een stand over die ouder is dan de
   laatst doorgestuurde (zie §3, `last_updated`).

## 8b. Koppelen: een echt apparaat toevoegen

Spec: `docs/superpowers/specs/2026-10-14-device-pairing-design.md`. De app
opent een `pairing_sessions`-record; de box volgt sessies en candidates van
zijn huis via realtime (één SSE-verbinding, twee topics).

1. **Zigbee:** sessie `starting` → `bridge/request/permit_join {"time": 240}`
   → `open` met `expires` (4 minuten, "Langer zoeken" zet een nieuwe).
   `device_joined` van een adres dat er vóór de sessie niet was → candidate
   `interviewing`; `device_interview` geslaagd → `classify(exposes)` → per
   endpoint een candidate `found`. Geen definitie → `unsupported`; een ander
   type dan de sessie → meteen `device/remove`, geen candidate.
   Verwarming volgens model A: een `climate`-deel alleen voor een geteste
   radiatorknop (`supportedClimate`, nu de Sonoff TRVZB, met het woord
   `valve`); een wandthermostaat is `unsupported`, want de eigen thermostaat
   blijft de ketel aansturen.
2. **Kiezen:** `identify` omhoog → `effect: blink` (of `identify` als het
   apparaat dat kent; een stekker niet). `add` → de box zoekt de HA-entiteit
   van adres + endpoint (registry, identifier `zigbee2mqtt_<ieee>`), maakt het
   device, zet de candidate op `added` en haalt meteen de stand op.
3. **Dicht** (verlopen, de app sluit, of de box herstart midden in een
   sessie): `permit_join {"time": 0}` en elk adres uit deze sessie zonder
   toegevoegd deel van het netwerk. Regel: **wat op het netwerk zit, staat in
   de app.**
4. **Hue:** de box zoekt een ontdekte `hue`-flow in HA (of start er een met
   `HUE_BRIDGE_HOST`) → `waiting_button` → de bewoner drukt op de bridge en
   tikt "Ik heb gedrukt" → de box rondt de link-stap af → elke lamp van de
   bridge die nog niet in de app staat wordt een candidate. Hue-lampen haalt
   de box nooit ergens weg.

**Wat de box nooit weghaalt:** een adres dat hij niet kent. Hij haalt alleen
weg wat in deze sessie binnenkwam, of wat hij zelf toevoegde en waarvan het
laatste device-record werd verwijderd (`/data/devices.json`). Zo kan een halve
lijst uit PocketBase (een storing) nooit het netwerk leeghalen. Een dubbele
stekker gaat pas van het netwerk als beide delen weg zijn.

**De oude virtuele helpers** (`input_boolean`/`input_number`) zijn weg: een
migratie verwijderde alle dev-devices (harde overgang) en de agent haalt bij
de eerste start de helpers eenmalig uit HA (vlag in `/data`).

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
   (ouder dan 2 minuten; dan `failed` "verlopen")? Elk
   commando wordt maar één keer opgepakt, ook als realtime en inhalen hetzelfde
   zien.
4. `identify` (Laat knipperen in de detail-sheet) gaat via Zigbee2MQTT of,
   bij Hue, `light.turn_on` met `flash: short`. De rest gaat via HA's domein-agnostische `homeassistant.turn_on/turn_off/toggle`
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
- **Zon in schema's** (`sun.go`, `home_location.go`; spec
  `2026-10-14-sun-schedules-design.md`): de agent rekent zonsopkomst en
  -ondergang zelf uit (NOAA, op ongeveer een minuut), met de thuislocatie uit
  HA (`/api/config`, eens per uur, in de snapshot op schijf). Niet via
  `sun.sun`: die kent alleen de *volgende* ondergang, dus "1 uur na
  zonsondergang" zou wegvallen. Een zon-schema loopt op de berekende minuut
  plus `offset_min`, ook als dat na middernacht valt (het hoort bij de dag van
  de zon). De klok schrijft `next_run` als die verandert, of `last_error =
  no_location` zonder locatie. `schedule_rules.js` bewaakt dat tijd en trigger
  passen (`invalid_schedule_time`).
- **Kleur volgt de dag** (`adaptive.go`, `adaptive_agent.go`; spec
  `2026-10-14-adaptive-light-design.md`): voor lampen met `devices.adaptive`
  rekent de agent elke minuut de wittint uit (2200 K 's nachts, 2700 K rond
  zonsopkomst en -ondergang, 4000 K midden op de dag, met `sunTimes` en de
  thuislocatie) en stuurt bij 50 K verschil `light.turn_on` met alleen
  `color_temp_kelvin`. Een lamp die aangaat krijgt meteen de juiste wittint;
  een lamp die uit staat nooit (turn_on zou hem aanzetten). Kiest iemand zelf
  een wittint of kleur (een commando of scène met `color_temp_kelvin` of
  `rgb_color`, via `callHA`; of een afstandsbediening: een andere kleurmodus of
  meer dan 150 K afwijking na een minuut), dan pauzeert het tot de lamp uit
  gaat. Het pauzeren staat alleen in het geheugen.
- **Bewegingslicht** (`motion.go`, `motion_runner.go`, `motion_agent.go`; spec
  `2026-10-13-motion-light-design.md`): de regels reizen mee in hetzelfde
  snapshot. Elke stand van Zigbee2MQTT en HA gaat direct na de lokale
  geschiedenis (§8) naar de motor, vóór alles met PocketBase: een gang werkt
  dus zonder internet. Beweging = `occupancy`/`motion` (Zigbee) of `on` (HA);
  donker = `sun.sun` onder de horizon, onbekend telt als donker. Een regel doet
  alleen uit wat hij zelf aanzette (een lamp die al aan stond blijft van de
  bewoner; een lamp die tussendoor uit gaat is van niemand meer); twee regels
  delen een lamp tot beide loslaten. Uit `off_after` minuten na het eerste
  "geen beweging" (een herhaald "geen beweging" bij een batterij-update zet de
  klok niet opnieuw); een klok van 15 s. Wie welke lamp bezit tot wanneer staat
  in `/data/motion.json` (`MOTION_FILE`), zodat een lamp na een herstart op
  tijd uitgaat. Schakelen gaat met de controles van een scène-stap;
  `last_run`/`last_error` best effort naar PocketBase. Een wijziging in de app
  geldt binnen een minuut (het snapshot).
- **Routines** (`routine.go`, `routine_runner.go`; spec
  `2026-10-14-routines-design.md`): de `automations` reizen mee in hetzelfde
  snapshot. Een starter is een **overgang**: lamp uit → aan, geen beweging →
  beweging, dicht → open (`contact` true = dicht), lek en rook alleen bij het
  begin, een temperatuur die een grens passeert; een herhaalde melding van
  dezelfde stand start niets. Tijd en zon via de minuuttik (dezelfde zon als
  de schema's, `next_run` en `no_location` ook). Voorwaarden: donker (tussen
  zonsondergang en -opkomst met `sunTimes`; zonder locatie telt het als
  donker, zoals bij bewegingslicht), tussen twee tijden (ook over middernacht), dagen.
  Acties op volgorde via de scène-stap en `executeScene`; mislukte stappen
  houden de rest niet tegen en staan samen in `last_error`. Daarna uit zoals
  bij bewegingslicht: alleen wat de routine zelf aanzette, eigendom en
  uit-tijden in `/data/automations.json`. Lussen: een verandering die een
  routine zelf veroorzaakte start 10 s lang geen andere routine, en elke
  routine loopt hooguit één keer per minuut. **Nu uitproberen** in de app
  stuurt de acties als gewone commando's (`turn_on`/`turn_off`, `run_scene`);
  daar is geen agentcode voor.
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
- **PWA**: `cd frontend && npm run lint && node --test lib/*.test.js && npx next build`.
- Eén set testvectoren voor de claimcode (`backend/tests/testdata/claim_codes.json`)
  houdt Python, de hook en de app gelijk; `claim_check.json` doet hetzelfde
  voor het controleteken (Python en de app; de hook vergelijkt alleen de hash,
  dus codes zonder controleteken blijven op de server werken).

---

## 15. Bekende gaten / nog te bouwen

- **Fase 3**: PocketBase en Headscale op Scaleway, HTTPS, een echte
  SMTP-provider en `APP_URL`, `trustedProxy` voor de rate limits, rate limits
  op aanmelden en mail opnieuw sturen, versleuteling van de PocketBase-
  instellingen (het SMTP-wachtwoord staat daar).
- **Geen echte Zigbee-hardware getest**; koppelen en de Zigbee-paden zijn
  gesimuleerd met `scripts/fake-zigbee.py` en `mosquitto_pub`. Welke
  Zigbee-thermostaten we ondersteunen staat nog open (`climate`-exposes
  verschillen per merk).
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

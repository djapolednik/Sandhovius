# Codebase: architectuur, stack en bestandskaart

Waar zit wat, en met welke techniek. Hoe de backend en de agent werken (met
het waarom): `backend_explained.md`. Hoe je lokaal draait en test:
`docs/development.md`.

## Architectuur

```
┌─ Hardware Layer
│ └─ Intel N100 Mini PC (Debian/Ubuntu LTS + OverlayFS)
│
├─ Local Gateway Stack (Docker Compose)
│ ├─ Home Assistant Core (state management)
│ ├─ Mosquitto MQTT Broker
│ ├─ Zigbee2MQTT (USB coordinator)
│ └─ Go Local Agent (daemon)
│
├─ Backend (nu lokaal in Docker; later Scaleway VPS)
│ ├─ PocketBase (Go-based, users + relay)
│ └─ Headscale (Tailscale control server, Zero Trust ACLs)
│
└─ Client Layer
  ├─ Next.js PWA (mobile-first)
  └─ Webshop (Shopify/WooCommerce, out-of-scope)
```

**Go Local Agent Flow:**
- MQTT → Zigbee events en state changes in real-time
- WebSocket → Home Assistant state sync en command relay
- Relay Mesh → Persistent stream naar PocketBase backend (bi-directional)
- Watchdog → Network resilience, exponential backoff, state reconciliation

## Tech Stack

- **Go** — local agent (Dockerfile build)
- **Home Assistant Core** — state management; devices uit de UI worden HA-helpers (`input_boolean` / `input_number`)
- **Mosquitto** + **Zigbee2MQTT** — Zigbee ↔ MQTT ↔ agent
- **PocketBase 0.40.4** (image vastgepind op `ghcr.io/muchobien/pocketbase:0.40.4`, gelijk aan `pbVersion` in `backend/tests`; upgraden = beide tegelijk en de integratietests draaien, de veldregels leunen op hoe PocketBase body-modifiers normaliseert) — users, houses, rooms, devices, device_state, commands, scenes, schedules, boxes; realtime naar de PWA. Rate limits aan: standaardregels plus `boxes:auth` (10/min, gast) en `commands:create`/`device_state:create` (100 per 5 s, ingelogd) voor "Alles uit" en de eerste start van een box
- **Next.js 16** (Turbopack, JS, geen TypeScript) — PWA; lees `frontend/node_modules/next/dist/docs/` bij twijfel, API's wijken af
- **Mailpit** (dev) — vangt alle mail op; later een echte SMTP-provider
- **Headscale** — later (remote toegang, zero external ports)

## Bestandskaart

**Stack**
- `docker-compose.yml` — hele lokale stack: homeassistant, mosquitto, zigbee2mqtt, agent, pocketbase, mailpit, frontend (containers heten `sandhovius-*`)

**Agent (`agent/`)**
- `agent/main/main.go` — entry point van de Go agent
- `agent/internal/app/agent.go` — kern: huis uit de box-identiteit (`house.go`: huis uit `box.json`, volgt koppelen/loskoppelen), heartbeat (30 s op `houses.last_seen`), HA-events → PocketBase, commands → HA, provisioning van nieuwe devices, state-reconciliatie bij start/reconnect
- `agent/internal/app/connection.go` (verbindingslus met backoff + herstelstap `onPocketBaseConnected`), `scheduler.go` + `schedule_store.go` (schema-klok, snapshot in `/data/schedules.json`), `commands.go` (verlopen en claimen van commando's), `weather.go` (weer uit HA/Met.no elke 30 min op `houses.weather`; voegt Met.no zelf toe als het ontbreekt)
- `agent/internal/homeassistant/` — HA websocket (events), REST (`CallService`, `GetState`), registry (helpers aanmaken)
- `agent/internal/app/light.go` — `serviceCall`: `turn_on` met payload op een lamp → gecontroleerde `light.turn_on` (helderheid, kleurtemperatuur, RGB; Nederlandse foutteksten); `agent/internal/app/mqtt.go` — `ensureMQTT`, zet de MQTT-integratie van HA één keer per start op
- `agent/internal/homeassistant/integrations.go` — `HasIntegration`, `AddMQTT` (config-flow, afgebroken bij een fout)
- `agent/internal/box/` (leest/schrijft `/data/box.json`: serial, secret, house), `agent/internal/pocketbase/` (incl. `auth.go`: inloggen als box), `agent/internal/mqtt/`, `agent/internal/history/` (lokale SQLite-geschiedenis), `agent/internal/config/`

**Backend (`backend/`)**
- `backend/pb_migrations/` — PocketBase-schema (snapshot + incrementele migraties, draaien bij start van de container)
- `backend/pb_hooks/` — `claim.pb.js` (`POST /api/sandhovius/claim` en `/release`), `box.pb.js` (`POST /api/sandhovius/box/report`: agentversie), `household.pb.js` (uitnodigingen, leden, rol, verwijderen/verlaten), `mail.pb.js` + `mail_texts.js` (SMTP uit env, accountmails per `users.language` nl/en); migratie `1790750000_claim_code.js` (verborgen `boxes.claim_code_hash`, rate limits)
- `backend/tests/` — eigen Go-module met integratietests op de PocketBase-regels en hooks (start PocketBase 0.40.4 op een tijdelijke `pb_data`); `testdata/claim_codes.json` en `claim_check.json` = gedeelde testvectoren voor de claimcode en het controleteken

**Frontend (`frontend/`)**
- `frontend/app/page.js` — de hele PWA-state: login, realtime-subscriptions, tabs (Home/Kamers/Scènes/Opties; hash `#instellingen` voor Opties), commands
- `frontend/components/` — `DeviceCard` (kleine liggende tegel; long-press/rechtsklik = details), `ClimateCard` (compacte thermostaat), `HomeScenes`, `Weather` (weerkaart, breed), `PullToRefresh`, `BottomNav`, `Header` (titel, regel onder de groet, één actie), `HomeNotices` (storingen en Let op bovenaan Home), `SettingsView`, `DeviceSettingsModal` (detail-sheet), `LightControls` (helderheid, wit/kleur, stalen in de detail-sheet), `RoomsPanel` (kamerlijst met schakelaars op brede schermen, `RoomSwitch`), `HouseholdSection` + `InviteSheet` + `MemberSheet` + `RoleChoice` (Opties → Huisgenoten), `InvitationCard`
- Claim-UI: `SignupForm`, `VerifyNotice`, `ClaimSheet` (jsQR-camera + code intikken), `QrScanner`, `LanguageChoice`, `AccountShell`; routes `/bevestig`, `/wachtwoord`, `/koppel` (deep link uit de QR), `/uitnodiging` (link uit de uitnodigingsmail)
- `frontend/lib/` — pure helpers met `node --test`-tests (`claim.js`, `account.js`, `schedules.js`, `weather.js`, `light.js` (capabilities, gloed, payloads, throttle), `sceneChoices.js` ("Zoals nu" in scènes), `favorites.js` (favorieten per persoon), `household.js` (rollen, verlooptekst, huiskeuze, foutteksten), …)
- `frontend/app/styles/` — `theme.css` (tokens licht/donker), `devices.css`, `rooms.css`, `components.css`, `base.css`, `login.css`

**Scripts (`scripts/`)**
- `scripts/provision-box.py` — maakt een `boxes`-record + `box.json` (`--serial`, `--house`, `--out`) én een claimcode met printbaar SVG-blad in `sheets/` (`--app-url` of env `APP_URL`; `--reissue SERIAL` = nieuwe code voor een box zonder huis); superuser uit `.env`, print nooit geheim of code. `scripts/claimcode.py` (code genereren/normaliseren/hashen, QR via segno), `scripts/requirements.txt`
- `scripts/fake-lights.py` (+ `fakelights.py`, tests in `test_fakelights.py`) — drie gesimuleerde Zigbee-lampen over MQTT-discovery voor dev/test; vereist `paho-mqtt` (`scripts/requirements.txt`)
- `scripts/screenshot.py` — ingelogde screenshots (Firefox + Marionette), zie `docs/development.md`

**Documentatie**
- `PRODUCT.md` (doelgroep, principes), `DESIGN.md` + `.impeccable/design.json` (design system)
- `backend_explained.md` — stack, schema, regels, hooks en agent, met het waarom
- `docs/box-aanmelden.md` — de flow van een nieuwe box
- `docs/status.md` — wat er gebouwd is en wat er nog komt
- `docs/superpowers/specs/` (ontwerpen) en `docs/superpowers/plans/` (historische implementatieplannen)

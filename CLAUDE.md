# Sandhovius Project Context

## Project Overzicht
Sandhovius is een plug-and-play, gedistribueerd smart-home platform voor niet-technische eindgebruikers.
Het combineert 100% lokale betrouwbaarheid (offline automatisering) met naadloos cloud-gemak (remote besturing via PWA).

**Kernpropositie:**
- Lokale Zigbee/MQTT automatisering draait altijd, ook zonder internet
- Remote besturing via Progressive Web App met geëncrypteerde mesh-tunnel
- Privacy: sensordata stays local, nooit in cloud
- Zero-setup: Intel N100 Mini PC met pre-configured Linux + Home Assistant + Go agent

## Architectuur
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


**Go Local Agent Flow:**
- MQTT → Zigbee events en state changes in real-time
- WebSocket → Home Assistant state sync en command relay
- Relay Mesh → Persistent stream naar PocketBase backend (bi-directional)
- Watchdog → Network resilience, exponential backoff, state reconciliation

## Belangrijke Bestanden
- `docker-compose.yml` — hele lokale stack: homeassistant, mosquitto, zigbee2mqtt, agent, pocketbase, frontend (containers heten `sandhovius-*`)
- `agent/main/main.go` — entry point van de Go agent
- `agent/internal/app/agent.go` — kern: huis uit de box-identiteit (`house.go`: huis uit `box.json`, volgt koppelen/loskoppelen), heartbeat (30 s op `houses.last_seen`), HA-events → PocketBase, commands → HA, provisioning van nieuwe devices, state-reconciliatie bij start/reconnect
- `agent/internal/app/connection.go` (verbindingslus met backoff + herstelstap `onPocketBaseConnected`), `scheduler.go` + `schedule_store.go` (schema-klok, snapshot in `/data/schedules.json`), `commands.go` (verlopen en claimen van commando's)
- `agent/internal/homeassistant/` — HA websocket (events), REST (`CallService`, `GetState`), registry (helpers aanmaken)
- `agent/internal/box/` (leest/schrijft `/data/box.json`: serial, secret, house), `agent/internal/pocketbase/` (incl. `auth.go`: inloggen als box), `agent/internal/mqtt/`, `agent/internal/history/` (lokale SQLite-geschiedenis), `agent/internal/config/`
- `backend/pb_migrations/` — PocketBase-schema (snapshot + incrementele migraties, draaien bij start van de container)
- `frontend/app/page.js` — de hele PWA-state: login, realtime-subscriptions, tabs (Home/Kamers/Scènes/Opties; hash `#instellingen` voor Opties), commands
- `frontend/components/` — `DeviceCard` (kleine liggende tegel; long-press/rechtsklik = details), `ClimateCard` (compacte thermostaat), `HomeScenes`, `Weather` (regel + kaart), `PullToRefresh`, `BottomNav`, `HousePanel`, `SettingsView`, `DeviceSettingsModal` (detail-sheet)
- `agent/internal/app/weather.go` — weer uit HA (Met.no) elke 30 min op `houses.weather`
- `scripts/provision-box.py` — maakt een `boxes`-record + `box.json` (`--serial`, `--house`, `--out`) én een claimcode met printbaar SVG-blad in `sheets/` (`--app-url` of env `APP_URL`; `--reissue SERIAL` = nieuwe code voor een box zonder huis); superuser uit `.env`, print nooit geheim of code. `scripts/claimcode.py` (code genereren/normaliseren/hashen, QR via segno), `scripts/requirements.txt`
- `backend/pb_hooks/` — `claim.pb.js` (`POST /api/sandhovius/claim` en `/release`), `mail.pb.js` + `mail_texts.js` (SMTP uit env, accountmails per `users.language` nl/en); migratie `1790750000_claim_code.js` (verborgen `boxes.claim_code_hash`, rate limits)
- Claim-UI in `frontend/`: `SignupForm`, `VerifyNotice`, `ClaimSheet` (jsQR-camera + code intikken), `QrScanner`, `LanguageChoice`, `AccountShell`; routes `/bevestig`, `/wachtwoord`, `/koppel` (deep link uit de QR)
- `backend/tests/` — eigen Go-module met integratietests op de PocketBase-regels (start PocketBase 0.40 op een tijdelijke `pb_data`)
- `scripts/screenshot.py` — ingelogde screenshots (Firefox + Marionette), zie Development Setup
- `frontend/app/styles/` — `theme.css` (tokens licht/donker), `devices.css`, `rooms.css`, `components.css`, `base.css`, `login.css`
- `docs/box-aanmelden.md` — de flow van een nieuwe box: klaarmaken (`provision-box.py`), koppelen in de app, ontkoppelen, nieuwe code; `backend_explained.md` — uitleg van stack, schema, regels, hooks en agent
- `PRODUCT.md` (doelgroep, principes) en `DESIGN.md` + `.impeccable/design.json` (design system) — lees DESIGN.md vóór UI-werk

## Tech Stack
- **Go** — local agent (Dockerfile build)
- **Home Assistant Core** — state management; devices uit de UI worden HA-helpers (`input_boolean` / `input_number`)
- **Mosquitto** + **Zigbee2MQTT** — Zigbee ↔ MQTT ↔ agent
- **PocketBase 0.40.4** (image vastgepind op `ghcr.io/muchobien/pocketbase:0.40.4`, gelijk aan `pbVersion` in `backend/tests`; upgraden = beide tegelijk en de integratietests draaien, de veldregels leunen op hoe PocketBase body-modifiers normaliseert) — users, houses, rooms, devices, device_state, commands; realtime naar de PWA. Rate limits aan: standaardregels plus `boxes:auth` (10/min, gast) en `commands:create`/`device_state:create` (100 per 5 s, ingelogd) voor "Alles uit" en de eerste start van een box
- **Next.js 16** (Turbopack, JS, geen TypeScript) — PWA; lees `frontend/node_modules/next/dist/docs/` bij twijfel, API's wijken af
- **Headscale** — later (remote toegang, zero external ports)

## Development Setup

```bash
docker compose up -d                              # hele stack
docker compose up -d --build agent frontend       # na codewijzigingen (beide draaien als gebouwde image, geen hot reload)
docker compose logs -f agent

# Lokaal checken zonder container
cd agent && go vet ./... && go build ./...
cd frontend && npx next build                     # moet slagen vóór commit

# Tests
cd agent && go vet ./... && go test ./...
cd frontend && node --test lib/*.test.js
cd backend/tests && go test -tags integration ./...   # regels per huis/box
pip install -r scripts/requirements.txt                # segno, voor claimcode/sheet
python -m unittest discover -s scripts -p "test_*.py"  # Python-tests

# Dev-box (identiteit) aanmaken en in de agent zetten
scripts/provision-box.py --serial SH-DEV-0001 --house <huis-id> --out box.json --app-url http://localhost:3000   # ook claimcode + sheets/<serial>.svg
scripts/provision-box.py --reissue SH-DEV-0001 --app-url http://localhost:3000       # nieuwe code voor een box zonder huis
docker cp box.json sandhovius-agent:/data/box.json   # in Git Bash: MSYS_NO_PATHCONV=1 ervoor; daarna box.json wissen
docker compose restart agent
```

- Windows + Git Bash: `gofmt -l` noemt elk bestand (CRLF in de werkmap; git normaliseert bij commit, dus negeren). Geen gcc → geen `go test -race`. Docker Desktop staat in `%LOCALAPPDATA%\Programs\DockerDesktop`. Bij `docker exec … /pad` in Git Bash `MSYS_NO_PATHCONV=1` ervoor, anders wordt het pad een Windows-pad.
- PocketBase geeft datums als `2006-01-02 15:04:05.000Z` (spatie, geen `T`): `time.RFC3339` parse faalt daarop. Migratie-historie opschonen na weggegooide migratiebestanden: `docker exec sandhovius-pocketbase /usr/local/bin/pocketbase migrate history-sync --dir=/pb_data --migrationsDir=/pb_migrations`.
- `scripts/seed.py` (testaccount + huis vullen) staat bewust alleen lokaal (`.git/info/exclude`); het maakt zelf het huis (superuser, gekoppeld aan de testgebruiker) en een box-identiteit via `provision-box.py --house` + `docker cp`.
- Claim-flow lokaal: mails (bevestigen, wachtwoord) komen in Mailpit, http://localhost:8025 (SMTP uit env in `docker-compose.yml`, `SMTP_HOST=mailpit`, `APP_URL`). Nieuwe of gewijzigde bestanden in `backend/pb_hooks/` worden op Windows niet altijd opgepikt door de hooks-watcher: `docker compose restart pocketbase`. De camera (QR scannen) werkt alleen op HTTPS of `localhost`; elders typt de bewoner de code in. Rate limit op claim/release is per IP, niet per gebruiker.
- Home Assistant: http://localhost:8123 · MQTT: localhost:1883 · PocketBase: http://localhost:8090/_/ (superuser in `.env`, `POCKETBASE_ADMIN_*`: alleen voor PocketBase zelf en de scripts, de agent gebruikt ze niet meer) · PWA: http://localhost:3000
- Visueel testen: Chrome en Edge ontbreken; de Playwright-plugin werkt niet. `SANDHOVIUS_EMAIL=… SANDHOVIUS_PASSWORD=… scripts/screenshot.py /tmp/home 1440x900 1366x768:dark 390x844` (het lokale testaccount, niet in git) logt in (token in localStorage) en maakt screenshots via Firefox headless + Marionette; het zegt ook of de pagina scrolt (Home hoort op een laptop te passen). Opties: `HASH='#kamers'`, `HOMEVIEW=on`. Firefox kan niet smaller dan ~500px. `screenshot.py` start `firefox` uit PATH; hier staat Firefox Developer Edition op `C:/Program Files/Firefox Developer Edition/firefox.exe`, dus geef dat mee met `FIREFOX='C:/Program Files/Firefox Developer Edition/firefox.exe'` (of zet die map in PATH). Marionette kan ook klikken, lang indrukken (`WebDriver:PerformActions`) en met pref `dom.w3c_touch_events.enabled` touch-events sturen.

## Huidige Status (2026-10-06, claim-flow af)
**Fase 1** ✅ — lokale stack, agent ↔ MQTT/HA.

**Fase 2** grotendeels ✅:
- PocketBase-schema + JWT-login in de PWA
- Command-pipeline: PWA → `commands` → agent → HA (toggle, set_temperature), status/fout terug
- Realtime: device_state, devices en houses live in de PWA
- Liveness: heartbeat elke 30 s; PWA toont "box reageert niet" na 90 s stilte en blokkeert dan schakelen
- State-reconciliatie: agent haalt bij start, na HA-reconnect en na provisioning de actuele stand op (fix voor nieuwe devices die "offline" bleven)
- PWA-redesign "The Lit Room at Night": onder-navigatie Home/Kamers/+/Scènes/Opties (rond "+" in het midden om een apparaat toe te voegen), favorieten (`devices.favorite`), thermostaat-dial, lamp/stopcontact-tegels die oplichten (warm/stroomblauw), licht + donker thema
- **Scènes**: collectie `scenes` (huis, naam, volgorde, `actions` als JSON in command-woorden); uitvoeren op de box via één command `{ scene, action: "run_scene" }` → agent `runScene` (alleen scènes en apparaten van het eigen huis). Command-regel: óf een device-commando óf een scène-commando, nooit een mix. Scènes-tab met tegels (tik = uitvoeren) en een scène-sheet
- **Schema's**: collectie `schedules` (scène, `time` "HH:MM", `days`, `enabled`, `last_run`/`last_error` van de agent). De agent klokt (`agent/internal/app/scheduler.go`): elke minuut een snapshot van schedules/scenes/devices van het eigen huis, uitvoeren via `executeScene`, ook als PocketBase even weg is (laatste snapshot in geheugen). Bewerken in de scène-sheet ("Vanzelf uitvoeren"), tijden op de scène-tegel. Tests: `cd agent && go test ./...`, `cd frontend && node --test lib/*.test.js`
- **Login-redesign**: de login is de eerste bento, een huispaneel (ramen 's avonds, altijd nachtkleuren, één lamp aan) naast het formulier. Een tweede lamp "loopt" rustig door het huis (CSS, 24 s-ronde). Na bevestigde login gaan alle lampen aan, het formulier vervaagt en Home komt binnen (`ARRIVE_MS` in `page.js` hoort bij de timing in `login.css`; `.arriving` op `<html>` voor de binnenkomst in `base.css`). Na inloggen altijd naar Home (hash gewist). Easing-tokens `--ease-out` en `--ease-lamp` in `theme.css`
- **Home-redesign**: kleine liggende apparaattegels (icoon, naam, stand; details via lang indrukken, rechtsklik of contextmenutoets; "Opnieuw proberen" bij mislukt klaarzetten zit in de detail-sheet), keuzebalk **Favorieten / Staat aan** (onthouden in localStorage), beide per kamer gegroepeerd (rustig kamerwoord, groepen in CSS-kolommen), compacte thermostaat (−/+ naast de knop, status onder "Verwarming"). Laptop: drie kolommen (huis + weer | apparaten | thermostaat + scènes) en Home past zonder scrollen (gecheckt op 1366×768, 1440×900, 1920×1080)
- **Scènes op Home**: pillen (tik = uitvoeren, lang indrukken = wijzigen)
- **Weer**: agent haalt het elk half uur uit HA (`weather.get_forecasts`) naar `houses.weather`/`weather_updated` (alleen de agent mag schrijven). Telefoon: regel in het huispaneel; laptop: kaart met uren en dagen. Na 2 uur zonder update een amber regel (box heeft waarschijnlijk geen internet). De huis-samenvatting ("2 lampen staan aan" + kamerchips) is weg; "Alles uit" bleef
- **Omlaag trekken om te verversen** in de geïnstalleerde app (in een tab heeft de telefoon het zelf); tabbladen komen binnen met fade + 12 px schuiven; hover alleen met een muis, drukfeedback op elke knop
- **Agent zonder PocketBase**: lokaal (MQTT, HA, geschiedenis, schema's) start altijd; `runPocketBase` logt in en verifieert de gateway met backoff (1–30 s). Na de eerste verbinding en na elke herverbinding van de command-stroom draait `onPocketBaseConnected` (online, device-cache, stand afstemmen, openstaande commando's inhalen). Schema-snapshot in `/data/schedules.json` (`SCHEDULES_FILE`). Commando's ouder dan 2 min (`commands.created`) worden `failed` "verlopen" — ook realtime, want bij een korte uitval overleeft de TCP-verbinding soms. De agent pakt alleen commando's en devices van zijn eigen huis op (meerdere boxen op één PocketBase). Scheduler tikt de bedoelde minuut (de timer ging soms ms te vroeg af → schema's liepen een minuut te laat)
- PWA-basis: installeerbaar (manifest, voorlopig icoon), thema Licht/Donker/Automatisch, "Alles uit", "Let op"-overzicht, "Ongedaan maken" (verwijderen gaat pas na 6 s echt), kamers en favorieten ordenen (`rooms.order`, `devices.favorite_order`), meerdere huizen, wachtwoord vergeten/wijzigen, "Opnieuw proberen" bij mislukt klaarzetten (command-actie `provision`)

- **Claim-flow** (spec B, `docs/superpowers/specs/2026-10-06-claim-flow-design.md`) ✅: bewoner maakt zelf een account (bevestigingsmail, wachtwoord vergeten via `/bevestig` en `/wachtwoord`; taal van mails kiesbaar in Opties) en koppelt een box met de QR/code van het sticker-blad (`/koppel`, camera of intikken): nieuw huis of vervanging van een bestaand huis; "Box ontkoppelen" laat het huis staan. Server: `/api/sandhovius/claim` en `/release` (volgorde: bevestigd → code → `replace_house`-eigenaar (404) → al gekoppeld (409, behalve aan een eigen huis: 200 met dat huis)); serienummers in hoofdletters; de box bewaart alleen `claim_code_hash`. QR: `<APP_URL>/koppel#s=…&c=…` (code in het fragment, nooit in een serverlog; de oude `?s=…&c=…` werkt nog). Inlogmelding en andere account-mails in de taal van het account. De dev-box is via de PWA als vervanging aan het dev-huis gekoppeld.
- **Box-identiteit** (spec A, `docs/superpowers/specs/2026-10-06-box-identity-design.md`): auth-collectie `boxes` (serienummer + eigen geheim, relatie `house`), regels laten een box alleen zijn eigen huis bereiken; bewonerstakken gelden alleen voor `users` (anders matchte een gast een huis zonder eigenaar) en een bewoner mag `claimed_at` niet zetten, rate limits aan (incl. `boxes:auth`); de agent logt in als box (`/data/box.json`, vervangt `gateway_id`/superuser en `GATEWAY_NAME`), neemt het huis uit de box over, volgt koppelen/loskoppelen en stopt dan schrijven naar het oude huis. Dev-box `SH-DEV-0001` hoort bij het dev-huis.

## Volgende Stappen
1. **Op een echte telefoon testen** (geïnstalleerd): omlaag trekken, lang indrukken op tegels en scènes, de tabovergang. Let op of bewoners de details vinden zonder zichtbare knop; zo niet, een klein "⋯" bij hover (laptop) of een hint bij eerste gebruik.
2. Scènes: volgorde wijzigen (veld `order` bestaat al, nog geen knoppen) — alleen als er vraag naar is.
3. **Fase 3 — remote toegang:** Headscale + PocketBase op Scaleway, zero external ports. Daarbij: idle-timeout op de SSE-stroom van de agent (een dode verbinding valt nu pas na ~3 min TCP-keepalive op) en commando's laten verlopen op de serverklok (`Date`-header) i.p.v. de boxklok. Ook nodig: een echte SMTP-provider (nu Mailpit; `SMTP_*` + afzender in env), een echte `APP_URL` (links in mails en QR), en trusted-proxy-instellingen in PocketBase achter de proxy, anders delen alle klanten één rate-limit-bucket (limieten gaan per IP).
4. Kleiner/los: `.gitignore`-patroon `agent/main/main` is bewust (binary, niet de map). `backend/pb_migrations/1789641627_seed_test_user.js` staat bewust niet in git (testgebruiker). Klein UI-puntje: "Wachtwoord vergeten?" is grijs omdat `.btn-plain` (components.css) de kleur van `.login-link` overschrijft — bewust of niet, nog beslissen.

## Werkafspraken
- UI-copy is Nederlands, zinsletters, geen hoofdletter-labels; zie Named Rules in DESIGN.md (o.a. Real Light Rule: alleen live apparaten gloeien).
- Commits: kleine logische commits op een feature-branch, daarna fast-forward naar `main`.
- Geen echte apparaten schakelen tijdens tests zonder het te zeggen; herstel testdata na afloop.

## Key Constraints
- **Time:** 10–15 uur/week, ~500 uur total scope, 4–5 month target
- **Network:** Zero external ports; all via Headscale mesh tunnel
- **Resilience:** Watchdog with exponential backoff; state reconciliation on reconnect
- **Privacy:** No cloud logs; device data stays local
- **Licensing:** Permissive open-source (BSD-3-Clause, MIT, Apache 2.0) for dependencies; own code stays proprietary (daarom Urbanist/OFL i.p.v. Lufga)

## Development Mentor Role
From now on, you are my collaborative senior software engineering mentor. Your primary goal is to guide my technical growth, help me build high-performance systems, and maintain momentum during the development of this project.

Role & Stance
- Act as an encouraging, pragmatic senior colleague rather than a pure gatekeeper or interrogator.
- Validate reasonable directions quickly, then help refine them.
- When an approach has flaws, explain the concrete engineering trade-off or failure mode immediately, then suggest a viable alternative direction.
- Do not let discussions stall in abstract debate. Balance critical thinking with practical progress.

Guidance & Problem Solving
- Steer first, then challenge: Provide a structural mental model, standard pattern, or directional hint up front so I have traction, then ask 1 focused question to verify my understanding.
- Scaffolding over withholding: If I am stuck or moving in circles, provide a concrete code snippet, pseudocode, or architectural pattern to break the deadlock, then ask me how to adapt it to our specific constraints.
- Keep steps manageable: Tackle one design choice or implementation step at a time. Do not overwhelm me with edge cases before the core loop works.

Behaviour & Decision Making
- Lead with actionable recommendations. When multiple paths exist, name the preferred industry-standard approach.
- Distinguish between reversible implementation details (move fast, give direct advice) and irreversible architectural choices (pause, probe trade-offs).
- When context is missing, make a reasonable technical assumption, state it concisely, and proceed.

Writing Style
- Direct, clear, and technical.
- Short paragraphs. Prefer concise prose; use bullets only for genuinely discrete lists.
- Match length to the task: compact for debugging and syntax, structured for architecture and trade-off analysis.
- Avoid hollow corporate buzzwords, excessive praise, or artificial filler. Keep the tone collegiaal, sharp, and helpful.

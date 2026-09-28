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
- `agent/internal/app/agent.go` — kern: gateway-registratie (vast record-ID in `/data/gateway_id`), heartbeat (30 s op `houses.last_seen`), HA-events → PocketBase, commands → HA, provisioning van nieuwe devices, state-reconciliatie bij start/reconnect
- `agent/internal/homeassistant/` — HA websocket (events), REST (`CallService`, `GetState`), registry (helpers aanmaken)
- `agent/internal/pocketbase/`, `agent/internal/mqtt/`, `agent/internal/history/` (lokale SQLite-geschiedenis), `agent/internal/config/`
- `backend/pb_migrations/` — PocketBase-schema (snapshot + incrementele migraties, draaien bij start van de container)
- `frontend/app/page.js` — de hele PWA-state: login, realtime-subscriptions, tabs (Home/Kamers/Instellingen), commands
- `frontend/components/` — tegels (`DeviceCard`, `LightCard`, `ClimateCard`, `SensorCard`), `BottomNav`, `HousePanel`, `SettingsView`, `DeviceSettingsModal` (detail-sheet)
- `frontend/app/styles/` — `theme.css` (tokens licht/donker), `devices.css`, `rooms.css`, `components.css`, `base.css`, `login.css`
- `PRODUCT.md` (doelgroep, principes) en `DESIGN.md` + `.impeccable/design.json` (design system) — lees DESIGN.md vóór UI-werk

## Tech Stack
- **Go** — local agent (Dockerfile build)
- **Home Assistant Core** — state management; devices uit de UI worden HA-helpers (`input_boolean` / `input_number`)
- **Mosquitto** + **Zigbee2MQTT** — Zigbee ↔ MQTT ↔ agent
- **PocketBase 0.40** — users, houses, rooms, devices, device_state, commands; realtime naar de PWA
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
```

- Home Assistant: http://localhost:8123 · MQTT: localhost:1883 · PocketBase: http://localhost:8090/_/ (superuser in `.env`, `POCKETBASE_ADMIN_*`) · PWA: http://localhost:3000
- Visueel testen: Chrome ontbreekt op deze machine; Edge headless via DevTools-protocol werkt (Playwright-plugin niet).

## Huidige Status (2026-09-28 — `main` loopt vóór op origin, nog niet gepusht)
**Fase 1** ✅ — lokale stack, agent ↔ MQTT/HA.

**Fase 2** grotendeels ✅:
- PocketBase-schema + JWT-login in de PWA
- Command-pipeline: PWA → `commands` → agent → HA (toggle, set_temperature), status/fout terug
- Realtime: device_state, devices en houses live in de PWA
- Box-identiteit: huis wordt éénmalig aangemaakt, gebonden op record-ID (niet op naam; naam is hernoembaar)
- Liveness: heartbeat elke 30 s; PWA toont "box reageert niet" na 90 s stilte en blokkeert dan schakelen
- State-reconciliatie: agent haalt bij start, na HA-reconnect en na provisioning de actuele stand op (fix voor nieuwe devices die "offline" bleven)
- PWA-redesign "The Lit Room at Night": onder-navigatie Home/Kamers/Instellingen, favorieten (`devices.favorite`), thermostaat-dial, lamp/stopcontact-tegels die oplichten (warm/stroomblauw), licht + donker thema

## Volgende Stappen
1. **Pushen** (`git push`) en de frontend-container herbouwen als die nog oud is.
2. **Scènes/routines** (afgesproken als volgende feature): PocketBase-collectie (`scenes`: naam, huis, acties), agent → HA `scene.turn_on` of een reeks service calls, daarna een **Scènes-tab** in `BottomNav` (nu 3 tabs). Eerst het datamodel voorstellen, dan bouwen.
3. **Schema's/tijdsturing** (bv. verwarming van–tot) — pas na scènes; waarschijnlijk via HA-automations.
4. **Claim-flow** voor een nieuwe box: serienummer bij productie, koppelen aan een account via `houses.claimed_at`/`user`. Vervangt later het ID-bestand in `registerGateway()` (zie memory `box-house-identity`).
5. **Fase 3 — remote toegang:** Headscale + PocketBase op Scaleway, zero external ports.
6. Kleiner/los: `commands` heeft geen timestamps (debuggen lastig — overweeg `autodate`-velden); `frontend/app/globals.css.bak` is een oude backup die weg kan; `.gitignore`-patroon `agent/main/main` is bewust (binary, niet de map).

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

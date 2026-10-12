# Development: lokaal draaien, testen en valkuilen

Waar code staat: `docs/codebase.md`. Hoe een box wordt klaargemaakt en
gekoppeld: `docs/box-aanmelden.md`.

## Stack, bouwen en testen

```bash
docker compose up -d                              # hele stack
docker compose up -d --build agent frontend       # na codewijzigingen (beide draaien als gebouwde image, geen hot reload)
AGENT_VERSION=$(git describe --always --dirty) docker compose up -d --build agent   # met versie (anders "dev"); de box meldt hem in boxes.agent_version
docker compose logs -f agent

# Lokaal checken zonder container
cd agent && go vet ./... && go build ./...
cd frontend && npx next build                     # moet slagen vóór commit

# Tests
cd agent && go vet ./... && go test ./...
cd frontend && node --test lib/*.test.js
cd backend/tests && go test -tags integration ./...   # regels per huis/box, hooks, mail
pip install -r scripts/requirements.txt                # segno, voor claimcode/sheet
python -m unittest discover -s scripts -p "test_*.py"  # Python-tests

# Dev-box (identiteit) aanmaken en in de agent zetten
scripts/provision-box.py --serial SH-DEV-0001 --house <huis-id> --out box.json --app-url http://localhost:3000   # ook claimcode + sheets/<serial>.svg
scripts/provision-box.py --reissue SH-DEV-0001 --app-url http://localhost:3000       # nieuwe code voor een box zonder huis
docker cp box.json sandhovius-agent:/data/box.json   # in Git Bash: MSYS_NO_PATHCONV=1 ervoor; daarna box.json wissen
docker compose restart agent
```

## Adressen

Home Assistant: http://localhost:8123 · MQTT: localhost:1883 · PocketBase:
http://localhost:8090/_/ (superuser in `.env`, `POCKETBASE_ADMIN_*`: alleen
voor PocketBase zelf en de scripts, de agent gebruikt ze niet meer) · PWA:
http://localhost:3000 · Mailpit: http://localhost:8025

## Gesimuleerde lampen

Voor dimmen en kleuren zonder echte lamp:

```bash
pip install -r scripts/requirements.txt
python scripts/fake-lights.py          # laat draaien; --host/--port als de broker elders staat
```

Het script meldt drie lampen aan via MQTT-discovery ("Testlamp dimbaar", "Testlamp wit", "Testlamp kleur"). Maak de drie devices aan in het PocketBase-beheer (http://localhost:8090/_/, collectie `devices`) met `type=light`, `gateway=<huis-id>`, `entity_id=light.testlamp_dimbaar`, `light.testlamp_wit` en `light.testlamp_kleur`, en een kamer (of laat ze staan als ze er al zijn). Toevoegen via de app werkt hier niet: dat maakt een `input_boolean`-helper aan, geen koppeling met een bestaande `light.*`. Opruimen: `python scripts/fake-lights.py --remove`, daarna de drie devices in het PocketBase-beheer (http://localhost:8090/_/) verwijderen.

De MQTT-integratie van Home Assistant zet de agent zelf op (eenmalig bij de start, als HA hem nog niet heeft); die blijft staan, ook na `--remove`.

## Valkuilen

- **Windows + Git Bash:** `gofmt -l` noemt elk bestand (CRLF in de werkmap; git normaliseert bij commit, dus negeren). Geen gcc → geen `go test -race`. Docker Desktop staat in `%LOCALAPPDATA%\Programs\DockerDesktop`. Bij `docker exec … /pad` in Git Bash `MSYS_NO_PATHCONV=1` ervoor, anders wordt het pad een Windows-pad.
- **PocketBase-datums** komen als `2006-01-02 15:04:05.000Z` (spatie, geen `T`): `time.RFC3339` parse faalt daarop.
- **Collectie wijzigen via de API of het dashboard** (als superuser, ook in een test) laat de lokale PocketBase een `*_updated_*.js` in `backend/pb_migrations/` schrijven (automigrate). Niet committen: weggooien, de wijziging terugzetten en daarna de history-sync hieronder.
- **Migratie-historie** opschonen na weggegooide migratiebestanden: `docker exec sandhovius-pocketbase /usr/local/bin/pocketbase migrate history-sync --dir=/pb_data --migrationsDir=/pb_migrations`.
- **Docker-cache:** verschijnt een frontendwijziging niet na `docker compose up -d --build frontend` (de stap `COPY . .` blijft CACHED, gezien na `git apply`), bouw dan zonder cache: `docker compose build --no-cache frontend && docker compose up -d frontend`. Controle: `docker exec sandhovius-frontend sh -c 'grep -l <nieuwe-klasse> /app/.next/static/chunks/*.css'`.
- **Hooks:** nieuwe of gewijzigde bestanden in `backend/pb_hooks/` worden op Windows niet altijd opgepikt door de hooks-watcher: `docker compose restart pocketbase`.
- **Claim-flow lokaal:** mails (bevestigen, wachtwoord, inlogmelding) komen in Mailpit (SMTP uit env in `docker-compose.yml`, `SMTP_HOST=mailpit`, `APP_URL`). De camera (QR scannen) werkt alleen op HTTPS of `localhost`; elders typt de bewoner de code in. Rate limits gaan per IP, niet per gebruiker.
- **`scripts/seed.py`** (testaccount + huis vullen) staat bewust alleen lokaal (`.git/info/exclude`); het maakt zelf het huis (superuser, gekoppeld aan de testgebruiker) en een box-identiteit via `provision-box.py --house` + `docker cp`. Het testaccount staat niet in git; zet `SANDHOVIUS_EMAIL`/`SANDHOVIUS_PASSWORD` in `.env`.
- **Bewust:** `.gitignore`-patroon `agent/main/main` (binary, niet de map); `backend/pb_migrations/1789641627_seed_test_user.js` staat niet in git (testgebruiker).

## Visueel testen

Chrome en Edge ontbreken; de Playwright-plugin werkt niet.
`SANDHOVIUS_EMAIL=… SANDHOVIUS_PASSWORD=… scripts/screenshot.py /tmp/home 1440x900 1366x768:dark 390x844`
logt in (token in localStorage) en maakt screenshots via Firefox headless +
Marionette; het zegt ook of de pagina scrolt (Home hoort op een laptop te
passen). Opties: `HASH='#kamers'`, `HOMEVIEW=on`. Firefox kan niet smaller dan
~500px. `screenshot.py` start `firefox` uit PATH; hier staat Firefox Developer
Edition op `C:/Program Files/Firefox Developer Edition/firefox.exe`, dus geef
dat mee met `FIREFOX='C:/Program Files/Firefox Developer Edition/firefox.exe'`
(of zet die map in PATH). Marionette kan ook klikken, lang indrukken
(`WebDriver:PerformActions`) en met pref `dom.w3c_touch_events.enabled`
touch-events sturen.

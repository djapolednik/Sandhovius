# Sandhovius

Een plug-and-play smart-home platform voor mensen zonder technische kennis.
Een kleine box (Intel N100) in huis automatiseert lokaal — ook zonder internet —
en een Progressive Web App bedient het huis van overal.

- **Lokaal eerst**: Home Assistant, Zigbee2MQTT en een eigen Go-agent draaien op
  de box; schema's, scènes en geschiedenis werken zonder cloud.
- **Gemak via de app**: kamers, apparaten, favorieten, scènes, schema's, weer,
  licht/donker thema, meerdere huizen per account.
- **Privacy**: sensordata blijft lokaal; de cloud houdt alleen de huidige stand
  bij die de app nodig heeft.
- **Zelf aanmelden**: de koper maakt een account en koppelt zijn box met de
  QR-code uit de handleiding (`docs/box-aanmelden.md`).

## Opbouw

| Map | Wat |
|---|---|
| `agent/` | Go Local Agent op de box (MQTT, Home Assistant, PocketBase, lokale SQLite) |
| `backend/pb_migrations/`, `backend/pb_hooks/` | PocketBase-schema, regels en server-hooks (claim, mail) |
| `backend/tests/` | Integratietests tegen een tijdelijke PocketBase |
| `frontend/` | De PWA (Next.js 16) |
| `scripts/` | Box klaarmaken (`provision-box.py`), screenshots |
| `docs/` | Ontwerpen (`docs/superpowers/specs/`), plannen en de aanmeldflow |

Meer uitleg: [`backend_explained.md`](backend_explained.md) (backend en agent),
[`PRODUCT.md`](PRODUCT.md) (doelgroep en principes),
[`DESIGN.md`](DESIGN.md) (design system), [`CLAUDE.md`](CLAUDE.md)
(werkafspraken en actuele status).

## Lokaal draaien

Nodig: Docker Desktop, Go, Node.js, Python 3. Maak een `.env` met o.a.
`HA_TOKEN`, `POCKETBASE_ADMIN_EMAIL` en `POCKETBASE_ADMIN_PASSWORD`.

```bash
docker compose up -d                          # hele stack
docker compose up -d --build agent frontend   # na codewijzigingen
docker compose logs -f agent
```

| Dienst | Adres |
|---|---|
| App (PWA) | http://localhost:3000 |
| PocketBase-admin | http://localhost:8090/_/ |
| Home Assistant | http://localhost:8123 |
| Mailpit (alle mail in dev) | http://localhost:8025 |
| MQTT | localhost:1883 |

Een box voor de lokale agent maken: zie `docs/box-aanmelden.md` en
`CLAUDE.md` (Development Setup).

## Testen

```bash
cd agent && go vet ./... && go test ./...
cd backend/tests && go test -tags integration ./...
cd frontend && node --test lib/*.test.js && npx next build
pip install -r scripts/requirements.txt
python -m unittest discover -s scripts -p "test_*.py"
```

## Roadmap

- Testen op een echte telefoon (geïnstalleerde app, scannen, lang indrukken).
- Fase 3: remote toegang via Headscale, PocketBase op Scaleway, HTTPS, een echte
  mailprovider, zero external ports.
- Zie `CLAUDE.md` → Volgende Stappen voor de actuele lijst.

## Auteurs

Eigenaar: Colin Sanders · Ontwikkelaar: David Polednik

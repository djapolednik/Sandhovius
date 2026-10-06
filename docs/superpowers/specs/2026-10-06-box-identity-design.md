# Box-identiteit — ontwerp (spec A van de claim-flow)

Datum: 2026-10-06 · Status: ter review · Vervolg: spec B (claimen)

## Doel

Elke box krijgt een eigen identiteit en logt in als zichzelf, niet als
PocketBase-superuser. Een box mag precies wat de agent nodig heeft, en alleen
voor het huis waar hij bij hoort. Voorwaarde voor fase 3: daar staat
PocketBase op Scaleway, en een box met de admin-sleutel in elk huis betekent
dat wie er één openschroeft bij alle klanten kan.

Dit is de basis onder spec B (claimen): koppelen wordt daar het zetten van
`boxes.house` en `houses.user`.

## Vastgelegde keuzes (uit het gesprek)

| Vraag | Keuze | Waarom |
|---|---|---|
| Bewijs van eigendom bij claimen (spec B) | Claimcode op de box (sticker + QR), apart van het boxgeheim | Gangbaar (Hue, Sonos), werkt ook buiten het huis, box hoeft niets van accounts te weten. |
| Box-identiteit | Eigen auth-collectie `boxes` in PocketBase | Standaard PocketBase; regels blijven de enige plek die zegt wie wat mag; realtime filtert dan ook op de server. API-sleutel in een hook of identiteit uit Headscale afgewezen (eigen code buiten het regelsysteem; netwerklaag bestaat nog niet). |
| Box ↔ huis | De box hoort bij een huis; het huis is van de bewoner | Vervangen van een kapotte box houdt kamers, apparaten, scènes en schema's; een tweedehands box wordt losgekoppeld en komt als nieuw. |
| Meerdere huizen | Eén account, meerdere huizen, elk met een eigen box; wisselen in de app | Bestaat al (`houses.user`, huiskeuze in Opties); spec B laat bij het claimen kiezen: nieuw of bestaand account, en bij bestaand: nieuw huis of vervangt de box van huis X. |
| Regels testen | Integratietest tegen een tijdelijke PocketBase-binary | Volledig en reproduceerbaar; raakt de dev-data niet. |

## Buiten scope

- De claim zelf (code, scherm, account kiezen): spec B.
- Meerdere boxen in één huis.
- Een box intrekken (bijv. gestolen): kan in de admin-UI door het record te
  verwijderen of het wachtwoord te wijzigen; een knop daarvoor komt later.

## Datamodel

**`boxes`** (nieuwe auth-collectie):

| Veld | Type | Opmerking |
|---|---|---|
| `serial` | text, uniek, verplicht | De login (identity-veld voor password-auth). |
| `password` | (auth) | Het boxgeheim: 32 willekeurige bytes, base64. |
| `house` | relatie → `houses`, optioneel, max 1 | Leeg tot de claim. |

Regels: list/view `id = @request.auth.id`; create/update/delete alleen
superuser (provisioning nu, claim-endpoint in spec B). Password-auth aan met
identity `serial`; e-mail-auth, OAuth en OTP uit. Rate limit op
`boxes:auth-with-password` (PocketBase-instelling, in dezelfde migratie).

**`houses.claimed_at`**: van `autodate` naar `DateField` (leeg). De huidige
waarde is het aanmaakmoment, dus betekenisloos; spec B vult het.

## Regels

`B` = `@request.auth.collectionName = "boxes"`, `H` = `@request.auth.house`.
Elke bestaande bewonersregel blijft; de box-tak komt erbij met `|| (…)`.
"Verboden velden" = velden die de box niet mag meesturen
(`@request.body.<veld>:isset = false`), gebaseerd op het schema in git.

| Collectie | Box leest (list/view) | Box schrijft | Verboden velden bij box-update |
|---|---|---|---|
| `houses` | `B && id = H` | update | `user`, `name`, `claimed_at` |
| `devices` | `B && gateway = H` | update | `gateway`, `name`, `type`, `room`, `favorite`, `favorite_order` |
| `device_state` | `B && device.gateway = H` | create (`B && @request.body.device.gateway = H`), update | `device` |
| `commands` | `B && (device.gateway = H \|\| scene.house = H)` | update | `device`, `scene`, `action`, `payload` |
| `scenes` | `B && house = H` | — | — |
| `schedules` | `B && house = H` | update | `house`, `scene`, `time`, `days`, `enabled` |
| `rooms` | — | — | — |

Gevolgen:

- Realtime volgt dezelfde list/view-regels: een box krijgt alleen events
  van zijn eigen huis. De huis-checks in de agent (`pendingCommandsFilter`,
  `handleCommand`, `runScene`, `handleDeviceEvent`, device-cache) blijven als
  tweede linie.
- Een box zonder huis (`H` leeg) matcht nergens: hij kan inloggen maar ziet
  en schrijft niets.
- Een veld dat later bij een collectie komt, mag de box standaard wél
  schrijven (zwarte lijst). De regeltest vangt dat: hij probeert per
  collectie elk veld dat niet op de toegestane lijst staat (zie Testen).
- Bewonersregels worden niet ruimer: een bewoner kan `boxes` niet zien.

## Op de box

`/data/box.json` (`BOX_FILE`):

```json
{ "serial": "SH-2026-000123", "secret": "…", "house": "45lpedg4nbwbmgv" }
```

`serial` en `secret` schrijft de provisioning; `house` schrijft de agent
(laatst bekende huis, voor offline starten). Atomisch schrijven (tmp +
rename), modus 0600.

## Agent

- `config`: `BOX_FILE` (standaard `/data/box.json`) vervangt
  `POCKETBASE_ADMIN_EMAIL`/`_PASSWORD`, `GATEWAY_NAME` en `GATEWAY_ID_FILE`.
  Ontbreekt of is het bestand onleesbaar, dan stopt de agent met een
  duidelijke fout (een box zonder identiteit is een productiefout, geen
  netwerkstoring).
- `pocketbase.Client.Login` gaat naar
  `/api/collections/boxes/auth-with-password` (`identity` = serial) en geeft
  het box-record terug (`house`). Opnieuw inloggen bij 401 blijft.
- `registerGateway` (ID-bestand, zoeken op naam, zelf een huis aanmaken)
  verdwijnt, net als `readGatewayID`/`writeGatewayID` en `FindGatewayByName`/
  `CreateGateway`. Daarvoor in de plaats:
  - Start: `setHouse(box.json.house)` — offline-start en schema-snapshot
    werken zoals nu.
  - `runPocketBase`: inloggen → `setHouse(record.house)` → is het huis
    veranderd, `house` in `box.json` bijwerken → is er een huis,
    `registered` + herstelstap.
  - Zonder huis: elke 5 minuten het eigen record opnieuw ophalen
    (`authRefresh`); zodra er een huis is, de herstelstap. Zo pikt de box een
    claim op zonder herstart.
  - Huis gewijzigd terwijl de agent draait (vervanging, loskoppelen):
    dezelfde 5-minuten-check ziet het; nieuw huis → `setHouse` + herstelstap;
    leeg → `setHouse("")`, `registered` false, alleen nog lokaal.
- Gateway-status: de box zet `select` online/offline op zijn huis zoals nu;
  alleen als er een huis is.

## Provisioning en migratie van de dev-omgeving

`scripts/provision-box.py` (superuser-gegevens uit `.env`):

- `provision-box.py --serial SH-DEV-0001 --out <pad>/box.json` — maakt een
  `boxes`-record met een willekeurig geheim, zonder huis (fabrieksgeval).
- `--house <id>` koppelt het meteen aan een bestaand huis (dev, en later
  testen van spec B).
- Schrijft `box.json`; print het serienummer, nooit het geheim.

Overzetten van de huidige dev-box: `provision-box.py --serial SH-DEV-0001
--house 45lpedg4nbwbmgv`, `box.json` in het `agent_data`-volume zetten,
daarna uit `docker-compose.yml` voor de agent: `POCKETBASE_ADMIN_*`,
`GATEWAY_NAME`, `GATEWAY_ID_FILE`. `/data/gateway_id` mag weg.

Voorwaarde: de twee migraties die in de lokale database staan maar niet in
git (`1790600000_command_lifecycle.js`,
`1790700000_seed_device_state_updated_at.js`) eerst uitzoeken. De regels
hier verwijzen alleen naar velden uit git, maar de regeltest draait op een
verse database en moet hetzelfde schema zien als productie.

## Testen

**Regels** — eigen Go-module `backend/tests/`, `go test -tags integration
./...` (Go staat al op de machine; geen Python-afhankelijkheden): download
PocketBase 0.40 naar een cachemap, start
op een vrije poort met een tijdelijke `pb_data` en `--migrationsDir
backend/pb_migrations`, zet testdata neer via de superuser:
twee huizen (A, B), bewoner A, box A (huis A), box B (huis B), box zonder huis.

- Box A ziet huis/devices/state/commands/scenes/schedules van A, niets van B.
- Box A kan niets van B wijzigen of aanmaken.
- Box A kan per collectie geen verboden veld wijzigen; en elk veld van het
  schema dat niet op de toegestane lijst staat, wordt geweigerd (vangt nieuwe
  velden).
- Box zonder huis ziet en schrijft niets.
- Bewoner A kan `boxes` niet lezen; bewonersgedrag blijft (A ziet eigen huis,
  niet B).
- Realtime: box A ontvangt een command-event van huis A, niet van huis B.

**Agent** (unit): `box.json` lezen/schrijven (ontbrekend, kapot, house
bijwerken), huis uit het auth-record, claim oppikken (leeg → huis),
loskoppelen (huis → leeg), huiswissel.

**Handmatig**: dev-box overzetten, agent start en verbindt als box; PWA werkt
als vanouds; de agent kan in de admin-UI geen ander huis zien (log in als
box via de API en probeer het).

## Volgorde van bouwen

1. Onbekende migraties uitzoeken (met de gebruiker).
2. Migratie: `boxes`, `claimed_at`, regels, rate limit + regeltest.
3. `provision-box.py`.
4. Agent: `box.json`, login als box, huis uit record, claim/wissel-check,
   oude registratie weg.
5. Dev-omgeving overzetten, `docker-compose.yml`, CLAUDE.md.

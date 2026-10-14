# Fase 3: voorbereiding

Datum: 2026-10-14 · Status: voorbereiding, nog niets gebouwd · Bouwt op:
box-identiteit (`2026-10-06-box-identity-design.md`), claim-flow
(`2026-10-06-claim-flow-design.md`), agent zonder PocketBase
(`2026-10-06-agent-offline-start-design.md`), meldingen
(`2026-10-14-notifications-design.md`)

## Doel

De koper bedient zijn huis ook buiten de deur, met een echte app-link in de
handleiding, echte mail en HTTPS. Nu draait alles op één laptop:
PocketBase, de PWA en Mailpit in Docker. Na fase 3 staan PocketBase en de PWA
op een server in de cloud. De box in huis blijft alles lokaal doen en praat
alleen nog uitgaand met die server.

Wat al klaar is en fase 3 makkelijk maakt:

- **De box heeft een eigen identiteit** (`boxes`, serienummer + geheim) en
  ziet alleen zijn eigen huis. Er staat geen admin-sleutel in huis.
- **De agent werkt zonder PocketBase**: schema's, routines, bewegingslicht,
  thuis/weg en meldingen draaien uit het snapshot op schijf. Een
  internetstoring kost alleen de bediening op afstand.
- **Alles is uitgaand**: de box logt in, leest en schrijft, en volgt
  realtime. Niemand hoeft de box van buiten te bereiken.
- **De app kent geen vast adres**: zonder `NEXT_PUBLIC_POCKETBASE_URL`
  gebruikt ze de host van de pagina.

## Het grote besluit: wat "geen open poorten" betekent

CLAUDE.md zegt: *zero external ports; all via Headscale mesh tunnel*. Daar
zijn twee lezingen van, en ze verschillen sterk.

**A. Geen open poorten bij de klant thuis (aanbevolen).** De box en het
huisnetwerk hebben niets open; de box maakt alleen uitgaande verbindingen.
De server in de cloud heeft één open poort: 443 (HTTPS), voor de PWA, de API
en de controle-server van Headscale. Telefoons praten gewoon HTTPS met de
server. Het mesh (Headscale) is voor beheer: wij kunnen een box bereiken voor
onderhoud zonder dat de klant iets openzet.

**B. Alles via het mesh, ook de telefoons.** Dan heeft de server geen
publieke API, maar moet elke bewoner een Tailscale-app installeren en
aanmelden. Dat is voor de doelgroep (niet-technisch, één hand, kort) een
drempel die de PWA juist wilde wegnemen. Ook een gast (D2) of een
pushmelding (B2) wordt dan lastig.

**Aanbeveling: A.** De belofte voor de klant blijft staan: in huis staat
niets open, en sensordata gaat niet naar de cloud. Het verschil met B zit
alleen op de server, en die beheren wij. **Dit is lastig terug te draaien**
(alle telefoons en de handleiding hangen eraan), dus eerst beslissen.

```
 telefoon ──HTTPS──▶ ┌──────────── server (Scaleway) ────────────┐
                     │ Caddy :443                                │
                     │  app.<domein>      → PWA (Next.js)        │
                     │  app.<domein>/api  → PocketBase           │
                     │  hs.<domein>       → Headscale            │
                     └───────────────▲───────────────────▲───────┘
                                     │ HTTPS (uitgaand)  │ mesh (uitgaand)
                      ┌──────────────┴───────────────────┴───┐
                      │ box in huis: agent, HA, Z2M, MQTT    │
                      │ geen open poorten                    │
                      └──────────────────────────────────────┘
```

## Te besluiten vóór de bouw

| Vraag | Aanbeveling | Waarom | Terug te draaien? |
|---|---|---|---|
| Lezing van "geen open poorten" | A (zie hierboven) | Telefoons zonder extra app; de klant heeft niets open | **Nee**, moeilijk |
| Domein | Eén eigen domein, de app op `app.<domein>` | De QR-link in elke handleiding wijst ernaar (`<APP_URL>/koppel#…`); een gedrukte handleiding pas je niet meer aan | **Nee**: kies een domein dat je jaren houdt |
| Hosting | Scaleway, regio `nl-ams` (Amsterdam) | EU, dichtbij, al genoemd in de plannen | Ja |
| Eén server of meer | Eén instance voor PocketBase, PWA, Caddy en Headscale | PocketBase is één bestand (SQLite); bij deze schaal is één server eenvoudiger en goedkoper | Ja |
| Reverse proxy en HTTPS | Caddy (Apache 2.0), automatische certificaten | Weinig configuratie, HTTPS vanzelf | Ja |
| Mail | Scaleway Transactional Email | EU, zelfde account; alleen `SMTP_*` in env | Ja |
| Back-ups | PocketBase-back-ups naar Scaleway Object Storage, versleuteld, dagelijks | Ingebouwd in PocketBase (S3-compatibel) | Ja |
| PocketBase-beheer (`/_/`) | Niet publiek; alleen via het mesh | Minder aanvalsoppervlak | Ja |
| Box offline melden (rest van B2) | Mail aan de beheerders na 30 minuten stilte | De box kan zichzelf niet melden, en push vanaf de server vraagt een eigen sleutel en aanmelding; mail kan PocketBase al | Ja |
| Geschiedenis (C1) | Via een commando met antwoord in PocketBase, niet direct app → box | Bij lezing A heeft de telefoon geen mesh; zo blijft sensordata op de box tot iemand erom vraagt, en wordt het antwoord daarna gewist | Ja, maar bepaalt C1 |

## Werkpakketten

De uren zijn een ruwe schatting bij 10–15 uur per week.

### P0. Account, domein en DNS (2–3 uur)

- Scaleway-account met een verwerkersovereenkomst (DPA), een project
  "sandhovius", 2FA aan.
- Domein registreren; DNS: `app` en `hs` naar de server; voor mail SPF,
  DKIM en DMARC volgens Scaleway TEM.
- Geheimen een plek geven (een wachtwoordkluis, niet in git): wachtwoord van
  de PocketBase-superuser, `CLAIM_CODE_KEY`, `PB_ENCRYPTION_KEY`,
  SMTP-gegevens en de sleutels voor Object Storage.

### P1. De server (4–6 uur)

- Instance in `nl-ams` (klein begint: 2 vCPU, 2–4 GB), Ubuntu LTS, Docker.
- Firewall (security group): alleen 443 en 80 open (80 alleen voor het
  certificaat en de doorverwijzing); SSH alleen via het mesh zodra P6 staat,
  tot dan alleen vanaf je eigen IP.
- Automatische beveiligingsupdates aan.
- Een `docker-compose.prod.yml`: Caddy, PocketBase, PWA en Headscale. Geen
  Mosquitto, Home Assistant, Zigbee2MQTT of agent: die horen op de box.
  Mailpit valt weg.

### P2. PocketBase in productie (6–8 uur)

- Hetzelfde image als nu, vast op 0.40.4 (de regels leunen op die versie).
  Migraties en hooks uit de repo in het image, niet als losse map.
- **Instellingen versleutelen**: PocketBase met `--encryptionEnv
  PB_ENCRYPTION_KEY` starten, zodat het SMTP-wachtwoord niet leesbaar in
  de database staat (stond al op de lijst vóór fase 3).
- **Achter de proxy**: de trusted-proxy-instelling op `X-Forwarded-For` van
  Caddy, anders delen alle telefoons één rate-limit-emmer (limieten gaan per
  IP, zie backend_explained §4).
- **Geen logs in de cloud** (Key Constraints): de request-logs van
  PocketBase uit of op een paar dagen, en de access-logs van Caddy uit. Alleen
  fouten bewaren.
- **Realtime door de proxy**: Caddy mag SSE niet bufferen en geen korte
  timeout hebben; de keepalive van de agent (15 s) blijft.
- **Back-ups**: de ingebouwde cron-back-up naar Object Storage, met
  bewaartermijn. Een **hersteltest** op een tweede, lege instance hoort erbij:
  een back-up die nooit teruggezet is, telt niet.
- `/_/` (het beheerscherm) in Caddy alleen voor het mesh-adres.

### P3. Mail en adressen (2–3 uur)

- `SMTP_HOST`, `SMTP_PORT`, gebruiker, wachtwoord en afzender in env; testen
  met verificatie, wachtwoord vergeten, inlogmelding en uitnodiging, in
  beide talen.
- `APP_URL=https://app.<domein>`, **zonder slash aan het eind** (bekend gat:
  anders `//bevestig`). Beter: in `mail.pb.js` de slash eraf halen, dan kan
  het niet meer misgaan.
- `PUSH_SUBJECT` op de box: een echt contactadres (`mailto:` op het eigen
  domein); sommige pushdiensten weigeren `noreply@sandhovius.local`.

### P4. De PWA (3–4 uur)

- De bestaande `frontend/Dockerfile` (`output: 'standalone'`) achter Caddy.
- Eén adres voor alles: Caddy stuurt `/api/*` en `/api/realtime` naar
  PocketBase en de rest naar Next.js. De app praat dan met haar eigen adres:
  geen CORS. `lib/pocketbase.js` neemt nu de host van de pagina op poort
  8090, tenzij `NEXT_PUBLIC_POCKETBASE_URL` gezet is: die bij het bouwen op
  `https://app.<domein>` zetten werkt zonder codewijziging. Netter: zonder
  ingesteld adres de eigen origin gebruiken als de pagina via HTTPS komt (een
  kleine aanpassing met een test).
- HTTPS maakt mogelijk wat nu niet kon: de camera voor de QR in `/koppel`, de
  service worker en pushmeldingen buiten `localhost`, en installeren op een
  iPhone.
- De headers van `next.config.js` (`no-cache` op pagina's, eigen headers voor
  `/sw.js`) blijven; Caddy mag ze niet overschrijven.

### P5. De box naar de cloud (6–8 uur)

- `POCKETBASE_URL=https://app.<domein>` in de compose van de box.
- **Commando's verlopen op de serverklok** (bekend gat, `commands.go`): de
  agent leidt de afwijking van zijn klok af uit de `Date`-header van
  PocketBase en vergelijkt `created` met de serverklok. Met tests voor een box
  die voor- of achterloopt.
- **Realtime door de proxy nakijken**: de agent vangt een half-open
  verbinding nu op met TCP-keepalive (15 s + 3×5 s, ~30 s). Achter Caddy loopt
  die keepalive alleen tot Caddy. Testen of een weggevallen upstream nog
  binnen een minuut opvalt; zo niet, een eigen timeout op de stroom (PocketBase
  stuurt zelf geen keepalive en sluit een stille stroom pas na 5 minuten).
- **Provisioning**: `provision-box.py --app-url https://app.<domein>` maakt
  de printbladen met de echte QR. Pas printen als het domein vaststaat
  (zie de tabel). De dev-box krijgt een nieuw blad (`--reissue`).
- `CLAIM_CODE_KEY` is dezelfde als op de server: kwijt = alle ongekoppelde
  boxen opnieuw uitgeven. Bewaren in de kluis, met een tweede kopie.

### P6. Headscale (4–6 uur)

- Headscale (BSD-3) op de server achter Caddy op `hs.<domein>`;
  Tailscale-client (BSD-3) op de box.
- **ACL's**: beheerapparaten mogen naar de boxen (SSH, HA-scherm voor
  support); boxen mogen niet naar elkaar en niet naar beheerapparaten.
- Een pre-auth-sleutel per box bij provisioning (`provision-box.py` uitbreiden),
  met een tag `box`, zodat de ACL's op tag werken.
- SSH op de server daarna alleen via het mesh.

### P7. Box offline melden (3–4 uur)

Het deel van B2 dat bij fase 3 hoort. Een cron-hook in PocketBase kijkt
elke 5 minuten naar `houses.last_seen`. Is een gekoppelde box 30 minuten
stil, dan krijgen de beheerders één mail in hun taal ("Je box reageert al
een half uur niet. Zit de stekker erin?"). Als hij terug is, volgt één mail
"weer verbonden". Dat is geen push: die vraagt een sleutel op de server en
een tweede aanmelding per telefoon. De mail-hook en de teksten bestaan al.

### P8. Proef en overstap (4–6 uur)

- Eerst alles op een **staging**-instance met een tijdelijk subdomein.
- Doorlopen met de dev-box thuis en twee telefoons (Android en iPhone,
  geïnstalleerd):
  - koppelen met de QR van een nieuw blad;
  - bedienen thuis en via 4G;
  - een scène en een routine;
  - een pushmelding;
  - de box van het netwerk halen (de app zegt "reageert niet", en na 30
    minuten komt de mail);
  - een back-up terugzetten.
- Dan productie. De dev-database gaat niet mee: productie begint leeg en de
  dev-box wordt opnieuw gekoppeld.

## Codewijzigingen in de repo

Klein en vooraf te bouwen en te testen, los van de server:

1. `frontend/lib/pocketbase.js` (optioneel): zonder ingesteld adres de eigen
   origin via HTTPS; test in `pocketbase.test.js`.
2. `backend/pb_hooks/mail.pb.js`: `APP_URL` zonder slash aan het eind.
3. `agent/internal/app/commands.go`: verlopen op de serverklok (`Date`-header).
4. `agent/internal/pocketbase/realtime.go`: alleen als P5 laat zien dat een
   dode verbinding door Caddy niet op tijd opvalt.
5. Een cron-hook `box_offline.pb.js` met teksten in `mail_texts.js` (P7), met
   integratietest.
6. `docker-compose.prod.yml` en een `Caddyfile` in de repo, zonder geheimen;
   de geheimen in een `.env` op de server.
7. `scripts/provision-box.py`: pre-auth-sleutel voor Headscale (P6).

## Risico's

- **Het domein ligt vast zodra er handleidingen gedrukt zijn.** Een
  doorverwijzing kan later, maar alleen als het domein van ons blijft.
- **Eén server is één storingspunt.** In huis werkt alles door (snapshot,
  lokaal); alleen bediening op afstand valt weg. Back-ups en een geteste
  hersteldag zijn de verzekering.
- **SQLite op één schijf**: geen probleem bij deze schaal; wel de schijf van
  de instance meenemen in de back-up-strategie (Object Storage los van de
  instance).
- **De sleutels** (`CLAIM_CODE_KEY`, `PB_ENCRYPTION_KEY`): kwijt =
  respectievelijk alle ongekoppelde boxen opnieuw uitgeven, of de
  instellingen opnieuw invoeren. Twee kopieën in de kluis.
- **Pushmeldingen op iOS** werken alleen voor een geïnstalleerde PWA, en
  pas sinds iOS 16.4.

## Volgorde en maat

P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8. De codewijzigingen (1–5) kunnen
al vóór P0, zonder server. Samen ruwweg 35–45 uur, dus 3–4 weken bij
10–15 uur per week.

## Daarna mogelijk

- **C1 Geschiedenis**, met het besluit uit de tabel: de app vraagt "laatste N
  gebeurtenissen" met een commando, de box antwoordt in het record en de
  server wist het daarna.
- **Bedienen buiten huis** als aparte rechten-schakelaar (D1 noemde het al).
- **Software-updates van de box** via het mesh: een eigen plan.

# Claim-flow — ontwerp (spec B)

Datum: 2026-10-06 · Status: ter review · Bouwt op: spec A
(`2026-10-06-box-identity-design.md`, in `main`)

## Doel

Een koper koppelt zelf, zonder hulp en zonder admin-UI, een nieuwe box aan
zijn account: nieuw of bestaand account, nieuw huis of vervanging van de box
van een bestaand huis. Een vreemde zonder het papier uit de doos kan de box
niet claimen. Eén account kan meerdere huizen hebben, elk met een eigen box
(wisselen bestaat al in de app).

## Vastgelegde keuzes (uit het gesprek)

| Vraag | Keuze | Waarom |
|---|---|---|
| Waar begint de koper? | In de PWA (adres staat in de handleiding): account, dan in de app de QR-code uit de handleiding scannen | Eén duidelijke plek. De QR-code bevat toch een link (`…/koppel?s=…&c=…`), zodat scannen met de gewone camera ook werkt — kost niets en wat gedrukt is, is niet meer te veranderen. |
| E-mail bevestigen | Verplicht vóór het koppelen | Netjes accountherstel; daarom komt SMTP in deze spec. |
| SMTP in dev | Mailpit in `docker-compose.yml` | Mails zichtbaar op `localhost:8025`, niets verlaat het netwerk, geen wachtwoorden. Fase 3: andere env-waarden. |
| Server-logica | Eigen endpoint als PocketBase-hook (`backend/pb_hooks/`) | Hash controleren en huis + box + eigenaar in één transactie kan niet met regels; een aparte service is te zwaar. |
| Claimcode bewaren | Alleen een hash in de database; opnieuw printen = nieuwe code uitgeven (`--reissue`) | Een datalek levert geen claimbare boxen op; geen extra sleutel om te beheren. |
| Code na koppelen | Gekoppelde box is niet opnieuw te claimen; na ontkoppelen werkt dezelfde code weer | De handleiding gaat bij verkoop mee met de box. |
| QR in de PWA | Camera + jsQR (Apache-2.0); altijd ook overtikken | `BarcodeDetector` ontbreekt in Safari en Firefox. |

## Buiten scope

- Echte verkoop: een box bij een klant kan de lokale PocketBase niet bereiken;
  dat komt met fase 3 (alleen het adres verandert).
- Een SMTP-provider voor productie (fase 3).
- Een box overdragen zonder ontkoppelen; meerdere boxen in één huis.
- Automatisch `box.json` op de box zetten (installatiescript, later).

## Werkwijze rond een box

**Klaarmaken (jij, eenmalig per box, thuis):**

1. Software op de N100 (Linux + Docker-stack).
2. `scripts/provision-box.py --serial SH-2026-000123 --app-url https://app.sandhovius.nl`
   — maakt het `boxes`-record (zonder huis), schrijft `box.json` en
   `SH-2026-000123.svg` (printblad).
3. `box.json` naar `/data` op de box (`scp`/usb).
4. Blad printen, in de doos bij de handleiding.

**Koppelen (de klant, thuis):**

5. Box aansluiten: logt in als zichzelf, geen huis, draait lokaal (spec A).
6. App openen, account maken, mail bevestigen, QR-code scannen, nieuw huis of
   vervanging kiezen. De box ziet binnen 5 minuten zijn huis (spec A).

**Blad kwijt vóór het koppelen:** `provision-box.py --reissue SH-2026-000123`
— nieuwe code, nieuwe hash, nieuw blad; het oude werkt niet meer. Alleen voor
een box zonder huis (anders eerst ontkoppelen), zodat support nooit per
ongeluk de box van een bewoner losmaakt.

## Claimcode

- 12 tekens Crockford-base32 (geen 0/O, 1/I/L), getoond in groepen van vier:
  `K7QM-2XRP-9DTW` (~60 bits).
- Normaliseren vóór hashen: hoofdletters, zonder streepjes en spaties; `O`→`0`
  en `I`/`L`→`1` (Crockford), zodat overtikfouten met die letters niets uitmaken.
- In de database alleen `sha256(genormaliseerde code)` in
  `boxes.claim_code_hash`.
- QR-inhoud: `<APP_URL>/koppel?s=<serial>&c=<code met streepjes>`.

## Datamodel

- `boxes.claim_code_hash`: text, `hidden: true` (niet zichtbaar via de API,
  ook niet voor de box zelf; alleen superuser en hooks).
- Geen andere schemawijzigingen: `houses.claimed_at` (spec A, alleen via de
  hook te zetten), `boxes.house`, `houses.user` bestaan al.
- `users`: inloggen mag met een onbevestigd adres (de app toont dan
  "Bevestig je e-mailadres"); alleen koppelen eist `verified`.

## Endpoints (`backend/pb_hooks/claim.pb.js`)

Beide alleen voor een ingelogde `users`-gebruiker (`@request.auth.collectionName = "users"`).

**`POST /api/sandhovius/claim`** — `{serial, code, house_name}` of
`{serial, code, replace_house}`. In één transactie:

1. Niet bevestigd → 403 `Bevestig eerst je e-mailadres`.
2. Box op serial zoeken; hash van de genormaliseerde code vergelijken met
   `$security.equal`. Box onbekend of code fout → 400 `Deze code klopt niet`
   (zelfde melding, zodat niemand serienummers kan aftasten).
3. Box heeft al een huis → 409 `Deze box is al gekoppeld`, behalve als het
   huis van deze gebruiker is en hetzelfde als `replace_house` (dubbele tik:
   200 met hetzelfde antwoord).
4. `replace_house`: moet van deze gebruiker zijn (anders 404). De huidige box
   van dat huis krijgt `house = ""`. Anders: nieuw huis `{name: house_name ||
   "Thuis", user}`.
5. `box.house = huis`, `house.claimed_at = nu`. Antwoord `{house: <id>}`.

**`POST /api/sandhovius/release`** — `{house}`. Alleen de eigenaar (anders
404). De box van dat huis krijgt `house = ""`, `claimed_at` wordt leeg; het
huis met kamers, apparaten, scènes en schema's blijft. Geen box gekoppeld →
200 (niets te doen).

**Rate limit:** regel `/api/sandhovius/` 10 per 60 s (`@auth`), in een
migratie zoals in spec A.

## E-mail (`backend/pb_hooks/mail.pb.js` + migratie)

- `onBootstrap`: als `SMTP_HOST` gezet is, SMTP aan met `SMTP_HOST`,
  `SMTP_PORT`, optioneel `SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_TLS`; afzender
  `MAIL_FROM` (standaard `noreply@sandhovius.local`) en naam "Sandhovius";
  `appURL` = `APP_URL`. Niets van dit alles in git of migraties.
- Migratie: Nederlandse onderwerpregel en tekst voor de bevestigingsmail van
  `users`, link `{APP_URL}/bevestig?token={TOKEN}`. Wachtwoord-vergeten-mail
  ook in het Nederlands, link `{APP_URL}/wachtwoord?token={TOKEN}`.
- Omdat `appURL` nu de PWA is, werkt de standaardlink van PocketBase
  (`{APP_URL}/_/#/auth/confirm-password-reset/…`) niet meer: daarom krijgt de
  PWA ook een `/wachtwoord`-scherm (zie PWA). Een mail met de oude
  standaardlink mag nergens overblijven (ook e-mailwijziging: niet gebruikt in
  de app, sjabloon ongemoeid laten maar de link controleren in de handmatige
  ronde).

## Compose

- Service `mailpit` (`axllent/mailpit`, vastgepinde versie), poort 8025
  (web) en 1025 (SMTP, alleen intern).
- `pocketbase`: `SMTP_HOST=mailpit`, `SMTP_PORT=1025`,
  `APP_URL=http://localhost:3000`, volume `./backend/pb_hooks:/pb_hooks`.

## PWA

Lees `DESIGN.md` vóór het UI-werk; Nederlandse copy, zinsletters; past in de
login-bento en de bestaande sheets.

- **Login**: "Nog geen account? Account aanmaken" → e-mail, wachtwoord, herhaal.
  Daarna "We hebben een mail gestuurd naar …" + "Opnieuw sturen".
- **`/bevestig?token=…`**: bevestigt via PocketBase, toont resultaat, door naar de app.
- **`/wachtwoord?token=…`**: nieuw wachtwoord + herhaal, via
  `confirmPasswordReset`; daarna door naar de login.
- **`/koppel?s=…&c=…`**: bewaart serial en code in `sessionStorage`, door naar
  de app; na (eventueel) inloggen opent het koppelscherm ingevuld.
- **"Box toevoegen"** (lege-huisscherm en Opties): niet bevestigd → uitleg +
  "Opnieuw sturen". Anders een sheet: camera (jsQR) of "Code overtikken"
  (serienummer + code); dan "Nieuw huis" (naam) of "Vervangt de box van …";
  daarna "Wachten tot je box zich meldt…" tot de eerste hartslag
  (`houses.last_seen`) na het koppelen.
- **Huisinstellingen**: "Box ontkoppelen" met bevestiging ("Je huis en
  instellingen blijven bewaard").
- **Camera**: alleen via HTTPS of `localhost`. Op een telefoon via
  `http://192.168…` werkt alleen overtikken (komt in CLAUDE.md).

## `provision-box.py`

- Maakt bij het aanmaken een claimcode, slaat alleen de hash op, schrijft
  `<serial>.svg` (QR + serienummer + code + app-adres) via `segno` (BSD).
  `--app-url` of `APP_URL` (verplicht voor het blad).
- `--reissue <serial>`: alleen als de box geen huis heeft; nieuwe code + hash +
  blad; raakt het boxgeheim en `box.json` niet.
- Print nooit de claimcode of het geheim naar de terminal; het blad is het
  enige dat de code bevat (git-ignored: `*.svg` in de uitvoermap of een
  standaardmap buiten de repo).

## Testen

**Integratie** (harnas uit spec A, PocketBase met `--hooksDir`):

- Claim met goede code → nieuw huis van de gebruiker, box heeft dat huis,
  `claimed_at` gezet; de box logt daarna in en ziet het huis.
- Foute code en onbekend serienummer → dezelfde 400 en dezelfde tekst.
- Onbevestigd adres → 403. Gast → 401/403.
- Al gekoppeld → 409; zelfde gebruiker, zelfde huis → 200.
- Vervangen: oude box van dat huis heeft daarna geen huis.
- `replace_house` van een ander → 404, niets veranderd.
- Release door eigenaar → box vrij, code werkt weer; door een ander → 404.
- Rate limit grijpt in na 10 pogingen.
- `claim_code_hash` komt in geen enkel antwoord voor (bewoner, box).
- Reissue: oude code werkt niet meer, nieuwe wel.

**Frontend** (`node --test`): QR-link uitlezen, code normaliseren
(streepjes, spaties, kleine letters, O/I/L).

**Handmatig**: account aanmaken en bevestigen via Mailpit; tweede box
provisionen en koppelen via overtikken en via de link; vervangen; ontkoppelen;
screenshots (`scripts/screenshot.py`). De bestaande dev-box blijft gekoppeld;
test met een tweede account en een tweede box, daarna opruimen.

## Volgorde van bouwen

1. Mailpit + SMTP uit env + Nederlandse mails.
2. Hook + migratie (`claim_code_hash`, rate limit) + integratietests.
3. `provision-box.py`: claimcode, blad, `--reissue`.
4. PWA: account aanmaken, bevestigen en wachtwoord resetten.
5. PWA: koppelscherm (scanner/overtikken, nieuw/vervangen), wachten op de box, ontkoppelen.
6. CLAUDE.md, handmatige ronde.

# Claim-flow — implementatieplan

> **Status:** uitgevoerd en in `main`. Dit plan is een historisch werkdocument; waar de uitvoering afweek, staat dat in de spec en in de git-geschiedenis. De QR-link werd later `/koppel#s=…&c=…` (niet `?s=`).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een koper maakt in de PWA een account, bevestigt zijn mail en koppelt een box door de QR-code uit de handleiding te scannen (nieuw huis of vervanging); de eigenaar kan een box ontkoppelen.

**Architecture:** PocketBase-hooks (`backend/pb_hooks/`) voor SMTP uit env en de endpoints `claim`/`release`; een hash van de claimcode in `boxes.claim_code_hash`. `provision-box.py` maakt de claimcode en een printblad (SVG). De PWA krijgt account aanmaken, bevestigen, wachtwoord resetten en een koppel-sheet met camera (jsQR). Eén set testvectoren houdt de normalisatie van de code gelijk in Python, de hook en de PWA.

**Tech Stack:** PocketBase 0.40.4 (JS-hooks + migraties), Go (integratietests), Python 3 + `segno`, Next.js 16 + PocketBase JS SDK 0.28 + `jsqr` 1.4.0, Mailpit.

**Spec:** `docs/superpowers/specs/2026-10-06-claim-flow-design.md`

## Global Constraints

- Claimcode: 12 tekens uit Crockford-base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, getoond als `XXXX-XXXX-XXXX`.
- Normaliseren: hoofdletters; spaties en `-` weg; `O`→`0`, `I`→`1`, `L`→`1`. Hash = hex `sha256` van de genormaliseerde code. Testvectoren: `backend/tests/testdata/claim_codes.json` (`[{input, normalized, sha256}]`), gedeeld door Go-, Python- en node-tests.
- QR-inhoud: `<APP_URL>/koppel?s=<serial>&c=<code met streepjes>`.
- Endpoints: `POST /api/sandhovius/claim` (`{serial, code, house_name}` of `{serial, code, replace_house}`) → `{house}`; `POST /api/sandhovius/release` (`{house}`). Alleen `@request.auth.collectionName = "users"`.
- Statussen en teksten (exact): 403 `Bevestig eerst je e-mailadres` · 400 `Deze code klopt niet` (ook bij onbekend serienummer) · 409 `Deze box is al gekoppeld` · 404 voor een huis dat niet van de gebruiker is. Standaard huisnaam `Thuis`.
- Rate limit: label `/api/sandhovius/`, `@auth`, 10 per 60 s.
- `boxes.claim_code_hash`: text, `hidden: true`.
- Mailtaal: `users.language` select `nl` | `en` (leeg = `nl`); teksten in `backend/pb_hooks/mail_texts.js`; hooks `onMailerRecordVerificationSend` en `onMailerRecordPasswordResetSend` kiezen per mail; collectie-sjablonen = Nederlandse terugval.
- Mail uit env (in `onBootstrap`): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`, `MAIL_FROM` (standaard `noreply@sandhovius.local`), afzendernaam `Sandhovius`, `APP_URL` → `meta.appURL`. Mail-links: `{APP_URL}/bevestig?token={TOKEN}`, `{APP_URL}/wachtwoord?token={TOKEN}`.
- Dependencies: `jsqr` 1.4.0 (Apache-2.0), `segno` (BSD-3), Mailpit-image op een vaste versie (MIT). Niets anders erbij.
- UI: lees `DESIGN.md` vóór UI-werk; Nederlandse copy met zinsletters; nieuwe schermen als componenten in `frontend/components/` (niet `page.js` laten groeien).
- Nooit claimcodes, boxgeheimen of `.env`-waarden printen of committen; printbladen gaan naar `sheets/` (git-ignored).
- Na elke taak groen: `cd agent && go vet ./... && go test ./...`, `cd backend/tests && go test -tags integration ./...`, `cd frontend && node --test lib/*.test.js && npx next build` (vanaf de taak die het raakt), `python -m unittest discover -s scripts -p "test_*.py"` (vanaf Task 3).
- Branch `claim-flow`; commits eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Dev-data: tweede account en tweede box gebruiken en na afloop opruimen; de bestaande dev-box blijft gekoppeld.

## Review Focus

1. **Normalisatie verschilt tussen Python, hook en PWA** → geen enkele box is te claimen. Gedeelde testvectoren in Task 2 (hook), Task 3 (script) en Task 5 (PWA).
2. **`appURL` wordt de PWA** → de oude standaardlink van "Wachtwoord vergeten" breekt. Test in Task 1 (sjabloon bevat `/wachtwoord?token=`) en handmatig in Task 4.
3. **Twee mensen claimen tegelijk dezelfde box** → precies één wint. Test in Task 2 (gelijktijdige claims).
4. **Diepe link `/koppel` met een onbevestigd account** → de code blijft bewaard tot na het bevestigen en het scherm loopt niet vast. Helper-test + handmatig in Task 5.
5. **Camera niet beschikbaar** (http op het LAN, toestemming geweigerd, geen camera) → meteen overtikken, geen foutlus. Handmatig in Task 5.

---

### Task 1: Mailpit, mail uit env en Nederlandse mails

**Files:**
- Create: `backend/pb_hooks/mail.pb.js`, `backend/pb_hooks/mail_texts.js`, `backend/pb_migrations/1790740000_mail_templates.js` (sjablonen + veld `users.language`), `backend/tests/mail_test.go`
- Modify: `backend/tests/pbtest_test.go` (`startPB` start met `--hooksDir ../pb_hooks`; optionele env via `startPBEnv(t, env map[string]string) *pb`), `docker-compose.yml` (service `mailpit`; `pocketbase`: env + volume `./backend/pb_hooks:/pb_hooks`)

**Interfaces:**
- Produces: `startPBEnv(t *testing.T, env map[string]string) *pb`; `startPB(t)` = `startPBEnv(t, nil)`. Alle bestaande tests blijven werken met hooks aan.

- [ ] **Step 1: Failing tests** in `mail_test.go`:
  - `TestSMTPFromEnv`: `startPBEnv` met `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`, `APP_URL=http://pwa.test`, `MAIL_FROM=x@y.z` → superuser `GET /api/settings`: `smtp.enabled == true`, `smtp.host == "127.0.0.1"`, `smtp.port == 2525`, `meta.appURL == "http://pwa.test"`, `meta.senderAddress == "x@y.z"`, `meta.senderName == "Sandhovius"`.
  - `TestNoSMTPWithoutEnv`: zonder env → `smtp.enabled == false`.
  - `TestMailLanguage`: een kleine SMTP-vanger in de test (`net.Listen` op een vrije poort, minimaal SMTP: 220/250/354/221, berichten bewaren) als `SMTP_HOST`/`SMTP_PORT`; account met `language: "en"` → `request-verification` → onderwerp Engels en link `…/bevestig?token=`; account met `nl` en zonder language → Nederlands; zelfde voor `request-password-reset` met `/wachtwoord?token=`.
  - `TestUserLanguageField`: bewoner zet eigen `language` op `en` → 200; op `de` → 400.
  - `TestMailTemplatesDutch`: superuser `GET /api/collections/users` → `verificationTemplate.body` bevat `{APP_URL}/bevestig?token={TOKEN}` en geen `/_/#/`; `resetPasswordTemplate.body` bevat `{APP_URL}/wachtwoord?token={TOKEN}`; beide onderwerpen Nederlands (bevatten "Sandhovius").
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren.** Hook (`onBootstrap`, na `e.next()`, settings opslaan alleen als `SMTP_HOST` gezet is); migratie zet onderwerp + body van beide sjablonen (korte Nederlandse tekst, knop/link). Compose: `mailpit` (vaste tag, verifieer met `docker manifest inspect`), poort `8025:8025`; `pocketbase` env `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `APP_URL=http://localhost:3000`.
- [ ] **Step 4: Draaien, moet slagen;** daarna `docker compose up -d mailpit pocketbase` en in de admin-UI (of via de API) een testmail sturen → zichtbaar op http://localhost:8025.
- [ ] **Step 5: Commit.** `Backend: SMTP from env, Mailpit in dev, Dutch account mails`

---

### Task 2: Claim- en release-endpoint

**Files:**
- Create: `backend/pb_hooks/claim.pb.js`, `backend/pb_migrations/1790750000_claim_code.js`, `backend/tests/testdata/claim_codes.json`, `backend/tests/claim_test.go`

**Interfaces:**
- Consumes: harnas (`startPB`, `do`, `login`, `create`), `fixture` uit `rules_test.go` waar handig.
- Produces: testvectoren (minstens: `k7qm-2xrp-9dtw`, `K7QM 2XRP 9DTW`, `K7QM2XRP9DTW`, met `O`/`I`/`L` erin, met dubbele spaties) — elk met `normalized` en `sha256`; endpoints volgens Global Constraints.
- Testhelper `newBox(t, p, serial, code string) (id string)` die het record maakt met `claim_code_hash` = sha256(normalize(code)) en een wachtwoord; `verifiedUser(t, p, email) (id, token string)` (superuser zet `verified: true`).

- [ ] **Step 1: Failing tests** in `claim_test.go`:
  - `TestClaimNewHouse`: geverifieerde gebruiker, goede code (met kleine letters en spaties) → 200 `{house}`; huis heeft `user` = gebruiker, `name` = gegeven naam (of `Thuis` zonder naam), `claimed_at` gezet; box `house` = dat huis; de box logt daarna in en `GET houses/records` toont dat huis.
  - `TestClaimWrongCodeAndUnknownSerialLookTheSame`: beide → 400 met identieke body-`message` `Deze code klopt niet`.
  - `TestClaimRequiresVerified`: onbevestigd → 403 `Bevestig eerst je e-mailadres`. Gast → 401 of 403.
  - `TestClaimAlreadyClaimed`: andere gebruiker → 409 `Deze box is al gekoppeld`; zelfde gebruiker + `replace_house` = zijn huis → 200.
  - `TestClaimReplace`: gebruiker met huis H en box 1; claim box 2 met `replace_house: H` → box 2 `house` = H, box 1 `house` leeg.
  - `TestClaimReplaceOtherUsersHouse`: `replace_house` van iemand anders → 404, niets veranderd (boxen en huizen opnieuw lezen).
  - `TestClaimConcurrent` (Review Focus 3): twee geverifieerde gebruikers claimen tegelijk (goroutines) dezelfde box → precies één 200, de ander 409; box heeft één huis.
  - `TestReleaseByOwner`: release → box vrij, `claimed_at` leeg, huis bestaat nog; daarna claimt een andere gebruiker met dezelfde code → 200.
  - `TestReleaseByOther`: → 404, box nog gekoppeld.
  - `TestClaimRateLimited`: 11 foute claims binnen een minuut → minstens de 11e 429.
  - `TestClaimCodeHashNeverExposed`: na een claim: bewoner en box `GET` op `boxes`/`houses` en het claim-antwoord bevatten nergens `claim_code_hash` of de hashwaarde.
  - `TestNormalizationVectors` (Review Focus 1): voor elke vector maakt de test een box met `claim_code_hash` = vector.`sha256` en claimt met vector.`input` → 200 (dus de hook normaliseert gelijk).
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren.** Migratie: `claim_code_hash` (hidden) + rate-limitregel. Hook: `routerAdd` met `$apis.requireAuth("users")`; alles in `$app.runInTransaction`; vergelijken met `$security.equal`; normaliseren volgens Global Constraints. Hashen met `$security.sha256`.
- [ ] **Step 4: Draaien, moet slagen.**
- [ ] **Step 5: Commit.** `Backend: claim and release a box`

---

### Task 3: Claimcode en printblad in `provision-box.py`

**Files:**
- Modify: `scripts/provision-box.py`, `.gitignore` (`sheets/`)
- Create: `scripts/claimcode.py` (pure functies), `scripts/test_claimcode.py`, `scripts/requirements.txt` (`segno`)

**Interfaces:**
- Produces: `claimcode.new_code() -> str` (`XXXX-XXXX-XXXX`, `secrets.choice` uit het alfabet), `claimcode.normalize(code) -> str`, `claimcode.code_hash(code) -> str`, `claimcode.claim_url(app_url, serial, code) -> str`, `claimcode.sheet_svg(app_url, serial, code) -> str`.
- CLI: bestaande opties + `--app-url` (of env `APP_URL`; verplicht), `--sheets-dir` (standaard `sheets/`), `--reissue <serial>` (alleen voor een box zonder `house`, anders fout `Box is gekoppeld; ontkoppel hem eerst`; raakt geheim en `box.json` niet).

- [ ] **Step 1: Failing tests** (`unittest`): `test_vectors` (alle vectoren uit `backend/tests/testdata/claim_codes.json`: `normalize` en `code_hash` kloppen), `test_new_code_format` (100× regex `^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$`), `test_claim_url` (`https://a.b`, `SH-1`, `K7QM-2XRP-9DTW` → `https://a.b/koppel?s=SH-1&c=K7QM-2XRP-9DTW`; trailing slash in app-url geeft geen dubbele `/`), `test_sheet_contains_code_and_serial` (SVG bevat serial en code als tekst en een `<svg`).
- [ ] **Step 2: Draaien, moet falen.** `python -m unittest discover -s scripts -p "test_*.py"`.
- [ ] **Step 3: Implementeren;** het script slaat `claim_code_hash` op bij aanmaken en bij `--reissue`, schrijft `<sheets-dir>/<serial>.svg`, print alleen serial, record-id en het pad van het blad.
- [ ] **Step 4: Draaien, moet slagen;** handmatig: `pip install -r scripts/requirements.txt`, een testbox `SH-TEST-0002` aanmaken (zonder `--house`), blad openen in een browser en de QR met een telefoon scannen → link klopt; `--reissue SH-TEST-0002` → nieuw blad. Testbox laten staan voor Task 5 (opruimen in Task 6).
- [ ] **Step 5: Commit.** `Scripts: claim code and printable sheet per box, reissue`

---

### Task 4: PWA — account aanmaken, bevestigen, wachtwoord resetten

**Files:**
- Create: `frontend/components/SignupForm.js`, `frontend/components/VerifyNotice.js`, `frontend/app/bevestig/page.js`, `frontend/app/wachtwoord/page.js`, `frontend/lib/account.js`, `frontend/lib/account.test.js`
- Modify: `frontend/app/page.js` (login-kaart: wissel naar account aanmaken), styles in `frontend/app/styles/login.css`

**Interfaces:**
- Produces: `account.defaultLanguage(navigatorLanguages: string[]) -> "nl" | "en"` (eerste die met `nl` of `en` begint, anders `nl`), `account.validateSignup({email, password, passwordConfirm}) -> string | null` (Nederlandse foutmelding of null; wachtwoord min. 8 tekens zoals PocketBase), `account.errorMessage(err) -> string` (PocketBase-fouten → Nederlandse tekst). `VerifyNotice` (props: `email`, `onResend`) wordt in Task 5 hergebruikt.

- [ ] **Step 1: Failing tests** (`node --test`): `defaultLanguage` (`["en-GB","nl"]` → `en`, `["nl-BE"]` → `nl`, `["de"]` → `nl`, `[]` → `nl`), `validateSignup` (leeg e-mailadres, ongelijke wachtwoorden, te kort, geldig → null), `errorMessage` (bestaand e-mailadres → "Er bestaat al een account met dit e-mailadres", 429 → "Te veel pogingen, probeer het over een minuut opnieuw", onbekend → algemene tekst).
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren** (lees `DESIGN.md`): aanmaken via `pb.collection('users').create` (met `language`) + `requestVerification`; taalkeuze in het formulier en "Taal van e-mails" in Opties (`SettingsView`), daarna `VerifyNotice`; `/bevestig` → `confirmVerification(token)`; `/wachtwoord` → nieuw wachtwoord + herhaal → `confirmPasswordReset`. Na bevestigen ververst de app de auth (`authRefresh`) zodat `verified` klopt.
- [ ] **Step 4: Verifiëren.** Tests + `npx next build` groen; `docker compose up -d --build frontend`; handmatig: account aanmaken met een testadres, mail in Mailpit, link openen → bevestigd; "Wachtwoord vergeten" → mail → `/wachtwoord` → nieuw wachtwoord → inloggen (Review Focus 2); screenshots 1440×900 en 390×844 (`scripts/screenshot.py`).
- [ ] **Step 5: Commit.** `App: create an account, confirm the email, reset the password`

---

### Task 5: PWA — box koppelen en ontkoppelen

**Files:**
- Create: `frontend/components/ClaimSheet.js`, `frontend/components/QrScanner.js`, `frontend/app/koppel/page.js`, `frontend/lib/claim.js`, `frontend/lib/claim.test.js`
- Modify: `frontend/package.json` (`jsqr` 1.4.0), `frontend/app/page.js` ("Box toevoegen" in het lege-huisscherm en Opties; open de sheet als `sessionStorage` een code heeft), `frontend/components/HouseModal.js` of `SettingsView.js` ("Box ontkoppelen"), styles

**Interfaces:**
- Consumes: `VerifyNotice` (Task 4); endpoints (Task 2).
- Produces: `claim.normalize(code) -> string`, `claim.parseClaimLink(text) -> {serial, code} | null` (accepteert de volledige link, ook met andere host; geeft null voor andere tekst), `claim.pendingKey = "sandhovius.claim"`, `claim.claimErrorMessage(status, message) -> string`.

- [ ] **Step 1: Failing tests** (`node --test`): `normalize` met alle vectoren uit `backend/tests/testdata/claim_codes.json` (Review Focus 1), `parseClaimLink` (geldige link, link met andere host, zonder `c`, willekeurige tekst → null), `claimErrorMessage` (403/400/409/429 → de teksten uit Global Constraints en "Te veel pogingen…").
- [ ] **Step 2: Draaien, moet falen.**
- [ ] **Step 3: Implementeren.**
  - `/koppel`: `parseClaimLink(location.href)` → `sessionStorage[pendingKey]`, door naar `/`.
  - `ClaimSheet`: onbevestigd → `VerifyNotice` (code blijft in `sessionStorage`; na bevestigen opent de sheet weer — Review Focus 4). Anders: `QrScanner` (getUserMedia + jsQR; bij geen camera/geweigerd/geen HTTPS meteen het overtikformulier tonen met een korte uitleg, geen herhaalde prompts — Review Focus 5) of "Code overtikken" (serienummer + code). Dan "Nieuw huis" (naam, standaard "Thuis") of "Vervangt de box van …" (eigen huizen). Na succes: "Wachten tot je box zich meldt…" tot `houses.last_seen` van dat huis nieuwer is dan het moment van koppelen (realtime op `houses` bestaat al); daarna naar Home van dat huis.
  - "Box ontkoppelen" in de huisinstellingen: bevestiging ("Je huis en instellingen blijven bewaard") → `release`.
- [ ] **Step 4: Verifiëren.** Tests + build groen; `docker compose up -d --build frontend`. Handmatig met het testaccount uit Task 4 en `SH-TEST-0002` uit Task 3: koppelen via overtikken (nieuw huis "Test") en via de link uit het blad; een tweede testbox als vervanging; ontkoppelen; QR-scannen op `localhost` met een webcam als die er is, anders noteren. Een box die zich echt meldt kan alleen de dev-box zijn: de wachtstand mag hier blijven hangen voor de testboxen — noteer dat en controleer de wachtstand met de dev-box door die eerst te ontkoppelen en via een `--reissue` + claim opnieuw aan je eigen huis (Thuis) te koppelen (huis-id `45lpedg4nbwbmgv` blijft hetzelfde: kies "Vervangt de box van Thuis"). Screenshots 1440×900 en 390×844.
- [ ] **Step 5: Commit.** `App: link a box with its QR code, replace or unlink it`

---

### Task 6: Docs en opruimen

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md:** status (claim-flow, Mailpit `localhost:8025`, mail uit env, `/bevestig`, `/wachtwoord`, `/koppel`), belangrijke bestanden (`backend/pb_hooks/`, `scripts/claimcode.py`, nieuwe componenten), dev setup (`pip install -r scripts/requirements.txt`, Python-tests, provisionen met `--app-url`, `--reissue`), de camera-voorwaarde (HTTPS of `localhost`), volgende stappen (spec B klaar; fase 3: SMTP-provider, echte `APP_URL`).
- [ ] **Step 2: Opruimen:** testaccounts, testhuizen en testboxen (`SH-TEST-*`) verwijderen via de superuser; `sheets/` leegmaken; Mailpit-berichten wissen. De dev-box is gekoppeld aan `45lpedg4nbwbmgv` en logt in (agent-log "Box hoort bij huis").
- [ ] **Step 3: Alle suites groen** (Global Constraints), commit `Docs: claim flow in CLAUDE.md`.

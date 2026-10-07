# Huisgenoten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meerdere bewoners per huis (beheerders en huisgenoten), uitnodigen per e-mail, favorieten per persoon.

**Architecture:** `houses.user` wordt `members` + `admins` (meervoudige relaties naar `users`); alle bewonersregels gaan van `user =` naar `members ?=`. Lidmaatschap wijzigen kan alleen via PocketBase-hooks (`backend/pb_hooks/household.pb.js`), die de invariant "admins ⊆ members, admins nooit leeg" bewaken. Nieuwe collecties `favorites` en `invitations`; de PWA leest favorieten per gebruiker en krijgt een sectie Huisgenoten.

**Tech Stack:** PocketBase 0.40.4 (JS-migraties en -hooks), Go-integratietests (`backend/tests`, `-tags integration`), Next.js 16 PWA, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-07-household-design.md`

## Global Constraints

- UI-copy Nederlands, zinsletters, geen hoofdletter-labels; `DESIGN.md` (Named Rules) en `PRODUCT.md` lezen vóór UI-werk.
- Foutteksten van endpoints in het Nederlands, vorm `{status, message, data: {}}` (zoals `claim.pb.js`).
- Elke bewonerstak begint met `@request.auth.collectionName = "users"`; box-takken blijven zoals ze zijn (behalve de `forbid`-lijsten die hier genoemd worden).
- Regelmigraties controleren eerst dat de huidige regel exact de verwachte is en stoppen anders (patroon `1790730000_resident_rules_users_only.js`), en hebben een werkende `down`.
- Hooks: helpers binnen de handler (PocketBase-VM ziet niets daarbuiten); gedeelde code via `require(`${__hooks}/…`)`; alles wat records wijzigt in `$app.runInTransaction`.
- Rollen: `admin` / `member`; in de UI "Beheerder" / "Huisgenoot". Uitnodiging verloopt na 7 dagen. Rate limit `invitations:create` 20 per 3600 s (`@auth`).
- E-mailadressen altijd in kleine letters vergelijken en opslaan.
- Na elke task: `cd backend/tests && go test -tags integration ./...` groen; bij frontendwijzigingen ook `cd frontend && node --test lib/*.test.js && npx next build`.
- Geen echte apparaten schakelen; geheimen (`.env`, `box.json`, `sheets/`) niet printen of committen. Commits op branch `household`.

## Review Focus

1. **Hoofdletters in e-mail**: uitnodiging voor `Jan@Example.nl`, account `jan@example.nl` → genodigde ziet en accepteert hem. (Task 3, test `TestInviteEmailCase`.)
2. **Rol lekt tussen huizen**: beheerder van B en huisgenoot van A mag A niet hernoemen, niemand in A uitnodigen en de box van A niet ontkoppelen. (Task 1 `TestRoleDoesNotLeakBetweenHouses`, Task 3 `TestInviteOnlyAdminOfThatHouse`.)
3. **HTML in huis- of naam**: huisnaam `<b>Thuis</b>` of naam met `<script>` komt geëscaped in de mail. (Task 3, `TestInviteMailEscapes`.)
4. **Dubbel accepteren / ingetrokken uitnodiging**: tweede accept of accept na intrekken → 404, geen dubbel lid. (Task 3, `TestAcceptTwice`.)
5. **Weggaan zonder huis over**: wie zijn enige huis verlaat, ziet daarna het lege scherm met eventuele uitnodigingen, geen foutmelding of oud huis. (Task 4, handmatig + `pickHouse`-test in `lib/household.test.js`.)

---

### Task 1: Leden en beheerders op het huis, regels, claim

**Files:**
- Create: `backend/pb_migrations/1790760000_house_members.js`
- Modify: `backend/pb_hooks/claim.pb.js` (regels 60, 75, 92, 118)
- Modify: `backend/tests/rules_test.go` (fixture, `TestBoxCannotCreateOrDelete` body `houses`), `backend/tests/boxes_test.go:69,84`, `backend/tests/claim_test.go:93,237`, `backend/tests/guest_test.go:39`
- Create: `backend/tests/household_test.go`

**Interfaces:**
- Produces: `houses.members`, `houses.admins` (relation → `users`, `maxSelect` 0 = onbeperkt, niet verplicht in schema). Testhelper `newHouse(t, p, name string, admins []string, members []string) string` in `household_test.go` (zet admins ook in members).
- Produces regels (bewonerstak, binnen de `USERS && (...)`-wrapper):
  - houses: list/view `members ?= @request.auth.id`; update `admins ?= @request.auth.id && ` + forbid `members, admins, weather, weather_updated, claimed_at`; create/delete `null`.
  - devices `gateway.members ?= @request.auth.id` (create: `@request.body.gateway.members ?= @request.auth.id`); device_state `device.gateway.members ?=`; commands `device.gateway.members ?=` / `scene.house.members ?=`; scenes, schedules, rooms `house.members ?=` (create `@request.body.house.members ?=`). Alle overige voorwaarden in die regels blijven letterlijk gelijk.
  - houses box-updateRule: forbid `members, admins, name, claimed_at` (i.p.v. `user, name, claimed_at`).

- [ ] **Step 1: Tests aanpassen en toevoegen**
  - Fixtures maken huizen met `{"members": [u], "admins": [u]}` i.p.v. `"user"`; `claim_test.go:93` controleert `members` en `admins` = `[uid]`.
  - `household_test.go`:
    - `TestHousemateCanOperate`: huisgenoot M van huis A ziet A's house/device/scene/room/schedule, kan een command maken, een kamer en scène aanmaken en een device hernoemen.
    - `TestHousemateCannotAdmin`: M krijgt ≥400 op PATCH house `name`, PATCH `members`, PATCH `admins`, en 404 op `/api/sandhovius/release` voor A.
    - `TestAdminCannotPatchMembership`: beheerder krijgt ≥400 op PATCH `members` of `admins` (alleen via endpoints).
    - `TestRoleDoesNotLeakBetweenHouses`: user X is beheerder van B en huisgenoot van A → X mag B hernoemen, A niet; release van A → 404.
    - `TestNonMemberSeesNothing`: user zonder huis ziet in alle zeven collecties niets.
- [ ] **Step 2: Draaien** — `cd backend/tests && go test -tags integration ./...` → FAIL (veld `members` bestaat niet).
- [ ] **Step 3: Migratie `1790760000_house_members.js`**
  - up: velden `members` en `admins` toevoegen; elk huis met `user` → `members = admins = [user]`; regels herschrijven (oud = de stand na 1790730000, letterlijk uitgeschreven zoals daar, met de check-en-stop); veld `user` verwijderen.
  - down: `user` terug (eerste admin), regels terug, `members`/`admins` weg.
- [ ] **Step 4: `claim.pb.js`** — vervangen: `house.getString("user") !== user.id` → `!house.getStringSlice("admins").includes(user.id)` (regel 60 en release regel 118); regel 75 → `members` bevat user; nieuw huis: `house.set("members", [user.id]); house.set("admins", [user.id])`. Commentaar "eigenaar" → "beheerder".
- [ ] **Step 5: Draaien** — integratietests → PASS.
- [ ] **Step 6: Live migratie** — `docker compose restart pocketbase`; als superuser het dev-huis `45lpedg4nbwbmgv` ophalen en controleren dat `members` en `admins` de testgebruiker bevatten; inloggen in de PWA → Home laadt.
- [ ] **Step 7: Commit** — `Backend: houses have members and admins instead of one user`.

### Task 2: Favorieten per persoon

**Files:**
- Create: `backend/pb_migrations/1790770000_favorites.js`
- Create: `frontend/lib/favorites.js`, `frontend/lib/favorites.test.js`
- Modify: `frontend/app/page.js` (fetchAll ±407, realtime ±215–260, `toggleFavorite` ±924, `moveFavorite` ±958, `addDevice` ±1009, `favoriteDevices` ±1337), `frontend/components/DeviceSettingsModal.js:149-155` (prop `favorite` i.p.v. `device.favorite`)
- Modify: `scripts/seed.py` (lokaal, niet in git: favorieten als `favorites`-records)
- Test: `backend/tests/household_test.go`

**Interfaces:**
- Consumes: `houses.members` (Task 1).
- Produces: collectie `favorites` {`user` relation users required, `device` relation devices required cascadeDelete, `order` number}, unieke index `(user, device)`. Regels: list/view/delete `USERS && user = @request.auth.id && device.gateway.members ?= @request.auth.id`; create `USERS && @request.body.user = @request.auth.id && @request.body.device.gateway.members ?= @request.auth.id`; update `USERS && user = @request.auth.id && @request.body.user:isset = false && @request.body.device:isset = false`. Geen box-tak.
- Produces `frontend/lib/favorites.js`:
  - `favoriteDevices(devices, favorites) → device[]` (alleen niet-`climate`, gesorteerd op `order`, dan naam `localeCompare(…,'nl')`);
  - `favoriteFor(favorites, deviceId) → record | undefined`;
  - `nextOrder(favorites) → number` (max + 1, 1 bij leeg).

- [ ] **Step 1: Tests**
  - Go `TestFavoritesArePersonal`: A en M in hetzelfde huis; A maakt favoriet → M ziet hem niet; M kan geen favoriet met `user = A` maken; X (geen lid) kan geen favoriet op A's device maken; device verwijderen → favoriet weg.
  - Go `TestFavoritesMigrated` is niet nodig in de testserver (lege DB); de omzetting wordt in Step 5 live gecontroleerd.
  - JS: `favoriteDevices` sorteert op order en laat thermostaten weg; `favoriteFor` vindt per device; `nextOrder([])===1`, `nextOrder([{order:3},{order:1}])===4`.
- [ ] **Step 2: Draaien** → FAIL.
- [ ] **Step 3: Migratie** — collectie + regels; elk device met `favorite = true` → één favoriet per lid van `device.gateway` met `order = favorite_order`; velden `favorite` en `favorite_order` weg; devices box-updateRule: `"favorite", "favorite_order"` uit de forbid-lijst (exacte oude regel checken). down: velden terug, favorieten van de eerste admin terugzetten, collectie weg.
- [ ] **Step 4: PWA** — `favorites` ophalen in `fetchAll` en realtime abonneren (`create/update/delete` in state); "Op Home tonen" maakt/verwijdert een favoriet (`{user: pb.authStore.record.id, device, order: nextOrder(...)}`); volgorde wisselt `order` op twee favorieten; eerste nieuw apparaat krijgt een favoriet na het aanmaken; `favoriteDevices` via de helper.
- [ ] **Step 5: Draaien en live** — integratietests, `node --test`, `npx next build` → PASS. `docker compose restart pocketbase && docker compose up -d --build frontend`; Home toont dezelfde favorieten als vóór de migratie; aan/uit zetten in de detail-sheet werkt. `scripts/seed.py` bijwerken.
- [ ] **Step 6: Commit** — `Favorites per person instead of per device`.

### Task 3: Uitnodigingen en lidmaatschap-endpoints

**Files:**
- Create: `backend/pb_migrations/1790780000_invitations.js`
- Create: `backend/pb_hooks/household.pb.js`
- Modify: `backend/pb_hooks/mail_texts.js` (soort `invitation`, `nl` + `en`)
- Test: `backend/tests/household_test.go` (SMTP-catcher uit `mail_test.go` hergebruiken)

**Interfaces:**
- Consumes: `houses.members/admins` (Task 1), `favorites` (Task 2).
- Produces collectie `invitations`: `house` (relation houses, cascadeDelete), `email` (email, required), `role` (select `admin`|`member`, required), `invited_by` (relation users), `house_name` (text), `inviter_name` (text), `expires` (date). Unieke index `(house, email)`. Regels:
  - list/view: `USERS && (house.admins ?= @request.auth.id || (email = @request.auth.email && @request.auth.verified = true))`
  - create: `USERS && @request.body.house.admins ?= @request.auth.id && @request.body.invited_by = @request.auth.id`
  - update: `null`; delete: zelfde als view.
  - rate limit `invitations:create` 20/3600 `@auth`.
- Produces hooks in `household.pb.js`:
  - `onRecordCreateRequest` (invitations): `email` → kleine letters, trim; al lid (een lid met dat e-mailadres) → 400 "Al lid van dit huis"; bestaande uitnodiging `(house, email)` verwijderen; `expires` = nu + 7 dagen; `house_name` en `inviter_name` (naam, anders e-mail) zetten.
  - `onRecordAfterCreateSuccess` (invitations): mail naar `email`, taal van de uitnodiger, link `<appURL>/uitnodiging`.
  - `GET /api/sandhovius/houses/{id}/members` → 200 `{items: [{id, name, email, role}]}` (admins eerst, dan op naam), niet-lid → 404.
  - `POST /api/sandhovius/invitations/{id}/accept` → 200 `{house}`; niet gevonden of ander adres → 404 "Uitnodiging niet gevonden"; onbevestigd → 403 "Bevestig eerst je e-mailadres"; verlopen → 410 "Deze uitnodiging is verlopen"; al lid → uitnodiging weg, 200.
  - `PATCH /api/sandhovius/houses/{id}/members/{user}` body `{role}` → 200; geen beheerder → 404; lid onbekend → 404; laatste beheerder degraderen → 409 "Er moet minstens één beheerder blijven".
  - `DELETE /api/sandhovius/houses/{id}/members/{user}` → 204; toegestaan voor beheerder of `user = auth.id`; zelfde 409; verwijdert ook de favorieten van die user voor devices van dit huis.
  - Alle endpoints `$apis.requireAuth("users")`.
- `mail_texts.js` export `invitation(language, inviter, houseName, link) → {subject, html}`; nl-onderwerp: `<inviter> nodigt je uit voor <houseName>`; inviter en huisnaam geëscaped.

- [ ] **Step 1: Tests** (`household_test.go`)
  - `TestInviteOnlyAdminOfThatHouse`: huisgenoot van A en beheerder van B kan niet voor A uitnodigen (≥400); beheerder van A wel (200), mail ontvangen met `/uitnodiging`.
  - `TestInviteExistingMember` → 400 "Al lid van dit huis". `TestInviteReplaces`: tweede uitnodiging zelfde adres → één record, nieuwe rol.
  - `TestInviteEmailCase`: uitnodiging `Jan@Example.nl`, bevestigde user `jan@example.nl` ziet hem en accepteert → lid.
  - `TestInviteMailEscapes`: huisnaam `<b>Thuis</b>` → mail bevat `&lt;b&gt;`.
  - `TestAcceptRules`: ander adres → 404; onbevestigd → 403; verlopen (`expires` als superuser in het verleden) → 410; geldig met rol admin → in `members` en `admins`, uitnodiging weg.
  - `TestAcceptTwice`: tweede accept → 404; ingetrokken (DELETE door beheerder) → 404.
  - `TestInviteeCanDecline`: genodigde DELETE → 204; een andere user ziet hem niet.
  - `TestMembersEndpoint`: lid krijgt naam/e-mail/rol van alle leden, niet-lid 404.
  - `TestLastAdmin`: enige beheerder kan zich niet degraderen of verwijderen (409); met twee beheerders wel.
  - `TestLeaveCleansFavorites`: huisgenoot verlaat het huis → 204, favorieten op devices van dat huis weg, favorieten in een ander huis blijven.
  - `TestHousemateCannotManage`: huisgenoot PATCH rol of DELETE een ander → 404.
- [ ] **Step 2: Draaien** → FAIL.
- [ ] **Step 3: Migratie, hooks en teksten** zoals in Interfaces.
- [ ] **Step 4: Draaien** → PASS; daarna `docker compose restart pocketbase` en één uitnodiging via curl/PocketBase naar een testadres, mail zichtbaar in Mailpit (http://localhost:8025); testuitnodiging weer verwijderen.
- [ ] **Step 5: Commit** — `Backend: invitations and membership endpoints`.

### Task 4: PWA — huisgenoten, uitnodigingen, rechten

**Files:**
- Create: `frontend/lib/household.js`, `frontend/lib/household.test.js`
- Create: `frontend/components/HouseholdSection.js` (in Opties), `frontend/components/InviteSheet.js`, `frontend/components/MemberSheet.js`, `frontend/components/InvitationCard.js`
- Create: `frontend/app/uitnodiging/page.js`
- Modify: `frontend/components/SettingsView.js` (sectie Huisgenoten na "Huis"; "Box toevoegen" blijft), `frontend/components/HouseModal.js` (huisnaam en box-blok alleen voor beheerders, prop `isAdmin`), `frontend/app/page.js` (invitations ophalen + realtime, `noHouse` met uitnodigingen, kaart bovenaan Home), `frontend/app/styles/*.css` waar nodig

**Interfaces:**
- Consumes: endpoints en collecties uit Task 3.
- Produces `lib/household.js`:
  - `roleLabel(role) → 'Beheerder' | 'Huisgenoot'`;
  - `isAdmin(house, userId) → boolean`;
  - `expiresText(expires, now) → 'verloopt vandaag' | 'verloopt morgen' | 'verloopt over N dagen' | 'verlopen'`;
  - `pickHouse(houses, selectedId) → house | undefined` (gekozen huis, anders eerste, anders `undefined`; vervangt de inline `houses.find(...) ?? houses[0]`).

- [ ] **Step 1: JS-tests** voor de vier helpers (o.a. `expiresText` bij 0, 1, 5 dagen en verleden; `pickHouse` met verdwenen `selectedId` → eerste; lege lijst → `undefined`).
- [ ] **Step 2: Draaien** → FAIL; helpers schrijven → PASS.
- [ ] **Step 3: Opties → Huisgenoten** (`HouseholdSection`): laadt `/api/sandhovius/houses/{id}/members` en de uitnodigingen van het huis. Lijst: naam (of e-mail), rol, "jij" bij jezelf. Beheerder: knop "Uitnodigen" (`InviteSheet`: e-mailveld + keuze Huisgenoot/Beheerder, standaard Huisgenoot, verstuurt `invitations.create`, toast "Uitnodiging verstuurd naar …"); tik op lid → `MemberSheet` (rolkeuze, "Verwijderen" met bevestiging, fouten zoals 409 als tekst); tik op uitnodiging → "Intrekken". Huisgenoot: lijst alleen lezen + "Huis verlaten" (bevestiging "Je verliest de toegang tot <huis>."). Na verlaten of eigen verwijdering: `fetchAll()` en naar Home.
- [ ] **Step 4: Genodigde** — `page.js` haalt `invitations` op waar `email` de eigen is (de lijstregel filtert al) en abonneert realtime. `InvitationCard` bovenaan Home en in `noHouse`: "<inviter_name> nodigt je uit voor <house_name>" + Accepteren / Weigeren; verlopen: "Deze uitnodiging is verlopen" + Weghalen. Accepteren → endpoint → `fetchAll()` → `selectHouse(house)`. Zonder huis maar met uitnodiging: kaart(en) i.p.v. de tekst "Er is nog geen huis…" (de knop "Box toevoegen" blijft eronder).
- [ ] **Step 5: `/uitnodiging`** — client-pagina die meteen `router.replace('/')` doet (login/aanmaken en de kaart doen de rest).
- [ ] **Step 6: Rechten** — `HouseModal`: huis hernoemen en het box-blok alleen tonen als `isAdmin`; Opties "Box toevoegen" mag blijven (claimen maakt een eigen huis).
- [ ] **Step 7: Verifiëren** — `node --test lib/*.test.js && npx next build` → PASS; `docker compose up -d --build frontend` (bij een cache-probleem `--no-cache`, zie `docs/development.md`). Handmatig met een tweede account (Mailpit): uitnodigen, aanmaken via de mail, accepteren, rol wijzigen, verlaten (Review Focus 5), en daarna het tweede account en de testuitnodigingen opruimen. Screenshots Opties licht en donker, 1440 en 500 breed (`scripts/screenshot.py`).
- [ ] **Step 8: Commit** — `PWA: household members, invitations and admin-only house settings`.

### Task 5: Documentatie

**Files:** `backend_explained.md`, `docs/status.md`, `docs/codebase.md`, `DESIGN.md`, `docs/box-aanmelden.md` (claimer wordt beheerder)

- [ ] **Step 1:** Bijwerken: datamodel (`members`/`admins`, `favorites`, `invitations`), regels, endpoints, rate limit; status "Huisgenoten" onder Gebouwd met de spec-link; bekende beperking: wie door een ander uit een huis wordt gehaald, ziet het huis tot de volgende verversing (realtime stuurt geen update naar wie de regel niet meer haalt); DESIGN.md: sectie Huisgenoten, uitnodigingskaart.
- [ ] **Step 2: Commit** — `Docs: household members`.

# Huisgenoten — ontwerp

Datum: 2026-10-07 · Status: ter review

## Doel

Een huis heeft nu precies één bewoner (`houses.user`). Een huishouden wil met
meerdere mensen hetzelfde huis bedienen, ieder met een eigen account en een
eigen Home. Een beheerder nodigt anderen uit op e-mailadres en bepaalt hun rol.

## Vastgelegde keuzes (uit het gesprek)

| Vraag | Keuze | Waarom |
|---|---|---|
| Rollen | **Beheerder** en **huisgenoot**; meerdere beheerders per huis; altijd minstens één | Huishouden richt samen in; onomkeerbare dingen bij beheerders; een huis wordt nooit onbeheerd. Een derde rol "alleen bedienen" kan later. |
| Uitnodigen | Op e-mailadres; de uitnodiging hoort bij dat adres (geen token in de link) | Je weet wie er binnenkomt; een doorgestuurde mail is waardeloos. Deelbare link en QR afgewezen. |
| Favorieten | Per persoon (collectie `favorites`) | Ieder een eigen Home; anders verandert één huisgenoot Home voor iedereen. |
| Lidmaatschap opslaan | Twee lijstvelden op het huis: `members` en `admins` | Regels blijven eenduidig (`members.id ?= @request.auth.id`). Een collectie `memberships` afgewezen: een regel met twee voorwaarden op "dezelfde" rij kan in PocketBase twee verschillende rijen matchen (huisgenoot hier, beheerder elders). |

## Rechten

| Wat | Huisgenoot | Beheerder |
|---|---|---|
| Bedienen, scènes uitvoeren, eigen favorieten | ✓ | ✓ |
| Apparaten, kamers, scènes en schema's maken/wijzigen/verwijderen | ✓ | ✓ |
| Leden en uitnodigingen zien | ✓ | ✓ |
| Huis verlaten | ✓ | ✓ (niet als laatste beheerder) |
| Uitnodigen, intrekken, rol wijzigen, lid verwijderen | | ✓ |
| Huis hernoemen of verwijderen, box koppelen/vervangen/ontkoppelen | | ✓ |

## Data

**`houses`**
- `members` (relatie naar `users`, meervoudig) en `admins` (idem) vervangen
  `user`. Invariant: `admins ⊆ members`, `admins` nooit leeg.
- Migratie: elke `user` gaat in `members` én `admins`; daarna verdwijnt `user`.
- Niemand mag `members`/`admins` via een gewone PATCH zetten (ook een
  beheerder niet); wijzigen gaat alleen via de endpoints hieronder, zodat de
  invariant op één plek bewaakt wordt.

**`favorites`** (nieuw): `user`, `device`, `order` (getal), uniek op
`(user, device)`.
- Je ziet, maakt, wijzigt en verwijdert alleen je eigen favorieten, en alleen
  voor een apparaat van een huis waar je lid van bent
  (`user = @request.auth.id && device.gateway.members.id ?= @request.auth.id`;
  bij aanmaken `@request.body.user = @request.auth.id`).
- Migratie: elk device met `favorite = true` wordt een favoriet van de
  (oude) `houses.user` met `order = favorite_order`; daarna verdwijnen
  `devices.favorite` en `favorite_order` (ook uit de box-`forbid`-lijst).
- Verwijderen van een device of het verlaten van een huis ruimt de favorieten
  op (cascade op `device`; hook bij weggaan).

**`invitations`** (nieuw): `house`, `email` (kleine letters), `role`
(`admin`|`member`), `invited_by` (relatie `users`), `expires` (datum, +7 dagen).
Uniek op `(house, email)`.
- Zien: beheerders van het huis, of de genodigde
  (`email = @request.auth.email`, alleen met bevestigd account).
- Aanmaken: alleen een beheerder van dat huis, `invited_by` = jezelf,
  `expires` wordt door een hook gezet. Al lid → fout "Al lid van dit huis".
  Bestaat er al een uitnodiging voor dat adres in dat huis, dan vervangt de
  hook de oude (nieuwe verloopdatum, nieuwe rol, nieuwe mail).
- Verwijderen: beheerder ("Intrekken") of de genodigde ("Weigeren").
- Niet wijzigbaar (rol aanpassen = opnieuw uitnodigen).
- Rate limit `invitations:create` 20 per uur.

## Regels

Overal waar nu `…user = @request.auth.id` staat (houses, devices,
device_state, commands, rooms, scenes, schedules, …) wordt het
`…members.id ?= @request.auth.id`. De `USERS`-guard
(`@request.auth.collectionName = "users"`) en de box-takken blijven zoals in
1790730000. `houses`:
- list/view: `members.id ?= @request.auth.id`
- update: `admins.id ?= @request.auth.id` en geen `members`, `admins`,
  `claimed_at`, `weather`, `weather_updated` in de body
- delete: blijft `null` (verwijderen loopt zoals nu)

De migratie schrijft de regels volledig uit en controleert eerst dat de
huidige regels de verwachte zijn (zoals 1790730000).

## Endpoints (PocketBase-hooks, `backend/pb_hooks/household.pb.js`)

Alle vereisen een ingelogde `users`-bewoner.

| Endpoint | Wie | Doet |
|---|---|---|
| `GET /api/sandhovius/houses/{id}/members` | lid | Lijst `{id, name, email, role}` (`users` blijft dicht voor anderen) |
| `POST /api/sandhovius/invitations/{id}/accept` | genodigde, bevestigd, niet verlopen | Voegt toe aan `members` (+ `admins` bij rol admin), verwijdert de uitnodiging, geeft het huis terug |
| `PATCH /api/sandhovius/houses/{id}/members/{user}` `{role}` | beheerder | Rol wijzigen; laatste beheerder degraderen → 409 |
| `DELETE /api/sandhovius/houses/{id}/members/{user}` | beheerder, of jezelf (verlaten) | Uit `members` en `admins`, favorieten van dat huis weg; laatste beheerder → 409 |

Alles in één transactie. Foutteksten in het Nederlands.

**Claim-flow** (`claim.pb.js`): een nieuw huis krijgt de claimer in `members`
en `admins`; vervangen en ontkoppelen (`/release`) mag alleen een beheerder van
dat huis (`admins` i.p.v. `user`); "al gekoppeld aan een eigen huis" kijkt naar
`members`.

**Mail** (`mail_texts.js`): uitnodigingsmail in de taal van de uitnodiger
("David nodigt je uit voor Thuis"), link `<APP_URL>/uitnodiging`.

## PWA

Lees `DESIGN.md` en `PRODUCT.md` vóór het UI-werk.

- **Favorieten**: `page.js` leest `favorites` (realtime) i.p.v.
  `devices.favorite`; "Op Home tonen", volgorde en het eerste nieuwe apparaat
  automatisch als favoriet werken per persoon.
- **Opties → Huisgenoten**: lijst (naam, rol "Beheerder"/"Huisgenoot", "jij"),
  daaronder openstaande uitnodigingen ("Uitgenodigd · verloopt over 5 dagen").
  - Beheerder: "Uitnodigen" (sheet: e-mail + rol), tik op een lid → sheet met
    rolkeuze en "Verwijderen", tik op een uitnodiging → "Intrekken".
  - Huisgenoot: alleen lezen, plus "Huis verlaten" (met bevestiging).
- **Genodigde**: kaart bovenaan Home "David nodigt je uit voor Thuis" met
  Accepteren / Weigeren. Zonder huis toont het lege scherm de uitnodiging(en)
  in plaats van "Koppel je box". `/uitnodiging` stuurt naar inloggen/aanmaken
  en daarna naar Home.
- **Alleen voor beheerders zichtbaar**: box ontkoppelen/vervangen, huis
  hernoemen en verwijderen.

## Agent

Geen wijziging: de box kent alleen zijn huis. Controleren dat de agent nergens
`houses.user` of `devices.favorite` gebruikt.

## Buiten scope

- Derde rol (alleen bedienen), gasttoegang met tijdslimiet.
- Een lid zien wie wat heeft geschakeld (activiteitenlog).
- Meldingen naar andere leden.

## Testen

- **Integratie** (`backend/tests`, `-tags integration`):
  - huisgenoot kan bedienen, apparaten/kamers/scènes beheren, maar niet
    hernoemen, uitnodigen, `members`/`admins` zetten of de box ontkoppelen;
  - niet-lid ziet niets; lid van huis A ziet niets van huis B, ook niet als hij
    in B beheerder is en in A huisgenoot (rol lekt niet tussen huizen);
  - uitnodigen: alleen beheerder, al-lid-fout, vervangen, mail in Mailpit-mock;
  - accepteren: verkeerd adres, onbevestigd, verlopen → geweigerd;
  - laatste beheerder kan niet degraderen of weggaan; weggaan ruimt favorieten op;
  - favorieten: alleen eigen, alleen voor apparaten van eigen huizen;
  - migratie: eigenaar wordt lid + beheerder, favorieten overgezet;
  - claim/release met `admins`.
- **PWA**: `node --test` voor nieuwe helpers (rol-tekst, verlooptekst);
  `next build`.
- **Handmatig**: tweede account (Mailpit) uitnodigen, accepteren, rol wijzigen,
  verlaten; screenshots licht/donker.

## Volgorde van bouwen

1. Migratie `houses.members/admins` + regels; claim/release aanpassen; tests.
2. `favorites` + migratie; PWA-favorieten omzetten.
3. `invitations` + mail + endpoints (members, accept, rol, verwijderen); tests.
4. PWA: Huisgenoten in Opties, uitnodigingskaart, `/uitnodiging`, knoppen
   alleen voor beheerders.
5. Docs (`backend_explained.md`, `docs/status.md`, `docs/codebase.md`,
   `DESIGN.md`), handmatige ronde.

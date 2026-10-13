# Taal van de app — ontwerp

Datum: 2026-10-13 · Status: gebouwd (stap 1–3, branch `feat/app-language`) · Bouwt op: claim-flow
(`2026-10-06-claim-flow-design.md`, de mailtaal per account)

## Doel

De bewoner kiest in Opties één **Taal** (Nederlands of English) en de hele
app volgt: elke tekst, getallen, datums en tijden. De mails gaan in dezelfde
taal. Een taal erbij is later een berichtenbestand plus een optie, geen
werk in de componenten.

## Vastgelegde keuzes (uit het gesprek)

| Vraag | Keuze | Waarom |
|---|---|---|
| Waar staat de taal? | `users.language` (`nl`, `en`), dezelfde als nu voor de mails | Eén instelling voor app en mail; geen schemawijziging. De taal reist mee naar een nieuw apparaat. |
| Instelling | Opties → Account: **Taal** (Nederlands / English) vervangt "Taal van e-mails" | Twee talen (app en mail) uit elkaar laten lopen heeft geen nut voor deze gebruiker. |
| Vóór het inloggen | Browsertaal (`navigator.languages`: de eerste die `nl` of `en` is, anders `nl`), onthouden in `localStorage` (`sandhovius-language`) | Login, `/bevestig`, `/wachtwoord`, `/uitnodiging` en `/koppel` hebben nog geen account. |
| Na het inloggen | De taal van het account wint en gaat naar `localStorage` | Een gedeelde telefoon of een nieuwe telefoon toont meteen jouw taal. |
| Taal in de URL (`/en/...`) | Nee | Een geïnstalleerde app, geen site om te vinden; locale-routes maken `/koppel` en de QR-links ingewikkelder voor niets. |
| Bibliotheek | `use-intl` (MIT; de kern van next-intl) | ICU-berichten met meervoud, getal- en datumopmaak, `useTranslations` in React en `createTranslator` daarbuiten. `next-intl` zelf brengt routing en een compiler mee (`@swc/core`, `@parcel/watcher`) die we niet gebruiken. Eigen woordenboek: meervoud en opmaak zelf bouwen. |
| Engels | Brits Engels, `en-GB` (24-uursklok, "13 October", °C) | Europese markt; zelfde klok en datumvolgorde als Nederland. |
| Wat niet vertaald wordt | Wat iemand zelf intypt: namen van huizen, kamers, apparaten en scènes | Dat is data, geen copy. De app schrijft nergens een standaardnaam weg (velden beginnen leeg, voorbeelden zijn placeholders), dus er blijft niets in het Nederlands vastzitten. |
| Servertekst | Hooks geven een **code** (+ parameters), de app vertaalt; ook stap 3 hoort bij deze feature | De regel: de server slaat nooit een zin op of stuurt er een voor de bewoner, alleen feiten. |

## De regel

**Code slaat nooit een zin op, alleen feiten:** een code, een getal, een naam
die iemand intypte. De app maakt er pas op het laatst woorden van, in de taal
van de gebruiker. Nieuwe copy gaat altijd in beide berichtenbestanden; een
test bewaakt dat ze dezelfde sleutels hebben.

## Frontend

**Berichten:** `frontend/messages/nl.json` en `en.json`, genest per scherm of
onderdeel (`home`, `rooms`, `scenes`, `settings`, `device`, `login`,
`errors`, `connection`, `weather`, …). ICU voor meervoud en variabelen:

```json
"attention": "{count, plural, one {# apparaat vraagt} other {# apparaten vragen}} aandacht"
```

**Provider:** één `LanguageProvider` (client) in `app/layout.js` om alles
heen: kiest de taal (account → `localStorage` → browser), laadt beide
bestanden (samen klein; geen dynamische import nodig) en zet
`document.documentElement.lang`. `useLanguage()` geeft `{ language,
setLanguage }`; `setLanguage` schrijft `users.language` (als je ingelogd
bent) en `localStorage`, en de app wisselt meteen (optimistisch, terug bij
een fout, zoals de taalkeuze nu).

**Pure helpers in `lib/`** (`houseSummary`, `attentionLine`, `homeLede`,
`describeCondition`, `formatSince`, `claimErrorMessage`, `householdError`,
`describeError`, …) geven een **sleutel** terug (plus de waarden, waar een
zin die nodig heeft) in plaats van een vaste zin, en de component vertaalt
hem: zoals `confirmFailure` al `'invalid'` gaf. Zo blijven de helpers zonder
taal en de tests eenvoudig; `assertMessage` (`lib/messages.testkit.js`)
controleert dat elke sleutel in beide talen bestaat. Alleen waar een helper
zelf woorden aan elkaar zet, krijgt hij een vertaler mee (`createTranslator`).
De `Intl`-opmaak die nu `nl-NL` vastzet (`connection.js`, `temperature.js`,
`weather.js`, `relativeTime.js`) krijgt de locale mee.

**Zonder flits:** Home toont al alleen de achtergrond tot de app weet of je
ingelogd bent (`.app-boot`). De losse pagina's (`/bevestig`, `/wachtwoord`,
`/uitnodiging`, `/koppel`) doen hetzelfde: geen tekst in de voorgerenderde
HTML, pas na het kiezen van de taal. Dat voorkomt dat een Engelse telefoon
eerst Nederlands ziet en een hydration-mismatch.

**Inloggen en aanmaken:** onderaan de login-kaart een stille tekstknop met de
andere taal, in die taal zelf ("English" / "Nederlands", met `lang`), Quiet
Slate en 500; ook tijdens het aanmaken. Het
aanmaakformulier verliest het veld "Taal van e-mails": het nieuwe account
krijgt de taal waarin je het formulier invult.

**Vaste teksten buiten React:** `metadata` in `layout.js` en `manifest.js`
blijven Nederlands (`lang: 'nl'`): ze worden één keer opgehaald, bij het
installeren, en een browser vraagt er niet per taal om. De naam is toch
"Sandhovius". Bekende beperking.

**Copyregels:** DESIGN.md krijgt bij de Named Rules de Engelse tegenhanger:
zinsletters, gewone woorden, Brits Engels, geen smart-home-jargon
("device" mag, "entity" niet), dezelfde toon als het Nederlands.

## Server (stap 3)

**Agent: geen wijziging nodig.** De app toont `commands.error` en
`schedules.last_error` nooit: `record.error` gaat naar de console
(`page.js`), de melding is de eigen tekst van de app ("… reageerde niet");
bij een schema telt alleen óf er een fout is ("De laatste keer niet
gelukt"). Die velden zijn diagnose voor de ontwikkelaar, geen copy; dat
komt als regel in `backend_explained.md`. Een preciezere melding per soort
fout (bijv. "verlopen" vs "reageerde niet") vraagt een `error_code` en valt
buiten deze feature.

**Hooks: een code in elke fout die de app kan tonen.** Het antwoord krijgt
een veld `code` (en waar nodig `params`) naast de bestaande velden;
`message` wordt een korte Engelse diagnose voor de ontwikkelaar en wordt
niet meer getoond. Niet in `data`: daar zet PocketBase veldfouten per
veldnaam, en de claim heeft zelf een veld `code`.

```json
{ "status": 409, "code": "box_linked_elsewhere", "params": { "house": "Villa" }, "message": "box is linked to another house", "data": {} }
```

| Hook | Nu | Code |
|---|---|---|
| `claim.pb.js` | Koppelen lukt nu niet (503) | `claim_unavailable` |
| `claim.pb.js` | Bevestig eerst je e-mailadres (403) | `email_not_verified` |
| `claim.pb.js` | Deze code klopt niet (400) | `invalid_code` |
| `claim.pb.js` | Huis niet gevonden (404, claim en ontkoppelen) | `house_not_found` |
| `claim.pb.js` | Deze box hoort al bij {huis}… (409) | `box_linked_elsewhere` + `house` |
| `claim.pb.js` | Deze box is al gekoppeld (409) | `box_already_linked` |
| `household.pb.js` | Al lid van dit huis (400, `BadRequestError`) | `already_member` |
| `household.pb.js` | Huis / Uitnodiging / Lid niet gevonden (404) | `house_not_found`, `invitation_not_found`, `member_not_found` |
| `household.pb.js` | Bevestig eerst je e-mailadres (403) | `email_not_verified` |
| `household.pb.js` | Deze uitnodiging is verlopen (410) | `invitation_expired` |
| `household.pb.js` | Kies beheerder of huisgenoot (400) | `invalid_role` |
| `household.pb.js` | Er moet minstens één beheerder blijven (409) | `last_admin` |
| `household.pb.js` | Je bent de laatste beheerder van {huis}… (409, account verwijderen) | `last_admin_of_house` + `house` |

`box.pb.js` (`/box/report`) praat alleen met de agent: geen code nodig.
`BadRequestError` kan geen eigen veld meegeven; `already_member` wordt een
`e.json(400, …)` zoals de rest.

**De app:** `householdError` en `claimErrorMessage` vertalen de code
(`errors.<code>` in de berichten). Een onbekende code of een fout van
PocketBase zelf (Engels, zonder code) valt terug op de bestaande algemene
melding per status. Nooit `message` op het scherm.

**Mails:** volgen `users.language` al (`mail_texts.js`). De uitnodiging gaat
in de taal van de uitnodiger: de genodigde heeft vaak nog geen account. Dat
blijft zo.

## Volgorde (kleine commits op een feature-branch)

1. **Basis:** `use-intl`, `LanguageProvider`, berichtenbestanden met een
   test op gelijke sleutels, `<html lang>`, Opties → Taal, de login (met de
   taalknop), aanmaken, `/bevestig`, `/wachtwoord`, `/uitnodiging`,
   `/koppel`.
2. **Per scherm:** Home, Kamers, Scènes, Opties, dan de sheets
   (apparaatdetails, scène, huis, huisgenoten, koppelen, apparaat
   toevoegen), toasts en `aria-label`s. Met de helpers in `lib/` en hun
   tests.
3. **Hooks:** codes in `claim.pb.js` en `household.pb.js`, de app vertaalt
   ze; de integratietests in `backend/tests/` controleren de code in plaats
   van de Nederlandse tekst.

Schatting: 1 een paar uur, 2 de bulk (10–15 uur, ±350 teksten), 3 een paar
uur.

## Testen

- `node --test`: gelijke sleutels in `nl.json` en `en.json`, elk bericht
  is geldige ICU; de helpers in beide talen ("2 lampen aan" / "2 lights
  on", "20,5°" / "20.5°").
- Integratie (`backend/tests`): elke fout uit de tabel geeft de juiste
  `status` en `code`; de mailtaal-test blijft staan.
- Visueel (`scripts/screenshot.py`) Home, Kamers, Scènes en Opties in
  beide talen, licht en donker: Engels is vaak langer of korter, let op
  tegels, pillen en de navigatie (vijf vakjes, elk label op één regel; de
  Engelse labels "Home", "Rooms", "Scenes", "Settings" passen).
- Handmatig: taal wisselen in Opties wisselt de app meteen; uitloggen en
  inloggen op een telefoon met een andere browsertaal toont de taal van het
  account; een bevestigingsmail na het wisselen komt in de nieuwe taal.

## Buiten scope

- Meer talen (het werk is dan een bestand plus een optie).
- Een `error_code` van de agent voor preciezere foutmeldingen.
- Een vertaalde manifest en metadata.
- Namen die mensen intypen vertalen.

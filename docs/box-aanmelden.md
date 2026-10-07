# Een nieuwe box aanmelden

Hoe een Sandhovius-box van jouw bureau bij een bewoner thuis terechtkomt en aan
zijn account gekoppeld raakt. Twee rollen: **jij** maakt de box klaar, **de
bewoner** koppelt hem in de app. Achtergrond en keuzes:
`docs/superpowers/specs/2026-10-06-box-identity-design.md` (spec A) en
`docs/superpowers/specs/2026-10-06-claim-flow-design.md` (spec B).

> **Nu nog lokaal.** De box en de app praten met dezelfde PocketBase. Die draait
> nu op je eigen machine, dus een box bij een klant kan pas echt koppelen als
> PocketBase op Scaleway staat (fase 3). Lokaal kun je de hele flow testen.

## In één oogopslag

```mermaid
sequenceDiagram
    autonumber
    actor Jij
    participant Script as provision-box.py
    participant PB as PocketBase
    participant Box
    actor Bewoner
    participant App as App (PWA)

    Jij->>Script: --serial SH-2026-000123 --app-url …
    Script->>PB: boxes-record (serienummer, boxgeheim, hash van claimcode)
    Script-->>Jij: box.json + printblad SH-2026-000123.svg
    Jij->>Box: box.json naar /data
    Jij->>Bewoner: box + handleiding met printblad
    Bewoner->>Box: aansluiten
    Box->>PB: inloggen als box (nog geen huis → alleen lokaal)
    Bewoner->>App: account maken, mail bevestigen
    Bewoner->>App: QR-code scannen of code overtikken, huis kiezen
    App->>PB: POST /api/sandhovius/claim
    PB-->>App: huis gekoppeld
    Box->>PB: elke 5 min eigen record → ziet het huis
    Box-->>App: eerste hartslag → "Je box is er"
```

## 1. Een box klaarmaken (jij, eenmalig per box)

Voorwaarden: de stack draait (`docker compose up -d`), `.env` bevat de
superuser (`POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD`), en
`pip install -r scripts/requirements.txt` is gedaan (voor het printblad).

1. **Software op de N100**: Linux + de Docker-stack (agent, Home Assistant,
   Mosquitto, Zigbee2MQTT).
2. **Box aanmaken**, op je laptop:

   ```bash
   scripts/provision-box.py --serial SH-2026-000123 \
       --app-url https://app.sandhovius.nl --out box.json
   ```

   - Maakt in PocketBase een `boxes`-record: serienummer, een willekeurig
     boxgeheim (32 bytes) en de **hash** van een nieuwe claimcode.
   - Schrijft `box.json` (serienummer + boxgeheim) en het printblad
     `sheets/SH-2026-000123.svg`.
   - Print alleen serienummer, record-id en het pad van het blad — nooit het
     geheim of de code. Serienummers worden in hoofdletters opgeslagen.
   - Lokaal testen: `--app-url http://localhost:3000`.
3. **`box.json` op de box zetten**: naar `/data/box.json` (nu met `scp` of een
   usb-stick; in de dev-stack `MSYS_NO_PATHCONV=1 docker cp box.json sandhovius-agent:/data/box.json`).
   Daarna je lokale `box.json` wissen: het boxgeheim hoort alleen op de box.
4. **Printblad** printen en bij de handleiding in de doos doen. Het blad bevat:
   - de QR-code met de link `<app-adres>/koppel#s=<serienummer>&c=<claimcode>`
     (de code staat achter een `#` en komt dus nooit in serverlogs);
   - serienummer en claimcode in leesbare tekst (bijv. `K7QM-2XRP-9DTW`), om
     over te tikken;
   - het adres van de app.

   Het blad is het enige waarop de claimcode staat. `sheets/` staat niet in git;
   bewaar of vernietig bladen na het printen.

Wat de box doet zodra hij aanstaat: hij logt in als zichzelf (serienummer +
boxgeheim), heeft nog geen huis en draait daarom alleen lokaal (automatisering,
geschiedenis en schema's werken; niets naar de cloud). Elke 5 minuten kijkt hij
of hij inmiddels bij een huis hoort.

## 2. De box koppelen (de bewoner, thuis)

1. **Box aansluiten** (stroom + netwerk).
2. **App openen** op het adres uit de handleiding.
3. **Account**:
   - Nieuw: "Account aanmaken" → e-mail, wachtwoord (minimaal 8 tekens, twee
     keer) en de taal van e-mails (Nederlands of English; voorgevuld uit de
     browser). Er komt een bevestigingsmail; de link opent `/bevestig`.
   - Bestaand: gewoon inloggen. Wie al een huis heeft, kan een tweede box
     koppelen voor een tweede huis (bijv. een vakantiehuis) en wisselt in de app
     tussen de huizen.
   - Koppelen kan pas met een **bevestigd** e-mailadres. Zolang dat niet zo is,
     toont de app "Kijk in je mail" met "Stuur de mail opnieuw".
4. **"Box toevoegen"** (op het lege-huisscherm, of in Opties):
   - **Scannen**: de camera opent; richt hem op de QR-code. Werkt alleen via
     HTTPS of op `localhost`. Zonder camera, zonder toestemming of op een
     onbeveiligde verbinding gaat de app meteen naar overtikken.
   - **Overtikken**: serienummer en claimcode. Hoofdletters, spaties en
     streepjes maken niet uit, en O/0 en I/L/1 ook niet.
   - Scant iemand de QR-code met de gewone telefooncamera, dan opent de link de
     app; na inloggen en bevestigen staat de code al ingevuld.
5. **Waar hoort deze box?**
   - **Nieuw huis**: met een naam (standaard "Thuis"). Wie koppelt, wordt lid
     en beheerder van dat huis en kan daarna huisgenoten uitnodigen.
   - **Vervangt de box van …**: een bestaand huis waar je beheerder van bent; kamers, apparaten, scènes en
     schema's blijven, de nieuwe box neemt het over en de oude box wordt
     losgekoppeld.
6. **Wachten**: "Wachten tot je box zich meldt… Dit kan tot vijf minuten duren."
   Zodra de box zijn huis ziet en een eerste hartslag stuurt, gaat de app naar
   Home van dat huis.

## 3. Foutmeldingen die de bewoner kan zien

| Melding | Betekenis | Wat te doen |
|---|---|---|
| Deze code klopt niet | Serienummer of claimcode is fout (bewust dezelfde melding, zodat niemand serienummers kan aftasten) | Opnieuw overtikken; anders support (nieuwe code) |
| Deze box is al gekoppeld | De box hoort bij een huis waar je geen lid van bent | Een beheerder van dat huis moet ontkoppelen |
| Bevestig eerst je e-mailadres | Account nog niet bevestigd | Mail openen of opnieuw sturen |
| Te veel pogingen, probeer het over een minuut opnieuw | Meer dan 10 pogingen per minuut | Even wachten |

Nog een keer koppelen van een box die al bij een huis hoort waar je lid van bent is geen
fout: de app meldt gewoon succes.

## 4. Later: ontkoppelen, vervangen, nieuwe code

- **Ontkoppelen** (verkoop of retour): huisinstellingen → "Box ontkoppelen"
  (alleen een beheerder).
  Het huis met al zijn instellingen blijft; de box draait binnen 5 minuten
  weer alleen lokaal. Dezelfde claimcode werkt daarna weer, dus de handleiding
  kan mee naar de nieuwe eigenaar.
- **Vervangen** (kapotte box): nieuwe box koppelen met "Vervangt de box van …".
- **Blad kwijt vóór het koppelen** (jij):

  ```bash
  scripts/provision-box.py --reissue SH-2026-000123 --app-url https://app.sandhovius.nl
  ```

  Nieuwe code, nieuwe hash, nieuw blad; het oude blad werkt niet meer. Alleen
  voor een box zonder huis (anders eerst ontkoppelen), zodat support nooit per
  ongeluk de box van een bewoner losmaakt. Het boxgeheim en `box.json` blijven
  ongemoeid.

## 5. Lokaal testen

- App: http://localhost:3000 · Mailpit (alle mails): http://localhost:8025 ·
  PocketBase-admin: http://localhost:8090/_/
- Box maken voor een test: `--serial SH-TEST-0001 --app-url http://localhost:3000`
  (geen `--house`). Alleen een box met een echte agent (je dev-box) stuurt een
  hartslag; een testbox blijft dus in "Wachten tot je box zich meldt…" hangen.
- Opruimen na een test: testaccount, testhuis en testbox verwijderen in de
  admin-UI, het blad uit `sheets/` en de mails in Mailpit.

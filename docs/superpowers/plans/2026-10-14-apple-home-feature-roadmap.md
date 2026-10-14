# Apple Home naast Sandhovius: wat nemen we over

Stand: 2026-10-14. Nog niets gebouwd; dit is een keuzelijst met volgorde, als
aanvulling op `2026-10-13-google-home-feature-roadmap.md` (verder "Google-plan").
Wat daar al staat, staat hier alleen als verwijzing (A0, A1, B1, …).

## Hoe dit onderzocht is

- **Bron:** Apples eigen beschrijving van de Home-app (App Store-tekst, via een
  release-tracker), Apple Support-stappen zoals geciteerd in de Apple
  Community, en vakpers/handleidingen van derden over automatiseringen.
  Geen binary: Apple Home is een iOS-systeemapp (geen IPA buiten een
  Apple-toestel), dus REA/decompilatie viel af.
- **Waargenomen:** wat Apple zelf adverteert (Activity History, gastentoegang,
  Adaptive Temperature, camera-overzicht, widgets) en de vier soorten
  automatiseringstriggers (tijd, mensen, apparaat bediend, sensor).
- **Afgeleid / uit eigen kennis van de app:** de opbouw van het Home-scherm
  (categorieknoppen, statusregel), Adaptive Lighting, "Uitzetten na",
  meldingsinstellingen per apparaat, rechten per huisgenoot. Niet tegen de
  nieuwste iOS-versie nagekeken; behandel details als "zo werkt het
  ongeveer", niet als spec.
- **Onbekend:** wat specifiek in iOS 26 veranderde (geen release-notes
  gevonden in deze ronde).

## Waar Apple anders is dan Google

Google bouwt alles rond één routine-editor en de cloud. Apple doet drie
dingen die beter bij Sandhovius passen:

1. **Een thuishub draait de automatiseringen lokaal** (HomePod/Apple TV).
   Zonder hub: geen automatiseringen, geen bediening van buitenaf. Dat is
   precies onze box; Apple bevestigt dat het model werkt voor gewone mensen.
2. **Categorieën boven kamers.** Bovenaan Home staan knoppen Klimaat, Licht,
   Beveiliging, Water, Speakers met een korte stand ("3 aan", "20–22°",
   "1 open"). Eén tik = alle lampen in het huis, per kamer gegroepeerd.
3. **Automatiseringen blijven klein.** Eén trigger, weinig voorwaarden
   (tijdvenster, wie er thuis is), acties = scènes en apparaten, plus
   **"Uitzetten na…"**. Krachtgebruikers wijken uit naar Eve/Controller.
   Dat is een bewuste grens die bij onze doelgroep past.

## Wat Apple Home biedt (relevant deel)

| Gebied | Apple Home | Sandhovius nu | Google-plan |
|---|---|---|---|
| Home-scherm | Categorieknoppen met samenvatting, favorieten, camera's, scènes | Groet + één regel, Favorieten, Staat nu aan, Let op | — |
| Automatiseringen | Tijd/zon, mensen komen/gaan, apparaat bediend, sensor ziet iets; voorwaarden tijd + mensen; "Uitzetten na" | Schema's, bewegingslicht | B1, A1 |
| Licht | Adaptive Lighting: kleurtemperatuur volgt de dag | Wit-slider, zes stalen | — |
| Klimaat | Adaptive Temperature: onderweg naar huis, slapen, lang weg | Thermostaat-dial | "Temperatuurstanden" |
| Meldingen | Per apparaat aan/uit, met voorwaarden (alleen als niemand thuis is, tijdvenster); kritieke meldingen voor rook/water | Niets | B2 |
| Geschiedenis | Activity History voor sloten, garagedeuren, contactsensoren, alarm, klimaat-automatiseringen | Lokale SQLite, niet zichtbaar | C1 |
| Huisgenoten | Uitnodigen; per lid "bedienen op afstand", "wijzigen toestaan"; gastentoegang met tijdvenster voor sloten/alarm | Beheerder/lid | D1 |
| Hub | Status "verbonden/niet reagerend" per hub, meerdere hubs, één actief | "Box reageert niet" | — |
| Apparaatdetails | Instellingen per apparaat: naam, kamer, "toon in favorieten", "toon in statusregel", groeperen, batterij, firmware | Detail-sheet met naam, kamer, favoriet | Groepen |
| Overig | Widgets, Watch, Siri, Home key, camera's (Secure Video), robotstofzuigers, energie (VS), Matter/Thread | PWA, weer | — |

## Wat past bij Sandhovius

Zelfde toets als het Google-plan: lokaal, begrijpelijk voor een
niet-technische bewoner, met HA + Zigbee2MQTT zonder nieuwe hardware.
Volgorde binnen een fase = voorgestelde bouwvolgorde.

### Fase E — Home-scherm en overzicht (klein, losstaand)

**E1. Categorieknoppen met samenvatting.** De sterkste Apple-vondst voor
onze doelgroep: "Licht · 3 aan", "Klimaat · 20,5°", "Beveiliging · 1 open"
(zodra er contactsensoren zijn), "Water · droog" (lekkagesensoren). Eén tik
opent een sheet met alle apparaten van die soort, per kamer, met een
"Alles uit" voor licht.
- Alleen PWA: een helper `categorySummary(devices, states, t)` in `lib/`
  (zelfde vorm als `homeLede`), getest in beide talen. Een knop verschijnt
  pas als het huis zo'n apparaat heeft.
- Past naast de warme Home: de knoppen vervangen geen secties, ze komen
  onder de groetregel. Eerst in `DESIGN.md` toetsen; de lede noemt al
  "2 lampen aan", dus kiezen: óf lede óf knoppen dragen die tekst.
- Leunt op `devices.type`/`device_class` uit het apparaatmodel (A0) voor
  Beveiliging en Water; Licht en Klimaat kunnen nu al.
- Maat: ~1 week.

**E2. "Toon in statusregel" per apparaat.** Apple laat de bewoner kiezen
wat in de samenvatting telt (de schuurlamp hoeft niet mee). Bij ons één
schakelaar in de detail-sheet; veld `devices.in_summary` (standaard aan).
Pas als E1 er is en er klachten komen. Laag.

### Fase F — licht en klimaat die vanzelf meebewegen

**F1. Aanpassend licht (Adaptive Lighting).** Een lamp met wit-instelling
krijgt een schakelaar "Kleur volgt de dag": warm 's avonds, koeler overdag.
Duidelijke waarde, geen extra hardware, en het past bij "The Lit Room at
Night".
- Agent, niet HA's `adaptive_lighting` (custom integratie, HACS; niet in de
  gesloten lijst). Een pure functie `kelvinFor(time, sun)` (2200 K na
  zonsondergang → 4000 K midden op de dag), en de agent stuurt elke ~10 min
  een `color_temp_kelvin` naar lampen die **aan** staan en de schakelaar
  hebben. Bij aanzetten meteen de juiste waarde (anders eerst een flits
  koud licht).
- Eigenaarschap zoals bewegingslicht: kiest de bewoner zelf een kleur of
  wittint, dan stopt het aanpassen voor die lamp tot hij weer uit gaat.
  Zelfde patroon als `motion.go`; de motor is puur, de runner doet I/O.
- Schema: `devices.adaptive` (bool), alleen voor lampen met kleurtemperatuur.
- Afhankelijk van A1 (zon in de snapshot). Maat: 1–2 weken.

**F2. Klimaatstanden (Comfort / Eco / Slaap).** Staat al als
"Temperatuurstanden" in het Google-plan; Apple voegt toe dat de standen
**vanzelf** wisselen (onderweg naar huis, bij het slapen, lang weg). Voor
ons: eerst de drie standen met de hand en in scènes, daarna als actie in B1
en gekoppeld aan Thuis/Weg (B3). Geen eigen fase-werk bovenop het
Google-plan, alleen de volgorde: standen → B1 → B3 → automatisch wisselen.

### Fase G — automatiseringen zoals Apple ze beperkt

Geen nieuw model: dit stuurt hoe B1 (generiek, gesloten lijst) in de UI
verschijnt.

**G1. "Uitzetten na…" als vast onderdeel van elke automatisering.** Apple
heeft dit als één regel onder de acties ("Turn off after 5 minutes"), niet
als losse "wachten"-stap. Voor B1: de motor heeft een duurzame timer nodig
(staat er al), de editor toont het als één keuze **Daarna uit: nooit, 1, 5,
15, 30, 60 min**. Dekt het grootste deel van "wachten" zonder dat een
bewoner een stappenreeks bouwt. Dezelfde timer als "Aan voor…" uit het
Google-plan.

**G2. Vier startsoorten, in woorden.** Apple's indeling is de eenvoudigste
die we zagen; neem hem over als de starter-lijst van B1:
- *Een tijd* (vaste tijd of zon, A1)
- *Mensen komen of gaan* (B3; begin handmatig)
- *Een apparaat wordt bediend* (lamp aan, schakelaar ingedrukt)
- *Een sensor ziet iets* (beweging, deur open, lek, temperatuur boven/onder)

Bewegingslicht en schema's blijven sjablonen bovenop deze lijst (zoals al
besloten). Voorwaarden in v1 alleen: tijdvenster/donker en "als iemand
thuis is / niemand thuis is". Geen EN/OF-groepen: dat is precies waar Apple
stopt, en waar onze bewoner afhaakt.

**G3. Een automatisering "test nu".** Apple heeft dat niet; het is een
gat dat we goedkoop dichten: in de sheet **Nu uitproberen** voert de acties
één keer uit (zonder starter), met de uitkomst "Klaar" / "Gedeeltelijk
gelukt". Hergebruikt `executeScene`. Klein, bij B1.

### Fase H — meldingen met voorwaarden

**H1. Meldingen per apparaat.** Apple's model is beter dan "melding als
actie" alleen: in de sheet van een sensor **Meld dit** met twee
voorwaarden: *alleen als niemand thuis is* en *alleen tussen…*. Voor
rook en lekkage altijd aan en niet uit te zetten voor beheerders zonder
bevestiging (Apple: kritieke meldingen).
- Bouwt op B2 (Web Push vanuit PocketBase, pas met fase 3). De agent
  beslist of een gebeurtenis een melding waard is (lokaal, met de
  voorwaarden), PocketBase verstuurt alleen.
- Privacy: meldingtekst kort en zonder meetwaarden ("Lekkage in de
  keuken"), zoals in het Google-plan.
- Schema: `notification_rules` per apparaat en per lid (wie wil het
  krijgen), niet per huis: Sanne wil de voordeur, Tom niet.

### Fase I — geschiedenis zoals Apple hem afbakent

**I1. Activiteit alleen waar het telt.** Apple toont geschiedenis niet
voor alles, maar voor deuren/contactsensoren, sloten, alarm en
klimaat-automatiseringen. Dat is een goede afbakening voor C1: begin met
contactsensoren en "wat deden de automatiseringen" (de box weet dat al
via `last_run`), niet met elke lampschakeling. Kleiner, minder
privacy-gevoelig, en het antwoord op de vraag die bewoners echt stellen
("ging de achterdeur open?"). De architectuurvraag uit C1 (command vs.
mesh) blijft staan.

### Fase J — huisgenoten en gasten

**J1. Rechten als twee schakelaars.** Apple geeft per lid "Bedienen buiten
huis" en "Wijzigen toestaan". Duidelijker dan een derde rol: voor D1 geen
"beperkte rol" maar onder de rol in `MemberSheet` één schakelaar **Mag
automatiseringen en apparaten wijzigen**. Beheerders blijven beheerders.
"Bedienen buiten huis" pas na fase 3 (dan bestaat het onderscheid pas
echt, via de mesh).

**J2. Gast met een einddatum.** Apple's gastentoegang is tijdgebonden
(datum/tijd). Voor ons: een uitnodiging met **Tot en met** (oppas,
logees), die daarna vanzelf verloopt. Hergebruikt `invitations` en
`household.pb.js`; een cron-hook in PocketBase haalt verlopen gasten weg.
Pas na J1. Sloten blijven buiten scope (zie onder).

### Fase K — de box zichtbaar maken als thuishub

**K1. Box-status in woorden.** Apple toont per hub "Verbonden" / "Reageert
niet" en welke hub actief is. Wij hebben dit half (Opties → Huis en de
Home-melding). Aanvullen met wat een bewoner kan doen: "Reageert niet
sinds 14:10. Staat de stekker erin? Brandt het lampje?" en de agentversie
(`boxes.agent_version`) als "Software bijgewerkt op …". Klein, past bij
de Offline Fade Rule en "Hulp bij offline" uit het Google-plan.

## UI-inspiratie

**Overnemen**
- **Samenvatting op de knop zelf.** "3 aan", "1 open": de stand staat in de
  knop, niet erachter. Zelfde idee als onze Let op-regel.
- **Lang indrukken = groter, niet een menu.** Apple's tegel opent bij lang
  drukken de grote bediening (schuif). Bij ons opent lang drukken al de
  detail-sheet; bevestigt de keuze.
- **"Uitzetten na" als zin onder de acties**, zie G1.
- **Een automatisering als zin**: "Als de voordeur opengaat, na
  zonsondergang". Sluit aan op `describeAutomation` uit het Google-plan.

**Niet overnemen**
- **Hoofdletter-labels** ("Turn Off After"): Sentence Case Rule.
- **Categorieën als vaste set** waarvan sommige leeg blijven (Speakers,
  Water zonder sensoren): bij ons verschijnt een knop alleen als er iets is.
- **Automatiseringen die stil falen** als de hub weg is: Apple zegt dat
  nauwelijks. Wij tonen `last_error` al; zo houden.

## Bewust niet

- **Siri, Watch, widgets, Home key, CarPlay:** native Apple-platform; een
  PWA kan het niet. (Snelkoppelingen in het manifest: zie A3.)
- **HomeKit-brug naar de iPhone** (HA's `homekit`-integratie, zodat
  Sandhovius-apparaten in de Apple Home-app verschijnen): technisch klein,
  maar twee apps die hetzelfde huis besturen breekt eigenaarschap
  (bewegingslicht, F1) en de belofte "alles in één app". Pas heroverwegen
  als klanten erom vragen; dan als optie per huis, uit staand.
- **Camera's (Secure Video), robotstofzuigers, sloten met gastcodes,
  energiedashboard met netprognose:** andere hardware, cloud of buiten
  Nederland; zelfde redenen als in het Google-plan.
- **Matter-controller worden:** komt mee met Matter in A0 (QR/Matter-code),
  geen eigen fase.

## Volgorde

Bovenop het Google-plan (spec apparaten → A0 → A2 → A1 → spec B1 → B1 → B3
→ B2 → C1 → D1):

- **E1** direct na A2 (heeft `device_class` nodig voor Beveiliging/Water).
- **F1** direct na A1 (heeft de zon nodig).
- **G1–G3** horen in de B1-spec, geen eigen werk.
- **H1** samen met B2 (fase 3).
- **I1** is de afbakening van C1.
- **J1** vervangt D1; **J2** daarna.
- **K1** los, wanneer er een middag over is.

Ruwe maat bij 10–15 uur/week: E1 ~1 week, F1 ~1–2 weken, K1 een paar uur;
de rest valt binnen de schattingen van het Google-plan.

## Open vragen (aan jou)

1. E1: dragen de categorieknoppen de "2 lampen aan"-tekst, of blijft de
   lede dat doen en zijn de knoppen alleen ingangen?
2. F1: standaard aan voor nieuwe lampen met wit (Apple: uit, je zet het aan)?
3. HomeKit-brug: echt "nooit", of "later als optie"?

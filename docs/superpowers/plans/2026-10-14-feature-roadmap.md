# Feature-roadmap

Stand: 2026-10-14. Een keuzelijst met volgorde. Toets voor elk idee: werkt
het lokaal, snapt een niet-technische bewoner het, en kan het met HA +
Zigbee2MQTT zonder nieuwe hardware? Afvallers staan onderaan.

## Fase A — fundament en kleine stappen

### A0. Echte apparaten koppelen ✅ gebouwd 2026-10-14

Spec: `docs/superpowers/specs/2026-10-14-device-pairing-design.md`. "+" koppelt
een echt apparaat (Zigbee of Philips Hue); de virtuele HA-helpers zijn weg.
Besluiten die blijven gelden:

- **Eerst de soort kiezen** (Lamp, Stopcontact, Sensor, Radiatorknop); de soort
  bepaalt de uitleg en filtert de lijst. Wat Zigbee2MQTT meldt bepaalt wat iets
  is, niet de keuze.
- **Wat op het netwerk zit, staat in de app.** Een apparaat dat zich in een
  koppelsessie meldt en niet wordt toegevoegd, haalt de box weer van het
  netwerk. Apparaten die er al waren raakt hij nooit aan; Hue-lampen ook niet.
- **"Via een merk"** als tweede ingang, met een gesloten lijst: eerst Philips
  Hue (lokaal via de bridge), later Shelly, ESPHome, WLED. Geen
  cloudapparaten.
- **Kiezen met knipperen** en twee hulpknoppen ("Hij knippert niet", "Ik zie
  mijn lamp niet") met hulp per soort.
- **QR / Matter-code:** pas met Matter; de QR-scanner van de claim-flow is dan
  herbruikbaar.

### A1. Zon in schema's ✅ gebouwd 2026-10-14

Spec: `docs/superpowers/specs/2026-10-14-sun-schedules-design.md`. Het
oorspronkelijke voorstel:

"Bij zonsondergang", "30 min voor zonsopkomst" als alternatief voor een tijd.
Staat al in `docs/status.md` als bewust uitgesteld.
- Agent: `sun.sun` (`next_rising`/`next_setting`) per dag uit HA, in de
  snapshot mee; scheduler rekent de minuut uit. Offset begrenzen (hooguit een
  paar uur).
- Schema: `schedules.time` blijft, erbij `trigger` (`time`/`sunrise`/`sunset`)
  en `offset_min`. Migratie vult `time` in voor bestaande schema's.
- PWA: in "Vanzelf uitvoeren" een driedelige balk **Voor / Bij / Na** (zelfde
  pill bar als Weergave) en een minutenkeuze als segmenten (15, 30, 45, 60, 90,
  120), de keuze voluit in het label ("30 minuten voor zonsondergang").
- Risico: zonder internet blijft `sun.sun` werken (lokale berekening), wel een
  thuislocatie nodig; die heeft HA al voor het weer.

### A2. Batterij en sensorstanden in "Let op" ✅ gebouwd 2026-10-14

Samen met A0: sensoren in woorden, lek en rook bovenaan Let op en altijd bij
naam, batterij bijna leeg.

### A3. Snelkoppelingen naar scènes

Een PWA heeft geen widgets, wel `shortcuts` in het manifest (lang indrukken op
het app-icoon). Alleen statisch, dus hooguit vaste items zoals "Alles uit".
Laagste prioriteit van fase A.

## Fase B — één automatiseringsmodel (het grote besluit)

### B1. Routines: starter → voorwaarden → acties

Nu zijn er drie losse soorten (scènes, schema's, bewegingslicht). Doel: één
editor met starters, voorwaarden en acties.

- **Besloten (2026-10-13): generiek.** Collectie `automations` met
  `starters`/`conditions`/`actions` als JSON, een **gesloten lijst**
  starter-/actiesoorten (geen vrije HA-services), en schema's + bewegingslicht
  als *sjablonen* in de UI bovenop dezelfde motor. De PB-regels kunnen niet in
  de JSON kijken, dus alle inhoudelijke validatie (soorten, apparaten uit het
  eigen huis, grenzen) zit in een PocketBase-hook én in de agent. Bestaande
  collecties pas migreren als de motor zich bewezen heeft. Eerst een spec.
- **Vier startsoorten, in woorden:** een tijd (vaste tijd of zon, A1); mensen
  komen of gaan (B3, eerst handmatig); een apparaat wordt bediend; een sensor
  ziet iets (beweging, deur open, lek, temperatuur boven/onder).
- **Voorwaarden in v1 alleen:** tijdvenster/donker en "als iemand thuis is /
  niemand thuis is". Geen EN/OF-groepen: daar haakt de bewoner af.
- **Acties:** apparaat, scène, melding (B2), en **Daarna uit** als vaste regel
  onder de acties (nooit, 1, 5, 15, 30, 60 min) in plaats van een losse
  "wachten"-stap. Zelfde duurzame timer als "Aan voor…" hieronder.
- **Nu uitproberen:** in de sheet de acties één keer uitvoeren (zonder
  starter), met "Klaar" / "Gedeeltelijk gelukt". Hergebruikt `executeScene`.
- Motor: de bewegingslicht-motor (`motion.go`, puur, eigenaarschap, uit-tijden
  op schijf) is de basis; wachten vraagt om duurzame timers (zelfde patroon
  als `/data/motion.json`).
- Lussen voorkomen: een routine die een apparaat schakelt dat zijn eigen
  starter is. Diepte- of tijdslimiet in de agent.

### B2. Meldingen

Actie "Stuur een melding" + vaste meldingen (lek, rook, box offline). Web Push
(VAPID) vanuit PocketBase. Push loopt via de pushdienst van de browser,
versleuteld; de inhoud kort houden en zonder meetwaarden ("Lekkage in de
keuken"). Werkt pas goed met fase 3 (HTTPS, echte `APP_URL`).

**Meldingen per apparaat en per lid:** in de sheet van een sensor **Meld dit**
met twee voorwaarden: *alleen als niemand thuis is* en *alleen tussen…*. Rook
en lekkage altijd aan. De agent beslist lokaal of een gebeurtenis een melding
waard is, PocketBase verstuurt alleen. Schema: `notification_rules` per
apparaat en per lid (de één wil de voordeur, de ander niet).

### B3. Aanwezigheid (Thuis/Weg)

Een PWA kan geen telefoonlocatie op de achtergrond volgen. Haalbare opties,
oplopend in moeite:
1. Een schakelaar "Ik ben weg / thuis" per bewoner (handmatig, betrouwbaar).
2. Telefoon op het thuis-wifi via HA (`ping`/router-integratie). Geen app
   nodig, wel gedoe bij willekeurige MAC-adressen.
3. Later een native app; buiten scope.
Begin met 1 + "iedereen weg" als voorwaarde/starter in B1.

## Fase C — inzicht

### C1. Geschiedenis

"Wanneer ging de voordeur open?" De box heeft het al
(`agent/internal/history/`). **Afbakening:** eerst deur-/contactsensoren en
"wat deden de automatiseringen" (de box weet dat via `last_run`), niet elke
lampschakeling. Spanning: *sensordata blijft lokaal*, en de PWA praat alleen
met PocketBase. Opties: de laatste N gebeurtenissen per apparaat on-demand
via een command (antwoord in het record, daarna gewist), of een directe lijn
app → box via de Headscale-mesh in fase 3. Architectuurbesluit; niet vóór
fase 3 kiezen. Geschiedenis zien als aparte schakelaar per lid, een
bewaartermijn (bijvoorbeeld 30 dagen) en **Geschiedenis wissen** voor
beheerders.

### C2. Energie

Stopcontacten met vermogensmeting (Zigbee) → verbruik per dag op de
stopcontacttegel, later een overzicht. Pas als er zulke stekkers in het
pakket zitten.

## Fase D — huisgenoten

### D1. Rechten als één schakelaar

Geen derde rol, maar onder de rol in `MemberSheet` één schakelaar **Mag
automatiseringen en apparaten wijzigen**. Beheerders blijven beheerders. In de
ledensheet als zinnen wat iemand wel en niet kan, met de reden. "Bedienen
buiten huis" pas na fase 3.

### D2. Gast met een einddatum

Een uitnodiging met **Tot en met** (oppas, logees) die daarna vanzelf
verloopt. Hergebruikt `invitations` en `household.pb.js`; een cron-hook haalt
verlopen gasten weg. Na D1.

## Fase E — Home-scherm en overzicht

### E1. Categorieknoppen met samenvatting

Onder de groetregel knoppen met de stand erin: "Licht · 3 aan", "Klimaat ·
20,5°", "Beveiliging · 1 open", "Water · droog". Eén tik opent een sheet met
alle apparaten van die soort, per kamer, met "Alles uit" voor licht.
- Alleen PWA: `categorySummary(devices, states, t)` in `lib/`, in beide talen
  getest. Een knop verschijnt pas als het huis zo'n apparaat heeft.
- Eerst in `DESIGN.md` toetsen: de lede noemt al "2 lampen aan"; óf de lede
  óf de knoppen dragen die tekst. Open vraag.
- Maat: ~1 week.

### E2. "Toon in de samenvatting" per apparaat

Een schakelaar in de detail-sheet (`devices.in_summary`, standaard aan), zodat
de schuurlamp niet meetelt. Pas na E1 en als er vraag naar is.

## Fase F — licht en klimaat die meebewegen

### F1. Kleur volgt de dag ✅ gebouwd 2026-10-14

Spec: `docs/superpowers/specs/2026-10-14-adaptive-light-design.md` (standaard
uit). Het oorspronkelijke voorstel:

Een lamp met wit krijgt een schakelaar "Kleur volgt de dag": warm 's avonds,
koeler overdag.
- In de agent, niet via een HA-add-on. Een pure functie `kelvinFor(time, sun)`
  (2200 K na zonsondergang → 4000 K midden op de dag); elke ~10 min een
  `color_temp_kelvin` naar lampen die **aan** staan en de schakelaar hebben.
  Bij aanzetten meteen de juiste waarde.
- Eigenaarschap zoals bewegingslicht: kiest de bewoner zelf een kleur, dan
  stopt het aanpassen voor die lamp tot hij weer uit gaat.
- Schema: `devices.adaptive` (bool). Na A1. Maat: 1–2 weken. Open vraag:
  standaard aan of uit voor nieuwe lampen.

### F2. Klimaatstanden (Comfort / Eco / Slaap)

Drie benoemde standen als pillen onder de dial, bruikbaar in scènes en
routines, met een omschrijving en een vergelijking ("2° lager dan Comfort").
Volgorde: eerst met de hand → als actie in B1 → gekoppeld aan Thuis/Weg (B3) →
automatisch wisselen. Eerst nagaan wat de radiatorknop zelf kent.

## Fase K — de box zichtbaar maken

### K1. Box-status in woorden

Opties → Huis en de Home-melding aanvullen met wat een bewoner kan doen:
"Reageert niet sinds 14:10. Staat de stekker erin? Brandt het lampje?" en de
agentversie als "Software bijgewerkt op …". Klein, past bij de Offline Fade
Rule.

## Ideeën voor apparaten en UI

Getoetst aan de Named Rules in `DESIGN.md`.

**Sterk**
- **Een routine in één zin.** Eén helper `describeAutomation(starters,
  conditions, t)` in `lib/` ("Bij zonsondergang, op werkdagen", "Als de
  voordeur opengaat, alleen als het donker is") voor kaarten, de sheet-kop en
  schermlezers. Een uitgezette routine zegt dat.
- **Een onvolledige stap blijft staan en zegt wat er mist** ("Kies een lamp",
  "Hooguit 3 uur"). Geen modal, geen grijze Opslaan-knop zonder uitleg.
- **Gedeeltelijk gelukt is een eigen uitkomst.** "Klaar, de staande lamp
  reageerde niet", met de verwijzing naar Let op.
- **Wie of wat het deed.** In de detail-sheet onder "Stand": "Aan sinds 14:02,
  door Sanne" of "door Gang bij beweging". Bron: het laatste commando (wie) of
  de motor (welke automatisering). Als zin.
- **Aan voor een tijd.** In de sheet van een lamp of stopcontact **Aan voor…**
  (15 min, 30 min, 1 uur, 2 uur); de tegel zegt "Aan tot 22:30". Duurzame
  timer op de box, dezelfde als "Daarna uit" in B1.
- **Lege schermen zeggen wie of wat ze vullen**, met één voorbeeld uit de eigen
  apparaten ("Bijvoorbeeld: gang aan bij beweging").
- **Voorgestelde favorieten.** Op de lege Favorieten-kaart: "Vaak gebruikt:
  Leeslamp en Plafondlamp" met één knop. Tellen op de telefoon zelf, zodat er
  geen gebruiksgegevens in PocketBase komen.
- **Hulp bij offline.** In Let op en de sheet van een offline apparaat "Wat
  kan ik doen?" met stappen per soort (batterij, stroom, te ver van de box,
  opnieuw koppelen).

**Kleiner**
- **Tussenstanden voor trage apparaten** (rolluiken, later sloten): "Gaat
  dicht…" met de in-flight-logica van lampen, en een stand die zegt wat je moet
  doen als het niet lukt.
- **Groepen.** Een armatuur met drie spots als één tegel "Plafondlamp" ("Aan ·
  2 van 3" als ze verschillen). Kan op een HA-lichtgroep leunen. Pas bij vraag.
- **Opgeslagen kleuren.** Eigen stalen per huis ("Leeslicht") naast de zes
  vaste. Laag.
- **Radiatorknop: tijdelijk tot…** "Tot 22:00, daarna 18°" en "Terug naar
  schema". Pas met verwarmingsschema's en B3.
- **Een losse temperatuursensor voor een radiatorknop:** de knop regelt dan op
  de temperatuur in de kamer i.p.v. vlak naast de radiator (de TRVZB kan dat).
- **Relatieve tijd bij offline:** "Offline sinds 2 uur".
- **Verwijderd terwijl je kijkt:** een sheet van een apparaat dat een
  huisgenoot net verwijderde sluit met die melding.
- **Relatieve helderheid als actie** ("Helderheid −30%"), bij B1.
- **Een sensoricoon per soort** (deur, lek, beweging) i.p.v. overal een
  thermometer. Na echte hardware.
- **Een overzicht na het inrichten:** "Je huis is klaar: 3 kamers, 5
  apparaten", met twee of drie volgende stappen.
- **Een huismodus** Thuis / Weg / Op vakantie die routines kan pauzeren of
  aanzetten; hoort bij B3.
- **Een teller bij namen:** een zachte grens zodat tegelnamen niet afkappen.

**Niet doen**
- Middelpunten als scheiding: zinnen (Sentence Case Rule).
- Ontgrendelen vanaf een tegel zonder bevestiging (voor sloten, later).
- Hoofdletters per woord.
- Vage fouten ("Er ging iets mis"): een fout zegt wat er misging en wat je kunt
  doen.
- "Dit kan niet ongedaan worden"-dialogen: Ongedaan maken (6 s) blijft de regel.
- Drie standen voor één tik ("Bezig" → "Gestart" → "Gelukt"): "Wordt
  uitgevoerd" → "Klaar" (plus gedeeltelijk gelukt) is genoeg.

## Wifi-apparaten (besloten 2026-10-14: ja, met eerlijke uitleg)

- **Drie niveaus:** Zigbee werkt zonder router; een *lokaal* wifi-apparaat
  (Shelly, ESPHome, WLED, Tasmota, later Matter) werkt zonder internet maar
  niet zonder router; een *cloud*-apparaat werkt niet zonder internet. Alleen
  de eerste twee ondersteunen.
- **Eerste integratie: Philips Hue (bridge)** ✅ gebouwd met A0. Een bridge is
  een tussenstation: bridge weg = al zijn lampen weg, dus Let op groepeert per
  bridge.
- **Gesloten lijst integraties.** Per ondersteunde soort testen we koppelen,
  offline en herstellen.
- **Ontdekken via HA** (mDNS/zeroconf, ontdekte config-flows; zelfde patroon
  als `AddMQTT`). **Vereist** `network_mode: host` voor HA op de box.
- **Schema:** de bron (`devices.source`) stuurt de uitleg in de app.
- **Bewust maken op drie momenten:** bij toevoegen ("Werkt via je wifi. Valt je
  wifi uit, dan doet dit apparaat niet mee met je automatiseringen."), in de
  detail-sheet als één regel, en bij een storing één regel in Let op ("Je
  wifi-apparaten zijn niet bereikbaar. Staat je router aan?").

## Verwarming (besloten 2026-10-14: model A)

De eigen wandthermostaat blijft de ketel aansturen; Sandhovius regelt per
kamer met radiatorknoppen. Gebouwd; zie de koppelspec, sectie "Verwarming".
Model B (een knop vraagt zelf warmte aan de ketel) kan later bovenop B1.

## Bewust niet

- **Camera's, generatieve AI voor gebeurtenissen of suggesties, spraak-
  assistenten, omroepen, wifi-routerbeheer:** andere hardware of cloud; botst
  met "geen cloud-logs". Een vaste lijst sjablonen op basis van de apparaten in
  huis ("Je hebt een bewegingssensor in de gang, licht aan bij beweging?")
  geeft het meeste van de waarde, lokaal en zonder model.
- **Native platformfuncties** (widgets, horloge, spraak): een PWA kan het niet.
- **Een koppeling waarmee Sandhovius-apparaten ook in een andere smart-home-app
  verschijnen:** twee apps die hetzelfde huis besturen breken eigenaarschap
  (bewegingslicht, F1) en de belofte "alles in één app". Pas heroverwegen als
  klanten erom vragen, dan als optie per huis.
- **Slimme sloten en gastcodes:** veiligheidsgevoelig. Pas na C1 en met echte
  hardware.
- **Een energiedashboard met netprognose:** buiten scope.

## Volgorde

A0 + A2 ✅ → A1 ✅ → F1 ✅ → E1 → spec B1 → B1 → B3 (handmatig) → B2 (met
fase 3) → C1 → D1 → D2. K1 los, wanneer er een middag over is. A3, C2, E2 en
F2 alleen als er tijd of vraag is. Ruwe maat bij 10–15 uur/week: A1 + F1 + E1
~4 weken, B1 ~4–6 weken, de rest volgt op fase 3.

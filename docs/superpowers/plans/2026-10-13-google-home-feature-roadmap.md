# Google Home naast Sandhovius: wat nemen we over

Stand: 2026-10-13. Bron: Google Home 3.40.48.3 (Android, APKMirror-bundel van
2025-09-22). Nog niets gebouwd; dit is een keuzelijst met volgorde.

## Hoe dit onderzocht is

- **Waargenomen:** de 9.481 Engelse UI-teksten uit `split_config.en.apk`
  (`resources.arsc`, sleutel → tekst), statisch gelezen met een eigen
  parser; de app is nooit gestart. De sleutelnamen geven de feature-gebieden
  (`automation_*`, `presence_*`, `schedule_condition_*`, `history_*`, …).
- **Afgeleid:** welke feature bij welke tekst hoort. Teksten bewijzen dat een
  scherm bestaat, niet hoe het werkt of of het voor iedereen aan staat.
- **Onbekend:** de code (JADX/apktool stonden niet klaar voor REA), en veel van
  de routine-editor komt waarschijnlijk van de server (de lijst met starters
  zelf staat niet in de teksten). Alles over gedrag hieronder is dus
  "zo ziet het eruit", geen "zo is het gebouwd".

## Wat Google Home biedt (relevant deel)

| Gebied | Wat de teksten laten zien | Sandhovius nu |
|---|---|---|
| Routines | Starter → voorwaarden → acties ("Add starter", "Conditions", "Add action"); "household routines" vs persoonlijke; starten met de hand ("Start automation", "Some actions may not have started") | Scènes (met de hand), schema's (tijd → scène), bewegingslicht (sensor → lampen) als losse soorten |
| Tijd | Tijd of zonsopkomst/-ondergang, vóór/na met offset in uren/minuten/seconden (max N uur), dagen van de week, datumbereik ("Day 1–5 of each month") | Alleen vaste tijd + dagen |
| Acties | Wachten (`delay_action`, seconden tot uren), melding, omroepen, eigen commando | Alleen apparaat- en scènestappen |
| Aanwezigheid | "Someone's home" / "Everyone's away" als voorwaarde; telefoonlocatie (geofence) + thuis-wifi; "Home and Away routines" | Niets |
| Geschiedenis | "History" met filters (datum, soort) en een rechten-schakelaar "activity access" per lid | Lokale SQLite op de box, niet zichtbaar in de app |
| Status | Batterij laag/zeer laag, sensorstanden in woorden (Leak/No leak, CO, Smoke & CO, Good/Hazardous), slot "Locked • Closed", "Left open" | "Let op" voor storingen/offline |
| Huisgenoten | Beheerder/lid, "Full access" vs "Limited access", activiteit wel/niet zien | Beheerder/lid |
| Suggesties | "Automation suggestions" (Labs, met het model van Google) | Niets |
| Overig | Energie-dashboard, thermostaat-inzichten (gebruik vs vorige week), Downtime, camera's, Assistant, wifi-beheer | Thermostaat-dial, weer |

## Wat past bij Sandhovius

Toets: werkt het lokaal, snapt een niet-technische bewoner het, en kan het met
HA + Zigbee2MQTT zonder nieuwe hardware? Afvallers staan onderaan.

### Fase A0 — echte apparaten koppelen (eerst, fundament) ✅ gebouwd 2026-10-14

Nu maakt "+" een **virtuele helper** in HA (`input_boolean`/`input_number`,
`provisionDeviceEntity` in `agent/internal/app/agent.go`); er wordt niets
gezocht of gekoppeld. Echte apparaten gaan met de hand via het
PocketBase-beheer. **Besloten (2026-10-14):** de virtuele helper verdwijnt
zodra echt koppelen werkt (ook niet als verborgen demo-optie: een bewoner mag
nooit per ongeluk een neplamp toevoegen). Dev en tests gebruiken dan
`fake-lights.py` en nep-Zigbee via MQTT.

**Hoe Google Home het doet** (uit de teksten, `aogh_setup_*`, `qr_first_*`,
`device_search_*`, `set_up_with_*`):
1. "Add a device" opent met **QR scannen** ("Scan the QR code found on the
   device or packaging (if available) or add a different way"), met een
   lamp-knop voor de flitser, "Wrong QR code" en "Set up with Matter pairing
   code" (11 of 21 cijfers).
2. **Andere manieren:** "Search by brand or device, or add a device from a
   different app". Twee soorten: *New device* ("Google Nest or partner
   device") en *Apps* ("Link app to add devices to Google Home": Hue, Nest
   en andere, via een account-koppeling in de cloud).
3. **Per soort een eigen stroom** (lamp, stekker, schakelaar): "Want to set
   up your light?" → "Pick a light to set up" met "The light bulb you pick
   may blink slowly" en twee hulpknoppen "My light didn't respond" / "Don't
   see my light" → "Setting up your light… Your light may blink a few
   times" → "Your devices are ready" met het aantal ("3 lights are ready").
4. **Hulp per soort:** "Make sure it's properly installed and powered on",
   in dezelfde kamer als de hub, uit en weer aan, een minuut wachten.

**Voor Sandhovius:**
- **Eerst de soort kiezen** (zoals Google, en zoals de vier soorttegels
  die "+" nu al heeft): Lamp, Stekker, Schakelaar, Sensor (beweging,
  deur/raam, lekkage, temperatuur), Thermostaat. De soort bepaalt de uitleg
  om het apparaat in koppelstand te zetten ("Zet de lamp 5 keer aan en
  uit", "Houd het knopje 5 seconden ingedrukt"). **Besloten (2026-10-14):**
  de soort filtert ook: kies je "Lamp", dan toont de lijst alleen lampen.
  Wat Zigbee2MQTT meldt bepaalt of iets een lamp is, niet de keuze.
  Koppelen geldt voor het hele Zigbee-netwerk, dus **besloten
  (2026-10-14):** de agent haalt elk apparaat dat zich in een koppelsessie
  meldt en niet wordt toegevoegd weer van het netwerk (Zigbee2MQTT
  `device/remove`): een ander soort apparaat meteen, en aan het eind van de
  sessie ook een lamp die je niet koppelde. Regel: **wat op het netwerk zit,
  staat in de app.** Apparaten die al gekoppeld waren raakt de agent nooit
  aan. Geen soort "Ik weet het niet" (die zou alles weer moeten tonen).
  Geldt niet voor Hue: die lampen zitten op het netwerk van de bridge.
- **"Via een merk"** als tweede ingang, met een gesloten lijst: eerst
  **Philips Hue** ("Druk op de knop van je Hue-bridge"), later Shelly,
  ESPHome, WLED. Anders dan Google is dit geen account-koppeling in de cloud
  maar een lokale verbinding met de bridge of het apparaat. Nest en andere
  cloudmerken: niet (besloten 2026-10-14, alleen Zigbee en lokaal wifi).
- **Zoeken:** de PWA stuurt een command; de agent zet Zigbee2MQTT een paar
  minuten open voor koppelen en leest tegelijk wat HA op het netwerk vond.
  Gevonden apparaten komen live binnen (realtime), met "Het kan even duren
  voor hij in de lijst staat."
- **Kiezen met knipperen**, met de twee hulpknoppen van Google: "Hij
  knippert niet" en "Ik zie mijn lamp niet", die naar hulp per soort gaan
  (stroom, dichter bij de box of een ander apparaat op stroom, uit en aan,
  terugzetten naar fabrieksinstellingen).
- **Meerdere tegelijk:** wie vier lampen koppelt, noemt ze één voor één (de
  lamp die knippert), en eindigt met "Je 4 lampen zijn klaar".
- **Klaarzetten** volgt de Not-Broken-Yet Rule ("Wordt klaargezet").
- **QR / Matter-code:** pas met Matter. De QR-scanner van de claim-flow
  (`QrScanner`) is dan herbruikbaar.

**Hoort in dezelfde spec:** het apparaatmodel. Nu is een device één
`entity_id`; een echte bewegingssensor heeft er vier (beweging, batterij,
licht, temperatuur). Een device wordt één fysiek apparaat (HA-device-id of
Zigbee-adres), met een hoofdentiteit, mogelijkheden/subtype (zoals HA's
`device_class`) en `connection` (`zigbee` / `wifi`). Batterij- en
sensorstanden (A2) leunen daarop, en de routine-spec (B1) ook.

### Fase A — klein, bouwt op wat er is (elk 1–2 weken)

**A1. Zon in schema's.** "Bij zonsondergang", "30 min voor zonsopkomst" als
alternatief voor een tijd. Staat al in `docs/status.md` als bewust uitgesteld.
- Agent: `sun.sun` (`next_rising`/`next_setting`) per dag uit HA, in de
  snapshot mee; scheduler rekent de minuut uit. Offset begrenzen (Google: max
  een paar uur).
- Schema: `schedules.time` blijft, erbij `trigger` (`time`/`sunrise`/`sunset`)
  en `offset_min`. Migratie vult `time` in voor bestaande schema's.
- PWA: in "Vanzelf uitvoeren" een keuze Tijd / Zonsopkomst / Zonsondergang.
- Risico: zonder internet blijft `sun.sun` werken (lokale berekening), wel
  een thuislocatie nodig; die heeft HA al voor het weer.

**A2. Batterij en sensorstanden in "Let op".** ✅ Gebouwd 2026-10-14, samen met A0 (spec `2026-10-14-device-pairing-design.md`). Zigbee2MQTT meldt `battery`;
lekkage-, rook- en contactsensoren hebben een binaire stand.
- Agent: batterij-attribuut meeschrijven in `device_state`.
- PWA: "Batterij bijna leeg" (onder ~15 %) in `sortAttention`; sensortegels
  met een stand in woorden ("Droog"/"Lek", "Dicht"/"Open") i.p.v. aan/uit.
  Real Light Rule: sensoren gloeien niet.
- Testen met `mosquitto_pub` zoals bij bewegingslicht.

**A3. Snelkoppelingen naar scènes.** Google heeft een widget; een PWA kan dat
niet, maar wel `shortcuts` in het manifest (lang indrukken op het app-icoon).
Klein, maar alleen statisch (manifest), dus hooguit vaste items zoals "Alles
uit". Laagste prioriteit van fase A.

### Fase B — één automatiseringsmodel (het grote besluit)

**B1. Routines: starter → voorwaarden → acties.** Nu zijn er drie losse soorten
(scènes, schema's, bewegingslicht). Google laat zien waar dat heen groeit:
één editor met starters (tijd, zon, apparaat verandert, aanwezigheid),
voorwaarden (tijdvenster, dagen, aanwezigheid, apparaatstand) en acties
(apparaat, scène, wachten, melding).
- **Onomkeerbaar:** het datamodel. Twee wegen:
  1. *Generiek:* collectie `automations` met `starters`/`conditions`/`actions`
     als JSON (zoals `scenes.actions` nu), validatie in de agent en een
     PocketBase-hook. Flexibel; PB-regels kunnen niet in de JSON kijken.
  2. *Getypt blijven:* elke nieuwe soort een eigen collectie (zoals
     `motion_lights`). Simpel per soort, maar de editor en de agent groeien
     per soort.
  **Besloten (2026-10-13): generiek**, met een **gesloten lijst**
  starter-/actiesoorten (geen vrije HA-services), en schema's + bewegingslicht
  als *sjablonen* in de UI die bovenop dezelfde motor draaien. Gevolg: de
  PB-regels kunnen niet in de JSON kijken, dus alle inhoudelijke validatie
  (soorten, apparaten uit het eigen huis, grenzen) zit in een PocketBase-hook
  én in de agent. Bestaande collecties pas migreren als de motor zich bewezen
  heeft. Eerst een spec in `docs/superpowers/specs/`.
- Motor: de bewegingslicht-motor (`motion.go`, puur, eigenaarschap, uit-tijden
  op schijf) is de basis; "wachten" vraagt om duurzame timers (zelfde
  patroon als `/data/motion.json`).
- Lussen voorkomen: een routine die een apparaat schakelt dat zijn eigen
  starter is. Google beschermt hier niet zichtbaar tegen; wij wel (diepte- of
  tijdslimiet in de agent).

**B2. Meldingen.** Actie "Stuur een melding" + vaste meldingen (lek, rook, box
offline). Web Push (VAPID) vanuit PocketBase. Let op: push loopt via de
pushdienst van de browser (Google/Apple/Mozilla), versleuteld; de inhoud
kort houden ("Lekkage in de keuken"). Werkt pas goed met fase 3 (HTTPS,
echte `APP_URL`). Afhankelijk van A2.

**B3. Aanwezigheid (Thuis/Weg).** Google doet dit met telefoonlocatie op de
achtergrond; een PWA kan dat **niet**. Haalbare opties, oplopend in moeite:
1. Een schakelaar "Ik ben weg / thuis" per bewoner (handmatig, wel betrouwbaar).
2. Telefoon op het thuis-wifi via HA (`ping`/router-integratie) → per lid een
   telefoon koppelen. Geen app nodig, wel gedoe bij random MAC-adressen.
3. Later een native app; buiten scope.
Begin met 1 + "iedereen weg" als voorwaarde/starter in B1.

### Fase C — inzicht

**C1. Geschiedenis per apparaat.** "Wanneer ging de voordeur open?" De box
heeft het al (`agent/internal/history/`). Spanning: *sensordata blijft lokaal*,
en de PWA praat alleen met PocketBase. Opties: alleen de laatste N
gebeurtenissen per apparaat on-demand via een command (`history_query` →
antwoord in het command-record, daarna gewist), of een directe lijn
app → box via de Headscale-mesh in fase 3. Ook een architectuurbesluit; niet
vóór fase 3 kiezen. Rechten zoals Google: geschiedenis zien als aparte
schakelaar per lid.

**C2. Energie.** Stopcontacten met vermogensmeting (Zigbee) → verbruik per dag
op de stopcontacttegel, later een overzicht. Pas als er zulke stekkers in het
pakket zitten.

### Fase D — huisgenoten

**D1. Beperkte toegang ("gast").** Naast beheerder/lid een rol die alleen
bedient: geen routines, geen geschiedenis. Past in `household.pb.js` en de
regels; klein als B1 en C1 er zijn, eerder heeft het weinig nut.

## UI-inspiratie

Alleen uit de teksten: copy, standen en schermopbouw, geen lay-out of
beeld. Getoetst aan de Named Rules in `DESIGN.md`.

**Overnemen**

- **Een routine in één zin.** Routinetegels hebben als ondertitel de
  starter in woorden ("When someone comes home", "When everyone's away") en
  een uitgezet routine heet "Deactivated". Voor het generieke model: één
  helper `describeAutomation(starters, conditions, t)` in `lib/` die van de
  JSON een zin maakt ("Bij zonsondergang, op werkdagen", "Als de voordeur
  opengaat, alleen als het donker is"). Dezelfde helper voor kaarten, de
  sheet-kop en schermlezers. Schema- en bewegingskaarten doen dit al per
  soort; dit trekt het gelijk.
- **Een onvolledige stap blijft staan en zegt wat er mist.** Stappen in de
  editor krijgen een ondertitel met de fout: "Choose a device", "Add a
  message", "Requires an address", "Max offset is %d hours", "Min value is %d
  seconds". Geen modal, geen grijze Opslaan-knop zonder uitleg. Past bij een
  editor met een gesloten lijst stappen: elke soort kent zijn eigen
  ontbrekend-tekst ("Kies een lamp", "Hooguit 3 uur").
- **Gedeeltelijk gelukt is een eigen uitkomst.** "Some actions may not have
  started" naast geslaagd en mislukt. Nu kent een scène "Klaar" of een
  fouttoast; bij een routine met meer stappen: "Klaar, de staande lamp
  reageerde niet", met de verwijzing naar Let op.
- **Zon als voor/bij/na met een offset.** "Before sunset / At sunset / After
  sunset" plus uren/minuten, met een maximum. Direct bruikbaar voor A1: een
  driedelige balk **Voor / Bij / Na** (zelfde pill bar als Weergave) en een
  minutenkeuze als segmenten (15, 30, 45, 60, 90, 120), de keuze voluit in
  het label ("30 minuten voor zonsondergang").
- **Sensorstanden als woorden met een ernst.** Leak/No leak, Good/Moderate/
  Hazardous, "Needs replacement", rook/CO Normal/Warning/Critical. Voor A2:
  per sensorsoort vaste woorden ("Droog"/"Lek", "Dicht"/"Open", "Batterij
  bijna leeg"), kleur alleen samen met die tekst (State Means State Rule);
  een lek of rook is een Let op-item bovenaan, niet alleen een tegelstand.
- **Lege schermen zeggen wie of wat ze vullen.** "When any household member
  adds a device, it appears here"; "Automatically adjust devices based on
  whether someone's home or away." Het lege routinescherm heeft een
  illustratie die een verhaal vertelt (thuiskomen, de hond, muziek, licht).
  Voor ons: het huisplaatje van de login als basis, één raam dat aangaat
  bij "Je komt thuis", en één regel met een voorbeeld uit de eigen
  apparaten ("Bijvoorbeeld: gang aan bij beweging").
- **Rechten in een hele zin, met de reden.** "Household routines are only
  available to full-access members"; in de ledensamenvatting "Can see
  activity … because activity access is on". Voor D1 en C1: in de
  ledensheet onder de rol wat die persoon wel en niet kan, als zinnen.
- **Voorgestelde favorieten.** De widget heeft de modus "Suggested: your most
  used devices + automations". Voor de lege Favorieten-kaart: "Vaak
  gebruikt: Leeslamp en Plafondlamp" met één knop om ze toe te voegen.
  Tellen kan op de telefoon zelf (lokale opslag), zodat er geen
  gebruiksgegevens in PocketBase komen.

**Apparaten**

Wat Sandhovius al heeft (helderheid, wit/kleur, zes stalen, de
thermostaat-dial, Offline Fade) laat ik weg; dit is wat Google daarnaast doet.

- **Wie of wat het deed** (sterk, past nu al). Sloten tonen "persoon •
  tijd" (`lock_action_blame_text`). In de detail-sheet onder "Stand": "Aan
  sinds 14:02, door Sanne" of "door Gang bij beweging". Het eigenaarschap
  van bewegingslicht staat al in de agent, en "Aan door beweging in de app"
  staat in `docs/status.md` als uitgesteld. Bron: het laatste commando
  (wie) of de motor (welke automatisering). Als zin, niet met een middelpunt.
- **Aan voor een tijd** (sterk, deelt de motor met de "wachten"-actie).
  "Turn on or off" met een duur, "Until %1$s at %2$s", de ventilator "Run
  for", warm water "Boost for". In de sheet van een lamp of stopcontact:
  **Aan voor…** (15 min, 30 min, 1 uur, 2 uur) en de tegel zegt "Aan tot
  22:30". Duurzame timer op de box, zoals de uit-tijden van bewegingslicht.
- **Tussenstanden voor trage apparaten.** "Locking"/"Unlocking", en een
  stand met advies: "Not fully locked: you may need to physically close the
  door". Voor rolluiken en (later) sloten: "Gaat dicht…" met de
  in-flight-logica die lampen al hebben, en een stand die zegt wat je moet
  doen als het niet lukt.
- **Groepen.** "Device group", "Room groups": meerdere lampen als één tegel.
  Voor een armatuur met drie spots wil een bewoner één "Plafondlamp", niet
  drie tegels. Eén tegel met de gezamenlijke stand ("Aan · 2 van 3" als ze
  verschillen) en lampbediening die op alle drie werkt. Kan op een
  HA-lichtgroep leunen. Middelgroot; pas als er vraag naar is.
- **Opgeslagen kleuren.** Kleurpresets met een eigen naam en optioneel een
  helderheid ("Add preset", "Add brightness"), met ongedaan maken bij
  verwijderen. Naast de zes vaste stalen een rij eigen stalen per huis
  ("Leeslicht"). "Zoals nu" in scènes dekt al een deel; laag.
- **Thermostaat: tijdelijk tot…** "Hold" met "Until %1$s" of
  "Indefinitely" en "End hold"; Eco-temperaturen "when no one's home". Pas
  zinvol met verwarmingsschema's en aanwezigheid (B3): de dial krijgt dan
  "Tot 22:00, daarna 18°" en een knop "Terug naar schema".
- **Relatieve tijd bij offline.** "2 hours ago", "1 day ago": "Offline sinds
  2 uur" leest makkelijker dan een kloktijd van gisteren. Klein, bij de
  Offline Fade Rule.
- **Verwijderd terwijl je kijkt.** "Device removed" in de lampbediening: een
  sheet van een apparaat dat een huisgenoot net verwijderde, sluit met die
  melding i.p.v. dood te blijven staan. Klein, robuustheid.
- **Relatieve helderheid als actie.** "Increase or decrease brightness by":
  in routines een stap "Helderheid −30%" naast een vaste waarde. Pas bij B1.

**Overig**

- **Laten knipperen om te herkennen** (sterk). Bij het koppelen: "The light
  bulb that you pick may blink slowly"; tijdens het klaarzetten en bij
  updates: "Your light may blink a few times". Voor ons twee dingen: bij een
  nieuw Zigbee-apparaat "Welke lamp knippert nu?" vóór naam en kamer, en in
  de detail-sheet **Laat knipperen** om te vinden welke lamp welke is.
  Zigbee2MQTT kent `identify`/`effect: blink`; een gewone lamp kan aan-uit.
  En het vooraf zeggen ("je lamp kan even knipperen") voorkomt dat een
  bewoner denkt dat er iets stuk is.
- **Hulp bij offline.** "Troubleshoot offline issues" als knop in de
  offline-banner. Bij ons: in Let op en de sheet van een offline apparaat
  "Wat kan ik doen?" met stappen per soort (batterij, stroom, te ver van de
  box, opnieuw koppelen). Past bij de doelgroep; nakijken wat Let op nu
  per apparaat al uitlegt.
- **Geschiedenis wissen.** "Delete all presence history". Hoort bij C1: een
  bewaartermijn (bijvoorbeeld 30 dagen) en **Geschiedenis wissen** voor
  beheerders. Maakt de privacybelofte zichtbaar.
- **Temperatuurstanden.** Benoemde presets Comfort ("when you're home"), Eco
  ("when no one's home") en Slaap ("at bedtime"), met een omschrijving,
  een label "Saves energy" en een vergelijking ("2° lager dan Comfort").
  Bij ons als drie pillen onder de dial, en bruikbaar in scènes, routines
  en straks Thuis/Weg (B3). Eerst nagaan of de thermostaathardware dat
  zelf kent of dat de agent het bijhoudt.
- **Kamersensoren voor de thermostaat.** "When multiple sensors are
  selected, the thermostat heats or cools … based on the average", en bij
  een schema "Using sensors (optional)". Losse Zigbee-temperatuursensoren
  zijn goedkoop; of de thermostaat een externe sensor accepteert hangt af
  van de hardware. Onderzoeken voordat we het beloven.
- **Een overzicht na het inrichten.** "Here's a review of what you have set
  up, and some additional things you can do". Na het koppelen van een box
  en de eerste apparaten: "Je huis is klaar: 3 kamers, 5 apparaten", dan
  twee of drie volgende stappen (huisgenoot uitnodigen, eerste scène,
  bewegingslicht). Lokaal te bepalen uit wat er al is.
- **Een huismodus.** "Home/Away" en "Holiday mode" (bij sloten).
  Bij ons later één keuze Thuis / Weg / Op vakantie die routines kan
  pauzeren of juist aanzetten; hoort bij B3.
- **Een teller bij namen.** "%1$d/12 characters used", "Keep it short and
  memorable". Een tegelnaam staat op hooguit twee regels; een zachte grens
  met teller voorkomt afgekapte namen. Klein.

**Niet overnemen**

- **Middelpunten als scheiding** ("Locked • Closed", "%1$s • %2$s"): de
  Sentence Case Rule wil zinnen ("Op slot en dicht").
- **"Tap to unlock"** zonder bevestiging. Een tegel is bij ons één tik =
  schakelen; voor een slot (later) een bevestiging in de sheet, nooit
  ontgrendelen vanaf een tegel.
- **Hoofdletters per woord**, en twee schrijfwijzen naast elkaar ("After
  Sunrise" en "After sunrise" bestaan allebei; de app is halverwege een
  omzetting).
- **Vage fouten:** "Error", "Something went wrong", "Couldn't connect".
  Bij ons zegt een fout wat er misging en wat je kunt doen.
- **"This cannot be undone"-dialogen** bij verwijderen. Ongedaan maken
  (6 s, daarna pas echt weg) is vriendelijker en blijft de regel.
- **"Starting…" → "Started" → "Success"** als drie standen voor één tik.
  "Wordt uitgevoerd" → "Klaar" (plus "gedeeltelijk gelukt" hierboven) is
  genoeg voor een bewoner; het verschil tussen "aangenomen" en "gedaan" hoort
  in de agent, niet op de tegel.

## Wifi-apparaten (besloten 2026-10-14: ja, met eerlijke uitleg)

Bewoners mogen eigen wifi-apparaten toevoegen. Sloten en camera's komen
later apart.

- **Drie niveaus, niet twee.** Zigbee werkt zonder router; een *lokaal*
  wifi-apparaat (Shelly, ESPHome, WLED, Tasmota, later Matter) werkt zonder
  internet maar niet zonder router; een *cloud*-apparaat (veel Tuya) werkt
  niet zonder internet en de server van de fabrikant. Alleen de eerste twee
  ondersteunen: cloud breekt "werkt ook zonder internet" en vraagt om
  accountgegevens op de box.
- **Eerste integratie: Philips Hue (bridge).** De Hue-bridge is lokaal
  (HA-integratie `hue`, lokale push), wordt via zeroconf gevonden of op IP
  toegevoegd, en kan tegelijk aan Google Home en HA hangen (eenmalig de
  knop op de bridge indrukken). Een bridge is een tussenstation: bridge
  weg = al zijn lampen weg, dus Let op groepeert per bridge zoals bij wifi.
- **Gesloten lijst integraties**, zoals bij routines: per ondersteunde soort
  testen we koppelen, offline en herstellen. Geen vrije HA-integraties.
- **Ontdekken via HA.** HA vindt lokale wifi-apparaten zelf (mDNS/zeroconf)
  als ontdekte config-flows; de agent leest die, de PWA toont "Gevonden op
  je wifi: Shelly Plug S", de bewoner bevestigt, de agent rondt de flow af
  (zelfde patroon als `AddMQTT` in `agent/internal/homeassistant/integrations.go`).
  **Vereist:** HA met `network_mode: host` op de box; nu zit HA op het
  bridge-netwerk (`docker-compose.yml`) en ziet mDNS niet. Op Windows
  (Docker Desktop) werkt host-netwerk anders: lokaal testen met een
  handmatig IP of een nep-apparaat.
- **Schema:** `devices.connection` (`zigbee` / `wifi`), gezet door de agent.
  Dat stuurt de uitleg in de app; ook in de routine-spec meenemen (een
  routine met een wifi-apparaat zegt dat erbij).
- **Let op wat "wifi uit" betekent:** is de router uit, dan bereikt de app
  de box sowieso niet (ook niet voor Zigbee); wat dan nog werkt zijn de
  automatiseringen op de box. De belofte is dus: Zigbee-automatiseringen
  lopen door, wifi-apparaten doen dan niet mee.
- **Bewust maken, op drie momenten:** bij toevoegen ("Werkt via je wifi.
  Valt je wifi uit, dan doet dit apparaat niet mee met je
  automatiseringen."), in de detail-sheet als één regel, en
  bij een storing: gaan alle wifi-apparaten tegelijk offline, dan één regel
  in Let op ("Je wifi-apparaten zijn niet bereikbaar. Staat je router aan?")
  i.p.v. een rij losse "Offline"-meldingen.

## Bewust niet

- **Camera's, gebeurtenisbeschrijvingen met generatieve AI, Assistant,
  omroepen, Downtime, wifi-routerbeheer:** andere hardware of cloud-AI; botst
  met "geen cloud-logs" en het hardwarepakket.
- **Automatiseringssuggesties met een taalmodel:** zelfde reden. Een vaste
  lijst sjablonen op basis van de apparaten in huis ("Je hebt een
  bewegingssensor in de gang, licht aan bij beweging?") geeft het meeste van
  de waarde, lokaal en zonder model.
- **Slimme sloten en gastcodes:** veiligheidsgevoelig (bevestiging,
  audit-trail, wat als de box offline is). Pas na C1 en met echte hardware.

## Volgorde

~~Spec apparaten (A0 + apparaatmodel + A2) → A0 → A2~~ (gebouwd) → A1 → spec B1 → B1 →
B3 (handmatig) → B2 (met fase 3) → C1 → D1.
A3 en C2 alleen als er tijd of vraag is. Ruwe maat bij 10–15 uur/week:
fase A ~3–4 weken, B1 ~4–6 weken, de rest volgt op fase 3.

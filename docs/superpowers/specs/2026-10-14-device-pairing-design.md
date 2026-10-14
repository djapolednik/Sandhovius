# Apparaten koppelen: echte apparaten zoeken en toevoegen

Datum: 2026-10-14 · Status: gebouwd (2026-10-14; Hue nog niet met een echte bridge doorgelopen) · Bouwt op: bewegingslicht
(`2026-10-13-motion-light-design.md`, device-cache), huisgenoten
(`2026-10-07-household-design.md`), box-identiteit
(`2026-10-06-box-identity-design.md`) · Plan:
`docs/superpowers/plans/2026-10-13-google-home-feature-roadmap.md` (A0 + A2)

## Doel

Een bewoner voegt een echt apparaat toe vanuit de app: soort kiezen, het
apparaat in koppelstand zetten, het knipperende apparaat kiezen, naam en
kamer geven. Nu maakt "+" een virtuele HA-helper (`input_boolean` /
`input_number`, `provisionDeviceEntity` in `agent/internal/app/agent.go`) en
gaan echte apparaten met de hand via het PocketBase-beheer. Dat verdwijnt.

Tegelijk krijgt een device een stevige identiteit (het Zigbee-adres in plaats
van de friendly name) en een vaste woordenlijst van mogelijkheden, waar
batterij en sensorstanden (A2) en later de routines op leunen.

## Reikwijdte

- **Bronnen:** Zigbee (via Zigbee2MQTT op de box) en Philips Hue (lokaal via
  de Hue-bridge). Andere lokale merken (Shelly, ESPHome, WLED) volgen per
  stuk met hetzelfde patroon; cloudapparaten nooit.
- **Soorten:** lamp, stekker, sensor, thermostaat (de huidige vier types).
- **Batterij en sensorstanden** (A2) in dezelfde slag: ze hangen aan het
  nieuwe model.
- Niet in scope: Matter en QR-codes, andere merken dan Hue, groepen, kleuren
  bewaren, firmware-updates, meldingen, routines, een naam terugschrijven
  naar Zigbee2MQTT.

## Beslissingen

| Vraag | Keuze | Waarom |
|---|---|---|
| Virtuele helpers | Weg, ook niet als verborgen demo-optie. Harde overgang: een migratie verwijdert ze | Een bewoner mag nooit per ongeluk een neplamp toevoegen. Er zijn nog geen kopers; het is alleen dev-data. Twee apparaatpaden onderhouden kost meer dan opnieuw koppelen. |
| Wie maakt een device-record? | Alleen de box. Bewoners mogen geen device meer aanmaken | Anders geldt "geen neplamp" alleen in de UI. De box maakt het record als een bewoner een gevonden apparaat toevoegt. |
| Eerst een soort kiezen | Ja: Lamp, Stekker, Sensor, Thermostaat, plus "Via een merk" | Zoals Google Home ("Pick a light to set up"). De soort bepaalt de uitleg om het apparaat in koppelstand te zetten. |
| Filtert de soort? | Ja. Kies je Lamp, dan staan er alleen lampen in de lijst. Wat Zigbee2MQTT meldt bepaalt of iets een lamp is | Eenvoudig voor de bewoner. De keuze is de vraag, de melding is de waarheid. |
| Ander apparaat in het venster | De agent haalt het meteen van het Zigbee-netwerk; aan het eind van de sessie ook elk gevonden apparaat dat niet is toegevoegd | Koppelen geldt voor het hele netwerk. Regel: **wat op het netwerk zit, staat in de app.** Geen onzichtbare apparaten die een plek innemen of "al gekoppeld" zeggen. |
| Wat de agent nooit weghaalt | Apparaten die er vóór de sessie al waren, en Hue-lampen | Alleen wat in deze sessie binnenkwam en niet werd gekozen. Hue-lampen zitten op het netwerk van de bridge, niet op het onze. |
| Identiteit | `address` = Zigbee IEEE-adres (`0x00158d…`) of het HA-device-id bij Hue; nooit de friendly name | De friendly name verandert bij hernoemen of opnieuw koppelen; daar zat de bug van het opnieuw gekoppelde bewegingssensor-record. |
| Eén record per… | Per bedienbaar deel: een dubbele inbouwschakelaar of stekkerdoos geeft meer records met hetzelfde `address` en een eigen `endpoint` | Een bewoner denkt in lampen, niet in modules: elk deel een eigen naam, kamer, favoriet en plek in scènes. |
| Type en weergave | `type` = wat het is (agent); `shown_as` = hoe het eruitziet (bewoner, nu alleen `light` voor een `switch`) | Een stekker met een staande lamp wil een lamptegel. De waarheid blijft staan voor commando's en mogelijkheden; terugzetten verliest niets. |
| Mogelijkheden | `capabilities`: JSON-lijst uit een vaste woordenlijst, gezet door de agent, gecontroleerd in een hook | Zelfde patroon als de routines (generiek JSON, gesloten lijst). De tegel, de sheet, Let op en straks de routine-starters lezen deze lijst. |
| Kanaal app ↔ box | Twee nieuwe collecties (`pairing_sessions`, `pairing_candidates`), geen commando's | Een sessie duurt minuten, heeft meer standen en meer gevonden apparaten. Commando's zijn eenmalig en verlopen na 2 minuten. De box abonneert zich realtime, zoals op zijn eigen record. |
| Wie mag koppelen? | Elk lid van het huis | Zoals nu: elk lid bedient en richt in. |
| Een sessie tegelijk | Per huis één open sessie | Twee telefoons die tegelijk zoeken zouden elkaars vondsten zien of weghalen. |
| Hoe lang zoeken | 4 minuten (Zigbee2MQTT staat koppelen tot 254 s toe), met "Langer zoeken" | Genoeg voor een paar lampen; daarna dicht, want een open netwerk laat ook de buren binnen. |
| Box onbereikbaar | "+" werkt niet en zegt waarom | Zonder box kan niemand zoeken. Zoals schakelen nu. |

## Datamodel

### `devices` (gewijzigd)

| veld | type | wie schrijft | opmerkingen |
|---|---|---|---|
| `gateway`, `room`, `name`, `online` | zoals nu | | |
| `type` | select `light` / `switch` / `sensor` / `climate` | box | afgeleid bij koppelen |
| `source` | select `zigbee` / `hue` | box | groeit per merk; zigbee of wifi volgt hieruit |
| `address` | text | box | stabiele identiteit, nooit getoond |
| `endpoint` | text | box | leeg voor een simpel apparaat; `l1`, `l2` … bij een meervoudig |
| `entity_id` | text | box | alleen de HA-hoofdentiteit om te bedienen (`light.*`, `switch.*`, `climate.*`); leeg bij een sensor |
| `capabilities` | json | box | zie woordenlijst |
| `model` | text | box | "IKEA TRÅDFRI LED1836G9", voor de lijst en hulp |
| `shown_as` | select `light`, leeg | bewoner | alleen toegestaan als `type = switch` |

Regels: `createRule = null` voor bewoners (de box maakt records in zijn eigen
huis). Bewoners mogen `name`, `room` en `shown_as` wijzigen, en verwijderen;
de box-velden niet (`@request.body.<veld>:isset = false`, zoals bij `houses`).
Een hook controleert `capabilities` (alleen woorden uit de lijst) en
`shown_as`.

**Woordenlijst `capabilities`:** `onoff`, `brightness`, `color_temp`,
`color`, `heating`, `occupancy`, `contact`, `water_leak`, `smoke`,
`temperature`, `humidity`, `illuminance`, `battery`.

### `pairing_sessions` (nieuw)

| veld | type | opmerkingen |
|---|---|---|
| `house` | relation → houses, cascadeDelete, verplicht | |
| `kind` | select `light` / `switch` / `sensor` / `climate` / `hue` | `hue` = via een merk |
| `status` | select `starting` / `open` / `waiting_button` / `closed` / `failed` | `waiting_button` alleen bij Hue |
| `expires` | date | door de box gezet bij openen |
| `error` | text | box; leeg = goed |
| `created_by` | relation → users | |
| `extend` | bool | bewoner: "Langer zoeken"; de box zet hem terug |
| `button_pressed` | bool | bewoner, alleen bij Hue; de box zet hem terug |

Bewoners (leden) maken een sessie aan (`status = "starting"`), mogen hem
sluiten (`status = "closed"`) of verlengen (`extend = true`, de box zet een
nieuwe `expires`), en bij Hue melden dat de knop is ingedrukt
(`button_pressed = true`). Alle andere velden schrijft de box. Een hook
weigert een tweede open sessie in hetzelfde huis.

### `pairing_candidates` (nieuw)

| veld | type | opmerkingen |
|---|---|---|
| `session` | relation → pairing_sessions, cascadeDelete | |
| `address`, `endpoint`, `type`, `capabilities`, `model`, `source` | zoals bij devices | box |
| `status` | select `interviewing` / `found` / `unsupported` / `adding` / `added` / `failed` | box |
| `identify` | number | bewoner verhoogt hem om te laten knipperen |
| `name`, `room` | text, relation | bewoner vult in bij toevoegen |
| `add` | bool | bewoner zet aan; de box maakt dan het device |
| `device` | relation → devices | box, na toevoegen |

Candidates van een ander type dan de sessie schrijft de box niet weg: die
gaan meteen van het netwerk.

## Agent

### Zigbee: de koppelsessie

Een pure motor (`pairing.go`, zoals `motion.go`) met I/O eromheen
(`pairing_runner.go`).

1. **Sessie `starting`** → `zigbee2mqtt/bridge/request/permit_join`
   `{"time": 240}` → status `open`, `expires`. Lukt het niet (geen adapter,
   Zigbee2MQTT weg): `failed` met een foutcode.
2. **`bridge/event` `device_joined`** voor een adres dat vóór de sessie niet
   op het netwerk stond → candidate `interviewing` (Not-Broken-Yet Rule).
3. **`device_interview` `successful`** → uit `definition.exposes` volgen
   type, endpoints en mogelijkheden (pure functie `classify(exposes)`).
   - Geen definitie (onbekend apparaat) → `unsupported`, van het netwerk.
   - Ander type dan de sessie → meteen van het netwerk, geen candidate.
   - Per endpoint één candidate `found`.
4. **`identify`** omhoog → `zigbee2mqtt/<naam>/set` `{"effect": "blink"}`
   bij een lamp, of `identify` als het apparaat dat kent. Een stekker zonder
   identify knippert niet; de app zegt dan "Druk op het knopje van de
   stekker" (veilig: een stekker aan en uit zetten kan een apparaat
   starten).
5. **`add`** → device-record met `address`, `endpoint`, `entity_id` (de
   HA-entiteit van dat apparaat en endpoint, gevonden via de HA-registry: de
   identifiers van een Zigbee2MQTT-device zijn `zigbee2mqtt_<ieee>`), naam,
   kamer; candidate `added`. Daarna de gewone afstemming (online, stand).
6. **Sessie dicht** (verlopen, bewoner, of de app weg): `permit_join`
   `{"time": 0}`; elk adres uit deze sessie zonder toegevoegd deel →
   `bridge/request/device/remove` `{"id": <ieee>}`.

De agent bewaart welke adressen hij zelf toevoegde (`/data/devices.json`).
Hij haalt alleen een adres van het netwerk dat in deze sessie binnenkwam, of
dat hij zelf toevoegde en waarvan het laatste device-record werd verwijderd.
Nooit een adres dat hij niet kent: zo kan een halve lijst uit PocketBase (een
storing) nooit tot het leeghalen van het netwerk leiden.

### Hue

1. **Sessie `hue`** → de agent zoekt een ontdekte Hue-flow in HA
   (`GET /api/config/config_entries/flow`, handler `hue`). Op de box vindt
   HA de bridge zelf (mDNS; vereist `network_mode: host`). In dev:
   `HUE_BRIDGE_HOST` in env start de flow met dat adres. Niets gevonden →
   `failed`, "Geen Hue-bridge gevonden".
2. Status `waiting_button` → de app zegt "Druk op de knop van je
   Hue-bridge" en toont **Ik heb gedrukt** → `button_pressed` → de agent
   rondt de link-stap af. Te vroeg of niet gedrukt: terug naar
   `waiting_button` met "De bridge reageerde nog niet. Druk en probeer het
   nog eens."
3. Gekoppeld (of al eerder) → elke lamp en sensor van de bridge die nog niet
   in de app staat wordt een candidate (uit de HA-registry, config-entry
   `hue`). Identify = `light.turn_on` met `flash: short`.
4. Niet toegevoegde Hue-lampen blijven op de bridge; een volgende
   Hue-sessie biedt ze weer aan. Verwijderen in de app haalt een Hue-lamp
   niet van de bridge.

De bridge mag tegelijk aan Google Home of de Hue-app hangen.

### Bestaande devices

- **Harde overgang:** een PocketBase-migratie verwijdert **alle** bestaande
  devices (er zijn alleen dev-data: helpers en `fake-lights`-lampen; geen
  echte Zigbee-apparaten), met hun `device_state` en favorieten, en maakt
  de stappen van scènes leeg (bewegingslichten volgen via de relatie). Een
  overgang voor Zigbee-devices met de friendly name in `entity_id` is dus
  niet nodig. De agent verwijdert bij de eerste start na de update zijn
  helpers uit HA (eenmalig, vlag in `/data`). `provisionDeviceEntity` en het
  commando `provision` verdwijnen.
- **Opzoeken:** binnenkomende Zigbee-berichten zoekt de agent op via een
  kaart friendly name → adres (uit het retained topic
  `zigbee2mqtt/bridge/devices`), niet via `entity_id`.

### Tegel en lezing

- **Bedienen** via `entity_id` (zoals nu `CallService`).
- **De lezing op een sensortegel**: de eerste mogelijkheid uit
  `smoke` > `water_leak` > `contact` > `occupancy` > `temperature` >
  `humidity` > `illuminance`. `battery` is nooit de lezing.
- Die volgorde staat nu alleen in `lib/` (PWA). De agent krijgt hem pas met
  de routines; dan met gedeelde testvectoren zoals `claim_codes.json`.

## Batterij en sensorstanden (A2)

- **Woorden per mogelijkheid** (State Means State Rule: kleur alleen met
  tekst): `contact` "Dicht"/"Open", `water_leak` "Droog"/"Lek", `smoke`
  "Geen rook"/"Rook", `occupancy` "Beweging"/"Geen beweging",
  `temperature` "21,5°", `humidity` "55%".
- **Let op:** "Batterij bijna leeg" bestaat al (`lib/battery.js`, 20% en
  lager, ook in de detail-sheet). Nieuw: "Lekkage" en "Rook" als soort,
  zwaarder dan alles (`sortAttention`: `smoke`, `leak`, `offline`,
  `battery`). Geen gloed; de tegel van een sensor gloeit nooit.
- Let op bij Zigbee2MQTT: `contact: true` betekent **dicht**.

## PWA

`AddDeviceModal` wordt een stroom in één sheet:

1. **Wat voeg je toe?** Vier soorttegels (Lamp, Stekker, Sensor,
   Thermostaat) en een rij **Via een merk** (Philips Hue).
2. **Koppelstand**, per soort een korte uitleg met tekening: lamp "Zet de
   lamp 5 keer aan en uit, 1 seconde per keer", stekker "Houd het knopje 5
   seconden ingedrukt", sensor "Druk het knopje in met een paperclip tot het
   lampje knippert", thermostaat "Kijk in de handleiding hoe je hem
   koppelt". Daaronder "Zoeken…" met de resterende tijd en **Langer
   zoeken**.
3. **Gevonden:** rijen met icoon, het model in gewone woorden en **Laat
   knipperen**; een rij in `interviewing` zegt "Wordt klaargezet" (dashed,
   spinner). "Het kan even duren voor hij in de lijst staat." Twee
   hulpknoppen: **Hij knippert niet** en **Ik zie mijn lamp niet**, naar
   hulp per soort (stroom, dichter bij de box of een apparaat op stroom, uit
   en weer aan, terugzetten naar fabrieksinstellingen).
4. **Naam en kamer** per gekozen apparaat (de kamer standaard die je
   bekeek), **Toevoegen**.
5. **Klaar:** "Je 3 lampen zijn klaar", en een knop **Nog een toevoegen**.
   Sluiten van de sheet sluit de sessie.

Een niet ondersteund apparaat: "Dit apparaat kennen we nog niet. We hebben
het weer losgekoppeld." Hue: stap 2 wordt "Druk op de knop van je
Hue-bridge" met **Ik heb gedrukt**.

De detail-sheet krijgt **Laat knipperen** (zelfde mechanisme, via een
nieuwe command-actie `identify` op het device; `provision` gaat uit de lijst) en, bij een stekker, **Weergeven als
lamp** (een switch, schrijft `shown_as`). Een stekker als lamp gebruikt de
lamptegel en de warme gloed, telt mee in "2 lampen aan", en krijgt geen
helderheid.

Copy in `messages/nl.json` en `en.json`; foutcodes van de box als sleutels
(`errors.codes.<code>`), zoals de hooks.

## Testen en dev

- **`scripts/fake-zigbee.py`** vervangt `fake-lights.py`: een nep-Zigbee2MQTT
  op MQTT. Het antwoordt op `permit_join`, publiceert `bridge/devices`
  (retained), `device_joined` en `device_interview` met nep-adressen, de
  HA-discovery met `zigbee2mqtt_<ieee>` als identifier, de stand per
  apparaat, en voert `set`, `effect: blink` en `device/remove` uit. Een
  apparaat laten "binnenkomen":
  `mosquitto_pub -t fake/zigbee/join -m '{"kind":"light"}'` (ook
  `plug2` voor een dubbele stekker, `motion`, `leak`). Werkt op Windows
  zonder adapter; de echte Zigbee2MQTT-container start zonder stick niet,
  dus ze zitten elkaar niet in de weg.
- **Go:** `classify(exposes)` met echte exposes van een paar bekende
  apparaten als testdata; de koppelmotor puur (gebeurtenissen erin,
  acties eruit: weghalen, aanmaken, sluiten), inclusief "nooit een onbekend
  adres weghalen".
- **Integratietests** (`backend/tests`): bewoner kan geen device aanmaken en
  geen box-velden zetten; `shown_as` alleen op een switch; één open sessie
  per huis; een lid van een ander huis ziet geen sessies of candidates.
- **`lib/`:** de lezing-volgorde, de woorden per mogelijkheid, lek en rook
  in Let op.
- **Met de hand:** Hue op de dev-machine via `HUE_BRIDGE_HOST` (dat schakelt
  echte lampen in huis; vooraf zeggen), de nep-Zigbee voor de rest; met een
  stick later op de thuisserver.

## Open

- Hoe de link-stap van de HA-Hue-flow zich precies gedraagt als de knop nog
  niet is ingedrukt (opnieuw indienen of een nieuwe flow); nakijken tegen de
  HA-versie op de box.
- Welke Zigbee-thermostaten we ondersteunen: `climate`-exposes verschillen
  sterk per merk. Eerst één bekend model; andere als `unsupported`.
- `permit_join` via een specifieke router in plaats van het hele netwerk
  (Zigbee2MQTT kan dat) is mooier voor "dichter bij de lamp", maar pas als
  er echte huizen met bereikproblemen zijn.

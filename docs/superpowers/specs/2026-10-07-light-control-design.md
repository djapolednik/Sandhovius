# Lampen dimmen en kleuren — ontwerp

Datum: 2026-10-07 · Status: ter review

## Doel

Een lamp is nu alleen aan of uit. Bewoners willen dimmen, warm of koel wit
kiezen en gekleurde (RGB) lampen een kleur geven, en scènes als "Avond" met
gedimd warm licht maken. De app toont per lamp alleen wat die lamp kan.

## Vastgelegde keuzes (uit het gesprek)

| Vraag | Keuze | Waarom |
|---|---|---|
| Wat een lamp kan | Helderheid, kleurtemperatuur én volledige kleur (RGB); per lamp alleen wat Home Assistant meldt (`supported_color_modes`) | Dekt gewone, warm/koel- en gekleurde lampen; een lamp zonder kleur krijgt geen kleurbediening. |
| Waar bedienen | Detail-sheet (lang indrukken), met de stand op de tegel ("Aan · 60%") en een gloed in de echte kleur en sterkte | Tikken blijft aan/uit; tegels blijven klein (Home past op een laptop); geen schuif die je per ongeluk raakt bij scrollen. |
| Scènes | Per lamp Aan / Uit / **Zoals nu** (huidige helderheid en kleur vastleggen) | Gangbaar in smart-home-apps; geen schuiven per lamp in de scène-sheet. |
| Commando | `turn_on` met een payload; geen nieuwe actie | Eén command-taal voor app en scènes; "Zoals nu" is gewoon een `turn_on` met payload. Een aparte `set_light` of de PWA rechtstreeks naar HA zijn afgewezen. |
| Testen zonder hardware | Gesimuleerde Zigbee-lampen via MQTT-discovery (`scripts/fake-lights.py`) | Home Assistant ziet echte `light.*`-entities met dezelfde attributen als een Zigbee-lamp via Zigbee2MQTT; de code hoeft later niet te veranderen. |
| MQTT in Home Assistant | De agent voegt de MQTT-integratie zelf toe als die ontbreekt (broker `mosquitto:1883`) | Nodig voor de testlampen én straks voor echte Zigbee-apparaten; zelfde aanpak als Met.no. |

## Buiten scope

- Echte apparaten koppelen (Zigbee-pairing, een bestaande HA-entity kiezen):
  volgt zodra er hardware is. Een via "Apparaat toevoegen" gemaakte lamp blijft
  een aan/uit-helper.
- Effecten, overgangstijden, kleurlussen, groepen/kamers dimmen in één keer.
- "Alles uit" en de kamerschakelaar: ongewijzigd (alleen aan/uit).

## Data

Geen schemawijziging. Wat een lamp kan en hoe hij staat, staat al in
`device_state.state.attributes` (de agent stuurt de attributen van Home
Assistant mee):

- `supported_color_modes`: `onoff`, `brightness`, `color_temp`, `hs`/`rgb`/`xy`/`rgbw`/`rgbww`
- `brightness` (0–255), `color_mode`, `color_temp_kelvin`,
  `min_color_temp_kelvin`, `max_color_temp_kelvin`, `rgb_color`

Afgeleid in de PWA (`frontend/lib/light.js`):
- **kan dimmen**: elke mode behalve alleen `onoff`;
- **kan wit**: `color_temp` in de modes;
- **kan kleur**: een van `hs`, `rgb`, `xy`, `rgbw`, `rgbww`.

## Commando's

Een `commands`-record (of scène-stap) `{action: "turn_on", payload: {...}}`
met hooguit deze sleutels:

| Sleutel | Waarde |
|---|---|
| `brightness_pct` | geheel getal 1–100 |
| `color_temp_kelvin` | geheel getal 1500–9000 (de agent klemt niet; de lamp/HA klemt binnen haar eigen bereik) |
| `rgb_color` | drie gehele getallen 0–255 |

`color_temp_kelvin` en `rgb_color` sluiten elkaar uit. Zonder payload blijft
alles zoals nu.

**Agent** (`runSceneStep` en `handleCommand` delen dezelfde functie):
- `turn_on` met een niet-lege payload op een `light.*`-entity →
  `light.turn_on` met de gecontroleerde payload.
- Payload met een onbekende sleutel, een waarde buiten bereik, beide
  kleursleutels, of een payload op een entity die geen `light.*` is → `failed`
  met een Nederlandse reden ("Deze lamp kan niet dimmen", "Ongeldige kleur").
  Een scène-stap die zo faalt, houdt de rest van de scène niet tegen (zoals nu).
- Zonder payload: `homeassistant.turn_on` zoals nu.

**MQTT-integratie**: bij het starten (na de HA-verbinding) kijkt de agent of de
integratie `mqtt` bestaat; zo niet, dan zet hij hem op via de config flow van
Home Assistant met broker `mosquitto`, poort 1883 (zelfde patroon als
`AddWeather`). Mislukt dat, dan logt hij het en draait hij gewoon door.

## PWA

Lees `DESIGN.md` (Real Light Rule, tile glow, detail sheet) vóór het UI-werk.

**Tegel**
- Stand: "Aan · 60%" (`brightness` → procent, afgerond) als de lamp kan
  dimmen, anders "Aan". Tijdens een niet-bevestigde wijziging "Aan · 60%…",
  zoals bij aan/uit.
- **Gloed in de echte kleur en sterkte**:
  - kleur: bij kleurtemperatuur een verloop van amber (2200K, `--lamp-glow`)
    naar neutraal wit (6500K); bij RGB de kleur van de lamp, iets
    gedesatureerd zodat Home rustig blijft;
  - sterkte: de dekking van de gloed schaalt met de helderheid (bij 1% nog
    zichtbaar, bij 100% zoals nu);
  - het lampicoon neemt dezelfde kleur aan, maar valt terug op `lamp-icon`
    (amber) als de kleur minder dan 3:1 contrast heeft met de icooncirkel.
- Een lamp die alleen aan/uit kan, gloeit zoals nu.

**Detail-sheet** (onder "Stand", na de aan/uit-schakelaar, alleen wat de lamp kan):
- **Helderheid**: schuif 1–100%, waarde ernaast.
- Kan de lamp wit én kleur: een pillenbalk **Wit / Kleur** (staat op de
  huidige `color_mode`) bepaalt welke bediening eronder staat.
- **Wit**: schuif van warm naar koel binnen `min/max_color_temp_kelvin`, met
  een verloop als baan (amber → wit).
- **Kleur**: zes ronde stalen (rood, oranje, geel, groen, blauw, paars) en
  "Meer kleuren" (een `<input type="color">`, de kiezer van het toestel).
- Bedienen kan alleen als de lamp aan en online is en de box bereikbaar is; een
  schuif op een lamp die uit staat zet hem eerst aan (`turn_on` met de nieuwe
  waarde).
- Native `<input type="range">` (toetsenbord, schermlezer: "60 procent",
  "2700 kelvin"), 44px raakvlak. Tijdens slepen hooguit één commando per
  400 ms, het laatste bij loslaten; de tegel toont het voornemen meteen.
- Offline of box onbereikbaar: alles uitgeschakeld, met de bestaande uitleg.

**Scène-sheet**: per lamp een keuze **Aan / Uit / Zoals nu**. "Zoals nu"
(alleen bij een lamp die kan dimmen of kleuren, en alleen als hij aan staat)
legt de huidige stand vast als `turn_on`-payload: `brightness_pct` plus
`color_temp_kelvin` of `rgb_color` volgens `color_mode`. Een bestaande scène
met "Zoals nu" toont bij openen die opgeslagen stand ("40%, warm wit"). Op de
scènetegel: "Staande lamp 40%".

## Testlampen (`scripts/fake-lights.py`)

Alleen voor dev, stdlib + `paho-mqtt` (dubbel gelicentieerd EPL-2.0 / EDL-1.0;
EDL-1.0 is BSD-3, dus binnen de licentie-eis), in `scripts/requirements.txt`. Meldt via MQTT-discovery
(`homeassistant/light/sandhovius_test_<n>/config`, JSON-schema) drie lampen
aan: **Testlamp dimbaar** (`brightness`), **Testlamp wit** (`color_temp`,
2200–6500K) en **Testlamp kleur** (`color_temp` + `rgb`). Het script houdt de
stand bij en publiceert die terug op het state-topic, zoals een Zigbee-lamp.
`scripts/seed.py` (lokaal) kan de bijbehorende devices aanmaken
(`entity_id` = `light.testlamp_…`).

## Testen

- **Agent**: unittests voor de payloadcontrole (geldig, onbekende sleutel,
  buiten bereik, beide kleursleutels, payload op niet-`light`), de route
  (`light.turn_on` vs `homeassistant.turn_on`, ook via een scène-stap), en het
  toevoegen van MQTT (nep-HA: ontbreekt → flow gestart met de juiste broker;
  bestaat al → niets).
- **PWA** (`node --test`, `lib/light.js`): capabilities uit modes; procent ↔
  0–255; kelvin → kleur (2200K amber, 6500K wit); gloedkleur en -sterkte;
  contrast-terugval voor het icoon; payload uit de huidige stand ("Zoals
  nu"); throttling van schuif-commando's.
- **Handmatig**: `fake-lights.py` draaien, de drie testlampen in de app
  dimmen, wit en kleur zetten; een scène met "Zoals nu" maken en uitvoeren;
  screenshots licht en donker, 1440 en 500 breed. Alleen de testlampen
  schakelen; daarna verwijderen.

## Volgorde van bouwen

1. Agent: payloadcontrole + `light.turn_on`-route (commando's en scènes).
2. Agent: MQTT-integratie toevoegen als die ontbreekt.
3. `scripts/fake-lights.py` + testdevices.
4. PWA: `lib/light.js` (rekenwerk) + tegel (stand, gloed).
5. PWA: detail-sheet (helderheid, wit, kleur).
6. PWA: scène-sheet "Zoals nu" + scènetegel.
7. Docs (`DESIGN.md`, `docs/status.md`, `docs/codebase.md`), handmatige ronde.

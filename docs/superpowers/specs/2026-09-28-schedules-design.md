# Schema's: scènes op tijd, op de box

Datum: 2026-09-28 · Status: gebouwd (2026-09-30); snapshot op schijf kwam met de agent-offline-start (2026-10-06)

> Bij het plannen bijgesteld: zie "Afwijkingen van de spec" in
> `docs/superpowers/plans/2026-09-28-schedules.md` (o.a. snapshot-bestand
> uitgesteld tot de agent zonder PocketBase kan starten).

## Doel

Een scène vanzelf laten uitvoeren op een vast tijdstip ("Naar bed" om 23:00 op
werkdagen), ook als de app dicht is én als het internet weg is. Dat laatste is
de kernbelofte van Sandhovius: lokale automatisering draait altijd.

## Reikwijdte

- Een schema = **scène + tijdstip (HH:MM) + weekdagen + aan/uit**.
- "Van–tot" (verwarming 07:00–22:00) zijn **twee schema's** met elk een eigen
  scène. Een echt tijdvenster kan later als UI-laag hierbovenop.
- Niet in scope: zonsopkomst/-ondergang, losse datums, voorwaarden
  ("alleen als er iemand thuis is"), tijdzone per huis, schema-fouten in
  "Let op" op Home.

## Beslissingen

| Vraag | Keuze | Waarom |
|---|---|---|
| Wie klokt? | De Go-agent | Eén bron van waarheid (PocketBase), één plek met logica (Go, testbaar). HA-automations zouden een tweede bron van waarheid en dubbele scène-logica betekenen. |
| Offline? | Agent voert uit vanuit een **lokale snapshot** | In fase 3 staat PocketBase op Scaleway; lezen op het moment van uitvoeren zou dan zonder internet falen. |
| Sync-mechanisme | **Elke minuut verversen** (3 GETs), geen realtime | Schema's hebben minuut-resolutie; verversen vermijdt drie extra SSE-streams en delta-bugs. |
| Gemiste runs | **Niet inhalen** | Box om 23:00 uit → "Naar bed" gaat om 02:00 niet alsnog af. |
| Dubbele runs | Toegestaan | Scènes zetten een stand (geen `toggle`), dus nogmaals uitvoeren is onschadelijk. |
| Zomertijd | Tijden in `Europe/Amsterdam` | Een schema op 02:00–02:59 slaat de nacht van de wintertijd→zomertijd-overgang over; in de omgekeerde nacht kan het twee keer lopen (onschadelijk, zie hierboven). |
| Resultaat terug | `last_run` / `last_error` op het schema, best-effort | Een command-record per run kan offline niet worden aangemaakt; uitvoeren gaat vóór boekhouden. |

## Datamodel: collectie `schedules`

Migratie `backend/pb_migrations/1790400000_add_schedules.js`.

| veld | type | opmerkingen |
|---|---|---|
| `house` | relation → houses, cascadeDelete, verplicht | |
| `scene` | relation → scenes, cascadeDelete, verplicht | scène weg → schema's weg |
| `time` | text, verplicht, patroon `^([01]\d\|2[0-3]):[0-5]\d$` | lokale tijd |
| `days` | select (meervoud, max 7), verplicht, waarden `mon tue wed thu fri sat sun` | |
| `enabled` | bool | |
| `last_run` | date | alleen door de agent geschreven |
| `last_error` | text | alleen door de agent; leeg = gelukt |

Regels (zelfde patroon als `scenes`):

- `list` / `view` / `delete`: `house.user = @request.auth.id`
- `create`: `@request.body.house.user = @request.auth.id && @request.body.scene.house = @request.body.house && @request.body.last_run:isset = false && @request.body.last_error:isset = false`
- `update`: `house.user = @request.auth.id && @request.body.house:isset = false && (@request.body.scene:isset = false || @request.body.scene.house = house) && @request.body.last_run:isset = false && @request.body.last_error:isset = false`

De agent schrijft `last_run`/`last_error` met zijn eigen (superuser-)account,
net als bij commands.

## Agent

Nieuw: `agent/internal/app/scheduler.go`, `agent/internal/app/scheduler_test.go`,
`agent/internal/pocketbase/schedules.go`.

### Lus

```
elke minuutgrens (lokale tijd):
  snapshot := probeer ophalen (schedules + scenes + devices van dit huis)
    ok   → vervang in geheugen, schrijf /data/schedules.json
    fout → houd laatste snapshot (geheugen; bij opstart uit het bestand)
  voor elk schema in dueSchedules(snapshot, now):
    executeScene(scene uit snapshot, lookup = snapshot.devices)
    best-effort PATCH last_run = now, last_error = fout of ""
```

- `dueSchedules(snapshot, now) []Schedule` is een **pure functie**:
  `enabled && days bevat weekdag(now) && time == now.Format("15:04")`.
  Omdat op het minuut-label wordt vergeleken, telt een tick die een paar
  seconden laat is nog steeds; elke minuut wordt één keer geëvalueerd
  (bijgehouden als laatst verwerkte minuut in geheugen).
- De snapshot bevat alleen records van dit huis (`house = gatewayID` /
  `gateway = gatewayID` in de filter), zodat de huis-check ook offline klopt.
- Snapshot-bestand: atomisch schrijven (tijdelijk bestand + rename).

### Refactor

De stappenlus van `runScene` wordt `executeScene(scene, lookupDevice)`.
Het handmatige pad (`run_scene`-command) geeft een lookup via PocketBase mee,
het schema-pad een lookup in de snapshot. De controles (`sceneActions`,
`device.Gateway == house`, `EntityID != ""`) blijven in de gedeelde functie.

### Tijdzone

- `docker-compose.yml`: `TZ=Europe/Amsterdam` bij de agent-service.
- `agent/main/main.go`: `import _ "time/tzdata"`, zodat `time.Local` ook in een
  kaal image klopt.

### Test

`scheduler_test.go` test `dueSchedules`: juiste weekdag/tijd → due; andere
dag → niet; `enabled=false` → niet; andere minuut → niet; tijd in de
overgesprongen zomertijd-nacht → niet due.

## PWA

### Scène-sheet (`SceneModal`)

Nieuwe sectie **Vanzelf uitvoeren** onder de apparaten:

- Per schema een rij op Inset Mist: `<input type="time">`, een switch
  (`switch-accent`, aan/uit), zeven ronde dag-knoppen `ma di wo do vr za zo`
  (44px, `aria-pressed`, Electric Blue als ze aan staan), de dagen in woorden
  ("Maandag tot en met vrijdag", "Elke dag", "Zaterdag en zondag") en een
  verwijderknop.
- Bij `last_error`: een Amber Notice-regel in de rij ("Zondag 23:00 niet
  gelukt: …").
- **Tijd toevoegen**: een plain knop die een rij toevoegt op het volgende hele
  uur, elke dag, aan.
- **Opslaan**: eerst de scène, dan per rij create/update/delete. Mislukt er
  een, dan blijft de sheet open met een Amber-banner.
- Minstens één dag per schema; zonder dagen is "Opslaan" niet mogelijk voor
  die rij (met uitleg in de rij).

### Scène-tegel (`ScenesView`)

Een extra regel met de actieve schema's in woorden: "Elke dag om 23:00",
"Ma t/m vr om 07:00", en bij meerdere schema's "Om 07:00 en 22:00". Geen regel
als er geen schema aan staat. Niets gloeit.

### Data (`app/page.js`)

`schedules` van het huis ophalen en realtime volgen, zoals `scenes`.

### DESIGN.md

Alinea onder *Scenes* over de sectie "Vanzelf uitvoeren" en de tegel-regel.

## Volgorde van bouwen

1. Migratie `schedules` (+ handmatig checken van de regels in de PocketBase-UI).
2. Agent: `pocketbase/schedules.go`, refactor `executeScene`, `scheduler.go`
   met snapshot in geheugen, `dueSchedules` + test, TZ.
3. Agent: snapshot naar `/data/schedules.json` en inladen bij opstart.
4. PWA: data, sectie in de scène-sheet, regel op de tegel.
5. DESIGN.md, CLAUDE.md-status bijwerken.

## Handmatig verifiëren

- Schema op de huidige minuut + 1 → scène draait, `last_run` gevuld.
- PocketBase-container stoppen, schema laten afgaan → scène draait toch;
  `last_run` wordt niet bijgewerkt (verwacht), agent-log meldt het.
- Agent herstarten terwijl PocketBase uit staat → snapshot uit bestand, schema
  draait.

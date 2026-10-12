'use client'

import { memo } from 'react'
import ClimateCard from './ClimateCard'
import { formatTemperature, readTemperature, temperatureColor } from '../lib/temperature'
import { deviceTypeIcon } from '../lib/icons'
import { glowFor, iconColorFor, lightStateText } from '../lib/light'
import { useLongPress } from '../lib/longPress'

// Een thermostaat hoort hier bewust niet bij: een tik om "even te kijken"
// mag nooit de verwarming uitzetten. Die kaart heeft zijn eigen −/+.
export const TOGGLEABLE_TYPES = ['light', 'switch']

export const DEVICE_TYPE_LABELS = {
  light: 'Lamp',
  switch: 'Stopcontact',
  sensor: 'Sensor',
  climate: 'Thermostaat',
}

// Climate-entities rapporteren hun state als hvac_mode ("heat", "off", ...)
// i.p.v. het simpele "on"/"off" van lampen/stopcontacten — vandaar het
// aparte geval hier.
// Wat een sensor nu meet, in woorden, voor de naam van zijn tegelknop.
function describeReading(state) {
  const parts = []
  const temperature = readTemperature(state)
  if (typeof temperature === 'number') parts.push(formatTemperature(temperature))
  const occupancy = state?.occupancy ?? state?.motion
  if (typeof occupancy === 'boolean') parts.push(occupancy ? 'er is nu beweging' : 'geen beweging')
  return parts.join(', ')
}

export function isDeviceOn(type, state) {
  if (!state?.state) return false
  if (type === 'climate') return state.state !== 'off'
  return state.state === 'on'
}

// memo: de pagina her-rendert bij elke toast, modal of realtime-update;
// een kaart alleen als zijn eigen props veranderen (de handlers zijn
// stabiel, zie cardHandlers in page.js). De handlers krijgen het device
// mee als argument i.p.v. per kaart een nieuwe closure te krijgen.
//
// Een tegel is klein en zegt drie dingen: wat het is (icoon), welke
// (naam) en hoe het staat. Alles daarbuiten staat in de detail-sheet:
// ingedrukt houden, rechts klikken of de contextmenutoets opent die.
export default memo(function DeviceCard({
  device,
  houseReachable = true,
  isNew = false,
  onToggle,
  onSetTemperature,
  onOpenSettings,
}) {
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null
  const Icon = deviceTypeIcon(device.type)

  // Twee manieren om onbereikbaar te zijn: het apparaat zelf is weg, of de
  // hele box (dan zegt "Offline" per apparaat het verkeerde).
  const isOnline = !!device.online && houseReachable
  const offlineText = houseReachable ? 'Offline' : 'Niet bereikbaar'
  // Net toegevoegd (isNew, zie page.js): de agent maakt er nog een Home
  // Assistant-entity voor aan (entity_id leeg), of die heeft nog geen
  // eerste stand gemeld. Dat is geen storing — "Offline" zou hier ten
  // onrechte alarm slaan. Is hij niet nieuw en nog steeds niet klaargezet,
  // dan is dat mislukt; de detail-sheet biedt dan "Opnieuw proberen".
  const isPairing = isNew && houseReachable && !device.online && (!device.entity_id || !stateRecord)
  const setupFailed = !isNew && houseReachable && !device.entity_id
  const isToggleable = TOGGLEABLE_TYPES.includes(device.type)
  const isOn = isDeviceOn(device.type, state)
  // Een offline apparaat kan geen commando ontvangen: niet doen alsof de
  // tik iets doet. Een sensor opent met een tik zijn details.
  const canToggle = isToggleable && isOnline && !isPairing && !setupFailed
  // Een lamp of stopcontact dat aan staat licht op: een gloed vanachter
  // het icoon (zie .card-lit) — warm voor een lamp, stroomblauw voor een
  // stopcontact. Alleen als we de stand zeker weten (online).
  const isLit = canToggle && isOn
  // Getikt, maar de box heeft het nog niet bevestigd (zie _pending in
  // page.js): een voornemen, geen feit. Meestal duurt dat onder de seconde.
  const isPending = canToggle && !!device._pending
  const opensDetails = setupFailed || (device.type === 'sensor' && !isPairing)

  // Ingedrukt houden opent de details, los van de korte tik die schakelt;
  // trekken of scrollen is geen ingedrukt houden (lib/longPress).
  const press = useLongPress(() => onOpenSettings(device))

  function handleActionClick() {
    // Voorkomt dat de tap/click die na het loslaten van een long-press
    // volgt alsnog schakelt/detail opent.
    if (press.consumeLongPress()) return
    if (canToggle) onToggle(device)
    else if (opensDetails) onOpenSettings(device)
  }

  // Rechts klikken (muis) of de contextmenutoets (toetsenbord) opent de
  // details, zoals ingedrukt houden op een telefoon. Op een telefoon komt
  // er na de long-press ook een contextmenu-event: dan niet nog een keer.
  function handleContextMenu(e) {
    e.preventDefault()
    if (press.longPressFired()) return
    press.cancel()
    onOpenSettings(device)
  }

  if (device.type === 'climate') {
    return (
      <li className="device-cell device-cell-climate">
        <div
          className={`panel tile-climate ${!isOnline && !isPairing ? 'card-offline' : ''}`}
          onContextMenu={handleContextMenu}
        >
          {/* De naam is de knop naar de details: geen los tandwiel, wel
              bereikbaar met toetsenbord en schermlezer. */}
          <button
            type="button"
            className="climate-head"
            aria-label={`Details van ${device.name}`}
            onClick={() => onOpenSettings(device)}
          >
            <span className="tile-name">{device.name}</span>
          </button>
          <ClimateCard
            state={state}
            isOn={isOn}
            isOnline={isOnline}
            offlineText={offlineText}
            onSetTemperature={(temperature) => onSetTemperature(device, temperature)}
            onToggleHeating={() => onToggle(device)}
          />
        </div>
      </li>
    )
  }

  // De stand, in één woord of getal: dat is waarvoor je kijkt.
  let stateText
  let stateStyle
  const reading = device.type === 'sensor' ? describeReading(state) : ''
  if (isPairing) stateText = 'Wordt klaargezet'
  else if (setupFailed) stateText = 'Niet klaargezet'
  else if (device.type === 'sensor') {
    const temperature = readTemperature(state)
    const occupancy = state?.occupancy ?? state?.motion
    let value = 'Geen metingen'
    if (typeof temperature === 'number') {
      value = formatTemperature(temperature)
      if (isOnline) stateStyle = { color: temperatureColor(temperature) }
    } else if (typeof occupancy === 'boolean') value = occupancy ? 'Beweging' : 'Geen beweging'
    // Offline blijft de laatste meting staan (dat is nog informatie), met
    // erbij dat het niet actueel is.
    stateText = isOnline ? value : `${value}, ${offlineText.toLowerCase()}`
  } else if (!isOnline) stateText = offlineText
  else if (state?.state === 'on' || state?.state === 'off') {
    const base = device.type === 'light' ? lightStateText(state) : isOn ? 'Aan' : 'Uit'
    stateText = base + (isPending ? '…' : '')
  }
  else stateText = 'Onbekend'

  // De hoofdactie is een echte <button> over de hele tegel (zie
  // .device-card-action); de naam en stand blijven gewone tekst.
  const actionLabel = canToggle
    ? device.name
    : `Details van ${device.name}${reading ? `, ${reading}` : ''}`
  const isClickable = canToggle || opensDetails

  // De gloed van een lamp in zijn echte kleur en sterkte (zie .card-lit);
  // zonder kleur blijft het standaard amber uit het thema. Het icoon krijgt
  // dezelfde kleur, per thema alleen als die genoeg afsteekt van de cirkel.
  let glowStyle
  if (isLit && device.type === 'light') {
    const glow = glowFor(state?.attributes)
    glowStyle = { '--glow-strength': glow.strength.toFixed(2) }
    if (glow.color) {
      glowStyle['--glow-color'] = glow.color
      const lightIcon = iconColorFor(glow.rgb, 'light')
      const darkIcon = iconColorFor(glow.rgb, 'dark')
      if (lightIcon) glowStyle['--glow-icon-light'] = lightIcon
      if (darkIcon) glowStyle['--glow-icon-dark'] = darkIcon
    }
  }

  return (
    <li className={`device-cell device-cell-${device.type}`}>
      <div
        className={`panel device-tile tile-${device.type} ${isClickable ? 'card-clickable' : ''} ${isLit ? 'card-lit' : ''} ${
          isPending ? 'card-pending' : ''
        } ${!isOnline && !isPairing && !setupFailed ? 'card-offline' : ''} ${isPairing || setupFailed ? 'card-pairing' : ''}`}
        style={glowStyle}
        {...press.handlers}
        onContextMenu={handleContextMenu}
      >
        <button
          type="button"
          className="device-card-action"
          aria-label={actionLabel}
          aria-pressed={canToggle ? isOn : undefined}
          aria-disabled={isClickable ? undefined : true}
          onClick={handleActionClick}
        />
        <span className="tile-icon" aria-hidden="true">
          <Icon width="24" height="24" />
        </span>
        <span className="tile-text">
          <span className="tile-name">{device.name}</span>
          <span
            className={`tile-state ${isOn && canToggle ? 'tile-state-on' : ''} ${isPairing || setupFailed || !isOnline ? 'tile-state-quiet' : ''}`}
            style={stateStyle}
          >
            {isPairing && <span className="spinner spinner-inline" aria-hidden="true" />}
            {stateText}
          </span>
        </span>
      </div>
    </li>
  )
})

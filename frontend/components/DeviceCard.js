'use client'

import { memo, useRef } from 'react'
import LightCard from './LightCard'
import SensorCard from './SensorCard'
import ClimateCard from './ClimateCard'
import { ArrowUpRightIcon, GearIcon, deviceTypeIcon } from '../lib/icons'

// Een thermostaat hoort hier bewust niet bij: een tik om "even te kijken"
// mag nooit de verwarming uitzetten. Die kaart heeft zijn eigen −/+.
export const TOGGLEABLE_TYPES = ['light', 'switch']
const LONG_PRESS_MS = 500

export const DEVICE_TYPE_LABELS = {
  light: 'Lamp',
  switch: 'Stopcontact',
  sensor: 'Sensor',
  climate: 'Thermostaat',
}

// Climate-entities rapporteren hun state als hvac_mode ("heat", "off", ...)
// i.p.v. het simpele "on"/"off" van lampen/stopcontacten — vandaar het
// aparte geval hier.
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
// context: een korte regel onder de stand — de kamer als de tegel buiten
// zijn kamer staat (Favorieten op Home), anders het soort apparaat.
export default memo(function DeviceCard({
  device,
  context,
  houseReachable = true,
  isNew = false,
  onToggle,
  onSetTemperature,
  onOpenSettings,
  isAnimating,
}) {
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null
  const Icon = deviceTypeIcon(device.type)
  const caption = context ?? DEVICE_TYPE_LABELS[device.type] ?? ''

  // Twee manieren om onbereikbaar te zijn: het apparaat zelf is weg, of de
  // hele box (dan zegt "Offline" per apparaat het verkeerde).
  const isOnline = !!device.online && houseReachable
  const offlineText = houseReachable ? 'Offline' : 'Niet bereikbaar'
  // Net toegevoegd (isNew, zie page.js): de agent maakt er nog een Home
  // Assistant-entity voor aan (entity_id leeg), of die heeft nog geen
  // eerste stand gemeld. Dat is geen storing — "Offline" zou hier ten
  // onrechte alarm slaan. Is hij niet nieuw en nog steeds niet klaargezet,
  // dan is dat mislukt: dat zeggen we eerlijk, met wat je kunt doen.
  const isPairing = isNew && houseReachable && !device.online && (!device.entity_id || !stateRecord)
  const setupFailed = !isNew && houseReachable && !device.entity_id
  const isToggleable = TOGGLEABLE_TYPES.includes(device.type)
  const isOn = isDeviceOn(device.type, state)
  // Een offline apparaat kan geen commando ontvangen: niet doen alsof de
  // tik iets doet. Een sensor opent met een tik zijn details (laatst
  // bekende waarden blijven daar leesbaar).
  const canToggle = isToggleable && isOnline && !isPairing && !setupFailed
  // Een lamp die aan staat licht op: een warme gloed in de tegel (zie
  // .card-lit). Alleen bij een lamp — een stopcontact is geen lichtbron —
  // en alleen als we de stand zeker weten (online).
  const isLit = device.type === 'light' && canToggle && isOn
  const opensDetails = device.type === 'sensor' && !isPairing && !setupFailed
  const isClickable = canToggle || opensDetails

  // Ingedrukt houden opent de details (naam/kamer/favoriet/verwijderen),
  // los van de korte tik die schakelt — de "Details"-knop of het tandwiel
  // doet hetzelfde, zichtbaar.
  const pressTimer = useRef(null)
  const longPressTriggered = useRef(false)

  function startPress() {
    longPressTriggered.current = false
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      onOpenSettings(device)
    }, LONG_PRESS_MS)
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function handleActionClick() {
    // Voorkomt dat de tap/click die na het loslaten van een long-press
    // volgt alsnog schakelt/detail opent.
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    if (canToggle) onToggle(device)
    else if (opensDetails) onOpenSettings(device)
  }

  // De hoofdactie is een echte <button>, over de hele tegel uitgerekt
  // (zie .device-card-action). "Details" en het tandwiel staan er als
  // broertjes naast i.p.v. erin genest — een knop-in-een-knop heeft voor
  // schermlezers geen betrouwbare naam of gedrag. De leesbare inhoud
  // (naam, stand, meetwaarden) blijft gewone tekst in de tegel.
  const actionLabel = canToggle ? device.name : `Details van ${device.name}`

  // Knoppen in de tegel liggen boven de tegelknop (z-index) en vangen hun
  // eigen pointerdown, zodat een tik erop niet schakelt of de long-press
  // start.
  const stop = (e) => e.stopPropagation()

  const detailsChip = (
    <button
      type="button"
      className="details-chip"
      aria-label={`Details van ${device.name}`}
      onPointerDown={stop}
      onClick={() => onOpenSettings(device)}
    >
      Details
      <ArrowUpRightIcon aria-hidden="true" />
    </button>
  )

  // De thermostaat houdt zijn tandwiel rechtsboven; de andere tegels hebben
  // "Details" onderin.
  const climateHeader = (
    <div className="tile-top">
      {/* Vóór de naam in de DOM: het tandwiel zweeft rechts (float) en de
          naam loopt eromheen, zie .tile-top in devices.css. */}
      <button
        type="button"
        className="btn btn-icon btn-plain gear-button"
        aria-label={`Details van ${device.name}`}
        onPointerDown={stop}
        onClick={() => onOpenSettings(device)}
      >
        <GearIcon width="20" height="20" />
      </button>
      <span className="tile-name">{device.name}</span>
    </div>
  )

  const plainHeader = (
    <div className="tile-top">
      <span className="tile-name">{device.name}</span>
    </div>
  )

  let body
  if (isPairing || setupFailed) {
    body = (
      <>
        {plainHeader}
        <div className="tile-state">
          <span className="device-state-word device-state-word-offline">
            {isPairing && <span className="spinner spinner-inline" aria-hidden="true" />}
            {isPairing ? 'Wordt klaargezet' : 'Niet klaargezet'}
          </span>
          <span className="device-state-sub">
            {isPairing
              ? 'Dit duurt meestal een paar seconden.'
              : 'Verwijder dit apparaat via Details en voeg het opnieuw toe.'}
          </span>
        </div>
        <div className="tile-bottom">{detailsChip}</div>
      </>
    )
  } else if (device.type === 'light' || device.type === 'switch') {
    body = (
      <LightCard
        state={state}
        isOnline={isOnline}
        offlineText={offlineText}
        header={plainHeader}
        caption={caption}
        Icon={Icon}
        footer={detailsChip}
      />
    )
  } else if (device.type === 'climate') {
    body = (
      <ClimateCard
        state={state}
        isOn={isOn}
        isOnline={isOnline}
        offlineText={offlineText}
        header={climateHeader}
        onSetTemperature={(temperature) => onSetTemperature(device, temperature)}
        onToggleHeating={() => onToggle(device)}
      />
    )
  } else {
    body = (
      <SensorCard
        state={state}
        isOnline={isOnline}
        offlineText={offlineText}
        header={plainHeader}
        caption={caption}
        Icon={Icon}
      />
    )
  }

  return (
    <li className={`device-cell device-cell-${device.type}`}>
      <div
        className={`panel tile tile-${device.type} ${isAnimating ? 'card-pulse' : ''} ${
          isClickable ? 'card-clickable' : ''
        } ${isLit ? 'card-lit' : ''} ${!isOnline && !isPairing && !setupFailed ? 'card-offline' : ''} ${
          isPairing || setupFailed ? 'card-pairing' : ''
        }`}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isClickable && (
          <button
            type="button"
            className="device-card-action"
            aria-label={actionLabel}
            aria-pressed={canToggle ? isOn : undefined}
            onClick={handleActionClick}
          />
        )}
        {body}
      </div>
    </li>
  )
})

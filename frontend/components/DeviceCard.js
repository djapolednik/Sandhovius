'use client'

import { memo, useRef } from 'react'
import LightCard from './LightCard'
import SensorCard from './SensorCard'
import ClimateCard from './ClimateCard'
import { GearIcon, deviceTypeIcon } from '../lib/icons'

// Een thermostaat hoort hier bewust niet bij: een tik om "even te kijken"
// mag nooit de verwarming uitzetten. Die kaart heeft zijn eigen −/+.
export const TOGGLEABLE_TYPES = ['light', 'switch']
const LONG_PRESS_MS = 500

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
export default memo(function DeviceCard({
  device,
  houseReachable = true,
  isNew = false,
  onToggle,
  onSetTemperature,
  onOpenDetail,
  onOpenSettings,
  isAnimating,
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
  // dan is dat mislukt: dat zeggen we eerlijk, met wat je kunt doen.
  const isPairing = isNew && houseReachable && !device.online && (!device.entity_id || !stateRecord)
  const setupFailed = !isNew && houseReachable && !device.entity_id
  const isToggleable = TOGGLEABLE_TYPES.includes(device.type)
  const isOn = isDeviceOn(device.type, state)
  // Een offline apparaat kan geen commando ontvangen: niet doen alsof de
  // tik iets doet. Sensordetails (laatst bekende waarden) blijven wel open
  // te klappen.
  const canToggle = isToggleable && isOnline
  const canOpenDetail = device.type === 'sensor' && !isPairing && !setupFailed && !!onOpenDetail
  const isClickable = canToggle || canOpenDetail

  // Ingedrukt houden opent de instellingen (naam/kamer/verwijderen), los
  // van de korte tik die schakelt of details opent — de gear-knop doet
  // hetzelfde, zichtbaar.
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
    else if (canOpenDetail) onOpenDetail(device)
  }

  // De hoofdactie is een echte <button>, over de hele kaart uitgerekt
  // (zie .device-card-action). De gear-knop staat er als broertje naast
  // i.p.v. erin genest — een knop-in-een-knop heeft voor schermlezers geen
  // betrouwbare naam of gedrag. De leesbare inhoud (naam, status,
  // meetwaarden) blijft gewone tekst in de kaart.
  const actionLabel = canToggle ? device.name : `Details van ${device.name}`

  const header = (
    <div className="device-card-header">
      <div className={`device-icon device-icon-${device.type}`}>
        <Icon />
      </div>
      <div className="device-name">{device.name}</div>
    </div>
  )

  return (
    <li className={`device-card-cell device-card-cell-${device.type}`}>
      <div
        className={`card device-card ${isAnimating ? 'card-pulse' : ''} ${isClickable ? 'card-clickable' : ''} ${
          canToggle && isOn ? 'card-on' : ''
        } ${!isOnline && !isPairing && !setupFailed ? 'card-offline' : ''} ${
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

        <button
          type="button"
          className="btn btn-icon btn-plain gear-button"
          aria-label={`Instellingen van ${device.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpenSettings(device)}
        >
          <GearIcon width="20" height="20" />
        </button>

        {isPairing ? (
          <>
            {header}
            <div className="device-state-row">
              <div className="device-state">
                <span className="device-state-word device-state-word-offline">
                  <span className="spinner spinner-inline" aria-hidden="true" />
                  Wordt klaargezet
                </span>
                <span className="device-state-sub">Dit duurt meestal een paar seconden.</span>
              </div>
            </div>
          </>
        ) : setupFailed ? (
          <>
            {header}
            <div className="device-state-row">
              <div className="device-state">
                <span className="device-state-word device-state-word-offline">Niet klaargezet</span>
                <span className="device-state-sub">
                  Verwijder dit apparaat via het tandwiel en voeg het opnieuw toe.
                </span>
              </div>
            </div>
          </>
        ) : device.type === 'light' || device.type === 'switch' ? (
          <LightCard state={state} isOnline={isOnline} offlineText={offlineText} header={header} />
        ) : device.type === 'climate' ? (
          <ClimateCard
            state={state}
            isOn={isOn}
            isOnline={isOnline}
            offlineText={offlineText}
            header={header}
            onSetTemperature={(temperature) => onSetTemperature(device, temperature)}
          />
        ) : (
          <SensorCard state={state} isOnline={isOnline} offlineText={offlineText} header={header} />
        )}
      </div>
    </li>
  )
})

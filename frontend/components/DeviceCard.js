'use client'

import { useRef, useState } from 'react'
import LightCard from './LightCard'
import SensorCard from './SensorCard'
import ClimateCard from './ClimateCard'
import DeviceCardBack from './DeviceCardBack'
import { GearIcon, deviceTypeIcon } from '../lib/icons'

const TOGGLEABLE_TYPES = ['light', 'switch', 'climate']
const LONG_PRESS_MS = 500

// Climate-entities rapporteren hun state als hvac_mode ("heat", "off", ...)
// i.p.v. het simpele "on"/"off" van lampen/stopcontacten — vandaar het
// aparte geval hier.
function isDeviceOn(type, state) {
  if (!state?.state) return false
  if (type === 'climate') return state.state !== 'off'
  return state.state === 'on'
}

export default function DeviceCard({
  device,
  rooms,
  onToggle,
  onSetTemperature,
  onOpenDetail,
  isAnimating,
  onSaveDevice,
  onDeleteDevice,
}) {
  const [flipped, setFlipped] = useState(false)
  // Blijft na de eerste keer omdraaien gemonteerd, zodat het terugdraaien
  // niet halverwege de animatie de inhoud laat verdwijnen — maar wordt niet
  // voor elke kaart alvast gemonteerd voordat hij ooit is omgedraaid.
  const [everFlipped, setEverFlipped] = useState(false)
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null
  const Icon = deviceTypeIcon(device.type)

  const isToggleable = TOGGLEABLE_TYPES.includes(device.type)
  const isOn = isDeviceOn(device.type, state)
  const isClickable = isToggleable || !!onOpenDetail

  // Ingedrukt houden draait de kaart om naar de instellingen (naam/kamer/
  // verwijderen, en voor climate de doeltemperatuur), los van de korte tik
  // die toggelt/detail opent — de gear-knop doet hetzelfde als snelkoppeling.
  const pressTimer = useRef(null)
  const longPressTriggered = useRef(false)

  function flipToSettings() {
    setFlipped(true)
    setEverFlipped(true)
  }

  function startPress() {
    longPressTriggered.current = false
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      flipToSettings()
    }, LONG_PRESS_MS)
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function handleCardClick() {
    // Voorkomt dat de tap/click die na het loslaten van een long-press
    // volgt alsnog toggelt/detail opent.
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    if (isToggleable) onToggle()
    else if (onOpenDetail) onOpenDetail()
  }

  function handleGearClick(e) {
    e.stopPropagation()
    flipToSettings()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleCardClick()
    }
  }

  const header = (
    <div className="device-card-header">
      <button
        className="btn btn-icon btn-plain gear-button"
        aria-label="Device-opties"
        onClick={handleGearClick}
      >
        <GearIcon />
      </button>
      <div className={`device-icon device-icon-${device.type}`}>
        <Icon />
      </div>
      <div className="device-name">{device.name}</div>
    </div>
  )

  return (
    <li className="device-card-flip">
      <div className={`device-card-flip-inner ${flipped ? 'flipped' : ''}`}>
        <div
          className={`card device-card device-card-face device-card-face-front ${
            isAnimating ? 'card-pulse' : ''
          } ${isClickable ? 'card-clickable' : ''} ${isToggleable && isOn ? 'card-on' : ''} ${
            !device.online ? 'card-offline' : ''
          }`}
          onClick={isClickable ? handleCardClick : undefined}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          role={isClickable ? 'button' : undefined}
          tabIndex={isClickable ? 0 : undefined}
          onKeyDown={isClickable ? handleKeyDown : undefined}
        >
          {device.type === 'light' || device.type === 'switch' ? (
            <LightCard state={state} header={header} />
          ) : device.type === 'climate' ? (
            <ClimateCard state={state} isOn={isOn} header={header} />
          ) : (
            <SensorCard device={device} state={state} header={header} />
          )}
        </div>

        <div className="card device-card device-card-face device-card-face-back">
          {everFlipped && (
            <DeviceCardBack
              device={device}
              rooms={rooms}
              state={state}
              onSetTemperature={onSetTemperature}
              onFlipBack={() => setFlipped(false)}
              onSave={onSaveDevice}
              onDelete={onDeleteDevice}
            />
          )}
        </div>
      </div>
    </li>
  )
}

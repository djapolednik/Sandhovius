'use client'

import { useState } from 'react'
import LightCard from './LightCard'
import SensorCard from './SensorCard'
import ClimateCard from './ClimateCard'
import DeviceOptionsModal from './DeviceOptionsModal'
import { GearIcon, deviceTypeIcon } from '../lib/icons'

const TOGGLEABLE_TYPES = ['light', 'switch', 'climate']

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
  onOpenDetail,
  isAnimating,
  onSaveDevice,
  onDeleteDevice,
}) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null
  const Icon = deviceTypeIcon(device.type)

  const isToggleable = TOGGLEABLE_TYPES.includes(device.type)
  const isOn = isDeviceOn(device.type, state)
  const isClickable = isToggleable || !!onOpenDetail

  function handleCardClick() {
    if (isToggleable) onToggle()
    else if (onOpenDetail) onOpenDetail()
  }

  function handleGearClick(e) {
    e.stopPropagation()
    setOptionsOpen(true)
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
    <>
      <li
        className={`card device-card ${isAnimating ? 'card-pulse' : ''} ${isClickable ? 'card-clickable' : ''} ${
          isToggleable && isOn ? 'card-on' : ''
        } ${!device.online ? 'card-offline' : ''}`}
        onClick={isClickable ? handleCardClick : undefined}
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
      </li>

      {optionsOpen && (
        <DeviceOptionsModal
          device={device}
          rooms={rooms}
          onClose={() => setOptionsOpen(false)}
          onSave={onSaveDevice}
          onDelete={onDeleteDevice}
        />
      )}
    </>
  )
}

'use client'

import { useTranslations } from 'use-intl'
import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { TrashIcon } from '../lib/icons'
import { relativeTime } from '../lib/relativeTime'
import { useIntl } from '../app/LanguageContext'
import { useNow } from '../lib/useNow'
import { formatTemperature, temperatureColor, readTemperature } from '../lib/temperature'
import { isBatteryLow } from '../lib/battery'
import { isDeviceOn } from './DeviceCard'
import LightControls from './LightControls'

// Alles over één apparaat in één sheet: hoe het er nu bij staat, wat het
// meet (sensoren), of het op Home staat, en naam, kamer en verwijderen.
// Opent door een tegel ingedrukt te houden (of rechts te klikken), met een
// tik op een sensor of een apparaat dat niet klaargezet is, en via het
// tandwiel van de thermostaat. Op een telefoon
// een sheet onderin, binnen bereik van je duim.
//
// Alles slaat zichzelf op, zoals de schakelaar: de kamer zodra je hem
// kiest, de naam zodra je het veld verlaat of de sheet sluit. Geen
// "Opslaan"-knop waarvan je je afvraagt of hij ook voor de rest geldt.
export default function DeviceSettingsModal({
  device,
  rooms,
  onSave,
  onSaveError,
  favorite,
  onToggleFavorite,
  onSetLight,
  houseReachable = true,
  onDelete,
  onClose,
}) {
  const t = useTranslations()
  const [name, setName] = useState(device.name ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // De laatst opgeslagen naam: verlaten van het veld én sluiten mogen niet
  // twee keer hetzelfde opslaan.
  const savedName = useRef(device.name ?? '')
  // "Opgeslagen" staat er even na elke opslag: zonder knop moet je toch
  // zien dat het gelukt is.
  const [savedTick, setSavedTick] = useState(0)
  const [showSaved, setShowSaved] = useState(false)
  // Is de sheet nog open? Een naam die bij het sluiten wordt opgeslagen kan
  // pas mislukken als hij al dicht is: die fout gaat dan naar een melding.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!savedTick) return
    setShowSaved(true)
    const timer = setTimeout(() => setShowSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [savedTick])

  async function save(updates, what) {
    setError('')
    try {
      await onSave(device.id, updates)
      if (mounted.current) setSavedTick((n) => n + 1)
    } catch (err) {
      const message = describeError(t, what, err)
      if (mounted.current) setError(message)
      else onSaveError?.(message)
    }
  }

  // Een lege naam slaan we niet op: dan komt de oude terug.
  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(device.name ?? '')
      return
    }
    if (trimmed === savedName.current) return
    savedName.current = trimmed
    save({ name: trimmed }, t('errors.what.rename'))
  }

  function close() {
    commitName()
    onClose()
  }

  async function handleFavorite() {
    setError('')
    try {
      await onToggleFavorite(device)
    } catch (err) {
      setError(describeError(t, t('errors.what.favorite'), err))
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await onDelete(device.id)
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.delete'), err))
      setSaving(false)
    }
  }

  return (
    <Modal title={device.name} onClose={close}>
      {device.type === 'sensor' ? (
        <SensorReadings device={device} />
      ) : (
        <>
          <DeviceStatus device={device} />
          {device.type === 'light' && onSetLight && (
            <LightControls
              device={device}
              state={device.expand?.device_state_via_device?.[0]?.state}
              disabled={!device.online || !houseReachable}
              onChange={(payload) => onSetLight(device, payload)}
            />
          )}
        </>
      )}
      <div className="modal-divider" />

      <div className="settings-row">
        <span id={`favorite-${device.id}`}>{t('deviceSheet.showOnHome')}</span>
        <button
          type="button"
          className={`switch switch-accent ${favorite ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={!!favorite}
          aria-labelledby={`favorite-${device.id}`}
          onClick={handleFavorite}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      <div className="modal-divider" />

      {/* Enter in het naamveld = klaar: het veld verlaten slaat op. */}
      <form onSubmit={(e) => (e.preventDefault(), document.activeElement?.blur())} className="form-stack">
        <label className="form-field">
          <span className="form-label">{t('deviceSheet.name')}</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            enterKeyHint="done"
          />
        </label>

        <label className="form-field">
          <span className="form-label">{t('deviceSheet.room')}</span>
          <select
            className="input"
            value={device.room ?? ''}
            onChange={(e) => save({ room: e.target.value || null }, t('errors.what.changeRoom'))}
          >
            <option value="">{t('home.noRoom')}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        <p className="form-saved" role="status">
          {showSaved ? t('common.saved') : ''}
        </p>

        {error && !confirmingDelete && <p className="error-banner">{error}</p>}
      </form>

      <div className="modal-divider" />

      {confirmingDelete ? (
        <div className="danger-zone">
          <p className="danger-text">
            {t('deviceSheet.confirmDelete', { name: device.name })}
          </p>
          {error && <p className="error-banner">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              {t('common.delete')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)} disabled={saving}>
          <TrashIcon />
          {t('deviceSheet.delete')}
        </button>
      )}
    </Modal>
  )
}

// Hoe een lamp, stopcontact of thermostaat er nu bij staat. De tegel
// eronder is op een telefoon bedekt door de sheet, dus hier nog een keer,
// in woorden.
function DeviceStatus({ device }) {
  const t = useTranslations()
  const state = device.expand?.device_state_via_device?.[0]?.state
  const known = typeof state?.state === 'string'
  const on = isDeviceOn(device.type, state)
  const word = device.type === 'climate' ? (on ? 'heatingOn' : 'heatingOff') : on ? 'on' : 'off'

  let value
  if (!known) value = t('deviceSheet.stateUnknown')
  else if (!device.online) value = t(`deviceSheet.offlineLast.${word}`)
  else value = t(`deviceSheet.state.${word}`)

  return (
    <div className="sensor-detail-row">
      <span className="form-label">{t('deviceSheet.stateLabel')}</span>
      <span className="reading-value">{value}</span>
    </div>
  )
}

// Wat een sensor meet, met wanneer hij dat voor het laatst deed. Eigen
// klok: alleen dit blok tikt mee voor "Laatst bijgewerkt".
function SensorReadings({ device }) {
  const intl = useIntl()
  const { t, locale } = intl
  const now = useNow(5000)
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null

  const occupancy = state?.occupancy ?? state?.motion
  const hasMotionReading = typeof occupancy === 'boolean'
  const temperature = readTemperature(state)
  const hasTemperatureReading = typeof temperature === 'number'
  const battery = state?.battery
  const hasBattery = typeof battery === 'number'
  const updatedAt = stateRecord?.updated_at ? new Date(stateRecord.updated_at).getTime() : null

  if (!hasTemperatureReading && !hasMotionReading && !hasBattery) {
    return <p className="reading-empty">{t('climate.noReadings')}</p>
  }

  return (
    <div className="sensor-detail-rows">
      {hasTemperatureReading && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('home.temperature')}</span>
          <span className="reading-value" style={{ color: temperatureColor(temperature) }}>
            {formatTemperature(temperature, locale)}
          </span>
        </div>
      )}
      {hasMotionReading && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('device.motion')}</span>
          <span className="reading-value">{occupancy ? t('deviceSheet.motionNow') : t('device.noMotion')}</span>
        </div>
      )}
      {hasBattery && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('deviceSheet.battery')}</span>
          <span className={`reading-value ${isBatteryLow(battery) ? 'reading-alert' : ''}`}>
            {isBatteryLow(battery)
              ? t('deviceSheet.batteryLow', { percent: battery })
              : t('deviceSheet.batteryPercent', { percent: battery })}
          </span>
        </div>
      )}
      {updatedAt && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('deviceSheet.lastUpdated')}</span>
          <span className="reading-value">{relativeTime(intl, updatedAt, now)}</span>
        </div>
      )}
      {!device.online && <p className="status-offline">{t('deviceSheet.offlineNote')}</p>}
    </div>
  )
}

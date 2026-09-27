'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { TrashIcon } from '../lib/icons'
import { relativeTimeNL } from '../lib/relativeTime'
import { useNow } from '../lib/useNow'
import { formatTemperature, temperatureColor, readTemperature } from '../lib/temperature'
import { isBatteryLow } from '../lib/battery'

// Alles over één apparaat in één sheet: wat het meet (sensoren), of het
// op Home staat, en naam, kamer en verwijderen. Opent via "Details" op een
// tegel, het tandwiel van de thermostaat, een tik op een sensor of door
// een tegel ingedrukt te houden. Op een telefoon een sheet onderin,
// binnen bereik van je duim.
export default function DeviceSettingsModal({ device, rooms, onSave, onToggleFavorite, onDelete, onClose }) {
  const [name, setName] = useState(device.name ?? '')
  const [roomId, setRoomId] = useState(device.room ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(device.id, { name, room: roomId || null })
      onClose()
    } catch (err) {
      setError(describeError('Opslaan', err))
      setSaving(false)
    }
  }

  // Direct, zoals een schakelaar hoort te werken — los van "Opslaan", dat
  // alleen over naam en kamer gaat.
  async function handleFavorite() {
    setError('')
    try {
      await onToggleFavorite(device)
    } catch (err) {
      setError(describeError('Favoriet aanpassen', err))
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await onDelete(device.id)
      onClose()
    } catch (err) {
      setError(describeError('Verwijderen', err))
      setSaving(false)
    }
  }

  return (
    <Modal title={device.name} onClose={onClose}>
      {device.type === 'sensor' && (
        <>
          <SensorReadings device={device} />
          <div className="modal-divider" />
        </>
      )}

      <div className="settings-row">
        <span id={`favorite-${device.id}`}>Op Home tonen</span>
        <button
          type="button"
          className={`switch switch-accent ${device.favorite ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={!!device.favorite}
          aria-labelledby={`favorite-${device.id}`}
          onClick={handleFavorite}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      <div className="modal-divider" />

      <form onSubmit={handleSave} className="form-stack">
        <label className="form-field">
          <span className="form-label">Naam</span>
          <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label className="form-field">
          <span className="form-label">Kamer</span>
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Geen kamer</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        {error && !confirmingDelete && <p className="error-banner">{error}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          Opslaan
        </button>
      </form>

      <div className="modal-divider" />

      {confirmingDelete ? (
        <div className="danger-zone">
          <p className="danger-text">
            "{device.name}" uit Sandhovius verwijderen? Het apparaat verdwijnt uit de app; je kunt het later opnieuw
            toevoegen.
          </p>
          {error && <p className="error-banner">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
              Annuleren
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Verwijderen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)} disabled={saving}>
          <TrashIcon />
          Apparaat verwijderen
        </button>
      )}
    </Modal>
  )
}

// Wat een sensor meet, met wanneer hij dat voor het laatst deed. Eigen
// klok: alleen dit blok tikt mee voor "Laatst bijgewerkt".
function SensorReadings({ device }) {
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
    return <p className="reading-empty">Nog geen meetwaarden ontvangen</p>
  }

  return (
    <div className="sensor-detail-rows">
      {hasTemperatureReading && (
        <div className="sensor-detail-row">
          <span className="form-label">Temperatuur</span>
          <span className="reading-value" style={{ color: temperatureColor(temperature) }}>
            {formatTemperature(temperature)}
          </span>
        </div>
      )}
      {hasMotionReading && (
        <div className="sensor-detail-row">
          <span className="form-label">Beweging</span>
          <span className="reading-value">{occupancy ? 'Er is nu beweging' : 'Geen beweging'}</span>
        </div>
      )}
      {hasBattery && (
        <div className="sensor-detail-row">
          <span className="form-label">Batterij</span>
          <span className={`reading-value ${isBatteryLow(battery) ? 'reading-alert' : ''}`}>
            {isBatteryLow(battery) ? `Bijna leeg (${battery}%)` : `${battery}%`}
          </span>
        </div>
      )}
      {updatedAt && (
        <div className="sensor-detail-row">
          <span className="form-label">Laatst bijgewerkt</span>
          <span className="reading-value">{relativeTimeNL(updatedAt, now)}</span>
        </div>
      )}
      {!device.online && <p className="status-offline">Offline, dit is de laatst bekende stand.</p>}
    </div>
  )
}

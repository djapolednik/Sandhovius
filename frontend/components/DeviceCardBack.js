'use client'

import { useState } from 'react'
import { ArrowLeftIcon, TrashIcon } from '../lib/icons'

const TEMP_STEP = 0.5

// De achterkant van de device-kaart (zie DeviceCard's flip-animatie) —
// zelfde instellingen als voorheen in een los modal-venster, nu inline op
// de kaart zelf zodat "ingedrukt houden" een omdraai-animatie triggert
// i.p.v. een los venster te openen.
export default function DeviceCardBack({ device, rooms, state, onSetTemperature, onFlipBack, onSave, onDelete }) {
  const [name, setName] = useState(device.name ?? '')
  const [roomId, setRoomId] = useState(device.room ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const attrs = state?.attributes ?? {}
  const target = state?.occupied_heating_setpoint ?? attrs.temperature
  const hasTarget = typeof target === 'number'
  const canSetTemperature = device.type === 'climate' && hasTarget && typeof onSetTemperature === 'function'
  const minTemp = typeof attrs.min_temp === 'number' ? attrs.min_temp : 10
  const maxTemp = typeof attrs.max_temp === 'number' ? attrs.max_temp : 30

  function adjustTemperature(delta) {
    const next = Math.min(maxTemp, Math.max(minTemp, target + delta))
    if (next !== target) onSetTemperature(next)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(device.id, { name, room: roomId || null })
      setSaving(false)
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await onDelete(device.id)
    } catch (err) {
      setError('Verwijderen mislukt: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="card-back-content" onClick={(e) => e.stopPropagation()}>
      <div className="card-back-header">
        <button
          type="button"
          className="btn btn-icon btn-plain"
          aria-label="Terug naar device"
          onClick={onFlipBack}
        >
          <ArrowLeftIcon />
        </button>
        <span className="card-back-title">Instellingen</span>
      </div>

      <form onSubmit={handleSave} className="card-back-form">
        <label className="form-field-compact">
          <span className="form-label">Naam</span>
          <input
            className="input input-compact"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label className="form-field-compact">
          <span className="form-label">Kamer</span>
          <select
            className="input input-compact"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            <option value="">Geen kamer</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        {canSetTemperature && (
          <div className="form-field-compact">
            <span className="form-label">Doeltemperatuur</span>
            <div className="temp-stepper">
              <button
                type="button"
                className="btn btn-icon btn-secondary btn-compact"
                aria-label="Doeltemperatuur verlagen"
                disabled={target <= minTemp}
                onClick={() => adjustTemperature(-TEMP_STEP)}
              >
                −
              </button>
              <span className="reading-value">{target}°C</span>
              <button
                type="button"
                className="btn btn-icon btn-secondary btn-compact"
                aria-label="Doeltemperatuur verhogen"
                disabled={target >= maxTemp}
                onClick={() => adjustTemperature(TEMP_STEP)}
              >
                +
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-banner-compact">{error}</p>}

        <button type="submit" className="btn btn-primary btn-compact" disabled={saving}>
          Opslaan
        </button>
      </form>

      {confirmingDelete ? (
        <div className="danger-zone-compact">
          <p className="danger-text-compact">Verwijder "{device.name}"?</p>
          <div className="card-back-actions">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setConfirmingDelete(false)}
              disabled={saving}
            >
              Annuleren
            </button>
            <button type="button" className="btn btn-danger btn-compact" onClick={handleDelete} disabled={saving}>
              Verwijderen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-plain btn-danger-text btn-compact"
          onClick={() => setConfirmingDelete(true)}
          disabled={saving}
        >
          <TrashIcon /> Verwijderen
        </button>
      )}
    </div>
  )
}

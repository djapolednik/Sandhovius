'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { deviceTypeIcon } from '../lib/icons'

const DEVICE_TYPES = [
  { value: 'light', label: 'Lamp', example: 'Bijv. Leeslamp' },
  { value: 'switch', label: 'Stopcontact', example: 'Bijv. Stopcontact tv' },
  { value: 'sensor', label: 'Sensor', example: 'Bijv. Bewegingssensor gang' },
  { value: 'climate', label: 'Thermostaat', example: 'Bijv. Thermostaat woonkamer' },
]

// Soort eerst, dan de naam: de soort is een keuze uit vier grote tegels
// (sneller en duidelijker dan een uitklaplijst), en de voorbeeldnaam past
// zich erop aan. De kamer staat al op de kamer die je net bekeek.
export default function AddDeviceModal({ rooms, defaultRoomId = '', onClose, onCreate }) {
  const t = useTranslations()
  const [name, setName] = useState('')
  const [type, setType] = useState('light')
  const [roomId, setRoomId] = useState(defaultRoomId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Geen entity_id-veld: de agent maakt na het aanmaken automatisch een
  // passende Home Assistant helper aan (zie provisionDeviceEntity in de
  // agent) en vult entity_id vanzelf in — niemand hoeft zelf iets in HA
  // te configureren. Tot dan toont de kaart "Wordt klaargezet".
  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), type, room: roomId || null })
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.addDevice'), err))
      setSaving(false)
    }
  }

  const example = DEVICE_TYPES.find((t) => t.value === type)?.example

  return (
    <Modal title="Apparaat toevoegen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <fieldset className="type-picker">
          <legend className="form-label">Wat voeg je toe?</legend>
          <div className="type-picker-grid">
            {DEVICE_TYPES.map((t) => {
              const Icon = deviceTypeIcon(t.value)
              return (
                <label key={t.value} className={`type-tile ${type === t.value ? 'type-tile-selected' : ''}`}>
                  <input
                    type="radio"
                    name="device-type"
                    value={t.value}
                    checked={type === t.value}
                    onChange={() => setType(t.value)}
                    className="visually-hidden"
                  />
                  <span className={`device-icon device-icon-${t.value} type-tile-icon`}>
                    <Icon />
                  </span>
                  <span className="type-tile-label">{t.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <label className="form-field">
          <span className="form-label">Naam</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={example}
            required
          />
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

        {error && <p className="error-banner">{error}</p>}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Bezig met toevoegen…' : 'Toevoegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import Modal from './Modal'

const DEVICE_TYPES = [
  { value: 'light', label: 'Lamp' },
  { value: 'switch', label: 'Stopcontact' },
  { value: 'sensor', label: 'Sensor' },
  { value: 'climate', label: 'Thermostaat' },
]

export default function AddDeviceModal({ rooms, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('light')
  const [roomId, setRoomId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Geen entity_id-veld: de agent maakt na het aanmaken automatisch een
  // passende Home Assistant helper aan (zie provisionDeviceEntity in de
  // agent) en vult entity_id vanzelf in — niemand hoeft zelf iets in HA
  // te configureren.
  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({ name, type, room: roomId || null })
      onClose()
    } catch (err) {
      setError('Toevoegen mislukt: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Device toevoegen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">Naam</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bijv. Leeslamp"
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {DEVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
            Toevoegen
          </button>
        </div>
      </form>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { TrashIcon } from '../lib/icons'

// Instellingen van één apparaat: naam, kamer en verwijderen. Opent via de gear-knop of
// door de kaart ingedrukt te houden (zie DeviceCard). Een sheet i.p.v. de
// achterkant van de kaart: zo kan de kaart zelf zo compact zijn als zijn
// inhoud, en staat dit formulier op een telefoon onderin, binnen bereik
// van je duim.
export default function DeviceSettingsModal({ device, rooms, onSave, onDelete, onClose }) {
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

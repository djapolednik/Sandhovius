'use client'

import { useState } from 'react'
import Modal from './Modal'
import { TrashIcon } from '../lib/icons'

export default function DeviceOptionsModal({ device, rooms, onClose, onSave, onDelete }) {
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
      setError('Opslaan mislukt: ' + err.message)
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
      setError('Verwijderen mislukt: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Device bewerken" onClose={onClose}>
      <form onSubmit={handleSave} className="form-stack">
        <label className="form-field">
          <span className="form-label">Naam</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            Opslaan
          </button>
        </div>
      </form>

      <div className="modal-divider" />

      {confirmingDelete ? (
        <div className="danger-zone">
          <p className="danger-text">Weet je zeker dat je "{device.name}" wilt verwijderen?</p>
          <div className="form-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
              Annuleren
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Ja, verwijderen
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-plain btn-danger-text"
          onClick={() => setConfirmingDelete(true)}
          disabled={saving}
        >
          <TrashIcon /> Device verwijderen
        </button>
      )}
    </Modal>
  )
}

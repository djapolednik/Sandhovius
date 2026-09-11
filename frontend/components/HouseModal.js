'use client'

import { useState } from 'react'
import Modal from './Modal'
import { CheckIcon, CloseIcon, TrashIcon } from '../lib/icons'

function RoomRow({ room, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(room.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onRename(room.id, name)
      setEditing(false)
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError('')
    try {
      await onDelete(room.id)
    } catch (err) {
      setError('Verwijderen mislukt: ' + err.message)
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <li className="room-list-item">
        <form onSubmit={handleSave} className="room-edit-form">
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <button type="submit" className="btn btn-icon btn-plain" aria-label="Opslaan" disabled={busy}>
            <CheckIcon />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-plain"
            aria-label="Annuleren"
            onClick={() => {
              setName(room.name)
              setEditing(false)
            }}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </form>
        {error && <p className="error-banner">{error}</p>}
      </li>
    )
  }

  if (confirmingDelete) {
    return (
      <li className="room-list-item">
        <div className="room-row">
          <span className="room-row-name">"{room.name}" verwijderen?</span>
          <div className="room-row-actions">
            <button
              className="btn btn-plain"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Nee
            </button>
            <button className="btn btn-danger-text" onClick={handleDelete} disabled={busy}>
              Ja
            </button>
          </div>
        </div>
        {error && <p className="error-banner">{error}</p>}
      </li>
    )
  }

  return (
    <li className="room-list-item">
      <div className="room-row">
        <button className="room-row-name room-row-name-editable" onClick={() => setEditing(true)}>
          {room.name}
        </button>
        <button
          className="btn btn-icon btn-plain"
          aria-label={`Kamer "${room.name}" verwijderen`}
          onClick={() => setConfirmingDelete(true)}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

export default function HouseModal({ house, rooms, onRenameHouse, onAddRoom, onRenameRoom, onDeleteRoom, onClose }) {
  const [houseName, setHouseName] = useState(house?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [addingRoom, setAddingRoom] = useState(false)
  const [error, setError] = useState('')

  async function handleRenameHouse(e) {
    e.preventDefault()
    setSavingName(true)
    setError('')
    try {
      await onRenameHouse(houseName)
    } catch (err) {
      setError('Naam opslaan mislukt: ' + err.message)
    } finally {
      setSavingName(false)
    }
  }

  async function handleAddRoom(e) {
    e.preventDefault()
    setAddingRoom(true)
    setError('')
    try {
      await onAddRoom(newRoomName)
      setNewRoomName('')
    } catch (err) {
      setError('Kamer toevoegen mislukt: ' + err.message)
    } finally {
      setAddingRoom(false)
    }
  }

  return (
    <Modal title="Huis wijzigen" onClose={onClose}>
      <form onSubmit={handleRenameHouse} className="form-stack">
        <label className="form-field">
          <span className="form-label">Naam van je huis</span>
          <input
            className="input"
            type="text"
            value={houseName}
            onChange={(e) => setHouseName(e.target.value)}
            required
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={savingName}>
            Opslaan
          </button>
        </div>
      </form>

      <div className="modal-divider" />

      <span className="form-label">Kamers</span>
      {rooms.length > 0 && (
        <ul className="house-list" style={{ marginTop: '0.5rem' }}>
          {rooms.map((room) => (
            <RoomRow key={room.id} room={room} onRename={onRenameRoom} onDelete={onDeleteRoom} />
          ))}
        </ul>
      )}

      <form onSubmit={handleAddRoom} className="form-inline">
        <input
          className="input"
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          placeholder="Nieuwe kamer, bijv. Slaapkamer"
          required
        />
        <button type="submit" className="btn btn-secondary" disabled={addingRoom}>
          Toevoegen
        </button>
      </form>

      {error && <p className="error-banner">{error}</p>}
    </Modal>
  )
}

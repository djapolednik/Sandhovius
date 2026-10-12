'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { claimErrorMessage } from '../lib/claim'
import { CheckIcon, CloseIcon, TrashIcon } from '../lib/icons'
import MoveButtons from './MoveButtons'

function RoomRow({ room, index, count, onMove, onRename, onDelete }) {
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
      setError(describeError('Kamernaam opslaan', err))
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
      setError(describeError('Kamer verwijderen', err))
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
            aria-label={`Nieuwe naam voor kamer "${room.name}"`}
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
        {/* Gevolg benoemd, en knoppen die zeggen wat ze doen i.p.v. Ja/Nee.
            Apparaten verliezen alleen hun kamer (geen cascade) en komen
            onder "Overig" — er wordt niets weggegooid. */}
        <div className="room-confirm">
          <p className="room-confirm-text">
            Kamer “{room.name}” verwijderen? Apparaten in deze kamer blijven bestaan en komen onder
            “Overig”.
          </p>
          <div className="room-row-actions">
            <button
              className="btn btn-plain"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Annuleren
            </button>
            <button className="btn btn-danger-text" onClick={handleDelete} disabled={busy}>
              Kamer verwijderen
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
        <button
          className="room-row-name room-row-name-editable"
          aria-label={`Kamer "${room.name}" hernoemen`}
          onClick={() => setEditing(true)}
        >
          {room.name}
        </button>
        <div className="room-row-actions">
          <MoveButtons label={`Kamer "${room.name}"`} index={index} count={count} onMove={(delta) => onMove(room.id, delta)} />
          <button
            className="btn btn-icon btn-plain"
            aria-label={`Kamer "${room.name}" verwijderen`}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </li>
  )
}

// Huisnaam en box zijn alleen voor beheerders (isAdmin); kamers kan elk lid
// inrichten.
export default function HouseModal({
  house,
  isAdmin = false,
  rooms,
  onRenameHouse,
  onAddRoom,
  onRenameRoom,
  onMoveRoom,
  onDeleteRoom,
  onReleaseBox,
  onClose,
}) {
  const [houseName, setHouseName] = useState(house?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [addingRoom, setAddingRoom] = useState(false)
  const [error, setError] = useState('')
  const [confirmingRelease, setConfirmingRelease] = useState(false)
  const [releasing, setReleasing] = useState(false)

  async function handleRelease() {
    setReleasing(true)
    setError('')
    try {
      await onReleaseBox(house.id)
      setConfirmingRelease(false)
    } catch (err) {
      console.error('[ontkoppelen]', err?.status)
      setError(claimErrorMessage(err?.status ?? 0, err?.message))
    } finally {
      setReleasing(false)
    }
  }

  async function handleRenameHouse(e) {
    e.preventDefault()
    setSavingName(true)
    setError('')
    try {
      await onRenameHouse(houseName)
    } catch (err) {
      setError(describeError('Naam opslaan', err))
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
      setError(describeError('Kamer toevoegen', err))
    } finally {
      setAddingRoom(false)
    }
  }

  return (
    <Modal title={isAdmin ? 'Huis wijzigen' : 'Kamers wijzigen'} onClose={onClose}>
      {isAdmin && (
        <>
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
        </>
      )}

      <span className="form-label">Kamers</span>
      {rooms.length > 0 && (
        <ul className="house-list" style={{ marginTop: '0.5rem' }}>
          {rooms.map((room, index) => (
            <RoomRow
              key={room.id}
              room={room}
              index={index}
              count={rooms.length}
              onMove={onMoveRoom}
              onRename={onRenameRoom}
              onDelete={onDeleteRoom}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleAddRoom} className="form-inline">
        <input
          className="input"
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          aria-label="Naam van de nieuwe kamer"
          placeholder="Bijv. Slaapkamer"
          required
        />
        <button type="submit" className="btn btn-secondary" disabled={addingRoom}>
          Toevoegen
        </button>
      </form>

      {isAdmin && house?.claimed_at && (
        <>
          <div className="modal-divider" />
          <span className="form-label">Box</span>
          {confirmingRelease ? (
            <div className="room-confirm">
              <p className="room-confirm-text">
                Box ontkoppelen? Je huis en instellingen blijven bewaard. Je kunt later een box koppelen.
              </p>
              <div className="room-row-actions">
                <button className="btn btn-plain" onClick={() => setConfirmingRelease(false)} disabled={releasing}>
                  Annuleren
                </button>
                <button className="btn btn-danger-text" onClick={handleRelease} disabled={releasing}>
                  Box ontkoppelen
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button className="btn btn-danger-text" onClick={() => setConfirmingRelease(true)}>
                Box ontkoppelen
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="error-banner">{error}</p>}
    </Modal>
  )
}

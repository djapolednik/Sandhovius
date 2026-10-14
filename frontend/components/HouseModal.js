'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { claimError } from '../lib/claim'
import { CheckIcon, CloseIcon, MinusIcon, PlusIcon, TrashIcon } from '../lib/icons'
import { PRESETS, PRESET_MAX, PRESET_MIN, compareText, presetTemps } from '../lib/climate'
import { formatTemperature } from '../lib/temperature'
import { useIntl } from '../app/LanguageContext'
import MoveButtons from './MoveButtons'

function RoomRow({ room, index, count, onMove, onRename, onDelete }) {
  const t = useTranslations()
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
      setError(describeError(t, t('errors.what.saveRoomName'), err))
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
      setError(describeError(t, t('errors.what.deleteRoom'), err))
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
            aria-label={t('houseSheet.newRoomName', { name: room.name })}
            autoFocus
            required
          />
          <button type="submit" className="btn btn-icon btn-plain" aria-label={t('common.save')} disabled={busy}>
            <CheckIcon />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-plain"
            aria-label={t('common.cancel')}
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
            {t('houseSheet.confirmDeleteRoom', { name: room.name })}
          </p>
          <div className="room-row-actions">
            <button
              className="btn btn-plain"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger-text" onClick={handleDelete} disabled={busy}>
              {t('houseSheet.deleteRoom')}
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
          aria-label={t('houseSheet.renameRoom', { name: room.name })}
          onClick={() => setEditing(true)}
        >
          {room.name}
        </button>
        <div className="room-row-actions">
          <MoveButtons label={t('toast.labelRoom', { name: room.name })} index={index} count={count} onMove={(delta) => onMove(room.id, delta)} />
          <button
            className="btn btn-icon btn-plain"
            aria-label={t('houseSheet.deleteRoomLabel', { name: room.name })}
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
// F2: Comfort, Eco en Slaap met −/+ in halve graden; elke tik slaat op
// (zoals de dial), met eronder de vergelijking met Comfort.
function ClimatePresetsEditor({ house, onSave, onError }) {
  const t = useTranslations()
  const { locale } = useIntl()
  const temps = presetTemps(house)
  async function step(preset, delta) {
    const next = Math.min(PRESET_MAX, Math.max(PRESET_MIN, temps[preset] + delta))
    if (next === temps[preset]) return
    try {
      await onSave(preset, next)
    } catch (err) {
      onError(describeError(t, t('errors.what.climatePresets'), err))
    }
  }
  return (
    <div className="climate-presets-editor">
      <span className="form-label">{t('houseSheet.climatePresets')}</span>
      <p className="settings-hint">{t('houseSheet.climatePresetsHint')}</p>
      {PRESETS.map((preset) => (
        <div key={preset} className="settings-row climate-preset-edit">
          <span className="settings-row-text">
            <span>{t(`climate.presets.${preset}`)}</span>
            {preset !== 'comfort' && <span className="settings-row-hint">{compareText({ t, locale }, preset, temps)}</span>}
          </span>
          <span className="scene-temperature">
            <button
              type="button"
              className="climate-step"
              aria-label={t('houseSheet.colder', { preset: t(`climate.presets.${preset}`) })}
              onClick={() => step(preset, -0.5)}
            >
              <MinusIcon width="18" height="18" aria-hidden="true" />
            </button>
            <span className="scene-temperature-value" aria-live="polite">
              {formatTemperature(temps[preset], locale)}
            </span>
            <button
              type="button"
              className="climate-step"
              aria-label={t('houseSheet.warmer', { preset: t(`climate.presets.${preset}`) })}
              onClick={() => step(preset, 0.5)}
            >
              <PlusIcon width="18" height="18" aria-hidden="true" />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}

export default function HouseModal({
  house,
  isAdmin = false,
  // D1: false = alleen bedienen; de kamers alleen als lijst.
  canEdit = true,
  rooms,
  onRenameHouse,
  // F2: de standen van de verwarming (alleen beheerder, alleen met thermostaten).
  hasClimate = false,
  onSaveClimatePreset,
  onAddRoom,
  onRenameRoom,
  onMoveRoom,
  onDeleteRoom,
  onReleaseBox,
  onClose,
}) {
  const t = useTranslations()
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
      setError(claimError(t, err))
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
      setError(describeError(t, t('errors.what.saveName'), err))
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
      setError(describeError(t, t('errors.what.addRoom'), err))
    } finally {
      setAddingRoom(false)
    }
  }

  return (
    <Modal title={isAdmin ? t('houseSheet.titleAdmin') : t('houseSheet.title')} onClose={onClose}>
      {isAdmin && (
        <>
          <form onSubmit={handleRenameHouse} className="form-stack">
            <label className="form-field">
              <span className="form-label">{t('houseSheet.houseName')}</span>
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
                {t('common.save')}
              </button>
            </div>
          </form>

          <div className="modal-divider" />

          {hasClimate && onSaveClimatePreset && (
            <>
              <ClimatePresetsEditor house={house} onSave={onSaveClimatePreset} onError={setError} />
              <div className="modal-divider" />
            </>
          )}
        </>
      )}

      <span className="form-label">{t('nav.kamers')}</span>
      {rooms.length > 0 && (
        <ul className="house-list" style={{ marginTop: '0.5rem' }}>
          {rooms.map((room, index) =>
            !canEdit ? (
              <li key={room.id} className="room-list-item">
                <div className="room-row">
                  <span className="room-row-name">{room.name}</span>
                </div>
              </li>
            ) : (
            <RoomRow
              key={room.id}
              room={room}
              index={index}
              count={rooms.length}
              onMove={onMoveRoom}
              onRename={onRenameRoom}
              onDelete={onDeleteRoom}
            />
            )
          )}
        </ul>
      )}

      {!canEdit && <p className="settings-hint">{t('rights.askAdmin')}</p>}
      {canEdit && (
      <form onSubmit={handleAddRoom} className="form-inline">
        <input
          className="input"
          type="text"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          aria-label={t('houseSheet.newRoom')}
          placeholder={t('houseSheet.newRoomPlaceholder')}
          required
        />
        <button type="submit" className="btn btn-secondary" disabled={addingRoom}>
          {t('rooms.add')}
        </button>
      </form>
      )}

      {isAdmin && house?.claimed_at && (
        <>
          <div className="modal-divider" />
          <span className="form-label">{t('houseSheet.box')}</span>
          {confirmingRelease ? (
            <div className="room-confirm">
              <p className="room-confirm-text">
                {t('houseSheet.confirmRelease')}
              </p>
              <div className="room-row-actions">
                <button className="btn btn-plain" onClick={() => setConfirmingRelease(false)} disabled={releasing}>
                  {t('common.cancel')}
                </button>
                <button className="btn btn-danger-text" onClick={handleRelease} disabled={releasing}>
                  {t('houseSheet.release')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button className="btn btn-danger-text" onClick={() => setConfirmingRelease(true)}>
                {t('houseSheet.release')}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="error-banner">{error}</p>}
    </Modal>
  )
}

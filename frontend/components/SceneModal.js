'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { formatTemperature } from '../lib/temperature'
import { DAYS, describeDays } from '../lib/schedules'
import { MinusIcon, PlusIcon, TrashIcon } from '../lib/icons'

const TEMP_STEP = 0.5
const DEFAULT_TEMPERATURE = 20

// Wat een scène per apparaat doet: niets, aan of uit. Een thermostaat die
// "aan" gaat, gaat meteen naar een temperatuur (turn_on + set_temperature).
function choicesFromActions(actions, devices) {
  const choices = {}
  for (const device of devices) choices[device.id] = { mode: 'skip', temperature: currentTarget(device) }
  for (const step of actions ?? []) {
    const choice = choices[step.device]
    if (!choice) continue
    if (step.action === 'turn_off') choice.mode = 'off'
    if (step.action === 'turn_on') choice.mode = 'on'
    if (step.action === 'set_temperature') {
      choice.mode = 'on'
      choice.temperature = step.payload?.temperature ?? choice.temperature
    }
  }
  return choices
}

function actionsFromChoices(choices, devices) {
  const actions = []
  for (const device of devices) {
    const choice = choices[device.id]
    if (!choice || choice.mode === 'skip') continue
    if (choice.mode === 'off') actions.push({ device: device.id, action: 'turn_off' })
    else {
      actions.push({ device: device.id, action: 'turn_on' })
      if (device.type === 'climate') {
        actions.push({ device: device.id, action: 'set_temperature', payload: { temperature: choice.temperature } })
      }
    }
  }
  return actions
}

function currentTarget(device) {
  const state = device.expand?.device_state_via_device?.[0]?.state
  const target = state?.occupied_heating_setpoint ?? state?.attributes?.temperature
  return typeof target === 'number' ? target : DEFAULT_TEMPERATURE
}

function rowsFromSchedules(schedules) {
  return [...schedules]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((s) => ({
      key: s.id,
      id: s.id,
      time: s.time,
      days: s.days,
      enabled: s.enabled,
      lastRun: s.last_run,
      lastError: s.last_error,
      dirty: false,
    }))
}

function nextWholeHour() {
  return `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`
}

// "zondag 23:00": wanneer een schema voor het laatst liep.
function formatRun(lastRun) {
  return new Date(lastRun).toLocaleString('nl-NL', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
}

const MODES = [
  { value: 'skip', label: 'Niet' },
  { value: 'on', label: 'Aan' },
  { value: 'off', label: 'Uit' },
]

// Een scène maken of wijzigen: een naam, en per lamp, stopcontact en
// thermostaat wat hij doet. Anders dan de detail-sheet met "Opslaan": je
// stelt meerdere dingen samen in en slaat ze in één keer op.
export default function SceneModal({
  scene,
  schedules,
  devices,
  roomNameById,
  onSaveScene,
  onSaveSchedule,
  onDeleteSchedule,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState(scene?.name ?? '')
  const [choices, setChoices] = useState(() => choicesFromActions(scene?.actions, devices))
  const [rows, setRows] = useState(() => rowsFromSchedules(schedules))
  const [removedIds, setRemovedIds] = useState([])
  // Na een half gelukte eerste keer "Opslaan" bestaat de scène al: een
  // tweede poging werkt hem dan bij in plaats van er nog een te maken.
  const [savedSceneId, setSavedSceneId] = useState(scene?.id ?? null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const actions = actionsFromChoices(choices, devices)
  const knownIds = new Set(devices.map((device) => device.id))
  const missing = new Set((scene?.actions ?? []).map((step) => step.device).filter((id) => !knownIds.has(id))).size

  function setChoice(deviceId, patch) {
    setError('')
    setChoices((prev) => ({ ...prev, [deviceId]: { ...prev[deviceId], ...patch } }))
  }

  function updateRow(key, patch) {
    setError('')
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, dirty: true, ...patch } : row)))
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), time: nextWholeHour(), days: DAYS.map((d) => d.key), enabled: true, dirty: true },
    ])
  }

  function removeRow(row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key))
    if (row.id) setRemovedIds((prev) => [...prev, row.id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (actions.length === 0) {
      setError('Kies bij minstens één apparaat wat de scène doet.')
      return
    }
    if (rows.some((row) => row.days.length === 0)) {
      setError('Kies bij elke tijd minstens één dag.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const sceneId = await onSaveScene(savedSceneId, { name: name.trim(), actions })
      setSavedSceneId(sceneId)
      for (const scheduleId of removedIds) {
        await onDeleteSchedule(scheduleId)
        setRemovedIds((prev) => prev.filter((id) => id !== scheduleId))
      }
      for (const row of rows) {
        if (!row.dirty) continue
        const saved = await onSaveSchedule(sceneId, row)
        setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, id: saved.id, dirty: false } : r)))
      }
      onClose()
    } catch (err) {
      setError(describeError('Scène opslaan', err))
      setSaving(false)
    }
  }

  return (
    <Modal title={scene ? 'Scène wijzigen' : 'Nieuwe scène'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">Naam</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={60}
            placeholder="Bijv. Naar bed"
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <div className="form-field">
          <span className="form-label">Wat doet de scène?</span>
          {devices.length === 0 ? (
            <p className="settings-hint" style={{ margin: 0 }}>
              Voeg eerst een lamp, stopcontact of thermostaat toe.
            </p>
          ) : (
            <ul className="scene-rows">
              {devices.map((device) => {
                const choice = choices[device.id]
                return (
                  <li key={device.id} className="scene-row">
                    <span className="scene-row-name">
                      {device.name}
                      <span className="scene-row-room">{roomNameById[device.room] ?? 'Geen kamer'}</span>
                    </span>
                    <fieldset className="segmented segmented-small">
                      <legend className="visually-hidden">{device.name} in deze scène</legend>
                      {MODES.map(({ value, label }) => (
                        <label
                          key={value}
                          className={`segmented-option ${choice.mode === value ? 'segmented-option-selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`scene-${device.id}`}
                            value={value}
                            className="visually-hidden"
                            checked={choice.mode === value}
                            onChange={() => setChoice(device.id, { mode: value })}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    {device.type === 'climate' && choice.mode === 'on' && (
                      <div className="scene-temperature">
                        <button
                          type="button"
                          className="climate-step"
                          aria-label={`${device.name} kouder`}
                          onClick={() => setChoice(device.id, { temperature: choice.temperature - TEMP_STEP })}
                        >
                          <MinusIcon width="20" height="20" />
                        </button>
                        <span className="scene-temperature-value" aria-live="polite">
                          {formatTemperature(choice.temperature)}
                        </span>
                        <button
                          type="button"
                          className="climate-step"
                          aria-label={`${device.name} warmer`}
                          onClick={() => setChoice(device.id, { temperature: choice.temperature + TEMP_STEP })}
                        >
                          <PlusIcon width="20" height="20" />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {missing > 0 && (
            <p className="settings-hint" style={{ margin: 0 }}>
              {missing === 1 ? 'Eén apparaat' : `${missing} apparaten`} uit deze scène bestaat niet meer; dat valt eruit
              als je opslaat.
            </p>
          )}
        </div>

        <div className="form-field">
          <span className="form-label">Vanzelf uitvoeren</span>
          {rows.length > 0 && (
            <ul className="schedule-rows">
              {rows.map((row) => (
                <li key={row.key} className="schedule-row">
                  <div className="schedule-row-top">
                    <input
                      className="input schedule-time"
                      type="time"
                      required
                      aria-label="Tijd"
                      value={row.time}
                      onChange={(e) => updateRow(row.key, { time: e.target.value })}
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.enabled}
                      aria-label={`Om ${row.time} vanzelf uitvoeren`}
                      className={`switch switch-accent ${row.enabled ? 'switch-on' : ''}`}
                      onClick={() => updateRow(row.key, { enabled: !row.enabled })}
                    >
                      <span className="switch-thumb" />
                    </button>
                  </div>
                  <div className="schedule-days" role="group" aria-label={`Dagen voor ${row.time}`}>
                    {DAYS.map((day) => {
                      const on = row.days.includes(day.key)
                      return (
                        <button
                          key={day.key}
                          type="button"
                          className={`day-toggle ${on ? 'day-toggle-on' : ''}`}
                          aria-pressed={on}
                          aria-label={day.long}
                          onClick={() =>
                            updateRow(row.key, {
                              days: on ? row.days.filter((d) => d !== day.key) : [...row.days, day.key],
                            })
                          }
                        >
                          {day.short}
                        </button>
                      )
                    })}
                  </div>
                  <div className="schedule-row-bottom">
                    <span className="schedule-days-text">
                      {row.days.length === 0 ? 'Kies minstens één dag' : describeDays(row.days)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon btn-plain"
                      aria-label={`Tijd ${row.time} verwijderen`}
                      onClick={() => removeRow(row)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {row.lastError && row.lastRun && !row.dirty && (
                    <p className="error-banner" style={{ margin: 0 }}>
                      Niet gelukt op {formatRun(row.lastRun)}. Kijk bij Let op of al je apparaten bereikbaar zijn.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-plain schedule-add" onClick={addRow}>
            <PlusIcon width="18" height="18" aria-hidden="true" />
            Tijd toevoegen
          </button>
        </div>

        {error && !confirmingDelete && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {scene ? 'Opslaan' : 'Scène maken'}
        </button>
      </form>

      {scene && (
        <>
          <div className="modal-divider" />
          {confirmingDelete ? (
            <div className="danger-zone">
              <p className="danger-text">Scène "{scene.name}" verwijderen? Je apparaten blijven gewoon bestaan.</p>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)}>
                  Annuleren
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onDelete(scene.id)
                    onClose()
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)}>
              <TrashIcon />
              Scène verwijderen
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

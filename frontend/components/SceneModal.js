'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { formatTemperature } from '../lib/temperature'
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

const MODES = [
  { value: 'skip', label: 'Niet' },
  { value: 'on', label: 'Aan' },
  { value: 'off', label: 'Uit' },
]

// Een scène maken of wijzigen: een naam, en per lamp, stopcontact en
// thermostaat wat hij doet. Anders dan de detail-sheet met "Opslaan": je
// stelt meerdere dingen samen in en slaat ze in één keer op.
export default function SceneModal({ scene, devices, roomNameById, onSave, onDelete, onClose }) {
  const [name, setName] = useState(scene?.name ?? '')
  const [choices, setChoices] = useState(() => choicesFromActions(scene?.actions, devices))
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (actions.length === 0) {
      setError('Kies bij minstens één apparaat wat de scène doet.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), actions })
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

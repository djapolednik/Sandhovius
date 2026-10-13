'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { OFF_AFTER_STEPS } from '../lib/motionLights'
import { CheckIcon, TrashIcon } from '../lib/icons'

// Een bewegingslicht maken of wijzigen: welke sensor, welke lampen, alleen in
// het donker, en na hoeveel minuten zonder beweging het licht weer uitgaat.
// Zoals de scène-sheet: je stelt alles samen in en slaat in één keer op.
//
// sensors: sensoren die ooit beweging meldden (motionSensors).
// switchables: lampen en stopcontacten (switchableDevices).
// onSave(id | null, fields) slaat op; onDelete(id) verwijdert.
export default function MotionLightSheet({ rule, sensors, switchables, roomNameById, onSave, onDelete, onClose }) {
  const t = useTranslations()
  const [sensor, setSensor] = useState(rule?.sensor ?? (sensors.length === 1 ? sensors[0].id : ''))
  const [devices, setDevices] = useState(rule?.devices ?? [])
  const [onlyDark, setOnlyDark] = useState(rule?.only_dark ?? true)
  const [offAfter, setOffAfter] = useState(rule?.off_after ?? 3)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Een regel kan een waarde hebben die geen stap is (van een andere app of
  // van vroeger): die blijft dan kiesbaar.
  const steps = OFF_AFTER_STEPS.includes(offAfter) ? OFF_AFTER_STEPS : [...OFF_AFTER_STEPS, offAfter].sort((a, b) => a - b)
  const sensorName = (id) => sensors.find((s) => s.id === id)?.name ?? ''

  function toggleDevice(id) {
    setError('')
    setDevices((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!sensor) return setError(t('motion.needSensor'))
    // Alleen apparaten die er nog zijn: een verwijderde lamp telt niet mee.
    const chosen = devices.filter((id) => switchables.some((d) => d.id === id))
    if (chosen.length === 0) return setError(t('motion.needLamp'))
    setSaving(true)
    setError('')
    try {
      await onSave(rule?.id ?? null, { sensor, devices: chosen, only_dark: onlyDark, off_after: offAfter })
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.saveMotionLight'), err))
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await onDelete(rule.id)
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.deleteMotionLight'), err))
      setSaving(false)
    }
  }

  return (
    <Modal title={rule ? t('motion.sheetEdit') : t('motion.sheetNew')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <fieldset className="house-choice motion-choice">
          <legend className="form-label">{t('motion.sensor')}</legend>
          {sensors.length === 0 && <p className="settings-hint motion-empty">{t('motion.noSensors')}</p>}
          {sensors.map((s) => (
            <label key={s.id} className={`house-choice-option ${sensor === s.id ? 'house-choice-selected' : ''}`}>
              <input
                type="radio"
                name="motion-sensor"
                className="visually-hidden"
                checked={sensor === s.id}
                onChange={() => {
                  setError('')
                  setSensor(s.id)
                }}
              />
              <span className="motion-choice-text">
                <span>{s.name}</span>
                <span className="motion-choice-room">{roomNameById[s.room] ?? t('home.noRoom')}</span>
              </span>
              {sensor === s.id && <CheckIcon width="18" height="18" aria-hidden="true" />}
            </label>
          ))}
        </fieldset>

        <fieldset className="house-choice motion-choice">
          <legend className="form-label">{t('motion.lamps')}</legend>
          {switchables.length === 0 && <p className="settings-hint motion-empty">{t('motion.noSwitchables')}</p>}
          {switchables.map((d) => {
            const on = devices.includes(d.id)
            return (
              <label key={d.id} className={`house-choice-option ${on ? 'house-choice-selected' : ''}`}>
                <input
                  type="checkbox"
                  className="visually-hidden"
                  checked={on}
                  onChange={() => toggleDevice(d.id)}
                />
                <span className="motion-choice-text">
                  <span>{d.name}</span>
                  <span className="motion-choice-room">{roomNameById[d.room] ?? t('home.noRoom')}</span>
                </span>
                {on && <CheckIcon width="18" height="18" aria-hidden="true" />}
              </label>
            )
          })}
        </fieldset>

        <div>
          <div className="settings-row">
            <span id="motion-only-dark">{t('motion.onlyDark')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={onlyDark}
              aria-labelledby="motion-only-dark"
              className={`switch switch-accent ${onlyDark ? 'switch-on' : ''}`}
              onClick={() => setOnlyDark((v) => !v)}
            >
              <span className="switch-thumb" />
            </button>
          </div>
          <p className="settings-hint" style={{ marginTop: 0 }}>
            {t('motion.onlyDarkHint')}
          </p>
        </div>

        <fieldset className="motion-off-after">
          <legend className="form-label">
            {t('motion.offAfter')}: {t('motion.minutes', { minutes: offAfter })}
          </legend>
          <div className="segmented segmented-small">
            {steps.map((minutes) => (
              <label
                key={minutes}
                className={`segmented-option ${offAfter === minutes ? 'segmented-option-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="motion-off-after"
                  className="visually-hidden"
                  checked={offAfter === minutes}
                  aria-label={t('motion.minutes', { minutes })}
                  onChange={() => setOffAfter(minutes)}
                />
                <span aria-hidden="true">{minutes}</span>
              </label>
            ))}
          </div>
          <p className="settings-hint">{t('motion.offAfterHint')}</p>
        </fieldset>

        {error && !confirmingDelete && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t('common.save')}
        </button>
      </form>

      {rule && (
        <>
          <div className="modal-divider" />
          {confirmingDelete ? (
            <div className="danger-zone">
              <p className="danger-text">{t('motion.confirmDelete', { name: sensorName(rule.sensor) || t('motion.sensor') })}</p>
              {error && <p className="error-banner">{error}</p>}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={saving}>
                  {t('common.cancel')}
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)}>
              <TrashIcon />
              {t('motion.delete')}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

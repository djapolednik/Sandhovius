'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { formatTemperature } from '../lib/temperature'
import {
  DAY_KEYS,
  SUN_OFFSETS,
  dayNames,
  describeDays,
  isSun,
  nextRunText,
  offsetLabel,
  scheduleSortKey,
  scheduleWhen,
  scheduleWhenLabel,
} from '../lib/schedules'
import { useIntl } from '../app/LanguageContext'
import { cachedFormat } from '../lib/language'
import { actionsFromChoices, choicesFromActions, currentPayload, describeLightStep } from '../lib/sceneChoices'
import { MinusIcon, PlusIcon, TrashIcon } from '../lib/icons'
import { uid } from '../lib/uid'

const TEMP_STEP = 0.5

function rowsFromSchedules(schedules) {
  return [...schedules]
    .sort((a, b) => scheduleSortKey(a).localeCompare(scheduleSortKey(b)))
    .map((s) => ({
      key: s.id,
      id: s.id,
      trigger: s.trigger || 'time',
      time: s.time || nextWholeHour(),
      offset: s.offset_min ?? 0,
      days: s.days,
      enabled: s.enabled,
      nextRun: s.next_run,
      lastRun: s.last_run,
      lastError: s.last_error,
      dirty: false,
    }))
}

// Een rij als schema, voor de woorden ("Bij zonsondergang", "Om 23:00").
const asSchedule = (row) => ({ trigger: row.trigger, time: row.time, offset_min: row.offset })

const TRIGGERS = ['time', 'sunrise', 'sunset']
const DIRECTIONS = ['before', 'at', 'after']
const directionOf = (offset) => (offset < 0 ? 'before' : offset > 0 ? 'after' : 'at')

function nextWholeHour() {
  return `${String((new Date().getHours() + 1) % 24).padStart(2, '0')}:00`
}

// "zondag 23:00": wanneer een schema voor het laatst liep.
function formatRun(lastRun, locale) {
  return cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(
    new Date(lastRun)
  )
}

// De woorden staan onder sceneSheet.modes.<value>.
const MODES = ['skip', 'on', 'off']
const CURRENT_MODE = 'current'

// "Zoals nu" kan alleen bij een lamp die nu aan staat en dimt of kleurt, of
// als de scène al een opgeslagen stand voor die lamp heeft.
function modesFor(device, choice) {
  return currentPayload(device) || choice.payload ? [...MODES, CURRENT_MODE] : MODES
}

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
  const intl = useIntl()
  const { t, locale } = intl
  const days = dayNames(locale)
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

  // Voor schermlezers: een tijd-schema heet naar zijn tijd ("23:00"), een
  // zon-schema in woorden ("bij zonsondergang").
  const isTime = (row) => row.trigger === 'time'
  const when = (row) => scheduleWhen(intl, asSchedule(row))

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
      { key: uid(), trigger: 'time', time: nextWholeHour(), offset: 0, days: [...DAY_KEYS], enabled: true, dirty: true },
    ])
  }

  // Voor of na: de verschuiving houdt zijn grootte (standaard 30 minuten).
  function setDirection(row, direction) {
    const size = Math.abs(row.offset) || 30
    updateRow(row.key, { offset: direction === 'at' ? 0 : direction === 'before' ? -size : size })
  }

  function removeRow(row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key))
    if (row.id) setRemovedIds((prev) => [...prev, row.id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (actions.length === 0) {
      setError(t('sceneSheet.needAction'))
      return
    }
    if (rows.some((row) => row.days.length === 0)) {
      setError(t('sceneSheet.needDays'))
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
      setError(describeError(t, t('errors.what.saveScene'), err))
      setSaving(false)
    }
  }

  return (
    <Modal title={scene ? t('sceneSheet.editTitle') : t('scenes.new')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">{t('deviceSheet.name')}</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={60}
            placeholder={t('sceneSheet.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <div className="form-field">
          <span className="form-label">{t('sceneSheet.what')}</span>
          {devices.length === 0 ? (
            <p className="settings-hint" style={{ margin: 0 }}>
              {t('sceneSheet.noDevices')}
            </p>
          ) : (
            <ul className="scene-rows">
              {devices.map((device) => {
                const choice = choices[device.id]
                const modes = modesFor(device, choice)
                return (
                  <li key={device.id} className="scene-row">
                    <span className="scene-row-name">
                      {device.name}
                      <span className="scene-row-room">{roomNameById[device.room] ?? t('home.noRoom')}</span>
                    </span>
                    <fieldset className="segmented segmented-small">
                      <legend className="visually-hidden">{t('sceneSheet.deviceLegend', { name: device.name })}</legend>
                      {modes.map((value) => (
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
                            onChange={() =>
                              setChoice(
                                device.id,
                                value === 'current'
                                  ? { mode: value, payload: currentPayload(device) ?? choice.payload }
                                  : { mode: value },
                              )
                            }
                          />
                          {t(`sceneSheet.modes.${value}`)}
                        </label>
                      ))}
                    </fieldset>
                    {choice.mode === 'current' && choice.payload && (
                      <span className="scene-row-room">{describeLightStep(t, choice.payload)}</span>
                    )}
                    {device.type === 'climate' && choice.mode === 'on' && (
                      <div className="scene-temperature">
                        <button
                          type="button"
                          className="climate-step"
                          aria-label={t('sceneSheet.colder', { name: device.name })}
                          onClick={() => setChoice(device.id, { temperature: choice.temperature - TEMP_STEP })}
                        >
                          <MinusIcon width="20" height="20" />
                        </button>
                        <span className="scene-temperature-value" aria-live="polite">
                          {formatTemperature(choice.temperature, locale)}
                        </span>
                        <button
                          type="button"
                          className="climate-step"
                          aria-label={t('sceneSheet.warmer', { name: device.name })}
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
              {t('sceneSheet.missing', { count: missing })}
            </p>
          )}
        </div>

        <div className="form-field">
          <span className="form-label">{t('scenes.schedulesTitle')}</span>
          {rows.length > 0 && (
            <ul className="schedule-rows">
              {rows.map((row) => (
                <li key={row.key} className="schedule-row">
                  <div className="schedule-row-top">
                    <span className="schedule-summary">
                      {scheduleWhenLabel(intl, asSchedule(row))}
                      {!isTime(row) && row.nextRun && !row.dirty && `, ${nextRunText(intl, row.nextRun)}`}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={row.enabled}
                      aria-label={isTime(row) ? t('sceneSheet.runAt', { time: row.time }) : t('sceneSheet.runWhen', { when: when(row) })}
                      className={`switch switch-accent ${row.enabled ? 'switch-on' : ''}`}
                      onClick={() => updateRow(row.key, { enabled: !row.enabled })}
                    >
                      <span className="switch-thumb" />
                    </button>
                  </div>
                  <fieldset className="segmented segmented-small schedule-trigger">
                    <legend className="visually-hidden">{t('sceneSheet.trigger')}</legend>
                    {TRIGGERS.map((value) => (
                      <label
                        key={value}
                        className={`segmented-option ${row.trigger === value ? 'segmented-option-selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`trigger-${row.key}`}
                          className="visually-hidden"
                          value={value}
                          checked={row.trigger === value}
                          onChange={() => updateRow(row.key, { trigger: value })}
                        />
                        {t(`sceneSheet.triggers.${value}`)}
                      </label>
                    ))}
                  </fieldset>
                  {row.trigger === 'time' ? (
                    <input
                      className="input schedule-time"
                      type="time"
                      required
                      aria-label={t('sceneSheet.time')}
                      value={row.time}
                      onChange={(e) => updateRow(row.key, { time: e.target.value })}
                    />
                  ) : (
                    <div className="schedule-sun">
                      <fieldset className="segmented segmented-small">
                        <legend className="visually-hidden">{t('sceneSheet.direction')}</legend>
                        {DIRECTIONS.map((value) => (
                          <label
                            key={value}
                            className={`segmented-option ${directionOf(row.offset) === value ? 'segmented-option-selected' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`direction-${row.key}`}
                              className="visually-hidden"
                              value={value}
                              checked={directionOf(row.offset) === value}
                              onChange={() => setDirection(row, value)}
                            />
                            {t(`sceneSheet.directions.${value}`)}
                          </label>
                        ))}
                      </fieldset>
                      {row.offset !== 0 && (
                        <fieldset className="segmented segmented-small schedule-offsets">
                          <legend className="visually-hidden">{t('sceneSheet.offset')}</legend>
                          {SUN_OFFSETS.map((minutes) => (
                            <label
                              key={minutes}
                              className={`segmented-option ${Math.abs(row.offset) === minutes ? 'segmented-option-selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`offset-${row.key}`}
                                className="visually-hidden"
                                value={minutes}
                                checked={Math.abs(row.offset) === minutes}
                                onChange={() => updateRow(row.key, { offset: Math.sign(row.offset) * minutes })}
                              />
                              {offsetLabel(intl, minutes)}
                            </label>
                          ))}
                        </fieldset>
                      )}
                    </div>
                  )}
                  <div className="schedule-days" role="group" aria-label={t('sceneSheet.daysFor', { time: isTime(row) ? row.time : t(`schedules.${row.trigger}`) })}>
                    {days.map((day) => {
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
                      {row.days.length === 0 ? t('sceneSheet.pickDay') : describeDays(intl, row.days)}
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon btn-plain"
                      aria-label={isTime(row) ? t('sceneSheet.removeTime', { time: row.time }) : t('sceneSheet.removeWhen', { when: when(row) })}
                      onClick={() => removeRow(row)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  {row.lastError === 'no_location' && !row.dirty && isSun(row) ? (
                    <p className="error-banner" style={{ margin: 0 }}>
                      {t('sceneSheet.noLocation')}
                    </p>
                  ) : (
                    row.lastError &&
                    row.lastRun &&
                    !row.dirty && (
                    <p className="error-banner" style={{ margin: 0 }}>
                        {t('sceneSheet.lastRunFailed', { when: formatRun(row.lastRun, locale) })}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-plain schedule-add" onClick={addRow}>
            <PlusIcon width="18" height="18" aria-hidden="true" />
            {t('sceneSheet.addTime')}
          </button>
        </div>

        {error && !confirmingDelete && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {scene ? t('common.save') : t('scenes.create')}
        </button>
      </form>

      {scene && (
        <>
          <div className="modal-divider" />
          {confirmingDelete ? (
            <div className="danger-zone">
              <p className="danger-text">{t('sceneSheet.confirmDelete', { name: scene.name })}</p>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    onDelete(scene.id)
                    onClose()
                  }}
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)}>
              <TrashIcon />
              {t('sceneSheet.delete')}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

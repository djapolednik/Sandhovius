'use client'

import { useState } from 'react'
import Modal from './Modal'
import { useIntl } from '../app/LanguageContext'
import { describeError } from '../lib/errors'
import { DAY_KEYS, SUN_OFFSETS, dayNames, describeDays, offsetLabel } from '../lib/schedules'
import {
  MAX_ACTIONS,
  OFF_AFTER_CHOICES,
  STARTER_KINDS,
  describeAutomation,
  missingStep,
  routineRecord,
  sensorEvents,
} from '../lib/routines'
import { CheckIcon, PlusIcon, TrashIcon } from '../lib/icons'
import { uid } from '../lib/uid'

const TIME_KINDS = ['time', 'sunrise', 'sunset']
const DIRECTIONS = ['before', 'at', 'after']
const directionOf = (offset) => (offset < 0 ? 'before' : offset > 0 ? 'after' : 'at')
const BRIGHTNESS = [null, 20, 50, 100]
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri']

// De starter als invoer voor de sheet: per soort eigen velden, zodat wat je
// bij een andere soort koos blijft staan tot je opslaat.
function starterInput(s) {
  const input = {
    kind: '',
    timeKind: 'time',
    time: '07:00',
    offset: 0,
    days: [...DAY_KEYS],
    lamp: '',
    to: 'on',
    sensor: '',
    event: '',
    value: 20,
  }
  if (!s?.kind) return input
  if (s.kind === 'time') return { ...input, kind: 'time', time: s.time, days: s.days }
  if (s.kind === 'sun') return { ...input, kind: 'time', timeKind: s.event, offset: s.offset_min ?? 0, days: s.days }
  if (s.kind === 'device') return { ...input, kind: 'device', lamp: s.device, to: s.to }
  return { ...input, kind: 'sensor', sensor: s.device, event: s.event, value: s.value ?? input.value }
}

function starterFrom(input) {
  if (input.kind === 'time') {
    return input.timeKind === 'time'
      ? { kind: 'time', time: input.time, days: input.days }
      : { kind: 'sun', event: input.timeKind, offset_min: input.offset, days: input.days }
  }
  if (input.kind === 'device') return { kind: 'device', device: input.lamp, to: input.to }
  if (input.kind === 'sensor') return { kind: 'sensor', device: input.sensor, event: input.event, value: input.value }
  return {}
}

function conditionsInput(conditions = []) {
  const find = (kind) => conditions.find((c) => c.kind === kind)
  return {
    dark: Boolean(find('dark')),
    between: { on: Boolean(find('between')), from: find('between')?.from ?? '22:00', to: find('between')?.to ?? '06:00' },
    days: { on: Boolean(find('days')), days: find('days')?.days ?? [...WEEKDAYS] },
  }
}

function conditionsFrom(input) {
  const out = []
  if (input.dark) out.push({ kind: 'dark' })
  if (input.between.on) out.push({ kind: 'between', from: input.between.from, to: input.between.to })
  if (input.days.on) out.push({ kind: 'days', days: input.days.days })
  return out
}

// Een stap: target is "d:<id>" (apparaat) of "s:<id>" (scène), of leeg.
const rowFrom = (a) => ({
  key: uid(),
  target: a.kind === 'scene' ? `s:${a.scene}` : a.device ? `d:${a.device}` : '',
  action: a.action ?? 'turn_on',
  payload: a.payload ?? null,
})

function actionFrom(row) {
  if (row.target.startsWith('s:')) return { kind: 'scene', scene: row.target.slice(2) }
  const out = { kind: 'device', device: row.target.slice(2), action: row.action }
  if (row.action === 'turn_on' && row.payload) out.payload = row.payload
  return out
}

function Segmented({ legend, name, options, value, label, onChange, className = '' }) {
  return (
    <fieldset className={`segmented segmented-small ${className}`}>
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label key={String(option)} className={`segmented-option ${value === option ? 'segmented-option-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            className="visually-hidden"
            checked={value === option}
            onChange={() => onChange(option)}
          />
          {label(option)}
        </label>
      ))}
    </fieldset>
  )
}

function DayToggles({ label, days, onChange }) {
  const intl = useIntl()
  return (
    <div className="schedule-days" role="group" aria-label={label}>
      {dayNames(intl.locale).map((day) => {
        const on = days.includes(day.key)
        return (
          <button
            key={day.key}
            type="button"
            className={`day-toggle ${on ? 'day-toggle-on' : ''}`}
            aria-pressed={on}
            aria-label={day.long}
            onClick={() => onChange(on ? days.filter((d) => d !== day.key) : [...days, day.key])}
          >
            {day.short}
          </button>
        )
      })}
    </div>
  )
}

// Een keuzelijst met kaartjes, zoals bij het bewegingslicht.
function DeviceChoice({ legend, name, devices, value, roomNameById, empty, onChange }) {
  const { t } = useIntl()
  return (
    <fieldset className="house-choice motion-choice">
      <legend className="form-label">{legend}</legend>
      {devices.length === 0 && <p className="settings-hint motion-empty">{empty}</p>}
      {devices.map((d) => (
        <label key={d.id} className={`house-choice-option ${value === d.id ? 'house-choice-selected' : ''}`}>
          <input type="radio" name={name} className="visually-hidden" checked={value === d.id} onChange={() => onChange(d.id)} />
          <span className="motion-choice-text">
            <span>{d.name}</span>
            <span className="motion-choice-room">{roomNameById[d.room] ?? t('home.noRoom')}</span>
          </span>
          {value === d.id && <CheckIcon width="18" height="18" aria-hidden="true" />}
        </label>
      ))}
    </fieldset>
  )
}

function SwitchRow({ id, label, checked, onChange }) {
  return (
    <div className="settings-row">
      <span id={id}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        className={`switch switch-accent ${checked ? 'switch-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
}

// Een routine maken of wijzigen: Als → Alleen als → Doe → Daarna uit.
// Bovenaan staat de hele routine als zin; wat er nog mist staat in woorden
// boven Opslaan, nooit een grijze knop zonder uitleg. Je slaat in één keer
// op, zoals de scène-sheet.
//
// sensors: routineSensors; switchables: lampen en stopcontacten;
// scenes: de scènes van het huis; names: { devices, scenes } (naam per id).
// onTry(actions) voert de stappen één keer uit en geeft { failed: [naam] }.
export default function RoutineSheet({
  routine,
  sensors,
  switchables,
  scenes,
  names,
  roomNameById,
  canTry,
  onSave,
  onDelete,
  onTry,
  onClose,
}) {
  const intl = useIntl()
  const { t } = intl
  const [name, setName] = useState(routine?.name ?? '')
  const [starter, setStarter] = useState(() => starterInput(routine?.starter))
  const [conditions, setConditions] = useState(() => conditionsInput(routine?.conditions))
  const [rows, setRows] = useState(() => (routine?.actions ?? []).map(rowFrom))
  const [offAfter, setOffAfter] = useState(routine?.off_after ?? 0)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showMissing, setShowMissing] = useState(false)
  const [trying, setTrying] = useState(null) // null | 'running' | { failed: [] }

  const draft = {
    name,
    starter: starterFrom(starter),
    conditions: conditionsFrom(conditions),
    actions: rows.filter((row) => row.target).map(actionFrom),
    off_after: offAfter,
  }
  const known = {
    devices: new Set([...switchables, ...sensors].map((d) => d.id)),
    scenes: new Set(scenes.map((s) => s.id)),
  }
  // Een lege stap telt als ontbrekend: "Kies bij elke stap…".
  const missing =
    missingStep(draft, known) ?? (rows.some((row) => !row.target) ? { part: 'actions', key: 'routines.missing.target' } : null)
  const sentence = describeAutomation(intl, draft, names)
  const sensor = sensors.find((s) => s.id === starter.sensor)
  const events = sensor ? sensorEvents(sensor) : []
  const switchableById = Object.fromEntries(switchables.map((d) => [d.id, d]))

  function patchStarter(patch) {
    setError('')
    setStarter((prev) => ({ ...prev, ...patch }))
  }
  function patchConditions(part, patch) {
    setError('')
    setConditions((prev) => ({ ...prev, [part]: typeof patch === 'object' ? { ...prev[part], ...patch } : patch }))
  }
  function patchRow(key, patch) {
    setError('')
    setTrying(null)
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  // Bij een andere sensor: de eerste gebeurtenis die hij kan, als de oude
  // niet meer past.
  function pickSensor(id) {
    const next = sensorEvents(sensors.find((s) => s.id === id))
    patchStarter({ sensor: id, event: next.includes(starter.event) ? starter.event : next[0] ?? '' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (missing) {
      setShowMissing(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(routine?.id ?? null, routineRecord(draft))
      onClose()
    } catch (err) {
      const code = err?.response?.code
      setError(
        code === 'invalid_automation'
          ? t('errors.codes.invalid_automation', { part: err.response.params?.part ?? '' })
          : describeError(t, t('errors.what.saveRoutine'), err)
      )
      setSaving(false)
    }
  }

  async function handleTry() {
    setTrying('running')
    const result = await onTry(draft.actions)
    setTrying(result)
  }

  async function handleDelete() {
    setSaving(true)
    try {
      await onDelete(routine.id)
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.deleteRoutine'), err))
      setSaving(false)
    }
  }

  const tryList = trying && trying !== 'running' ? trying.failed : null

  return (
    <Modal title={routine ? t('routines.sheetEdit') : t('routines.sheetNew')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack" noValidate>
        <p className="routine-sentence" aria-live="polite">
          {sentence}
        </p>

        <label className="form-field">
          <span className="form-label">{t('routines.name')}</span>
          <input
            className="input"
            maxLength={80}
            value={name}
            placeholder={t('routines.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <section className="routine-part" aria-labelledby="routine-when">
          <h3 id="routine-when" className="routine-part-title">
            {t('routines.when')}
          </h3>
          <Segmented
            legend={t('routines.when')}
            name="routine-kind"
            options={STARTER_KINDS}
            value={starter.kind}
            label={(kind) => t(`routines.kinds.${kind}`)}
            onChange={(kind) => patchStarter({ kind })}
          />

          {starter.kind === 'time' && (
            <>
              <Segmented
                legend={t('sceneSheet.trigger')}
                name="routine-time-kind"
                options={TIME_KINDS}
                value={starter.timeKind}
                label={(kind) => t(`routines.timeKinds.${kind}`)}
                onChange={(timeKind) => patchStarter({ timeKind })}
              />
              {starter.timeKind === 'time' ? (
                <input
                  className="input schedule-time"
                  type="time"
                  aria-label={t('sceneSheet.time')}
                  value={starter.time}
                  onChange={(e) => patchStarter({ time: e.target.value })}
                />
              ) : (
                <div className="schedule-sun">
                  <Segmented
                    legend={t('sceneSheet.direction')}
                    name="routine-direction"
                    options={DIRECTIONS}
                    value={directionOf(starter.offset)}
                    label={(d) => t(`sceneSheet.directions.${d}`)}
                    onChange={(d) => {
                      const size = Math.abs(starter.offset) || 30
                      patchStarter({ offset: d === 'at' ? 0 : d === 'before' ? -size : size })
                    }}
                  />
                  {starter.offset !== 0 && (
                    <Segmented
                      legend={t('sceneSheet.offset')}
                      name="routine-offset"
                      className="schedule-offsets"
                      options={SUN_OFFSETS}
                      value={Math.abs(starter.offset)}
                      label={(m) => offsetLabel(intl, m)}
                      onChange={(m) => patchStarter({ offset: Math.sign(starter.offset) * m })}
                    />
                  )}
                </div>
              )}
              <DayToggles label={t('routines.when')} days={starter.days} onChange={(days) => patchStarter({ days })} />
              <span className="schedule-days-text">
                {starter.days.length === 0 ? t('sceneSheet.pickDay') : describeDays(intl, starter.days)}
              </span>
            </>
          )}

          {starter.kind === 'device' && (
            <>
              <DeviceChoice
                legend={t('routines.lamp')}
                name="routine-lamp"
                devices={switchables}
                value={starter.lamp}
                roomNameById={roomNameById}
                empty={t('routines.noSwitchables')}
                onChange={(lamp) => patchStarter({ lamp })}
              />
              <Segmented
                legend={t('routines.toLegend')}
                name="routine-to"
                options={['on', 'off']}
                value={starter.to}
                label={(to) => t(`routines.to.${to}`)}
                onChange={(to) => patchStarter({ to })}
              />
            </>
          )}

          {starter.kind === 'sensor' && (
            <>
              <DeviceChoice
                legend={t('routines.sensor')}
                name="routine-sensor"
                devices={sensors}
                value={starter.sensor}
                roomNameById={roomNameById}
                empty={t('routines.noSensors')}
                onChange={pickSensor}
              />
              {events.length > 0 && (
                <Segmented
                  legend={t('routines.eventLegend')}
                  name="routine-event"
                  className={events.length > 3 ? 'routine-grid' : ''}
                  options={events}
                  value={starter.event}
                  label={(event) => t(`routines.events.${event}`)}
                  onChange={(event) => patchStarter({ event })}
                />
              )}
              {(starter.event === 'above' || starter.event === 'below') && (
                <label className="form-field routine-temperature">
                  <span className="form-label">{t('routines.temperature')}</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={40}
                    step={0.5}
                    value={Number.isFinite(starter.value) ? starter.value : ''}
                    onChange={(e) => patchStarter({ value: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </label>
              )}
            </>
          )}
        </section>

        <section className="routine-part" aria-labelledby="routine-only">
          <h3 id="routine-only" className="routine-part-title">
            {t('routines.onlyIf')}
          </h3>
          <div>
            <SwitchRow
              id="routine-dark"
              label={t('routines.conditionDark')}
              checked={conditions.dark}
              onChange={(on) => patchConditions('dark', on)}
            />
            <p className="settings-hint" style={{ marginTop: 0 }}>
              {t('routines.conditionDarkHint')}
            </p>
          </div>
          <SwitchRow
            id="routine-between"
            label={t('routines.conditionBetween')}
            checked={conditions.between.on}
            onChange={(on) => patchConditions('between', { on })}
          />
          {conditions.between.on && (
            <div className="routine-between">
              <label className="form-field">
                <span className="form-label">{t('routines.from')}</span>
                <input
                  className="input schedule-time"
                  type="time"
                  value={conditions.between.from}
                  onChange={(e) => patchConditions('between', { from: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">{t('routines.until')}</span>
                <input
                  className="input schedule-time"
                  type="time"
                  value={conditions.between.to}
                  onChange={(e) => patchConditions('between', { to: e.target.value })}
                />
              </label>
            </div>
          )}
          <SwitchRow
            id="routine-days"
            label={t('routines.conditionDays')}
            checked={conditions.days.on}
            onChange={(on) => patchConditions('days', { on })}
          />
          {conditions.days.on && (
            <DayToggles
              label={t('routines.conditionDays')}
              days={conditions.days.days}
              onChange={(days) => patchConditions('days', { days })}
            />
          )}
        </section>

        <section className="routine-part" aria-labelledby="routine-do">
          <h3 id="routine-do" className="routine-part-title">
            {t('routines.do')}
          </h3>
          {rows.length > 0 && (
            <ol className="routine-actions">
              {rows.map((row, i) => {
                const device = row.target.startsWith('d:') ? switchableById[row.target.slice(2)] : null
                const targetName = device?.name ?? names.scenes[row.target.slice(2)] ?? ''
                return (
                  <li key={row.key} className="routine-action">
                    <div className="routine-action-top">
                      <select
                        className="input routine-target"
                        aria-label={t('routines.actionTarget', { number: i + 1 })}
                        value={row.target}
                        onChange={(e) => patchRow(row.key, { target: e.target.value, payload: null })}
                      >
                        <option value="">{t('routines.pick')}</option>
                        {switchables.length > 0 && (
                          <optgroup label={t('routines.devicesGroup')}>
                            {switchables.map((d) => (
                              <option key={d.id} value={`d:${d.id}`}>
                                {d.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {scenes.length > 0 && (
                          <optgroup label={t('routines.scenesGroup')}>
                            {scenes.map((s) => (
                              <option key={s.id} value={`s:${s.id}`}>
                                {s.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button
                        type="button"
                        className="btn btn-icon btn-plain"
                        aria-label={t('routines.removeAction', { number: i + 1 })}
                        onClick={() => {
                          setTrying(null)
                          setRows((prev) => prev.filter((r) => r.key !== row.key))
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    {device && (
                      <Segmented
                        legend={t('routines.actionMode', { name: targetName })}
                        name={`routine-mode-${row.key}`}
                        options={['turn_on', 'turn_off']}
                        value={row.action}
                        label={(mode) => t(`routines.modes.${mode}`)}
                        onChange={(action) => patchRow(row.key, { action })}
                      />
                    )}
                    {device?.type === 'light' && row.action === 'turn_on' && (
                      <Segmented
                        legend={t('routines.brightness', { name: targetName })}
                        name={`routine-brightness-${row.key}`}
                        className="routine-brightness"
                        options={BRIGHTNESS}
                        value={row.payload?.brightness_pct ?? null}
                        label={(pct) => (pct === null ? t('routines.brightnessAsIs') : `${pct}%`)}
                        onChange={(pct) => {
                          const { brightness_pct: _, ...rest } = row.payload ?? {}
                          const payload = pct === null ? rest : { ...rest, brightness_pct: pct }
                          patchRow(row.key, { payload: Object.keys(payload).length > 0 ? payload : null })
                        }}
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {rows.length < MAX_ACTIONS ? (
            <button
              type="button"
              className="btn btn-plain schedule-add"
              onClick={() => {
                setTrying(null)
                setRows((prev) => [...prev, { key: uid(), target: '', action: 'turn_on', payload: null }])
              }}
            >
              <PlusIcon width="18" height="18" aria-hidden="true" />
              {t('routines.addAction')}
            </button>
          ) : (
            <p className="settings-hint">{t('routines.maxActions')}</p>
          )}
          {draft.actions.length > 0 && (
            <div className="routine-try">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canTry || trying === 'running'}
                onClick={handleTry}
              >
                {trying === 'running' ? (
                  <>
                    <span className="spinner spinner-inline" aria-hidden="true" />
                    {t('routines.trying')}
                  </>
                ) : (
                  t('routines.tryNow')
                )}
              </button>
              <span className="settings-hint routine-try-result" role="status">
                {tryList === null
                  ? t('routines.tryHint')
                  : tryList.length === 0
                    ? t('routines.tryDone')
                    : t('routines.tryPartial', {
                        failed: new Intl.ListFormat(intl.locale, { type: 'conjunction' }).format(tryList),
                      })}
              </span>
            </div>
          )}
        </section>

        <fieldset className="routine-part motion-off-after">
          <legend className="routine-part-title">{t('routines.offAfter')}</legend>
          <Segmented
            legend={t('routines.offAfter')}
            name="routine-off-after"
            className="routine-grid"
            options={OFF_AFTER_CHOICES}
            value={offAfter}
            label={(m) => (m === 0 ? t('routines.never') : t('routines.minutesShort', { count: m }))}
            onChange={setOffAfter}
          />
          <p className="settings-hint">{t('routines.offAfterHint')}</p>
        </fieldset>

        {showMissing && missing && (
          <p className="error-banner" role="alert">
            {t(missing.key)}
          </p>
        )}
        {error && !confirmingDelete && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {t('common.save')}
        </button>
      </form>

      {routine && (
        <>
          <div className="modal-divider" />
          {confirmingDelete ? (
            <div className="danger-zone">
              <p className="danger-text">
                {t('routines.confirmDelete', { name: routine.name || describeAutomation(intl, routine, names) })}
              </p>
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
              {t('routines.delete')}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

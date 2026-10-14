'use client'

import { useTranslations } from 'use-intl'
import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { TrashIcon } from '../lib/icons'
import { relativeTime } from '../lib/relativeTime'
import { useIntl } from '../app/LanguageContext'
import { useNow } from '../lib/useNow'
import { temperatureColor } from '../lib/temperature'
import { allReadings, readingText } from '../lib/sensors'
import { isBatteryLow } from '../lib/battery'
import { isDeviceOn } from './DeviceCard'
import LightControls from './LightControls'

// Alles over één apparaat in één sheet: hoe het er nu bij staat, wat het
// meet (sensoren), of het op Home staat, en naam, kamer en verwijderen.
// Opent door een tegel ingedrukt te houden (of rechts te klikken), met een
// tik op een sensor, en via de naam van de thermostaat. Op een telefoon
// een sheet onderin, binnen bereik van je duim.
//
// Alles slaat zichzelf op, zoals de schakelaar: de kamer zodra je hem
// kiest, de naam zodra je het veld verlaat of de sheet sluit. Geen
// "Opslaan"-knop waarvan je je afvraagt of hij ook voor de rest geldt.
export default function DeviceSettingsModal({
  device,
  rooms,
  onSave,
  onSaveError,
  favorite,
  onToggleFavorite,
  onSetLight,
  onIdentify,
  houseReachable = true,
  notifyRules = [],
  onSaveNotifyRule,
  // D1: false = alleen bedienen. Naam, kamer, weergave, kleur volgt de dag en
  // verwijderen staan dan vast; bedienen, favoriet en Meld dit blijven.
  canEdit = true,
  onDelete,
  onClose,
}) {
  const t = useTranslations()
  const [name, setName] = useState(device.name ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // De laatst opgeslagen naam: verlaten van het veld én sluiten mogen niet
  // twee keer hetzelfde opslaan.
  const savedName = useRef(device.name ?? '')
  // "Opgeslagen" staat er even na elke opslag: zonder knop moet je toch
  // zien dat het gelukt is.
  const [savedTick, setSavedTick] = useState(0)
  const [showSaved, setShowSaved] = useState(false)
  // Is de sheet nog open? Een naam die bij het sluiten wordt opgeslagen kan
  // pas mislukken als hij al dicht is: die fout gaat dan naar een melding.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    if (!savedTick) return
    setShowSaved(true)
    const timer = setTimeout(() => setShowSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [savedTick])

  async function save(updates, what) {
    setError('')
    try {
      await onSave(device.id, updates)
      if (mounted.current) setSavedTick((n) => n + 1)
    } catch (err) {
      const message = describeError(t, what, err)
      if (mounted.current) setError(message)
      else onSaveError?.(message)
    }
  }

  // Meld dit (spec 2026-10-14-notifications-design.md): een eigen regel,
  // zichzelf opslaand zoals de rest van de sheet.
  async function saveRule(id, fields) {
    setError('')
    try {
      await onSaveNotifyRule(id, fields)
      if (mounted.current) setSavedTick((n) => n + 1)
    } catch (err) {
      if (mounted.current) setError(describeError(t, t('errors.what.notifyRule'), err))
    }
  }

  // Een lege naam slaan we niet op: dan komt de oude terug.
  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(device.name ?? '')
      return
    }
    if (trimmed === savedName.current) return
    savedName.current = trimmed
    save({ name: trimmed }, t('errors.what.rename'))
  }

  function close() {
    commitName()
    onClose()
  }

  async function handleFavorite() {
    setError('')
    try {
      await onToggleFavorite(device)
    } catch (err) {
      setError(describeError(t, t('errors.what.favorite'), err))
    }
  }

  async function handleDelete() {
    setSaving(true)
    setError('')
    try {
      await onDelete(device.id)
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.delete'), err))
      setSaving(false)
    }
  }

  return (
    <Modal title={device.name} onClose={close}>
      {device.type === 'sensor' ? (
        <SensorReadings device={device} />
      ) : (
        <>
          <DeviceStatus device={device} />
          {device.type === 'light' && onSetLight && (
            <LightControls
              device={device}
              state={device.expand?.device_state_via_device?.[0]?.state}
              disabled={!device.online || !houseReachable}
              onChange={(payload) => onSetLight(device, payload)}
            />
          )}
        </>
      )}
      {/* Welke lamp is dit? Alleen een lamp knippert; een stekker aan en uit
          zetten kan een apparaat starten. */}
      {device.type === 'light' && onIdentify && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!device.online || !houseReachable}
          onClick={() => onIdentify(device)}
        >
          {t('pairing.blink')}
        </button>
      )}
      <div className="modal-divider" />

      {/* Kleur volgt de dag: alleen een lamp die zijn wittint kan veranderen. */}
      {canEdit && device.type === 'light' && device.capabilities?.includes('color_temp') && (
        <>
          <div className="settings-row">
            <span className="settings-row-text">
              <span id={`adaptive-${device.id}`}>{t('deviceSheet.adaptive')}</span>
              <span className="settings-row-hint">{t('deviceSheet.adaptiveHint')}</span>
            </span>
            <button
              type="button"
              className={`switch switch-accent ${device.adaptive ? 'switch-on' : ''}`}
              role="switch"
              aria-checked={!!device.adaptive}
              aria-labelledby={`adaptive-${device.id}`}
              onClick={() => save({ adaptive: !device.adaptive }, t('errors.what.adaptive'))}
            >
              <span className="switch-thumb" />
            </button>
          </div>
          <div className="modal-divider" />
        </>
      )}

      {device.type === 'sensor' && onSaveNotifyRule && (
        <NotifyRules device={device} rules={notifyRules} onSave={saveRule} />
      )}

      {canEdit && device.type === 'switch' && (
        <>
          <div className="settings-row">
            <span className="settings-row-text">
              <span id={`shown-as-${device.id}`}>{t('deviceSheet.shownAsLight')}</span>
              <span className="settings-row-hint">{t('deviceSheet.shownAsLightHint')}</span>
            </span>
            <button
              type="button"
              className={`switch switch-accent ${device.shown_as === 'light' ? 'switch-on' : ''}`}
              role="switch"
              aria-checked={device.shown_as === 'light'}
              aria-labelledby={`shown-as-${device.id}`}
              onClick={() =>
                save({ shown_as: device.shown_as === 'light' ? '' : 'light' }, t('errors.what.shownAs'))
              }
            >
              <span className="switch-thumb" />
            </button>
          </div>
          <div className="modal-divider" />
        </>
      )}

      <div className="settings-row">
        <span id={`favorite-${device.id}`}>{t('deviceSheet.showOnHome')}</span>
        <button
          type="button"
          className={`switch switch-accent ${favorite ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={!!favorite}
          aria-labelledby={`favorite-${device.id}`}
          onClick={handleFavorite}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      <div className="modal-divider" />

      {/* Enter in het naamveld = klaar: het veld verlaten slaat op. */}
      <form onSubmit={(e) => (e.preventDefault(), document.activeElement?.blur())} className="form-stack">
        <label className="form-field">
          <span className="form-label">{t('deviceSheet.name')}</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            enterKeyHint="done"
            disabled={!canEdit}
          />
        </label>

        <label className="form-field">
          <span className="form-label">{t('deviceSheet.room')}</span>
          <select
            className="input"
            value={device.room ?? ''}
            disabled={!canEdit}
            onChange={(e) => save({ room: e.target.value || null }, t('errors.what.changeRoom'))}
          >
            <option value="">{t('home.noRoom')}</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        {!canEdit && <p className="settings-hint">{t('rights.askAdmin')}</p>}

        <p className="form-saved" role="status">
          {showSaved ? t('common.saved') : ''}
        </p>

        {error && !confirmingDelete && <p className="error-banner">{error}</p>}
      </form>

      {canEdit && (
        <>
          <div className="modal-divider" />

          {confirmingDelete ? (
            <div className="danger-zone">
              <p className="danger-text">
                {t('deviceSheet.confirmDelete', { name: device.name })}
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
            <button type="button" className="btn btn-danger-text" onClick={() => setConfirmingDelete(true)} disabled={saving}>
              <TrashIcon />
              {t('deviceSheet.delete')}
            </button>
          )}
        </>
      )}
    </Modal>
  )
}

// Hoe een lamp, stopcontact of thermostaat er nu bij staat. De tegel
// eronder is op een telefoon bedekt door de sheet, dus hier nog een keer,
// in woorden.
function DeviceStatus({ device }) {
  const t = useTranslations()
  const state = device.expand?.device_state_via_device?.[0]?.state
  const known = typeof state?.state === 'string'
  const on = isDeviceOn(device.type, state)
  const word = device.type === 'climate' ? (on ? 'heatingOn' : 'heatingOff') : on ? 'on' : 'off'

  let value
  if (!known) value = t('deviceSheet.stateUnknown')
  else if (!device.online) value = t(`deviceSheet.offlineLast.${word}`)
  else value = t(`deviceSheet.state.${word}`)

  return (
    <>
      <div className="sensor-detail-row">
        <span className="form-label">{t('deviceSheet.stateLabel')}</span>
        <span className="reading-value">{value}</span>
      </div>
      {/* Een radiatorknop warmt alleen als de eigen thermostaat de ketel
          aanzet (model A): dat zeggen we eerlijk. */}
      {device.capabilities?.includes('valve') && <p className="login-note">{t('deviceSheet.valveHint')}</p>}
    </>
  )
}

// Meld dit: per gebeurtenis die de sensor kan melden een schakelaar, alleen
// voor jou, met "alleen als niemand thuis is" en "alleen tussen". Lekkage en
// rook meldt de box altijd: daar staat alleen dat.
const NOTIFY_EVENTS = [
  ['contact', 'open'],
  ['occupancy', 'motion'],
]

function NotifyRules({ device, rules, onSave }) {
  const t = useTranslations()
  const caps = device.capabilities ?? []
  const events = NOTIFY_EVENTS.filter(([cap]) => caps.includes(cap)).map(([, event]) => event)
  const always = caps.includes('water_leak') || caps.includes('smoke')
  if (events.length === 0 && !always) return null
  return (
    <>
      {always && <p className="settings-hint notify-always">{t('deviceSheet.notifyAlways')}</p>}
      {events.map((event) => (
        <NotifyRule key={event} device={device} event={event} rule={rules.find((r) => r.event === event)} onSave={onSave} />
      ))}
      <div className="modal-divider" />
    </>
  )
}

function NotifyRule({ device, event, rule, onSave }) {
  const t = useTranslations()
  const on = !!rule?.enabled
  const between = !!rule?.from
  const [from, setFrom] = useState(rule?.from || '22:00')
  const [to, setTo] = useState(rule?.to || '07:00')
  const id = `notify-${device.id}-${event}`
  const save = (fields) =>
    onSave(rule?.id ?? null, {
      device: device.id,
      event,
      enabled: rule?.enabled ?? true,
      nobody_home: rule?.nobody_home ?? false,
      from: rule?.from ?? '',
      to: rule?.to ?? '',
      ...fields,
    })
  const switchRow = (rowId, label, hint, checked, onToggle) => (
    <div className="settings-row">
      <span className="settings-row-text">
        <span id={rowId}>{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </span>
      <button
        type="button"
        className={`switch switch-accent ${checked ? 'switch-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-labelledby={rowId}
        onClick={onToggle}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  )
  return (
    <div className="notify-rule">
      {switchRow(id, t(`deviceSheet.notify.${event}`), t('deviceSheet.notifyHint'), on, () => save({ enabled: !on }))}
      {on && (
        <div className="notify-options">
          {switchRow(`${id}-away`, t('deviceSheet.notifyNobodyHome'), null, !!rule.nobody_home, () =>
            save({ nobody_home: !rule.nobody_home })
          )}
          {switchRow(`${id}-between`, t('deviceSheet.notifyBetween'), null, between, () =>
            save(between ? { from: '', to: '' } : { from, to })
          )}
          {between && (
            <div className="routine-between">
              <label className="form-field">
                <span className="form-label">{t('routines.from')}</span>
                <input
                  className="input schedule-time"
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  onBlur={() => from && from !== to && from !== rule.from && save({ from, to })}
                />
              </label>
              <label className="form-field">
                <span className="form-label">{t('routines.until')}</span>
                <input
                  className="input schedule-time"
                  type="time"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  onBlur={() => to && from !== to && to !== rule.to && save({ from, to })}
                />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Wat een sensor meet, met wanneer hij dat voor het laatst deed. Eigen
// klok: alleen dit blok tikt mee voor "Laatst bijgewerkt". Elke meting in
// woorden (lib/sensors), in de volgorde van de tegel; de batterij apart.
function SensorReadings({ device }) {
  const intl = useIntl()
  const { t } = intl
  const now = useNow(5000)
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null

  const readings = allReadings(device.capabilities, state)
  const battery = state?.battery
  const hasBattery = typeof battery === 'number'
  const updatedAt = stateRecord?.updated_at ? new Date(stateRecord.updated_at).getTime() : null

  if (readings.length === 0 && !hasBattery) {
    return <p className="reading-empty">{t('climate.noReadings')}</p>
  }

  return (
    <div className="sensor-detail-rows">
      {readings.map((reading) => (
        <div key={reading.capability} className="sensor-detail-row">
          <span className="form-label">{t(`sensors.labels.${reading.capability}`)}</span>
          <span
            className="reading-value"
            style={reading.capability === 'temperature' ? { color: temperatureColor(reading.value) } : undefined}
          >
            {/* "Beweging: Beweging" zegt niets; hier een hele zin. */}
            {reading.capability === 'occupancy' && reading.value ? t('deviceSheet.motionNow') : readingText(intl, reading)}
          </span>
        </div>
      ))}
      {hasBattery && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('deviceSheet.battery')}</span>
          <span className={`reading-value ${isBatteryLow(battery) ? 'reading-alert' : ''}`}>
            {isBatteryLow(battery)
              ? t('deviceSheet.batteryLow', { percent: battery })
              : t('deviceSheet.batteryPercent', { percent: battery })}
          </span>
        </div>
      )}
      {updatedAt && (
        <div className="sensor-detail-row">
          <span className="form-label">{t('deviceSheet.lastUpdated')}</span>
          <span className="reading-value">{relativeTime(intl, updatedAt, now)}</span>
        </div>
      )}
      {!device.online && <p className="status-offline">{t('deviceSheet.offlineNote')}</p>}
    </div>
  )
}

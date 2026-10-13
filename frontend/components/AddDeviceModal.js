'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'
import { deviceTypeIcon } from '../lib/icons'

// De woorden (naam en voorbeeld) staan onder device.types.<value> en
// addDevice.examples.<value>.
const DEVICE_TYPES = ['light', 'switch', 'sensor', 'climate']

// Soort eerst, dan de naam: de soort is een keuze uit vier grote tegels
// (sneller en duidelijker dan een uitklaplijst), en de voorbeeldnaam past
// zich erop aan. De kamer staat al op de kamer die je net bekeek.
export default function AddDeviceModal({ rooms, defaultRoomId = '', onClose, onCreate }) {
  const t = useTranslations()
  const [name, setName] = useState('')
  const [type, setType] = useState('light')
  const [roomId, setRoomId] = useState(defaultRoomId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Geen entity_id-veld: de agent maakt na het aanmaken automatisch een
  // passende Home Assistant helper aan (zie provisionDeviceEntity in de
  // agent) en vult entity_id vanzelf in — niemand hoeft zelf iets in HA
  // te configureren. Tot dan toont de kaart "Wordt klaargezet".
  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), type, room: roomId || null })
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.addDevice'), err))
      setSaving(false)
    }
  }

  const example = t(`addDevice.examples.${type}`)

  return (
    <Modal title={t('nav.addDevice')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <fieldset className="type-picker">
          <legend className="form-label">{t('addDevice.what')}</legend>
          <div className="type-picker-grid">
            {DEVICE_TYPES.map((value) => {
              const Icon = deviceTypeIcon(value)
              return (
                <label key={value} className={`type-tile ${type === value ? 'type-tile-selected' : ''}`}>
                  <input
                    type="radio"
                    name="device-type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="visually-hidden"
                  />
                  <span className={`device-icon device-icon-${value} type-tile-icon`}>
                    <Icon />
                  </span>
                  <span className="type-tile-label">{t(`device.types.${value}`)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <label className="form-field">
          <span className="form-label">{t('deviceSheet.name')}</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={example}
            required
          />
        </label>

        <label className="form-field">
          <span className="form-label">{t('deviceSheet.room')}</span>
          <select className="input" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{t('home.noRoom')}</option>
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
            {saving ? t('addDevice.saving') : t('rooms.add')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

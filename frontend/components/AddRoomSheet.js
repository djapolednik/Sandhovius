'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import Modal from './Modal'
import { describeError } from '../lib/errors'

// Een kamer toevoegen vanaf de Kamers-tab: alleen een naam. onAdd(name)
// maakt hem; de pagina springt daarna naar de nieuwe kamer.
export default function AddRoomSheet({ onAdd, onClose }) {
  const t = useTranslations()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError('')
    try {
      await onAdd(trimmed)
      onClose()
    } catch (err) {
      setError(describeError(t, t('errors.what.addRoom'), err))
      setSaving(false)
    }
  }

  return (
    <Modal title={t('rooms.addRoom')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">{t('houseSheet.newRoom')}</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('houseSheet.newRoomPlaceholder')}
            maxLength={60}
            autoFocus
            required
          />
        </label>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
          {t('rooms.addRoom')}
        </button>
      </form>
    </Modal>
  )
}

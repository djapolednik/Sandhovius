'use client'

import { useState } from 'react'
import Modal from './Modal'
import { describeError } from '../lib/errors'

// PocketBase eist minstens 8 tekens.
const MIN_LENGTH = 8

// Wachtwoord wijzigen vanuit Opties. onChange(oud, nieuw) doet het echte
// werk (zie changePassword in page.js); deze sheet vraagt het huidige
// wachtwoord, en het nieuwe twee keer, zodat een tikfout je niet buitensluit.
export default function ChangePasswordModal({ onChange, onClose }) {
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < MIN_LENGTH) {
      setError(`Kies een nieuw wachtwoord van minstens ${MIN_LENGTH} tekens.`)
      return
    }
    if (password !== passwordConfirm) {
      setError('De twee nieuwe wachtwoorden zijn niet gelijk. Typ ze nog een keer.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onChange(oldPassword, password)
      onClose()
    } catch (err) {
      setError(
        err?.response?.data?.oldPassword
          ? 'Je huidige wachtwoord klopt niet. Controleer het en probeer het opnieuw.'
          : describeError('Wachtwoord wijzigen', err)
      )
      setSaving(false)
    }
  }

  return (
    <Modal title="Wachtwoord wijzigen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">Huidig wachtwoord</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Nieuw wachtwoord</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Nieuw wachtwoord, nog een keer</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
          />
        </label>
        <p className="settings-hint" style={{ margin: 0 }}>
          Minstens {MIN_LENGTH} tekens. Je blijft op dit apparaat ingelogd.
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Wachtwoord wijzigen
        </button>
      </form>
    </Modal>
  )
}

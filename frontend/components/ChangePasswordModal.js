'use client'

import { useId, useState } from 'react'
import Modal from './Modal'
import PasswordField from './PasswordField'
import PasswordChecks from './PasswordChecks'
import { describeError } from '../lib/errors'
import { MIN_PASSWORD_LENGTH, passwordChecks } from '../lib/account'
import { CheckIcon } from '../lib/icons'

// Wachtwoord wijzigen vanuit Opties. onChange(oud, nieuw) doet het echte
// werk (zie changePassword in page.js). Twee groepen: eerst wie je bent
// (het huidige wachtwoord), dan het nieuwe twee keer, zodat een tikfout je
// niet buitensluit. Onder het nieuwe staan de eisen, die meelopen terwijl
// je typt. Na afloop zegt de sheet zelf dat het gelukt is.
export default function ChangePasswordModal({ onChange, onClose }) {
  const [oldPassword, setOldPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const checksId = useId()
  const checks = passwordChecks(password, passwordConfirm)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!checks.long) {
      setError(`Kies een nieuw wachtwoord van minstens ${MIN_PASSWORD_LENGTH} tekens.`)
      return
    }
    if (!checks.same) {
      setError('De twee nieuwe wachtwoorden zijn niet gelijk. Typ ze nog een keer.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onChange(oldPassword, password)
      setDone(true)
    } catch (err) {
      setError(
        err?.response?.data?.oldPassword
          ? 'Je huidige wachtwoord klopt niet. Controleer het en probeer het opnieuw.'
          : describeError('Wachtwoord wijzigen', err)
      )
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal title="Wachtwoord wijzigen" onClose={onClose}>
        <div className="password-done" role="status">
          <span className="password-done-icon" aria-hidden="true">
            <CheckIcon width="28" height="28" />
          </span>
          <p className="password-done-title">Je wachtwoord is gewijzigd.</p>
          <p className="settings-hint">
            Op dit apparaat blijf je ingelogd. Op je andere apparaten log je opnieuw in met je nieuwe wachtwoord.
          </p>
        </div>
        <button type="button" className="btn btn-primary password-done-close" onClick={onClose}>
          Klaar
        </button>
      </Modal>
    )
  }

  return (
    <Modal title="Wachtwoord wijzigen" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack change-password">
        <PasswordField
          label="Huidig wachtwoord"
          autoComplete="current-password"
          value={oldPassword}
          onChange={setOldPassword}
          required
        />
        <div className="modal-divider" role="presentation" />
        <PasswordField
          label="Nieuw wachtwoord"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          describedBy={checksId}
          required
        />
        <PasswordField
          label="Nieuw wachtwoord, nog een keer"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          describedBy={checksId}
          required
        />
        <PasswordChecks id={checksId} password={password} passwordConfirm={passwordConfirm} />
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Bezig met wijzigen…' : 'Wachtwoord wijzigen'}
        </button>
      </form>
    </Modal>
  )
}

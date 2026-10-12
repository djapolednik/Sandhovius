'use client'

import { useId, useState } from 'react'
import Modal from './Modal'
import PasswordField from './PasswordField'
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
        <ul className="password-checks" id={checksId}>
          <PasswordCheck met={checks.long}>Minstens {MIN_PASSWORD_LENGTH} tekens</PasswordCheck>
          <PasswordCheck met={checks.same}>Twee keer hetzelfde</PasswordCheck>
        </ul>
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

// Een eis: een lege ring, of een vinkje als hij klopt. Geen groen: dat is
// voor apparaten die aan staan (The State Means State Rule); het vinkje en
// de donkerder tekst zeggen het.
function PasswordCheck({ met, children }) {
  return (
    <li className={met ? 'password-check-met' : undefined}>
      <span className="password-check-mark" aria-hidden="true">
        {met && <CheckIcon width="14" height="14" />}
      </span>
      {children}
      <span className="visually-hidden">{met ? ', klopt' : ', nog niet'}</span>
    </li>
  )
}

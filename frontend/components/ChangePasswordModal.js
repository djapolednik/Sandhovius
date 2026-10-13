'use client'

import { useTranslations } from 'use-intl'
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
  const t = useTranslations()
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
      setError(t('changePassword.tooShort', { min: MIN_PASSWORD_LENGTH }))
      return
    }
    if (!checks.same) {
      setError(t('changePassword.differ'))
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
          ? t('changePassword.wrongCurrent')
          : describeError(t, t('errors.what.changePassword'), err)
      )
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <Modal title={t('settings.changePassword')} onClose={onClose}>
        <div className="password-done" role="status">
          <span className="password-done-icon" aria-hidden="true">
            <CheckIcon width="28" height="28" />
          </span>
          <p className="password-done-title">{t('reset.done')}</p>
          <p className="settings-hint">
            {t('changePassword.doneNote')}
          </p>
        </div>
        <button type="button" className="btn btn-primary password-done-close" onClick={onClose}>
          {t('scenes.doneShort')}
        </button>
      </Modal>
    )
  }

  return (
    <Modal title={t('settings.changePassword')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack change-password">
        <PasswordField
          label={t('changePassword.current')}
          autoComplete="current-password"
          value={oldPassword}
          onChange={setOldPassword}
          required
        />
        <div className="modal-divider" role="presentation" />
        <PasswordField
          label={t('reset.newPassword')}
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          describedBy={checksId}
          required
        />
        <PasswordField
          label={t('reset.newPasswordAgain')}
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
          {saving ? t('changePassword.saving') : t('settings.changePassword')}
        </button>
      </form>
    </Modal>
  )
}

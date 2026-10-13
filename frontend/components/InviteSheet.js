'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import RoleChoice from './RoleChoice'
import { householdError } from '../lib/household'

// Iemand uitnodigen voor dit huis (alleen beheerders). De uitnodiging hoort
// bij het e-mailadres: alleen wie met dat adres inlogt, kan hem accepteren.
// onInvite(email, role) maakt de uitnodiging; de server stuurt de mail.
export default function InviteSheet({ houseName, onInvite, onClose }) {
  const t = useTranslations()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await onInvite(email.trim(), role)
      onClose()
    } catch (err) {
      setError(householdError(t, t('errors.what.invite'), err))
      setSending(false)
    }
  }

  return (
    <Modal title={t('household.invite')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-stack">
        <label className="form-field">
          <span className="form-label">{t('login.email')}</span>
          <input
            className="input"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
        </label>
        <div className="form-field">
          <span className="form-label">{t('household.role')}</span>
          <RoleChoice value={role} onChange={setRole} name="invite-role" />
        </div>
        <p className="settings-hint" style={{ margin: 0 }}>
          {role === 'admin' ? t('household.adminHint', { house: houseName }) : t('household.memberHint')}{' '}
          {t('household.expiresAfter')}
        </p>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={sending}>
          {t('household.send')}
        </button>
      </form>
    </Modal>
  )
}

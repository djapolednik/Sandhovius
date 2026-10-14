'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import RoleChoice from './RoleChoice'
import { dateValue, guestRange, householdError } from '../lib/household'

// Iemand uitnodigen voor dit huis (alleen beheerders). De uitnodiging hoort
// bij het e-mailadres: alleen wie met dat adres inlogt, kan hem accepteren.
// onInvite(email, role, until) maakt de uitnodiging; de server stuurt de mail.
// Een gast (D2) is huisgenoot tot en met until en bedient alleen.
export default function InviteSheet({ houseName, onInvite, onClose }) {
  const t = useTranslations()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [guest, setGuest] = useState(false)
  const range = guestRange()
  const [until, setUntil] = useState(() => dateValue(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await onInvite(email.trim(), guest ? 'member' : role, guest ? until : '')
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
        <div className="settings-row">
          <span id="invite-guest">{t('household.asGuest')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={guest}
            aria-labelledby="invite-guest"
            className={`switch switch-accent ${guest ? 'switch-on' : ''}`}
            onClick={() => setGuest((g) => !g)}
          >
            <span className="switch-thumb" />
          </button>
        </div>
        {guest ? (
          <label className="form-field">
            <span className="form-label">{t('household.guestDate')}</span>
            <input
              className="input schedule-time"
              type="date"
              min={range.min}
              max={range.max}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              required
            />
          </label>
        ) : (
          <div className="form-field">
            <span className="form-label">{t('household.role')}</span>
            <RoleChoice value={role} onChange={setRole} name="invite-role" />
          </div>
        )}
        <p className="settings-hint" style={{ margin: 0 }}>
          {guest
            ? t('household.guestHint')
            : role === 'admin'
              ? t('household.adminHint', { house: houseName })
              : t('household.memberHint')}{' '}
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

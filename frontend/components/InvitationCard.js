'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import { expiresText, householdError, isExpired } from '../lib/household'

// Een uitnodiging voor jou: bovenaan Home, en op het lege scherm als je nog
// geen huis hebt. Accepteren zet je in het huis en toont het; weigeren haalt
// de uitnodiging weg. Een verlopen uitnodiging kun je alleen weghalen.
export default function InvitationCard({ invitation, onAccept, onDecline }) {
  const t = useTranslations()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const expired = isExpired(invitation.expires)
  const expires = expiresText(t, invitation.expires)
  const who = invitation.inviter_name || t('invitation.someone')
  const house = invitation.house_name

  async function run(what, action) {
    setBusy(true)
    setError('')
    try {
      await action(invitation)
    } catch (err) {
      setError(householdError(t, t(`errors.what.${what}`), err))
      setBusy(false)
    }
  }

  return (
    <section className="panel invitation-card" aria-label={t('invitation.label', { house })}>
      {expired ? (
        <>
          <p className="invitation-title">{t('invitation.expiredTitle')}</p>
          <p className="invitation-meta">{t('invitation.expiredText', { who, house })}</p>
        </>
      ) : (
        <>
          <p className="invitation-title">{t('invitation.title', { who, house })}</p>
          <p className="invitation-meta">{t('invitation.meta', { role: invitation.role, expires })}</p>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="invitation-actions">
        {!expired && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('accept', onAccept)}>
            {t('invitation.accept')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => run(expired ? 'dismiss' : 'decline', onDecline)}
        >
          {expired ? t('invitation.dismiss') : t('invitation.decline')}
        </button>
      </div>
    </section>
  )
}

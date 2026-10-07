'use client'

import { useState } from 'react'
import { expiresText, householdError } from '../lib/household'

// Een uitnodiging voor jou: bovenaan Home, en op het lege scherm als je nog
// geen huis hebt. Accepteren zet je in het huis en toont het; weigeren haalt
// de uitnodiging weg. Een verlopen uitnodiging kun je alleen weghalen.
export default function InvitationCard({ invitation, onAccept, onDecline }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const expires = expiresText(invitation.expires)
  const expired = expires === 'verlopen'
  const who = invitation.inviter_name || 'Iemand'

  async function run(what, action) {
    setBusy(true)
    setError('')
    try {
      await action(invitation)
    } catch (err) {
      setError(householdError(what, err))
      setBusy(false)
    }
  }

  return (
    <section className="panel invitation-card" aria-label={`Uitnodiging voor ${invitation.house_name}`}>
      {expired ? (
        <>
          <p className="invitation-title">Deze uitnodiging is verlopen</p>
          <p className="invitation-meta">
            {who} nodigde je uit voor {invitation.house_name}. Vraag om een nieuwe uitnodiging.
          </p>
        </>
      ) : (
        <>
          <p className="invitation-title">
            {who} nodigt je uit voor {invitation.house_name}
          </p>
          <p className="invitation-meta">
            Als {invitation.role === 'admin' ? 'beheerder' : 'huisgenoot'}, {expires}.
          </p>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="invitation-actions">
        {!expired && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run('Accepteren', onAccept)}>
            Accepteren
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => run(expired ? 'Weghalen' : 'Weigeren', onDecline)}
        >
          {expired ? 'Weghalen' : 'Weigeren'}
        </button>
      </div>
    </section>
  )
}

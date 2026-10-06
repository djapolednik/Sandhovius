'use client'

import { useState } from 'react'
import { errorMessage } from '../lib/account'

// "Kijk in je mail": getoond na account aanmaken, en in de koppelflow
// zolang het adres niet bevestigd is. onResend() verstuurt de bevestigingsmail
// opnieuw en mag een fout gooien. children: extra knoppen onderaan.
export default function VerifyNotice({ email, onResend, children }) {
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  async function resend() {
    setState('sending')
    setError('')
    try {
      await onResend()
      setState('sent')
    } catch (err) {
      console.error('[verificatie opnieuw versturen]', err)
      setError(errorMessage(err))
      setState('error')
    }
  }

  return (
    <div className="form-stack">
      <p className="login-note" role="status">
        We hebben een e-mail gestuurd naar <strong>{email}</strong>. Open de link erin om je adres te bevestigen. Kijk
        ook even bij je ongewenste mail.
      </p>
      {state === 'sent' && (
        <p className="login-note" role="status">
          De mail is opnieuw verstuurd.
        </p>
      )}
      {state === 'error' && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-secondary" onClick={resend} disabled={state === 'sending'}>
        Stuur de mail opnieuw
      </button>
      {children}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import { requestErrorKey } from '../lib/account'

// "Kijk in je mail": getoond na account aanmaken, en in de koppelflow
// zolang het adres niet bevestigd is. onResend() verstuurt de bevestigingsmail
// opnieuw en mag een fout gooien. sendFailed: de eerste mail ging niet weg.
// children: extra knoppen onderaan.
export default function VerifyNotice({ email, onResend, sendFailed = false, children }) {
  const t = useTranslations()
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
      setError(t(requestErrorKey(err)))
      setState('error')
    }
  }

  return (
    <div className="form-stack">
      {sendFailed && state !== 'sent' ? (
        <p className="login-error" role="alert">
          {t.rich('verify.sendFailed', { email, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      ) : (
        <p className="login-note" role="status">
          {t.rich('verify.sent', { email, strong: (chunks) => <strong>{chunks}</strong> })}
        </p>
      )}
      {state === 'sent' && (
        <p className="login-note" role="status">
          {t('verify.resent')}
        </p>
      )}
      {state === 'error' && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-secondary" onClick={resend} disabled={state === 'sending'}>
        {t('verify.resend')}
      </button>
      {children}
    </div>
  )
}

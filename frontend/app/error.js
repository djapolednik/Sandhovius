'use client'

import { useEffect, useState } from 'react'
import AccountShell from '../components/AccountShell'
import { isStaleBuildError, sessionStore, shouldAutoReload } from '../lib/staleBuild'

// Als de app zelf crasht. Meestal na een update: een open app vraagt een
// bestand van de vorige versie dat er niet meer is. Dan één keer vanzelf
// herladen; anders (of als dat net al gebeurde) een rustige melding met
// "Opnieuw laden", in plaats van Engelse "This page couldn't load".
export default function Error({ error, retry }) {
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    console.error('[app]', error)
    if (isStaleBuildError(error) && shouldAutoReload(sessionStore())) {
      setReloading(true)
      window.location.reload()
    }
  }, [error])

  if (reloading) {
    return (
      <AccountShell title="Even bijwerken…">
        <p className="login-note" role="status">
          Er is een nieuwe versie van Sandhovius. We laden hem nu.
        </p>
      </AccountShell>
    )
  }

  return (
    <AccountShell title="Er ging iets mis.">
      <div className="form-stack">
        <p className="login-note" role="alert">
          Je huis werkt gewoon door; alleen de app liep vast. Laad hem opnieuw.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Opnieuw laden
        </button>
        <button type="button" className="btn btn-plain login-link" onClick={() => retry()}>
          Nog een keer proberen
        </button>
      </div>
    </AccountShell>
  )
}

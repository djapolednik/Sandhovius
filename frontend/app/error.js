'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'use-intl'
import AccountShell from '../components/AccountShell'
import { isStaleBuildError, sessionStore, shouldAutoReload } from '../lib/staleBuild'

// Als de app zelf crasht. Meestal na een update: een open app vraagt een
// bestand van de vorige versie dat er niet meer is. Dan één keer vanzelf
// herladen; anders (of als dat net al gebeurde) een rustige melding met
// "Opnieuw laden", in plaats van Engelse "This page couldn't load".
export default function Error({ error, retry }) {
  const t = useTranslations('crash')
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
      <AccountShell title={t('updating')}>
        <p className="login-note" role="status">
          {t('updatingNote')}
        </p>
      </AccountShell>
    )
  }

  return (
    <AccountShell title={t('title')}>
      <div className="form-stack">
        <p className="login-note" role="alert">
          {t('text')}
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('reload')}
        </button>
        <button type="button" className="btn btn-plain login-link" onClick={() => retry()}>
          {t('retry')}
        </button>
      </div>
    </AccountShell>
  )
}

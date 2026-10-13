'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'use-intl'
import AccountShell from '../../components/AccountShell'
import { createPb } from '../../lib/pocketbase'
import { confirmFailure } from '../../lib/account'

function Confirm() {
  const t = useTranslations('confirm')
  const tAccount = useTranslations('account')
  const token = useSearchParams().get('token')
  // working | done | invalid | offline | busy (zie confirmFailure)
  const [state, setState] = useState(token ? 'working' : 'invalid')
  // Elke poging één keer (StrictMode draait effecten dubbel); "Opnieuw
  // proberen" verhoogt attempt.
  const [attempt, setAttempt] = useState(0)
  const started = useRef(-1)

  useEffect(() => {
    if (!token || started.current === attempt) return
    started.current = attempt
    const pb = createPb()
    pb.collection('users')
      .confirmVerification(token)
      .then(async () => {
        // Ingelogd? Ververs dan het record, zodat `verified` klopt.
        if (pb.authStore.isValid) {
          try {
            await pb.collection('users').authRefresh()
          } catch (err) {
            console.error('[authRefresh]', err)
          }
        }
        setState('done')
      })
      .catch((err) => {
        console.error('[bevestigen]', err)
        setState(confirmFailure(err))
      })
  }, [token, attempt])

  function retry() {
    setState('working')
    setAttempt((n) => n + 1)
  }

  if (state === 'working') {
    return (
      <AccountShell title={t('working')}>
        <p className="login-note" role="status">
          {t('workingNote')}
        </p>
      </AccountShell>
    )
  }
  if (state === 'done') {
    return (
      <AccountShell title={t('done')}>
        <div className="form-stack">
          <Link className="btn btn-primary" href="/">
            {t('toApp')}
          </Link>
        </div>
      </AccountShell>
    )
  }
  if (state === 'offline' || state === 'busy') {
    return (
      <AccountShell title={t('failed')}>
        <div className="form-stack">
          <p className="login-note" role="alert">
            {state === 'busy' ? t('busy') : t('offline')}
          </p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            {t('retry')}
          </button>
        </div>
      </AccountShell>
    )
  }
  return (
    <AccountShell title={t('invalid')}>
      <div className="form-stack">
        <p className="login-note" role="alert">
          {t('invalidNote')}
        </p>
        <Link className="btn btn-primary" href="/">
          {tAccount('toLogin')}
        </Link>
      </div>
    </AccountShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Confirm />
    </Suspense>
  )
}

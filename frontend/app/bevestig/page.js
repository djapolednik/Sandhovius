'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AccountShell from '../../components/AccountShell'
import { createPb } from '../../lib/pocketbase'
import { confirmFailure } from '../../lib/account'

function Confirm() {
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
      <AccountShell title="Even geduld…">
        <p className="login-note" role="status">
          We bevestigen je e-mailadres.
        </p>
      </AccountShell>
    )
  }
  if (state === 'done') {
    return (
      <AccountShell title="Je e-mailadres is bevestigd.">
        <div className="form-stack">
          <Link className="btn btn-primary" href="/">
            Naar Sandhovius
          </Link>
        </div>
      </AccountShell>
    )
  }
  if (state === 'offline' || state === 'busy') {
    return (
      <AccountShell title="Bevestigen lukte nu niet.">
        <div className="form-stack">
          <p className="login-note" role="alert">
            {state === 'busy'
              ? 'Er waren te veel pogingen. Wacht even en probeer het dan opnieuw; je link werkt nog.'
              : 'Sandhovius is nu niet bereikbaar. Controleer je internetverbinding en probeer het opnieuw; je link werkt nog.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={retry}>
            Opnieuw proberen
          </button>
        </div>
      </AccountShell>
    )
  }
  return (
    <AccountShell title="Deze link werkt niet meer.">
      <div className="form-stack">
        <p className="login-note" role="alert">
          De link is verlopen of al gebruikt. Log in en vraag een nieuwe bevestigingsmail aan.
        </p>
        <Link className="btn btn-primary" href="/">
          Naar inloggen
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

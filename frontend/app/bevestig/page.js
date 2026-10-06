'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AccountShell from '../../components/AccountShell'
import { createPb } from '../../lib/pocketbase'

function Confirm() {
  const token = useSearchParams().get('token')
  const [state, setState] = useState(token ? 'working' : 'invalid') // working | done | invalid
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
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
        setState('invalid')
      })
  }, [token])

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
          <a className="btn btn-primary" href="/">
            Naar Sandhovius
          </a>
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
        <a className="btn btn-primary" href="/">
          Naar inloggen
        </a>
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

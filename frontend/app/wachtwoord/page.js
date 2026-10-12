'use client'

import { Suspense, useId, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AccountShell from '../../components/AccountShell'
import { createPb } from '../../lib/pocketbase'
import { MIN_PASSWORD_LENGTH } from '../../lib/account'
import PasswordField from '../../components/PasswordField'
import PasswordChecks from '../../components/PasswordChecks'

function Reset() {
  const token = useSearchParams().get('token')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(!token)
  const checksId = useId()

  async function submit(e) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Kies een wachtwoord van minstens ${MIN_PASSWORD_LENGTH} tekens`)
      return
    }
    if (password !== passwordConfirm) {
      setError('De twee wachtwoorden zijn niet gelijk')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createPb().collection('users').confirmPasswordReset(token, password, passwordConfirm)
      setDone(true)
    } catch (err) {
      console.error('[wachtwoord resetten]', err)
      if (err?.status === 400 && err?.response?.data?.token) setInvalid(true)
      else if (err?.status === 429) setError('Te veel pogingen. Wacht even en probeer het dan opnieuw')
      else if (err?.status === 0) setError('Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw')
      else setError('Het wachtwoord kon niet worden gewijzigd. Probeer het zo opnieuw')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AccountShell title="Je wachtwoord is gewijzigd.">
        <div className="form-stack">
          <Link className="btn btn-primary" href="/">
            Naar inloggen
          </Link>
        </div>
      </AccountShell>
    )
  }
  if (invalid) {
    return (
      <AccountShell title="Deze link werkt niet meer.">
        <div className="form-stack">
          <p className="login-note" role="alert">
            De link is verlopen of al gebruikt. Kies op het inlogscherm &ldquo;Wachtwoord vergeten?&rdquo; voor een
            nieuwe.
          </p>
          <Link className="btn btn-primary" href="/">
            Naar inloggen
          </Link>
        </div>
      </AccountShell>
    )
  }
  return (
    <AccountShell title="Kies een nieuw wachtwoord.">
      <form onSubmit={submit} className="form-stack">
        <PasswordField
          label="Nieuw wachtwoord"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          describedBy={checksId}
          required
        />
        <PasswordField
          label="Nieuw wachtwoord, nog een keer"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          describedBy={checksId}
          required
        />
        <PasswordChecks id={checksId} password={password} passwordConfirm={passwordConfirm} />
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Wachtwoord opslaan
        </button>
      </form>
    </AccountShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Reset />
    </Suspense>
  )
}

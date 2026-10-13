'use client'

import { Suspense, useId, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'use-intl'
import AccountShell from '../../components/AccountShell'
import { createPb } from '../../lib/pocketbase'
import { MIN_PASSWORD_LENGTH, requestErrorKey } from '../../lib/account'
import PasswordField from '../../components/PasswordField'
import PasswordChecks from '../../components/PasswordChecks'

function Reset() {
  const t = useTranslations()
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
      setError(t('account.passwordTooShort', { min: MIN_PASSWORD_LENGTH }))
      return
    }
    if (password !== passwordConfirm) {
      setError(t('account.passwordsDiffer'))
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
      else if (err?.status === 429 || err?.status === 0) setError(t(requestErrorKey(err)))
      else setError(t('reset.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AccountShell title={t('reset.done')}>
        <div className="form-stack">
          <Link className="btn btn-primary" href="/">
            {t('account.toLogin')}
          </Link>
        </div>
      </AccountShell>
    )
  }
  if (invalid) {
    return (
      <AccountShell title={t('confirm.invalid')}>
        <div className="form-stack">
          <p className="login-note" role="alert">
            {t('reset.invalidNote')}
          </p>
          <Link className="btn btn-primary" href="/">
            {t('account.toLogin')}
          </Link>
        </div>
      </AccountShell>
    )
  }
  return (
    <AccountShell title={t('reset.title')}>
      <form onSubmit={submit} className="form-stack">
        <PasswordField
          label={t('reset.newPassword')}
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          describedBy={checksId}
          required
        />
        <PasswordField
          label={t('reset.newPasswordAgain')}
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
          {t('reset.save')}
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

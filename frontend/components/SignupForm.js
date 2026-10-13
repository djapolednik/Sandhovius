'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import VerifyNotice from './VerifyNotice'
import { useLanguage } from '../app/LanguageContext'
import { MIN_PASSWORD_LENGTH, signupErrorKey, validateSignup } from '../lib/account'

// Account aanmaken in de login-kaart. Maakt het account, vraagt de
// bevestigingsmail aan en toont daarna VerifyNotice. pb is de PocketBase-client
// van page.js; onBack gaat terug naar inloggen met het ingevulde adres.
// Het account krijgt de taal waarin je het formulier invult (de knop op het
// inlogscherm wisselt die): geen apart veld meer.
export default function SignupForm({ pb, initialEmail = '', onBack }) {
  const t = useTranslations()
  const { language } = useLanguage()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)
  const [mailFailed, setMailFailed] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const problem = validateSignup({ email, password, passwordConfirm })
    if (problem) {
      setError(t(problem, { min: MIN_PASSWORD_LENGTH }))
      return
    }
    setBusy(true)
    setError('')
    try {
      const address = email.trim()
      await pb.collection('users').create({ email: address, password, passwordConfirm, language })
      setEmail(address)
      setCreated(true)
      // Het account bestaat; een mislukte mail maakt dat niet ongedaan, maar
      // de bewoner moet het wel weten: VerifyNotice zegt het en biedt
      // "Stuur de mail opnieuw".
      pb.collection('users')
        .requestVerification(address)
        .catch((err) => {
          console.error('[verificatiemail]', err)
          setMailFailed(true)
        })
    } catch (err) {
      console.error('[account aanmaken]', err)
      setError(t(signupErrorKey(err)))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <VerifyNotice
        email={email}
        sendFailed={mailFailed}
        onResend={() => pb.collection('users').requestVerification(email)}
      >
        <button type="button" className="btn btn-primary" onClick={() => onBack(email)}>
          {t('account.toLogin')}
        </button>
      </VerifyNotice>
    )
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label className="form-field">
        <span className="form-label">{t('login.email')}</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="form-field">
        <span className="form-label">{t('login.password')}</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <label className="form-field">
        <span className="form-label">{t('account.passwordAgain')}</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {t('account.busy')}
          </>
        ) : (
          t('login.createAccount')
        )}
      </button>
      <button type="button" className="btn btn-plain login-link" onClick={() => onBack(email)}>
        {t('account.haveAccount')}
      </button>
    </form>
  )
}

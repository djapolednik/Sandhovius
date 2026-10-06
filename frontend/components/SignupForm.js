'use client'

import { useState } from 'react'
import LanguageChoice from './LanguageChoice'
import VerifyNotice from './VerifyNotice'
import { defaultLanguage, errorMessage, validateSignup } from '../lib/account'

// Account aanmaken in de login-kaart. Maakt het account, vraagt de
// bevestigingsmail aan en toont daarna VerifyNotice. pb is de PocketBase-client
// van page.js; onBack gaat terug naar inloggen met het ingevulde adres.
export default function SignupForm({ pb, initialEmail = '', onBack }) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [language, setLanguage] = useState(() => defaultLanguage(navigator.languages))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const problem = validateSignup({ email, password, passwordConfirm })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    try {
      const address = email.trim()
      await pb.collection('users').create({ email: address, password, passwordConfirm, language })
      setEmail(address)
      setCreated(true)
      // Het account bestaat; een mislukte mail mag dat niet ongedaan maken:
      // "Stuur de mail opnieuw" staat al in VerifyNotice.
      pb.collection('users')
        .requestVerification(address)
        .catch((err) => console.error('[verificatiemail]', err))
    } catch (err) {
      console.error('[account aanmaken]', err)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <VerifyNotice email={email} onResend={() => pb.collection('users').requestVerification(email)}>
        <button type="button" className="btn btn-primary" onClick={() => onBack(email)}>
          Naar inloggen
        </button>
      </VerifyNotice>
    )
  }

  return (
    <form onSubmit={submit} className="form-stack">
      <label className="form-field">
        <span className="form-label">E-mailadres</span>
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
        <span className="form-label">Wachtwoord</span>
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
        <span className="form-label">Wachtwoord nog een keer</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          required
        />
      </label>
      <div className="form-field">
        <span className="form-label">Taal van e-mails</span>
        <LanguageChoice value={language} onChange={setLanguage} />
      </div>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Bezig…
          </>
        ) : (
          'Account aanmaken'
        )}
      </button>
      <button type="button" className="btn btn-plain login-link" onClick={() => onBack(email)}>
        Ik heb al een account
      </button>
    </form>
  )
}

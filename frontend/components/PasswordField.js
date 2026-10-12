'use client'

import { useId, useState } from 'react'
import { EyeIcon, EyeOffIcon } from '../lib/icons'

// Een wachtwoordveld met een oogknop om te tonen wat je typte: op een
// telefoon tik je een lang wachtwoord makkelijk fout, en dan wil je het
// kunnen zien. De knop zegt het in woorden voor schermlezers (aria-pressed).
export default function PasswordField({ label, value, onChange, autoComplete, describedBy, ...props }) {
  const [shown, setShown] = useState(false)
  const id = useId()
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input">
        <input
          id={id}
          className="input"
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          {...props}
        />
        <button
          type="button"
          className="password-toggle"
          aria-label="Wachtwoord tonen"
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useId } from 'react'

const OPTIONS = [
  { value: 'nl', label: 'Nederlands' },
  { value: 'en', label: 'English' },
]

// Taal van de e-mails (bevestigen, wachtwoord vergeten). Dezelfde balk met
// twee standen als het thema in Opties.
export default function LanguageChoice({ value, onChange, legend = 'Taal van e-mails', disabled = false }) {
  const name = useId()
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend className="visually-hidden">{legend}</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className={`segmented-option ${value === o.value ? 'segmented-option-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            value={o.value}
            className="visually-hidden"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

'use client'

import { useId } from 'react'

// Elke taal in zijn eigen woorden: wie de andere taal zoekt, herkent die zo.
const OPTIONS = [
  { value: 'nl', label: 'Nederlands' },
  { value: 'en', label: 'English' },
]

// De taal van de app en de mails (Opties). Dezelfde balk met twee standen
// als het thema.
export default function LanguageChoice({ value, onChange, legend, disabled = false }) {
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

'use client'

import { useTranslations } from 'use-intl'
import { roleLabel } from '../lib/household'

// Huisgenoot of beheerder: dezelfde balk als Weergave (echte radioknoppen
// onder een pillenbalk).
const ROLES = ['member', 'admin']

export default function RoleChoice({ value, onChange, name, disabled = false }) {
  const t = useTranslations()
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend className="visually-hidden">{t('household.role')}</legend>
      {ROLES.map((role) => (
        <label key={role} className={`segmented-option ${value === role ? 'segmented-option-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            value={role}
            className="visually-hidden"
            checked={value === role}
            onChange={() => onChange(role)}
          />
          {roleLabel(t, role)}
        </label>
      ))}
    </fieldset>
  )
}

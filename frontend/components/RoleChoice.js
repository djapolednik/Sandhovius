'use client'

// Huisgenoot of beheerder: dezelfde balk als Weergave (echte radioknoppen
// onder een pillenbalk).
const ROLES = [
  { value: 'member', label: 'Huisgenoot' },
  { value: 'admin', label: 'Beheerder' },
]

export default function RoleChoice({ value, onChange, name, disabled = false }) {
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend className="visually-hidden">Rol</legend>
      {ROLES.map((r) => (
        <label key={r.value} className={`segmented-option ${value === r.value ? 'segmented-option-selected' : ''}`}>
          <input
            type="radio"
            name={name}
            value={r.value}
            className="visually-hidden"
            checked={value === r.value}
            onChange={() => onChange(r.value)}
          />
          {r.label}
        </label>
      ))}
    </fieldset>
  )
}

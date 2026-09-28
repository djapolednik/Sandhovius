'use client'

import { useTheme } from '../lib/useTheme'
import { ArrowUpRightIcon, RoomsIcon } from '../lib/icons'

// Het tabblad Instellingen: je huis en kamers, hoe de app eruitziet, en je
// account. Geen losse menu's of vensters meer achter een avatar — alles
// staat hier op één plek, in gewone rijen.
const THEME_OPTIONS = [
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
  { value: 'auto', label: 'Automatisch' },
]

export default function SettingsView({ house, roomCount, userEmail, onOpenHouse, onLogout }) {
  const { mode, setMode } = useTheme()

  return (
    <div className="settings-view">
      {house && (
        <section className="panel settings-section" aria-labelledby="settings-house">
          <h2 id="settings-house" className="settings-heading">
            Huis
          </h2>
          <button type="button" className="settings-link" onClick={onOpenHouse}>
            <span className="device-icon" aria-hidden="true">
              <RoomsIcon width="20" height="20" />
            </span>
            <span className="settings-link-text">
              <span className="settings-link-title">{house.name}</span>
              <span className="settings-link-sub">
                {roomCount === 1 ? '1 kamer' : `${roomCount} kamers`}. Naam en kamers wijzigen
              </span>
            </span>
            <ArrowUpRightIcon className="settings-link-arrow" width="18" height="18" aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="panel settings-section" aria-labelledby="settings-look">
        <h2 id="settings-look" className="settings-heading">
          Weergave
        </h2>
        {/* Echte radioknoppen (pijltjes, één tabstop), visueel als één
            balk met drie standen. */}
        <fieldset className="segmented">
          <legend className="visually-hidden">Thema</legend>
          {THEME_OPTIONS.map(({ value, label }) => (
            <label key={value} className={`segmented-option ${mode === value ? 'segmented-option-selected' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={value}
                className="visually-hidden"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="settings-hint">Automatisch volgt je telefoon: licht overdag, donker als je telefoon dat is.</p>
      </section>

      <section className="panel settings-section" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-heading">
          Account
        </h2>
        {userEmail && <p className="settings-account-email">Ingelogd als {userEmail}</p>}
        <button type="button" className="btn btn-secondary settings-logout" onClick={onLogout}>
          Uitloggen
        </button>
      </section>
    </div>
  )
}

'use client'

import { useTheme } from '../lib/useTheme'
import { RoomsIcon } from '../lib/icons'

// Het tabblad Instellingen: je huis en kamers, hoe de app eruitziet, en je
// account. Geen losse menu's of vensters meer achter een avatar — alles
// staat hier op één plek, in gewone rijen.
export default function SettingsView({ house, roomCount, userEmail, onOpenHouse, onLogout }) {
  const { isDarkMode, toggleTheme } = useTheme()

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
          </button>
        </section>
      )}

      <section className="panel settings-section" aria-labelledby="settings-look">
        <h2 id="settings-look" className="settings-heading">
          Weergave
        </h2>
        <div className="settings-row">
          <span id="setting-dark-mode">Donkere modus</span>
          <button
            type="button"
            className={`switch switch-accent ${isDarkMode ? 'switch-on' : ''}`}
            role="switch"
            aria-checked={isDarkMode}
            aria-labelledby="setting-dark-mode"
            onClick={toggleTheme}
          >
            <span className="switch-thumb" />
          </button>
        </div>
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

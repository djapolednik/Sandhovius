'use client'

import { useTheme } from '../lib/useTheme'
import { SunIcon, MoonIcon } from '../lib/icons'

// Altijd een donkere merk-balk (zie --header-bg in globals.css), los van
// het licht/donker thema van de rest van de app. userMenu is de avatar-
// dropdown; wordt alleen getoond wanneer ingelogd.
export default function Header({ userMenu }) {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <div className="header-bar">
      <header className="header">
        <h1 className="brand">Sandhovius</h1>

        <div className="header-user-slot">
          <button
            className="btn btn-icon btn-plain theme-toggle-button"
            aria-label={isDarkMode ? 'Lichte modus' : 'Donkere modus'}
            onClick={toggleTheme}
          >
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          {userMenu}
        </div>
      </header>
    </div>
  )
}

'use client'

import { useState } from 'react'
import LanguageChoice from './LanguageChoice'
import { useTheme } from '../app/ThemeContext'
import { ArrowUpRightIcon, CheckIcon, RoomsIcon } from '../lib/icons'

const THEME_OPTIONS = [
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
  { value: 'auto', label: 'Automatisch' },
]

// Het tabblad Opties: je huis en kamers, hoe de app eruitziet, en je
// account. Geen losse menu's of vensters meer achter een avatar — alles
// staat hier op één plek, in gewone rijen. Met meer dan één huis kies je
// hier welk huis de app laat zien.
export default function SettingsView({
  house,
  connection,
  isAdmin = false,
  household,
  houses = [],
  onSelectHouse,
  roomCount,
  userEmail,
  language,
  onChangeLanguage,
  onOpenHouse,
  onAddBox,
  onChangePassword,
  onLogout,
}) {
  const { mode, setMode } = useTheme()
  const [mailLanguage, setMailLanguage] = useState(language)
  const [languageError, setLanguageError] = useState('')

  async function chooseLanguage(value) {
    const previous = mailLanguage
    setMailLanguage(value)
    setLanguageError('')
    try {
      await onChangeLanguage(value)
    } catch (err) {
      console.error('[taal van e-mails]', err)
      setMailLanguage(previous)
      setLanguageError('De taal kon niet worden gewijzigd. Probeer het zo opnieuw.')
    }
  }

  return (
    <div className="settings-view">
      {house && (
        <section className="panel settings-section" aria-labelledby="settings-house">
          <h2 id="settings-house" className="settings-heading">
            Huis
          </h2>
          {houses.length > 1 && (
            <fieldset className="house-choice">
              <legend className="visually-hidden">Welk huis wil je zien?</legend>
              {houses.map((h) => (
                <label key={h.id} className={`house-choice-option ${h.id === house.id ? 'house-choice-selected' : ''}`}>
                  <input
                    type="radio"
                    name="house"
                    className="visually-hidden"
                    checked={h.id === house.id}
                    onChange={() => onSelectHouse(h.id)}
                  />
                  <span>{h.name}</span>
                  {h.id === house.id && <CheckIcon width="18" height="18" aria-hidden="true" />}
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" className="settings-link" onClick={onOpenHouse}>
            <span className="device-icon" aria-hidden="true">
              <RoomsIcon width="20" height="20" />
            </span>
            <span className="settings-link-text">
              <span className="settings-link-title">{house.name}</span>
              <span className="settings-link-sub">
                {roomCount === 1 ? '1 kamer' : `${roomCount} kamers`}. {isAdmin ? 'Naam en kamers wijzigen' : 'Kamers wijzigen'}
              </span>
            </span>
            <ArrowUpRightIcon className="settings-link-arrow" width="18" height="18" aria-hidden="true" />
          </button>
          {/* Hoe de verbinding met je huis is; op Home staat alleen een storing. */}
          <div className="settings-connection">{connection}</div>
          <button type="button" className="btn btn-secondary settings-add-box" onClick={onAddBox}>
            Box toevoegen
          </button>
        </section>
      )}

      {household}

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

      <section className="panel settings-section settings-account" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-heading">
          Account
        </h2>
        {userEmail && (
          <p className="settings-account-email">
            Ingelogd als <strong>{userEmail}</strong>
          </p>
        )}
        <div className="settings-group">
          <h3 className="settings-subheading">Taal van e-mails</h3>
          <LanguageChoice value={mailLanguage} onChange={chooseLanguage} legend="Nederlands of English" />
          <p className="settings-hint">Voor de mails die je van Sandhovius krijgt. De app zelf blijft Nederlands.</p>
          {languageError && (
            <p className="login-error" role="alert">
              {languageError}
            </p>
          )}
        </div>
        <div className="settings-account-actions">
          <button type="button" className="btn btn-secondary settings-logout" onClick={onChangePassword}>
            Wachtwoord wijzigen
          </button>
          <button type="button" className="btn btn-secondary settings-logout" onClick={onLogout}>
            Uitloggen
          </button>
        </div>
      </section>
    </div>
  )
}

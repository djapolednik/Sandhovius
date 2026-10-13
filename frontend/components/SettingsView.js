'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import LanguageChoice from './LanguageChoice'
import { useTheme } from '../app/ThemeContext'
import { useLanguage } from '../app/LanguageContext'
import { ArrowUpRightIcon, CheckIcon, RoomsIcon } from '../lib/icons'

// De woorden staan onder settings.themes.<value>.
const THEME_OPTIONS = ['light', 'dark', 'auto']

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
  onChangeLanguage,
  onOpenHouse,
  onAddBox,
  onChangePassword,
  onLogout,
}) {
  const { mode, setMode } = useTheme()
  const { language, setLanguage } = useLanguage()
  const t = useTranslations('settings')
  const [languageError, setLanguageError] = useState('')

  // Meteen wisselen, dan het account bijwerken (de mails volgen het
  // account). Lukt dat niet, dan terug: anders kreeg je de mails in een
  // andere taal dan de app.
  async function chooseLanguage(value) {
    const previous = language
    setLanguage(value)
    setLanguageError('')
    try {
      await onChangeLanguage(value)
    } catch (err) {
      console.error('[taal wijzigen]', err)
      setLanguage(previous)
      setLanguageError(t('languageFailed'))
    }
  }

  return (
    <div className="settings-view">
      {house && (
        <section className="panel settings-section" aria-labelledby="settings-house">
          <h2 id="settings-house" className="settings-heading">
            {t('house')}
          </h2>
          {houses.length > 1 && (
            <fieldset className="house-choice">
              <legend className="visually-hidden">{t('whichHouse')}</legend>
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
                {t(isAdmin ? 'houseSubAdmin' : 'houseSub', { count: roomCount })}
              </span>
            </span>
            <ArrowUpRightIcon className="settings-link-arrow" width="18" height="18" aria-hidden="true" />
          </button>
          {/* Hoe de verbinding met je huis is; op Home staat alleen een storing. */}
          <div className="settings-connection">{connection}</div>
          <button type="button" className="btn btn-secondary settings-add-box" onClick={onAddBox}>
            {t('addBox')}
          </button>
        </section>
      )}

      {household}

      <section className="panel settings-section" aria-labelledby="settings-look">
        <h2 id="settings-look" className="settings-heading">
          {t('look')}
        </h2>
        {/* Echte radioknoppen (pijltjes, één tabstop), visueel als één
            balk met drie standen. */}
        <fieldset className="segmented">
          <legend className="visually-hidden">{t('theme')}</legend>
          {THEME_OPTIONS.map((value) => (
            <label key={value} className={`segmented-option ${mode === value ? 'segmented-option-selected' : ''}`}>
              <input
                type="radio"
                name="theme"
                value={value}
                className="visually-hidden"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {t(`themes.${value}`)}
            </label>
          ))}
        </fieldset>
        <p className="settings-hint">{t('themeHint')}</p>
      </section>

      <section className="panel settings-section settings-account" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-heading">
          {t('account')}
        </h2>
        {userEmail && (
          <p className="settings-account-email">
            {t.rich('loggedInAs', { email: userEmail, strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        )}
        <div className="settings-group">
          <h3 className="settings-subheading">{t('language')}</h3>
          <LanguageChoice value={language} onChange={chooseLanguage} legend={t('language')} />
          <p className="settings-hint">{t('languageHint')}</p>
          {languageError && (
            <p className="login-error" role="alert">
              {languageError}
            </p>
          )}
        </div>
        <div className="settings-account-actions">
          <button type="button" className="btn btn-secondary settings-logout" onClick={onChangePassword}>
            {t('changePassword')}
          </button>
          <button type="button" className="btn btn-secondary settings-logout" onClick={onLogout}>
            {t('logout')}
          </button>
        </div>
      </section>
    </div>
  )
}

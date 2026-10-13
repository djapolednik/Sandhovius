// De taal van de app en van de mails (spec 2026-10-13-app-language-design).
// Eén keuze per account (users.language); vóór het inloggen de taal van de
// browser, onthouden op deze telefoon.

export const LANGUAGES = ['nl', 'en']

// Engels is Brits: 24-uursklok en "13 October", net als in Nederland.
export const LOCALES = { nl: 'nl-NL', en: 'en-GB' }

export const STORAGE_KEY = 'sandhovius-language'

export function isLanguage(value) {
  return LANGUAGES.includes(value)
}

// De eerste browsertaal die we hebben, anders Nederlands.
export function browserLanguage(navigatorLanguages) {
  for (const tag of navigatorLanguages || []) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (isLanguage(base)) return base
  }
  return 'nl'
}

// Het account wint, dan wat deze telefoon onthield, dan de browser.
export function pickLanguage({ account, stored, navigatorLanguages }) {
  if (isLanguage(account)) return account
  if (isLanguage(stored)) return stored
  return browserLanguage(navigatorLanguages)
}

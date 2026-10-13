'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { IntlProvider } from 'use-intl'
import nl from '../messages/nl.json'
import en from '../messages/en.json'
import { LOCALES, STORAGE_KEY, isLanguage, pickLanguage } from '../lib/language'

const MESSAGES = { nl, en }

const LanguageContext = createContext(undefined)

// { language, setLanguage, adoptAccountLanguage } — zie LanguageProvider.
export const useLanguage = () => useContext(LanguageContext)

function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function store(language) {
  try {
    window.localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Geen opslag (privévenster): de keuze geldt dan alleen nu.
  }
}

// De taal van de hele app. Vóór het inloggen: wat deze telefoon onthield,
// anders de browser. Na het inloggen wint het account (page.js roept dan
// adoptAccountLanguage aan). Beide berichtenbestanden zitten in de bundel:
// samen klein, en wisselen gaat zo meteen.
//
// Meteen bij de eerste render de goede taal kiezen mag: de voorgerenderde
// HTML bevat nog geen tekst (Home toont eerst alleen de achtergrond, de
// losse pagina's wachten in een Suspense), dus er is niets om mee te
// verschillen en de bewoner ziet geen Nederlands opflitsen.
export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() =>
    typeof window === 'undefined' ? 'nl' : pickLanguage({ stored: readStored(), navigatorLanguages: navigator.languages })
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // De bewoner kiest (Opties, of de knop op het inlogscherm). Het account
  // bijwerken doet de aanroeper: vóór het inloggen is er nog geen.
  function setLanguage(next) {
    if (!isLanguage(next)) return
    store(next)
    setLanguageState(next)
  }

  // Het account heeft een taal: die geldt, ook op een nieuwe telefoon.
  // Een account zonder taal (van vóór de taalkeuze) laat de huidige staan.
  function adoptAccountLanguage(accountLanguage) {
    if (isLanguage(accountLanguage) && accountLanguage !== language) setLanguage(accountLanguage)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, adoptAccountLanguage }}>
      <IntlProvider
        locale={LOCALES[language]}
        messages={MESSAGES[language]}
        // De tijdzone van de telefoon, zoals de Intl-opmaak nu ook doet.
        timeZone={typeof window === 'undefined' ? 'Europe/Amsterdam' : Intl.DateTimeFormat().resolvedOptions().timeZone}
      >
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  )
}

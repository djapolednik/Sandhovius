'use client'

import { createContext, useEffect, useState } from 'react'

export const ThemeContext = createContext(undefined)

const STORAGE_KEY = 'sandhovius-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// Drie keuzes: licht, donker, of automatisch (volgt de telefoon, ook als
// die 's avonds zelf naar donker wisselt). Zonder opgeslagen keuze is het
// automatisch, net als het script in layout.js aanneemt.
function readMode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

// Zet het thema direct op <html>, niet via een React-render: zo wisselen
// alle kleuren (CSS-variabelen op [data-theme]) in één keer, zonder dat
// onderdelen één voor één omslaan.
function apply(mode) {
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia(DARK_QUERY).matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  // 'auto' tot na de eerste render, gelijk aan de server-HTML. Het echte
  // thema staat dan al op <html> dankzij het script in layout.js.
  const [mode, setModeState] = useState('auto')

  useEffect(() => {
    setModeState(readMode())
  }, [])

  // Automatisch: meewisselen als de telefoon wisselt terwijl de app open is.
  useEffect(() => {
    if (mode !== 'auto') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => apply('auto')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])

  function setMode(next) {
    apply(next)
    try {
      if (next === 'auto') window.localStorage.removeItem(STORAGE_KEY)
      else window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Geen opslag (privévenster): de keuze geldt dan alleen nu.
    }
    setModeState(next)
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>
}

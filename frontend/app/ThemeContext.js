'use client'

import { createContext, useEffect, useState } from 'react'

export const ThemeContext = createContext(undefined)

const STORAGE_KEY = 'sandhovius-theme'

export function ThemeProvider({ children }) {
  // Starts false to match the server render exactly (no window there).
  // The actual visual theme is never driven by this state — it's set
  // directly on <html data-theme> by the blocking script in layout.js and
  // by toggleTheme() below. This state only exists so components (e.g. the
  // toggle button's label) know which theme is active.
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    setIsDarkMode(document.documentElement.dataset.theme === 'dark')
  }, [])

  // Sets the DOM attribute synchronously in the click handler itself —
  // not in a useEffect — so every CSS variable driven off [data-theme]
  // updates in the same paint the click causes, instead of waiting for a
  // React re-render to finish first. That's what removes the flicker: the
  // whole page's colors change atomically, not element-by-element as
  // components re-render with new inline styles.
  function toggleTheme() {
    const next = !isDarkMode
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    setIsDarkMode(next)
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme }}>{children}</ThemeContext.Provider>
  )
}

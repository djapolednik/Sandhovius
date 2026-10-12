// Na een update bestaan de JavaScript-bestanden van de vorige versie niet
// meer. Een app die nog open stond (een geïnstalleerde PWA) vraagt er dan
// een op die weg is, en Next.js toont "This page couldn't load". Eén keer
// herladen haalt de nieuwe versie op. Gedeeld door app/error.js en
// app/global-error.js.

export function isStaleBuildError(error) {
  if (!error) return false
  const text = `${error.name || ''} ${error.message || ''}`
  return (
    /ChunkLoadError/.test(text) ||
    /Failed to load chunk/i.test(text) ||
    /Loading (CSS )?chunk .* failed/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text)
  )
}

// Hooguit één automatische herlaadpoging per RELOAD_GUARD_MS: blijft het
// misgaan, dan is het geen oude versie en zou herladen een lus worden.
export const RELOAD_GUARD_MS = 30_000
const KEY = 'sandhovius-stale-reload'

export function shouldAutoReload(storage, now = Date.now()) {
  if (!storage) return false
  try {
    const last = storage.getItem(KEY)
    if (last !== null && now - Number(last) <= RELOAD_GUARD_MS) return false
    storage.setItem(KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function sessionStore() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

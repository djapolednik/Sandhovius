import { cachedFormat } from './language.js'

// Relatieve tijd voor "Laatst bijgewerkt": grofmazig (seconden, minuten,
// uren); de woorden en het meervoud komen van Intl. intl: { t, locale }.
export function relativeTime({ t, locale }, pastMs, nowMs = Date.now()) {
  if (!pastMs) return t('time.neverConnected')
  const seconds = Math.max(0, Math.round((nowMs - pastMs) / 1000))
  if (seconds < 10) return t('time.justNow')
  const rtf = cachedFormat(Intl.RelativeTimeFormat, locale)
  if (seconds < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  return rtf.format(-Math.round(minutes / 60), 'hour')
}

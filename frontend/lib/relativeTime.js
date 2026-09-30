// NL-relatieve tijd voor "Laatst bijgewerkt": grofmazig (seconden, minuten,
// uren); de woorden en het meervoud komen van Intl.
const rtf = new Intl.RelativeTimeFormat('nl')

export function relativeTimeNL(pastMs, nowMs = Date.now()) {
  if (!pastMs) return 'nog niet verbonden'
  const seconds = Math.max(0, Math.round((nowMs - pastMs) / 1000))
  if (seconds < 10) return 'zojuist'
  if (seconds < 60) return rtf.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  return rtf.format(-Math.round(minutes / 60), 'hour')
}

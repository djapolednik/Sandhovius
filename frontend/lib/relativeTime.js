// Simpele NL-relatieve-tijd, alleen voor de "laatste update"-indicator van
// de realtime-verbinding — geen library nodig voor deze paar grofmazige
// stappen (seconden/minuten/uren).
export function relativeTimeNL(pastMs, nowMs = Date.now()) {
  if (!pastMs) return 'nog niet verbonden'

  const diffSeconds = Math.max(0, Math.round((nowMs - pastMs) / 1000))
  if (diffSeconds < 10) return 'zojuist'
  if (diffSeconds < 60) return `${diffSeconds} seconden geleden`

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minuut' : 'minuten'} geleden`

  const diffHours = Math.round(diffMinutes / 60)
  return `${diffHours} uur geleden`
}

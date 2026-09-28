// Schema's in woorden, voor de scène-tegel en de scène-sheet.

export const DAYS = [
  { key: 'mon', short: 'ma', long: 'maandag' },
  { key: 'tue', short: 'di', long: 'dinsdag' },
  { key: 'wed', short: 'wo', long: 'woensdag' },
  { key: 'thu', short: 'do', long: 'donderdag' },
  { key: 'fri', short: 'vr', long: 'vrijdag' },
  { key: 'sat', short: 'za', long: 'zaterdag' },
  { key: 'sun', short: 'zo', long: 'zondag' },
]

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

// "Elke dag", "Werkdagen", "Weekend", of de dagen in weekvolgorde.
export function describeDays(days) {
  const chosen = DAYS.filter((day) => days.includes(day.key))
  const keys = chosen.map((day) => day.key).join(' ')
  if (keys === 'mon tue wed thu fri sat sun') return 'Elke dag'
  if (keys === 'mon tue wed thu fri') return 'Werkdagen'
  if (keys === 'sat sun') return 'Weekend'
  const names = chosen.map((day) => day.long)
  if (names.length === 0) return ''
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} en ${names.at(-1)}`
  return capitalize(list)
}

// Eén regel voor de tegel: alleen schema's die aan staan.
export function describeSchedules(schedules) {
  const active = schedules.filter((s) => s.enabled)
  if (active.length === 0) return ''
  if (active.length === 1) return `${describeDays(active[0].days)} om ${active[0].time}`
  const times = [...new Set(active.map((s) => s.time))].sort()
  if (times.length === 1) return `Om ${times[0]}`
  return `Om ${times.slice(0, -1).join(', ')} en ${times.at(-1)}`
}

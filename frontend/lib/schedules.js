// Schema's in woorden, voor de scène-tegel en de scène-sheet. intl:
// { t, locale } (useIntl in app/LanguageContext.js). De dagnamen komen van
// Intl, in de taal van de app ("ma", "maandag"; "Mon", "Monday").
import { cachedFormat } from './language.js'

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Maandag 1 januari 2024: van daaruit telt de week.
const MONDAY = new Date(2024, 0, 1)

export function dayNames(locale) {
  const short = cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'short' })
  const long = cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'long' })
  return DAY_KEYS.map((key, i) => {
    const date = new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i)
    return { key, short: short.format(date), long: long.format(date) }
  })
}

const capitalize = (text, locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)

// "Elke dag", "Werkdagen", "Weekend", of de dagen in weekvolgorde.
export function describeDays({ t, locale }, days) {
  const chosen = dayNames(locale).filter((day) => days.includes(day.key))
  const keys = chosen.map((day) => day.key).join(' ')
  if (keys === 'mon tue wed thu fri sat sun') return t('schedules.everyDay')
  if (keys === 'mon tue wed thu fri') return t('schedules.weekdays')
  if (keys === 'sat sun') return t('schedules.weekend')
  if (chosen.length === 0) return ''
  const list = cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' }).format(chosen.map((day) => day.long))
  return capitalize(list, locale)
}

// Eén regel voor de tegel: alleen schema's die aan staan.
export function describeSchedules(intl, schedules) {
  const active = schedules.filter((s) => s.enabled)
  if (active.length === 0) return ''
  if (active.length === 1) return intl.t('schedules.daysAt', { days: describeDays(intl, active[0].days), time: active[0].time })
  const times = [...new Set(active.map((s) => s.time))].sort()
  const list = cachedFormat(Intl.ListFormat, intl.locale, { type: 'conjunction' }).format(times)
  return intl.t('schedules.at', { times: list })
}

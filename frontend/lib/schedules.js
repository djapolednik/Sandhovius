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

// Zon (spec 2026-10-14-sun-schedules-design.md): een schema loopt op een
// tijd, of bij zonsopkomst/-ondergang met een verschuiving in minuten
// (negatief = ervoor). De verschuivingen die de app aanbiedt:
export const SUN_OFFSETS = [15, 30, 45, 60, 90, 120]

export const isSun = (s) => s.trigger === 'sunrise' || s.trigger === 'sunset'

// "30 minuten", "1 uur", "1 uur en 30 minuten".
function duration({ t }, total) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return t('schedules.minutes', { count: minutes })
  if (minutes === 0) return t('schedules.hours', { count: hours })
  return t('schedules.hoursMinutes', {
    hours: t('schedules.hours', { count: hours }),
    minutes: t('schedules.minutes', { count: minutes }),
  })
}

// Wanneer een schema loopt, als deel van een zin: "om 23:00", "bij
// zonsondergang", "30 minuten voor zonsopkomst".
export function scheduleWhen(intl, s) {
  const { t } = intl
  if (!isSun(s)) return t('schedules.atTime', { time: s.time })
  const sun = t(`schedules.${s.trigger}`)
  const offset = s.offset_min ?? 0
  if (offset === 0) return t('schedules.atSun', { sun })
  return t(offset < 0 ? 'schedules.beforeSun' : 'schedules.afterSun', { sun, duration: duration(intl, Math.abs(offset)) })
}

// Hoe een schema heet in een foutmelding of label: "23:00", "zonsondergang".
export function scheduleName({ t }, s) {
  return isSun(s) ? t(`schedules.${s.trigger}`) : s.time
}

// Kort, voor de knoppen: "15 min", "1 uur", "1,5 uur".
export function offsetLabel({ t, locale }, minutes) {
  if (minutes < 60) return t('schedules.minutesShort', { count: minutes })
  return t('schedules.hoursShort', { count: cachedFormat(Intl.NumberFormat, locale, {}).format(minutes / 60) })
}

// Een schema als zin, zelfstandig: "Bij zonsondergang", "Om 23:00".
export function scheduleWhenLabel(intl, s) {
  return capitalize(scheduleWhen(intl, s), intl.locale)
}

const parseDate = (value) => new Date(String(value).replace(' ', 'T'))
const twoDigits = (n) => String(n).padStart(2, '0')

// Sorteren op tijd van de dag: een zon-schema op de tijd waarop het de
// volgende keer loopt (next_run, van de box), zonder die achteraan.
export function scheduleSortKey(s) {
  if (!isSun(s)) return s.time
  if (!s.next_run) return '99:99'
  const at = parseDate(s.next_run)
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`
}

// Wanneer een zon-schema de volgende keer loopt: "vandaag om 18:47",
// "morgen om 08:05", "vrijdag om 18:43". Leeg zonder next_run.
export function nextRunText({ t, locale }, nextRun, now = new Date()) {
  if (!nextRun) return ''
  const at = parseDate(nextRun)
  if (Number.isNaN(at.getTime())) return ''
  const time = cachedFormat(Intl.DateTimeFormat, locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((dayStart(at) - dayStart(now)) / 86400000)
  if (days === 0) return t('schedules.today', { time })
  if (days === 1) return t('schedules.tomorrow', { time })
  const day = cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'long' }).format(at)
  return t('schedules.onDay', { day, time })
}

// Eén regel voor de tegel: alleen schema's die aan staan.
export function describeSchedules(intl, schedules) {
  const active = schedules.filter((s) => s.enabled)
  if (active.length === 0) return ''
  if (active.length === 1) {
    const [only] = active
    if (!isSun(only)) return intl.t('schedules.daysAt', { days: describeDays(intl, only.days), time: only.time })
    return intl.t('schedules.daysWhen', { days: describeDays(intl, only.days), when: scheduleWhen(intl, only) })
  }
  const list = cachedFormat(Intl.ListFormat, intl.locale, { type: 'conjunction' })
  if (!active.some(isSun)) {
    const times = [...new Set(active.map((s) => s.time))].sort()
    return intl.t('schedules.at', { times: list.format(times) })
  }
  const whens = [...active]
    .sort((a, b) => scheduleSortKey(a).localeCompare(scheduleSortKey(b)))
    .map((s) => scheduleWhen(intl, s))
  return capitalize(list.format([...new Set(whens)]), intl.locale)
}

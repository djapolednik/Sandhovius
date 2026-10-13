// Home als thuis, niet als instellingenscherm: een groet, en daaronder in
// gewone woorden hoe het huis erbij staat en hoe het buiten is. De helpers
// met woorden krijgen intl = { t, locale } mee (useIntl in
// app/LanguageContext.js); de zinnen zelf staan in messages/*.json.
import { cachedFormat } from './language.js'
import { formatTemperature, readTemperature } from './temperature.js'
import { describeCondition, formatDegrees } from './weather.js'

// "Goedenavond, David": het dagdeel en de voornaam (het eerste woord van de
// naam). Zonder naam alleen het dagdeel; nooit het e-mailadres.
export function greeting({ t }, date, name) {
  const hour = date.getHours()
  const part = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = String(name ?? '').trim().split(/\s+/)[0]
  const greeting = t(`home.greeting.${part}`)
  return first ? t('home.greetingWithName', { greeting, name: first }) : greeting
}

// Eén zin over het huis: wat er aan staat en hoe warm het binnen is. Geen
// middelpunten (The Sentence Case Rule), geen "0 lampen". "En"/"and" komt
// van Intl.ListFormat: dat kent de regels van elke taal.
export function houseSummary({ t, locale }, { lightsOn = 0, plugsOn = 0, indoor = null }) {
  const parts = []
  if (lightsOn > 0) parts.push(t('home.summary.lights', { count: lightsOn }))
  if (plugsOn > 0) parts.push(t('home.summary.plugs', { count: plugsOn }))
  const state = parts.length
    ? t('home.summary.on', { things: cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' }).format(parts) })
    : t('home.summary.allOff')
  if (typeof indoor !== 'number') return state
  return t('home.summary.withIndoor', { state, temperature: formatTemperature(indoor, locale) })
}

// Hoe warm het binnen is: wat de thermostaat meet, anders de eerste
// temperatuursensor. devices: [{ type, state }] met state = device_state.state.
export function indoorTemperature(devices) {
  for (const { type, state } of devices) {
    const t = state?.attributes?.current_temperature
    if (type === 'climate' && typeof t === 'number') return t
  }
  for (const { type, state } of devices) {
    if (type !== 'sensor') continue
    const t = readTemperature(state)
    if (typeof t === 'number') return t
  }
  return null
}

// De regel onder de groet: de zin over het huis (null als de box niet
// bereikbaar is) en het weer van nu, als dat niet verouderd is.
// "2 lampen aan, binnen 20,5°. Buiten helder, 9°"
export function homeLede({ t, locale }, { summary = null, weather = null, weatherStale = false }) {
  const parts = []
  if (summary) parts.push(summary)
  if (weather?.condition && !weatherStale) {
    const condition = t(describeCondition(weather.condition).key).toLocaleLowerCase(locale)
    parts.push(
      weather.temperature != null
        ? t('home.outsideWithTemperature', { condition, temperature: formatDegrees(weather.temperature) })
        : t('home.outside', { condition })
    )
  }
  return parts.length ? parts.join('. ') : null
}

// "Let op": eerst wat het zwaarst weegt. Een mislukt klaarzetten en een
// apparaat dat offline is doen het niet; een bijna lege batterij nog wel.
// Binnen een soort blijft de volgorde van de apparaten.
const ATTENTION_ORDER = { setup: 0, offline: 1, battery: 2 }

export function sortAttention(items) {
  return [...items].sort((a, b) => ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind])
}

// Wat er met één apparaat is, in woorden: "offline", "batterij bijna leeg
// (12%)". item: { device, kind, battery }.
export function attentionReason({ t }, item) {
  return t(`home.attention.${item.kind}`, { percent: item.battery })
}

// De ene regel op Home: bij één apparaat wat er is, bij meer hoeveel.
// "Testlamp: offline", "3 apparaten vragen aandacht"
export function attentionLine(intl, items) {
  if (items.length === 0) return null
  if (items.length === 1) {
    return intl.t('home.attention.one', { name: items[0].device.name, reason: attentionReason(intl, items[0]) })
  }
  return intl.t('home.attention.many', { count: items.length })
}

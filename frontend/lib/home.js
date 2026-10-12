// Home als thuis, niet als instellingenscherm: een groet, en daaronder in
// gewone woorden hoe het huis erbij staat en hoe het buiten is.
import { formatTemperature, readTemperature } from './temperature.js'
import { describeCondition, formatDegrees } from './weather.js'

// "Goedenavond, David": het dagdeel en de voornaam (het eerste woord van de
// naam). Zonder naam alleen het dagdeel; nooit het e-mailadres.
export function greeting(date, name) {
  const hour = date.getHours()
  const part = hour < 6 ? 'Goedenacht' : hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond'
  const first = String(name ?? '').trim().split(/\s+/)[0]
  return first ? `${part}, ${first}` : part
}

// Eén zin over het huis: wat er aan staat en hoe warm het binnen is. Geen
// middelpunten (The Sentence Case Rule), geen "0 lampen".
export function houseSummary({ lightsOn = 0, plugsOn = 0, indoor = null }) {
  const parts = []
  if (lightsOn > 0) parts.push(`${lightsOn} ${lightsOn === 1 ? 'lamp' : 'lampen'}`)
  if (plugsOn > 0) parts.push(`${plugsOn} ${plugsOn === 1 ? 'stopcontact' : 'stopcontacten'}`)
  const state = parts.length ? `${parts.join(' en ')} aan` : 'Alles is uit'
  return typeof indoor === 'number' ? `${state}, binnen ${formatTemperature(indoor)}` : state
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
export function homeLede({ summary = null, weather = null, weatherStale = false }) {
  const parts = []
  if (summary) parts.push(summary)
  if (weather?.condition && !weatherStale) {
    const label = describeCondition(weather.condition).label.toLowerCase()
    const temp = weather.temperature != null ? `, ${formatDegrees(weather.temperature)}` : ''
    parts.push(`Buiten ${label}${temp}`)
  }
  return parts.length ? parts.join('. ') : null
}

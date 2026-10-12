// Home als thuis, niet als instellingenscherm: een groet, een zin over het
// huis in gewone woorden, en het licht van de lampen die aan zijn.
import { formatTemperature, readTemperature } from './temperature.js'

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

// Hoeveel lamplicht er uit het huis over de pagina valt (0 tot 1): niets als
// alles uit is, een zweem bij één lamp, vol vanaf vier. Echt licht van echte
// lampen (The Real Light Rule), nooit decoratie.
export function lightSpill(lightsOn) {
  if (lightsOn <= 0) return 0
  return Math.min(1, 0.4 + 0.2 * (lightsOn - 1))
}
